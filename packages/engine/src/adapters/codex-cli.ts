// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The pure half of a ModelPort over the OpenAI Codex CLI (epic 0036,
 * docs/epics/0036-provider-parity.md): parsing `codex exec --json` stdout into
 * the same envelope shape `claude -p` produces, so `firing.ts` never has to
 * know which engine ran. Mirrors `claude-cli.ts`'s pure-parse/impure-transport
 * split — this file is the parse; the spawn (`CodexCliModel`) is a later slice.
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

import type { ModelEnvelope, ModelResponse } from '../ports.js';

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
