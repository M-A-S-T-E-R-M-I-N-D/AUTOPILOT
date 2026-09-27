// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A ModelPort over the Google Gemini CLI (epic 0036,
 * docs/epics/0036-provider-parity.md), split like `claude-cli.ts` and
 * `codex-cli.ts` into a pure parse ({@link parseGeminiJsonOutput},
 * fixture-tested) and the impure spawn ({@link GeminiCliModel}) that feeds it
 * `gemini --prompt … --output-format json` output.
 *
 * The wire format is `JsonOutput` in google-gemini/gemini-cli
 * `packages/core/src/output/types.ts`, written by `JsonFormatter` as ONE
 * pretty-printed object: `session_id`, `response`, `stats` (`SessionMetrics`,
 * `packages/core/src/telemetry/uiTelemetry.ts`), `error` (`type`, `message`,
 * `code`), `warnings`. A finished run writes it to stdout; a fatal error
 * (turn limit, API failure, cancellation) writes the error-only object to
 * STDERR instead, behind an `[ERROR] ` feedback prefix
 * (`packages/cli/src/utils/errors.ts`, `nonInteractiveCli.ts`) — so the parse
 * reads stdout first and falls back to stderr.
 *
 * What the CLI does NOT report, and so this parse never invents:
 * - Cost. `stats` carries token counts only, never a priced figure, so
 *   `costUsd` is always `null` (`ports.ts`, `firing.ts` §3.6).
 * - Turn count, wall duration, stop reason. `stats.models.*.api` counts API
 *   requests (router and helper calls included) and sums their latency, which
 *   are not the agent turns and wall clock those fields mean, so they are `null`.
 */

