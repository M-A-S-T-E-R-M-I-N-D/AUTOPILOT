// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ModelPort over the OpenAI Codex CLI (docs/epics/0036-provider-parity.md,
 * candidate 3; community epic GitHub #21) — `codex exec --json`, the
 * non-interactive mode that prints one JSON event per line on stdout
 * (`thread.started`, `turn.started`, `item.*`, `turn.completed`,
 * `turn.failed`, `error` — the `ThreadEvent` enum in openai/codex's
 * `codex-rs/exec/src/exec_events.rs`). Mirrors `claude-cli.ts`'s
 * pure-parse/impure-transport split: {@link parseCodexEvents} is unit-tested
 * against fixture JSONL, the spawn lives in {@link CodexCliModel}.
 *
 * Cost: Codex's `turn.completed` usage carries token counts only — never a
 * priced figure — so `costUsd` is ALWAYS `null` here, never an estimate from
 * a per-token price table (`ports.ts`'s never-invent-a-cost rule, `firing.ts`
 * §3.6). Every cost surface for a lane flown on this adapter degrades to
 * "unknown"; the epic accepts that as the price of the adapter.
 *
 * Not wired into any flight yet — no lane selects this driver; that routing
 * (and the demote-after-two-red-firings lane gate the epic names) is a later
 * slice.
 */

import { execFile, type ExecFileOptions } from 'node:child_process';
import type { ModelPort, ModelResponse, ModelEnvelope } from '../ports.js';
import { resolveClaudeEnv, DEFAULT_AUTH } from '../auth.js';
import {
  DEFAULT_CLI_TIMEOUT_MS,
  isCliTimeoutDeath,
  reapCliDescendants,
  stderrTail,
} from './claude-cli.js';

/** `codex exec --sandbox` policy for the commands the agent runs. */
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/** Codex's own docs name `workspace-write` as the non-interactive mode for edits. */
export const DEFAULT_CODEX_SANDBOX: CodexSandboxMode = 'workspace-write';

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Every stdout line that parses as a JSON object; anything else is skipped. */
function codexEvents(stdout: string): readonly Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const event = asRecord(JSON.parse(trimmed));
      if (event) events.push(event);
    } catch {
      // Not an event line — `--json` keeps stdout to events, but one stray
      // line must not cost the whole envelope.
    }
  }
  return events;
}

interface CodexTally {
  readonly sessionId: string | null;
  readonly lastMessage: string | null;
  readonly usage: Record<string, unknown> | null;
  readonly failure: string | null;
  readonly terminal: boolean;
}

function tallyEvent(tally: CodexTally, event: Record<string, unknown>): CodexTally {
  switch (event['type']) {
    case 'thread.started':
      return { ...tally, sessionId: strOrNull(event['thread_id']) ?? tally.sessionId };
    case 'item.completed': {
      const item = asRecord(event['item']);
      const text = item?.['type'] === 'agent_message' ? strOrNull(item['text']) : null;
      return text === null ? tally : { ...tally, lastMessage: text };
    }
    case 'turn.completed':
      return { ...tally, usage: asRecord(event['usage']), terminal: true };
    case 'turn.failed': {
      const message = strOrNull(asRecord(event['error'])?.['message']);
      return { ...tally, failure: message ?? 'turn failed', terminal: true };
    }
    case 'error':
      return { ...tally, failure: strOrNull(event['message']) ?? 'error', terminal: true };
    default:
      return tally;
  }
}

/**
 * Parse `codex exec --json` stdout into the same envelope shape the Claude
 * CLI produces, so `firing.ts` never has to know which engine ran. Pure.
 *
 * - `sessionId` is `thread.started`'s `thread_id` — what `codex exec resume`
 *   takes — and rides on the response itself too, so a killed attempt's
 *   thread stays addressable even with no envelope.
 * - `result` is the LAST `agent_message` item's text (the METRICS line lives
 *   in the agent's final words).
 * - Token counts come from `turn.completed`'s `usage`. Codex's
 *   `input_tokens` INCLUDES the cached portion (its own `non_cached_input()`
 *   subtracts it), so `tokensIn` is the uncached remainder and `cacheRead`
 *   the cached part — the same split the Claude envelope reports.
 * - `turn.failed`/`error` put Codex's own message in `apiErrorStatus`, where
 *   the resilience probe looks for a quota phrase.
 * - No terminal event at all (killed mid-run) → `envelope: null`, exactly
 *   like a Claude CLI that died before its `result` event.
 *
 * `numTurns`, `stopReason`, and `durationMs` stay null: Codex reports no
 * agentic-turn count and no stop reason, and the parser never guesses.
 */
export function parseCodexEvents(
  stdout: string,
  exitCode: number,
  requestedModel: string,
): ModelResponse {
  const tally = codexEvents(stdout).reduce<CodexTally>(tallyEvent, {
    sessionId: null,
    lastMessage: null,
    usage: null,
    failure: null,
    terminal: false,
  });
  if (!tally.terminal) return { stdout, exitCode, envelope: null, sessionId: tally.sessionId };

  const inputTokens = numOrNull(tally.usage?.['input_tokens']);
  const cachedTokens = numOrNull(tally.usage?.['cached_input_tokens']);
  const envelope: ModelEnvelope = {
    result: tally.lastMessage,
    isError: tally.failure !== null || exitCode !== 0,
    apiErrorStatus: tally.failure,
    costUsd: null,
    numTurns: null,
    durationMs: null,
    stopReason: null,
    modelUsed: requestedModel,
    tokensIn: inputTokens === null ? null : Math.max(0, inputTokens - (cachedTokens ?? 0)),
    tokensOut: numOrNull(tally.usage?.['output_tokens']),
    cacheRead: cachedTokens,
    cacheCreate: numOrNull(tally.usage?.['cache_write_input_tokens']),
    sessionId: tally.sessionId,
  };
  return { stdout, exitCode, envelope, sessionId: tally.sessionId };
}

