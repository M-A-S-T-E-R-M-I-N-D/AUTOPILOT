// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A ModelPort over the OpenAI Codex CLI (epic 0036,
 * docs/epics/0036-provider-parity.md), split like `claude-cli.ts` into a pure
 * parse ({@link parseCodexExecOutput}, fixture-tested) and the impure spawn
 * ({@link CodexCliModel}) that feeds it `codex exec --json` stdout.
 *
 * The wire format is the `ThreadEvent` enum in openai/codex
 * `codex-rs/exec/src/exec_events.rs` — one JSON object per line, tagged by
 * `type`: `thread.started` (`thread_id`), `turn.started`, `turn.completed`
 * (`usage`), `turn.failed` (`error.message`), `item.started|updated|completed`
 * (`item.type` e.g. `agent_message` with `text`), and `error` (`message`).
 *
 * What the CLI does NOT report, and so this parse never invents:
 * - Cost. `usage` carries token counts only, never a priced figure, so
 *   `costUsd` is always `null` — no per-token price table lives in this repo
 *   (`ports.ts`, `firing.ts` §3.6: cost is never computed from tokens).
 * - Model, duration, turn count, stop reason. No event carries them, so they
 *   are `null`; `modelUsed` is the model the engine REQUESTED, since nothing
 *   on the wire attests the one that ran.
 */

import { execFile, type ExecFileOptions } from 'node:child_process';
import type { ModelEnvelope, ModelPort, ModelResponse } from '../ports.js';
import {
  reapCliDescendants,
  isCliTimeoutDeath,
  CLI_STDIN_PROMPT_THRESHOLD,
  DEFAULT_CLI_TIMEOUT_MS,
} from './claude-cli.js';

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function recordOrEmpty(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

/** Every line of `stdout` that parses as a JSON object; anything else (a
 *  stray log line, a line torn by a kill) is skipped, never fatal. */
function jsonObjectLines(stdout: string): readonly Record<string, unknown>[] {
  return stdout.split('\n').flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return [];
    try {
      return [recordOrEmpty(JSON.parse(trimmed))];
    } catch {
      return [];
    }
  });
}

interface CodexTokens {
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly cacheRead: number | null;
  readonly cacheCreate: number | null;
}

const NO_TOKENS: CodexTokens = {
  tokensIn: null,
  tokensOut: null,
  cacheRead: null,
  cacheCreate: null,
};

/**
 * Codex's `input_tokens` INCLUDES the cached ones (its own `TokenUsage::
 * non_cached_input` is `input_tokens - cached_input_tokens`, floored at 0),
 * while `ModelEnvelope.tokensIn` means uncached input as `claude -p` reports
 * it — so the cached share moves to `cacheRead` instead of being counted twice.
 * `cache_write_input_tokens` is absent from older CLIs: absent stays `null`.
 */
function tokensFromUsage(usage: unknown): CodexTokens {
  const u = recordOrEmpty(usage);
  const input = numOrNull(u['input_tokens']);
  const cached = numOrNull(u['cached_input_tokens']);
  return {
    tokensIn: input === null ? null : Math.max(0, input - Math.max(0, cached ?? 0)),
    tokensOut: numOrNull(u['output_tokens']),
    cacheRead: cached,
    cacheCreate: numOrNull(u['cache_write_input_tokens']),
  };
}

/**
 * Parse one `codex exec --json` run. The terminal event decides the envelope:
 * the LAST `turn.completed` is a pass whose `result` is the last
 * `agent_message`; the last `turn.failed` is a failure whose `result` is its
 * error message. With neither — the process was killed, or died before a turn
 * ended — the envelope is `null`, the same "abnormal exit" signal a missing
 * `claude -p` result envelope gives, while the `thread_id` already seen on the
 * wire still rides out as `sessionId` so the attempt stays resumable.
 *
 * A bare `error` event is NOT terminal: Codex emits one for a stream error it
 * may retry, and reports a turn that really failed as `turn.failed`. An
 * `item.completed` of type `error` is a warning (config, deprecation, model
 * reroute), not a failure. Usage is the thread's RUNNING total, so the last
 * `turn.completed` wins rather than a sum.
 */
