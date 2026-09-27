// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The pure parse half of a ModelPort over the Google Gemini CLI (epic 0036,
 * docs/epics/0036-provider-parity.md), split like `claude-cli.ts` and
 * `codex-cli.ts`: {@link parseGeminiJsonOutput} is fixture-tested here, and the
 * spawn that feeds it `gemini -p --output-format json` output is a later slice.
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

import type { ModelEnvelope, ModelResponse } from '../ports.js';

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
