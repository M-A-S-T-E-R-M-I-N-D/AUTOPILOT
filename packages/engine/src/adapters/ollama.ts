// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ModelPort over a local Ollama server (M6, ENGINE-RESEARCH I1/I2;
 * `routing.ts`'s local tier, `config.ts`'s `routing.localModel` placeholder
 * `ollama-local`) — the local-model adapter `ports.ts`'s `ModelPort` docstring
 * names as the intended driver. Mirrors `otlp.ts`'s injectable-fetch +
 * AbortController-timeout shape (real `fetch` satisfies the minimal type,
 * tests inject a fake) and `claude-cli.ts`'s pure-parse/impure-transport
 * split.
 *
 * First real caller: the dashboard's mechanical board-TRIAGE substep
 * (`apps/dashboard/src/fly.ts`'s `runBoardTriage`) — a tool-less, single-turn
 * cheap-model call, exactly the "mechanical sub-work" I1 means to route off
 * the paid cloud tier. `firing.ts`'s primary work-unit call is deliberately
 * NOT routed here: it needs full agentic tool use (edit files, run the gate,
 * commit), which this single-turn, no-tool-use adapter cannot provide —
 * offload the grunt, never the judgment (ENGINE-RESEARCH §7).
 */

import type { ModelPort, ModelResponse, ModelEnvelope } from '../ports.js';

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function numOrNull(v: unknown): number | null {
  // Stryker disable next-line ConditionalExpression: Number.isFinite never
  // coerces (unlike global isFinite), so it already returns false for every
  // non-number value — no input can distinguish this typeof guard reduced to
  // a literal `true` from the real check; genuinely equivalent, not a gap.
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const NS_PER_MS = 1_000_000;

/** A minimal fetch-shaped HTTP client — real `fetch` satisfies this, so do test fakes. */
export type OllamaFetch = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal?: AbortSignal;
  },
) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

/**
 * Parse one `/api/generate` (non-streaming) response into the same envelope
 * shape the cloud CLI produces, so `firing.ts` never has to know which tier
 * ran. Pure and unit-tested; the impure `fetch` lives in {@link OllamaModel}.
 * `costUsd` is genuinely `0` (local compute), not an estimate — the same
 * "never invent a cost" rule `ports.ts` documents just resolves to a known
 * value here instead of `null`. A non-2xx status (e.g. the model was never
 * pulled) or an unparseable body reports `isError: true` rather than
 * throwing, matching `ModelPort`'s "never rejects" contract.
 */
export function parseOllamaResponse(
  status: number,
  body: unknown,
  requestedModel: string,
): ModelResponse {
  const malformed = typeof body !== 'object' || body === null;
  const o = malformed ? {} : (body as Record<string, unknown>);
  const isHttpError = status < 200 || status >= 300;

  if (malformed || isHttpError) {
    const message = strOrNull(o['error']) ?? `Ollama HTTP ${status}`;
    const envelope: ModelEnvelope = {
      result: null,
      isError: true,
      apiErrorStatus: String(status),
      costUsd: 0,
      numTurns: null,
      durationMs: null,
      stopReason: null,
      modelUsed: requestedModel,
      tokensIn: null,
      tokensOut: null,
      cacheRead: null,
      cacheCreate: null,
    };
    return { stdout: message, exitCode: 1, envelope };
  }

  const totalDurationNs = numOrNull(o['total_duration']);
  const response = strOrNull(o['response']);
  const envelope: ModelEnvelope = {
    result: response,
    isError: false,
    apiErrorStatus: null,
    costUsd: 0,
    numTurns: 1,
    durationMs: totalDurationNs !== null ? Math.round(totalDurationNs / NS_PER_MS) : null,
    stopReason: o['done'] === true ? 'end_turn' : null,
    modelUsed: strOrNull(o['model']) ?? requestedModel,
    tokensIn: numOrNull(o['prompt_eval_count']),
    tokensOut: numOrNull(o['eval_count']),
    cacheRead: null,
    cacheCreate: null,
  };
  return { stdout: response ?? '', exitCode: 0, envelope };
}

export interface OllamaModelOptions {
  /** Defaults to Ollama's own default local port. */
  readonly baseUrl?: string;
  /** Defaults to the global `fetch`; inject a fake in tests. */
  readonly fetchImpl?: OllamaFetch;
  /** Abort the request after this many ms. Defaults to {@link DEFAULT_OLLAMA_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

/**
 * Mechanical substeps are meant to be short — generous enough for a slow cold
 * model load on the founder's GPU, far short of the cloud CLI's 30-minute
 * ceiling (`claude-cli.ts`'s `DEFAULT_CLI_TIMEOUT_MS`) since nothing routed
 * here is meant to be a long agentic session.
 */
export const DEFAULT_OLLAMA_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * ModelPort over `POST /api/generate` on a local Ollama server (single-turn,
 * non-streaming — no tool use, no agent loop, just a completion). A dead or
 * unreachable server (never started, wrong port) reports as a failed
 * `ModelResponse` — same as any other quota/error envelope — never a thrown
 * rejection, so resilience/routing logic upstream never needs a try/catch.
 */
export class OllamaModel implements ModelPort {
  constructor(private readonly opts: OllamaModelOptions = {}) {}

  async invoke(model: string, prompt: string): Promise<ModelResponse> {
    const fetchImpl = this.opts.fetchImpl ?? (fetch as unknown as OllamaFetch);
    const baseUrl = this.opts.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.opts.timeoutMs ?? DEFAULT_OLLAMA_TIMEOUT_MS,
    );
    try {
      const response = await fetchImpl(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false }),
        signal: controller.signal,
      });
      const body = await response.json();
      return parseOllamaResponse(response.status, body, model);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        stdout: message,
        exitCode: 1,
        envelope: {
          result: null,
          isError: true,
          apiErrorStatus: null,
          costUsd: 0,
          numTurns: null,
          durationMs: null,
          stopReason: null,
          modelUsed: model,
          tokensIn: null,
          tokensOut: null,
          cacheRead: null,
          cacheCreate: null,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