export function parseCodexExecOutput(
  stdout: string,
  exitCode: number,
  requestedModel: string,
): ModelResponse {
  let sessionId: string | null = null;
  let lastMessage: string | null = null;
  let terminal: Record<string, unknown> | null = null;

  for (const event of jsonObjectLines(stdout)) {
    const type = event['type'];
    if (type === 'thread.started') {
      sessionId ??= strOrNull(event['thread_id']);
    } else if (type === 'item.completed') {
      const item = recordOrEmpty(event['item']);
      if (item['type'] === 'agent_message') lastMessage = strOrNull(item['text']) ?? lastMessage;
    } else if (type === 'turn.completed' || type === 'turn.failed') {
      terminal = event;
    }
  }

  if (terminal === null) return { stdout, exitCode, envelope: null, sessionId };

  const failed = terminal['type'] === 'turn.failed';
  const tokens = failed ? NO_TOKENS : tokensFromUsage(terminal['usage']);
  const envelope: ModelEnvelope = {
    result: failed ? strOrNull(recordOrEmpty(terminal['error'])['message']) : lastMessage,
    isError: failed,
    apiErrorStatus: null,
    costUsd: null,
    numTurns: null,
    durationMs: null,
    stopReason: null,
    modelUsed: requestedModel === '' ? null : requestedModel,
    ...tokens,
    sessionId,
  };
  return { stdout, exitCode, envelope, sessionId };
}

export interface CodexCliOptions {
  readonly repo: string;
  /** CLI binary — discovered from PATH by default (never a hardcoded personal path). */
  readonly binary?: string;
  /**
   * Base environment to derive the CLI env from (defaults to `process.env`). Codex's own
   * auth (`codex login`'s ChatGPT session, or `CODEX_API_KEY`) rides through unchanged —
   * `auth.ts`'s `AuthConfig`/`AuthMode` work (this epic's Bedrock/Vertex slice) is
   * Claude-CLI-specific env-var routing and does not apply to a different binary.
   */
  readonly env?: NodeJS.ProcessEnv;
  /** Kill the child if it runs longer than this. Defaults to `claude-cli.ts`'s
   *  {@link DEFAULT_CLI_TIMEOUT_MS} — the same wall-clock cap every CLI-spawning
   *  ModelPort in this repo shares, until this adapter earns its own tuned value. */
  readonly timeoutMs?: number;
  /**
   * `--sandbox` level passed to `codex exec`. Defaults to `workspace-write`: the CLI's
   * own default is `read-only` (per developers.openai.com/codex/noninteractive, verified
   * 2026-09-27), which would leave an agentic coding loop unable to edit any file — the
   * one capability the parity matrix above credits this adapter with.
   */
  readonly sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  /** ORPHAN SWEEP crash-path follow-up (board ap-mt2ukjg5-2), containment
   *  parity with `ClaudeCliModel`/`GeminiCliModel` before this adapter is
   *  wired into routing (epic 0036): persists the child's pid for the
   *  duration of the invocation so a crash-path sweep can still reap it if
   *  THIS process dies before the normal settle callback (below) untracks
   *  it. Structurally typed — any `CliDescendantRegistry` satisfies this
   *  without an import cycle, same as `ClaudeCliOptions.pidRegistry`. */
  readonly pidRegistry?: { track: (pid: number) => void; untrack: (pid: number) => void };
  /** ORPHAN SWEEP seam (board web-msu3sv1w-hfj87n), same as
   *  `ClaudeCliOptions.reapDescendants`: defaults to the real cross-platform
   *  {@link reapCliDescendants}; tests inject a spy to prove the reap runs. */
  readonly reapDescendants?: (pid: number | undefined, platform?: NodeJS.Platform) => void;
}