import { execFile, type ExecFileOptions } from 'node:child_process';
import type { ModelEnvelope, ModelPort, ModelResponse } from '../ports.js';
import {
  reapCliDescendants,
  CLI_STDIN_PROMPT_THRESHOLD,
  DEFAULT_CLI_TIMEOUT_MS,
} from './claude-cli.js';

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function recordOrNull(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** The keys that mark an object as Gemini's `JsonOutput` rather than a stray
 *  JSON log line that happened to parse. */
const OUTPUT_KEYS = ['session_id', 'response', 'stats', 'error'] as const;

/** A line that opens an object, allowing the `[ERROR] ` feedback prefix. */
const OBJECT_START = /^\s*(?:\[[A-Z]+\]\s*)?\{/;

/**
 * The `JsonOutput` object in `text`, or `null`. Each line that opens an object
 * is tried in order, parsed through the text's last `}`, so log lines before
 * the object and a trailing newline after it never break the parse.
 */
function findJsonOutput(text: string): Record<string, unknown> | null {
  const end = text.lastIndexOf('}');
  if (end === -1) return null;
  let offset = 0;
  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    if (!OBJECT_START.test(line) || lineStart > end) continue;
    const start = lineStart + line.indexOf('{');
    try {
      const parsed = recordOrNull(JSON.parse(text.slice(start, end + 1)));
      if (parsed !== null && OUTPUT_KEYS.some((key) => key in parsed)) return parsed;
    } catch {
      // Not the object (or a torn one) — try the next line that opens one.
    }
  }
  return null;
}

interface GeminiTokens {
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly cacheRead: number | null;
}

/**
 * One token field summed over every model in `stats.models`. `null` when there
 * are no models or any model lacks a finite number there: a partial sum would
 * understate the run and read as real.
 */
function sumModelTokens(
  models: readonly Record<string, unknown>[],
  field: 'input' | 'candidates' | 'cached',
): number | null {
  if (models.length === 0) return null;
  let total = 0;
  for (const model of models) {
    const value = recordOrNull(model['tokens'])?.[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}

/**
 * Tokens follow the CLI's own `StreamJsonFormatter.convertToStreamStats`
 * mapping: `tokens.input` is the uncached prompt share (`prompt - cached`, the
 * CLI computes it), `tokens.candidates` is the output, and `tokens.cached` is
 * the cache read. Gemini reports no cache write, so `cacheCreate` is `null`.
 */
function tokensFromStats(models: readonly Record<string, unknown>[]): GeminiTokens {
  return {
    tokensIn: sumModelTokens(models, 'input'),
    tokensOut: sumModelTokens(models, 'candidates'),
    cacheRead: sumModelTokens(models, 'cached'),
  };
}

/** The CLI's error `code` (a string, or a number such as an HTTP status). */
function errorCode(error: Record<string, unknown> | null): string | null {
  const code = error?.['code'];
  if (typeof code === 'string' && code.length > 0) return code;
  return typeof code === 'number' && Number.isFinite(code) ? String(code) : null;
}

/**
 * Parse one `gemini -p --output-format json` run. The object on stdout wins;
 * with none there, the error object on `stderr` is read. With neither — the
 * process was killed before it wrote one, or never started — the envelope is
 * `null`, the same "abnormal exit" signal a missing `claude -p` result gives.
 *
 * An `error` field makes the envelope a failure whose `result` is the error's
 * message, even when a partial `response` rode along (the INVALID_STREAM case).
 * `modelUsed` is the one model `stats` names; when it names several (the CLI's
 * router adds its own) or none, it is the model the engine requested.
 */
export function parseGeminiJsonOutput(
  stdout: string,
  exitCode: number,
  requestedModel: string,
  stderr = '',
): ModelResponse {
  const output = findJsonOutput(stdout) ?? findJsonOutput(stderr);
  if (output === null) return { stdout, exitCode, envelope: null, sessionId: null };

  const rawSessionId = strOrNull(output['session_id']);
  const sessionId = rawSessionId === null || rawSessionId === '' ? null : rawSessionId;
  const error = recordOrNull(output['error']);
  const modelStats = recordOrNull(recordOrNull(output['stats'])?.['models']) ?? {};
  const modelNames = Object.keys(modelStats);
  const models = Object.values(modelStats).map((m) => recordOrNull(m) ?? {});
  const requested = requestedModel === '' ? null : requestedModel;

  const envelope: ModelEnvelope = {
    result: error !== null ? strOrNull(error['message']) : strOrNull(output['response']),
    isError: error !== null,
    apiErrorStatus: errorCode(error),
    costUsd: null,
    numTurns: null,
    durationMs: null,
    stopReason: null,
    modelUsed: modelNames.length === 1 ? (modelNames[0] ?? requested) : requested,
    ...tokensFromStats(models),
    cacheCreate: null,
    sessionId,
  };
  return { stdout, exitCode, envelope, sessionId };
}

export interface GeminiCliOptions {
  readonly repo: string;
  /** CLI binary — discovered from PATH by default (never a hardcoded personal path). */
  readonly binary?: string;
  /**
   * Base environment for the child (defaults to `process.env`). Gemini's own auth
   * (`GEMINI_API_KEY`, Vertex AI env, or the cached Google login) passes through
   * unchanged: `auth.ts`'s `AuthMode` routing is for the `claude` binary only.
   */
  readonly env?: NodeJS.ProcessEnv;
  /** Kill the child if it runs longer than this. Defaults to `claude-cli.ts`'s
   *  {@link DEFAULT_CLI_TIMEOUT_MS}, the wall-clock cap every CLI-spawning
   *  ModelPort in this repo shares. */
  readonly timeoutMs?: number;
  /**
   * `--approval-mode` for the run. Defaults to `yolo`: headless mode cannot ask,
   * so under `default` every tool that needs a confirmation (file edits, shell)
   * is refused, and under `auto_edit` the shell still is, so the agent could not
   * run the gate or commit. `yolo` is the only mode that gives the full agentic
   * loop the parity matrix credits this adapter with. It is not sandboxed.
   */
  readonly approvalMode?: 'default' | 'auto_edit' | 'yolo' | 'plan';
  /**
   * Pass `--skip-trust` to trust `repo` for this one session. Off by default. The
   * CLI's folder trust is on by default, and headless mode exits with
   * `FatalUntrustedWorkspaceError` in an untrusted folder instead of asking.
   * Trusting a folder also loads its `.gemini/settings.json`, `.env`, and MCP
   * servers, so that stays the caller's decision (or the operator's own
   * `trustedFolders.json`), never a silent default here.
   */
  readonly trustWorkspace?: boolean;
  /** ORPHAN SWEEP crash-path follow-up (board ap-mt2ukjg5-2), containment
   *  parity with `ClaudeCliModel` before this adapter is wired into routing
   *  (epic 0036): persists the child's pid for the duration of the
   *  invocation so a crash-path sweep can still reap it if THIS process dies
   *  before the normal settle callback (below) untracks it. Structurally
   *  typed — any `CliDescendantRegistry` satisfies this without an import
   *  cycle, same as `ClaudeCliOptions.pidRegistry`. */
  readonly pidRegistry?: { track: (pid: number) => void; untrack: (pid: number) => void };
}

/**
 * ModelPort over the local Google Gemini CLI (epic 0036): spawns `gemini --model
 * <model> --output-format json --approval-mode <mode> [--skip-trust] [--resume
 * <session>] [--prompt <prompt>]` and parses its output via
 * {@link parseGeminiJsonOutput}, stderr included, since a fatal error goes there.
 *
 * Flags follow google-gemini/gemini-cli `packages/cli/src/config/config.ts`: the
 * positional prompt runs INTERACTIVE, so the prompt rides on `--prompt`, and
 * `--resume` takes the session UUID the JSON output carries. The CLI appends piped
 * stdin to the prompt (`gemini.tsx`), so a prompt over
 * {@link CLI_STDIN_PROMPT_THRESHOLD} goes on stdin alone, dodging the Windows
 * command-line ceiling the way `ClaudeCliModel` does. The CLI reads stdin whenever
 * it is not a TTY, so it is always closed: an argv prompt gets an empty stdin, not
 * the CLI's 500 ms wait for input that never comes (`readStdin.ts`).
 *
 * Transport mirrors `CodexCliModel`'s: buffered `execFile`, `detached: true`
 * plus {@link reapCliDescendants} (ORPHAN SWEEP), no idle timeout, no streaming, no
 * resume-retry-on-failure — but DOES carry `ClaudeCliModel`'s crash-path
 * {@link GeminiCliOptions.pidRegistry} tracking (containment parity, board
 * ap-mt2ukjg5-2), added ahead of this adapter's routing wiring so a lane
 * flown on it is never a containment regression from day one. Never
 * rejects: a spawn failure resolves the same "no envelope" shape an
 * abnormal exit gets.
 */
export class GeminiCliModel implements ModelPort {
  constructor(private readonly opts: GeminiCliOptions) {}

  invoke(model: string, prompt: string, resumeSessionId?: string): Promise<ModelResponse> {
    const pipePrompt = prompt.length > CLI_STDIN_PROMPT_THRESHOLD;
    const args = [
      '--model',
      model,
      '--output-format',
      'json',
      '--approval-mode',
      this.opts.approvalMode ?? 'yolo',
    ];
    if (this.opts.trustWorkspace === true) args.push('--skip-trust');
    if (resumeSessionId !== undefined && resumeSessionId.length > 0) {
      args.push('--resume', resumeSessionId);
    }
    if (!pipePrompt) args.push('--prompt', prompt);

    const execOpts: ExecFileOptions & { detached: boolean; encoding: 'utf8' } = {
      cwd: this.opts.repo,
      env: this.opts.env ?? process.env,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: this.opts.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS,
      detached: true,
      encoding: 'utf8',
    };
    return new Promise((resolve) => {
      const child = execFile(
        this.opts.binary ?? 'gemini',
        args,
        // Same overload-dodging cast ClaudeCliModel.execOnce uses — see its comment.
        execOpts as ExecFileOptions & { encoding: 'utf8' },
        (err, stdout, stderr) => {
          reapCliDescendants(child.pid);
          if (child.pid !== undefined) this.opts.pidRegistry?.untrack(child.pid);
          // Same derivation as ClaudeCliModel.execOnce: a numeric err.code is the
          // real exit code; a spawn failure or timeout kill has none, so it reads as 1.
          const exitCode =
            err && typeof (err as { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : err
                ? 1
                : 0;
          resolve(parseGeminiJsonOutput(stdout ?? '', exitCode, model, stderr ?? ''));
        },
      );
      if (child.pid !== undefined) this.opts.pidRegistry?.track(child.pid);
      // A CLI that exits before reading its stdin (bad flag, untrusted folder)
      // breaks the pipe; unheard, that EPIPE would crash the host rather than
      // reach the callback above, which already reports the exit.
      child.stdin?.on('error', () => undefined);
      if (pipePrompt) child.stdin?.end(prompt);
      else child.stdin?.end();
    });
  }
}