/**
 * The `codex exec` argv. The prompt always goes through stdin (`-`), so no
 * prompt length ever meets Windows' command-line ceiling or a shell's
 * quoting. `--skip-git-repo-check` because the target is always a git repo
 * already (the gate's own premise) — a worktree's `.git` FILE must never be
 * why a firing dies. Every flag precedes `resume`, so `exec` itself parses
 * it for a resumed run exactly as for a cold one.
 */
export function buildCodexArgs(
  model: string,
  sandbox: CodexSandboxMode,
  resumeSessionId?: string,
): readonly string[] {
  const flags = ['exec', '--json', '--model', model, '--sandbox', sandbox, '--skip-git-repo-check'];
  return resumeSessionId !== undefined && resumeSessionId.length > 0
    ? [...flags, 'resume', resumeSessionId, '-']
    : [...flags, '-'];
}

/**
 * The spawn env for `codex`: a NEW env with every variable the Claude auth
 * modes manage stripped (subscription mode sets none of them) — so no
 * Anthropic credential, proxy URL, or Bedrock/Vertex switch rides into a
 * different vendor's agent. Codex's own credentials pass through untouched.
 */
export function resolveCodexEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return resolveClaudeEnv(DEFAULT_AUTH, baseEnv);
}

export interface CodexCliOptions {
  readonly repo: string;
  /**
   * CLI binary — `codex` from PATH by default. On Windows an npm `.cmd` shim
   * cannot be spawned without a shell, so point this at the real executable.
   */
  readonly binary?: string;
  readonly sandbox?: CodexSandboxMode;
  /** Base environment to derive the CLI env from (defaults to `process.env`). */
  readonly env?: NodeJS.ProcessEnv;
  /** Kill the child if it runs longer than this. Defaults to {@link DEFAULT_CLI_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

function failedSpawn(message: string): ModelResponse {
  return { stdout: stderrTail(message), exitCode: 1, envelope: null, sessionId: null };
}

/**
 * ModelPort over `codex exec --json`. Never rejects: a missing binary, a
 * crash, or a timeout comes back as a failed `ModelResponse` carrying the
 * stderr tail, the same shape a dead Claude CLI returns. `caps` are ignored —
 * `codex exec` has no max-turns or max-budget flag to map them onto.
 * `resumed` is left unset: which failure text Codex prints for a stale
 * thread id has not been verified against a real binary yet, so there is no
 * honest accepted/rejected signal to report.
 */
export class CodexCliModel implements ModelPort {
  constructor(private readonly opts: CodexCliOptions) {}

  invoke(model: string, prompt: string, resumeSessionId?: string): Promise<ModelResponse> {
    const args = buildCodexArgs(model, this.opts.sandbox ?? DEFAULT_CODEX_SANDBOX, resumeSessionId);
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;
    // Detached like the Claude CLI child (ORPHAN SWEEP): its own process
    // group, so reapCliDescendants can take down whatever it left running.
    // ExecFileOptions just doesn't NAME `detached`; execFile forwards it.
    const execOpts: ExecFileOptions & { detached: boolean; encoding: 'utf8' } = {
      cwd: this.opts.repo,
      env: resolveCodexEnv(this.opts.env ?? process.env),
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: timeoutMs,
      detached: true,
      encoding: 'utf8',
    };
    const binary = this.opts.binary ?? 'codex';
    const startedAt = Date.now();
    return new Promise((resolve) => {
      try {
        const opts = execOpts as ExecFileOptions & { encoding: 'utf8' };
        const child = execFile(binary, args, opts, (err, stdout, stderr) => {
          reapCliDescendants(child.pid);
          const elapsedMs = Date.now() - startedAt;
          const exitCode = typeof err?.code === 'number' ? err.code : err ? 1 : 0;
          const parsed = parseCodexEvents(stdout, exitCode, model);
          const timedOut = isCliTimeoutDeath(err?.killed === true, elapsedMs, timeoutMs);
          const extra = timedOut ? { timedOut: true } : {};
          if (parsed.envelope === null) {
            // No envelope: stdout carries the death reason (`firing.ts`'s deathTail).
            const reason = stderr.trim() !== '' ? stderr : (err?.message ?? '');
            resolve({ ...parsed, stdout: stderrTail(reason), ...extra });
            return;
          }
          resolve({ ...parsed, envelope: { ...parsed.envelope, durationMs: elapsedMs }, ...extra });
        });
        // A spawn that failed also errors its stdin pipe; the callback above
        // already reports that failure, so the pipe's own echo is dropped.
        child.stdin?.on('error', () => undefined);
        child.stdin?.end(prompt);
      } catch (error: unknown) {
        resolve(failedSpawn(error instanceof Error ? error.message : String(error)));
      }
    });
  }
}