/**
 * ModelPort over the local OpenAI Codex CLI (epic 0036): spawns `codex exec --json
 * --model <model> [--sandbox <level>] [resume <session>] <prompt>` and parses its JSONL
 * stdout via {@link parseCodexExecOutput}. Stdin is always closed: given a prompt
 * argument, `codex exec` still reads a non-TTY stdin to EOF to append it as a
 * `<stdin>` block (codex-rs/exec/src/lib.rs `resolve_root_prompt`), so a pipe left
 * open would hang every cold run until the wall-clock cap. A prompt over
 * {@link CLI_STDIN_PROMPT_THRESHOLD}, or one starting with `-`, goes on stdin behind
 * a `-` argument instead, dodging the Windows command-line ceiling the way
 * `ClaudeCliModel` does. Mirrors `ClaudeCliModel`'s buffered-execFile
 * transport shape, including `detached: true` + {@link reapCliDescendants} so a
 * wall-clock kill still reaps whatever the child spawned (ORPHAN SWEEP, board
 * web-msu3sv1w-hfj87n) — but skips its idle-timeout, streaming, and CLI-level
 * resume-retry-on-failure hardening: those were added to the Claude driver
 * incrementally after real incidents this adapter has no flight history to have hit
 * yet. It DOES carry `ClaudeCliModel`/`GeminiCliModel`'s crash-path
 * {@link CodexCliOptions.pidRegistry} tracking (containment parity, board
 * ap-mt2ukjg5-2), added ahead of this adapter's routing wiring so a lane
 * flown on it is never a containment regression from day one. Its settle
 * path matches `ClaudeCliModel.execOnce`'s too: the reap goes through the
 * injectable {@link CodexCliOptions.reapDescendants} seam, and a kill by the
 * wall-clock cap comes back `timedOut` (THIRD CAP) instead of reading as an
 * ordinary crash. Never rejects — a spawn failure (binary missing) reports
 * the same "no envelope" shape {@link parseCodexExecOutput} already gives an
 * abnormal exit.
 */
export class CodexCliModel implements ModelPort {
  constructor(private readonly opts: CodexCliOptions) {}

  invoke(model: string, prompt: string, resumeSessionId?: string): Promise<ModelResponse> {
    const args = [
      'exec',
      '--json',
      '--model',
      model,
      '--sandbox',
      this.opts.sandbox ?? 'workspace-write',
    ];
    // Global flags above are placed before the subcommand so they parse
    // correctly whether or not the CLI treats them as clap `global = true`
    // options (verified structure: openai/codex codex-rs/exec/src/cli.rs).
    if (resumeSessionId !== undefined && resumeSessionId.length > 0) {
      args.push('resume', resumeSessionId);
    }
    // `-` makes both `exec` and `exec resume` read the prompt from stdin
    // (codex-rs/exec/src/lib.rs `resolve_prompt`). A leading `-` on argv would
    // parse as a flag, and `-` alone as that same stdin read, so those go on
    // stdin too.
    const pipePrompt = prompt.length > CLI_STDIN_PROMPT_THRESHOLD || prompt.startsWith('-');
    args.push(pipePrompt ? '-' : prompt);

    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;
    const startedAt = Date.now();
    const execOpts: ExecFileOptions & { detached: boolean; encoding: 'utf8' } = {
      cwd: this.opts.repo,
      env: this.opts.env ?? process.env,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: timeoutMs,
      detached: true,
      encoding: 'utf8',
    };
    return new Promise((resolve) => {
      const child = execFile(
        this.opts.binary ?? 'codex',
        args,
        // Same overload-dodging cast ClaudeCliModel.execOnce uses — see its comment.
        execOpts as ExecFileOptions & { encoding: 'utf8' },
        (err, stdout) => {
          (this.opts.reapDescendants ?? reapCliDescendants)(child.pid);
          if (child.pid !== undefined) this.opts.pidRegistry?.untrack(child.pid);
          // Same derivation as ClaudeCliModel.execOnce: a numeric err.code is the
          // real exit code (e.g. a non-zero `codex exec` run); any other error
          // (spawn failure, timeout kill) has none, so it reads as 1.
          const exitCode =
            err && typeof (err as { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : err
                ? 1
                : 0;
          const killedBySignal = err !== null && (err as { killed?: boolean }).killed === true;
          const timedOut = isCliTimeoutDeath(killedBySignal, Date.now() - startedAt, timeoutMs);
          resolve({
            ...parseCodexExecOutput(stdout ?? '', exitCode, model),
            ...(timedOut ? { timedOut: true } : {}),
          });
        },
      );
      if (child.pid !== undefined) this.opts.pidRegistry?.track(child.pid);
      // Same EPIPE guard as GeminiCliModel: a CLI that exits before reading
      // its stdin breaks the pipe, and the callback above already reports it.
      child.stdin?.on('error', () => undefined);
      if (pipePrompt) child.stdin?.end(prompt);
      else child.stdin?.end();
    });
  }
}
