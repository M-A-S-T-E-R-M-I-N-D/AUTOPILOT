// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * OTLP/HTTP JSON mapping + transport for a `FiringRecord` (BACKLOG-999
 * ap-mskoz971-3). `toOtlpResourceSpans` reshapes a record into the wire
 * format an OTLP collector (or any OTLP/HTTP JSON-compatible backend)
 * accepts at `POST /v1/traces` and stays pure/side-effect-free, as testable
 * as the rest of `telemetry.ts`. `exportOtlpResourceSpans` is the one place
 * that performs the actual `fetch` — its HTTP client is injectable so
 * callers (and tests) never depend on a real network. The endpoint-wiring
 * adoption step (ap-msksw1me-0) has since landed: `apps/dashboard/src/fly.ts`
 * calls both after every firing, gated by `apps/dashboard/src/flight/otlp.ts`'s
 * `otlpConfigFromEnv` (off by default, no `OTEL_EXPORTER_OTLP_*` endpoint set).
 */

import { createHash } from 'node:crypto';
import type { FiringRecord } from './telemetry.js';

export type OtlpAttributeValue =
  | { readonly stringValue: string }
  | { readonly intValue: string }
  | { readonly doubleValue: number }
  | { readonly boolValue: boolean };

export interface OtlpKeyValue {
  readonly key: string;
  readonly value: OtlpAttributeValue;
}

/** trace.proto Status.StatusCode. */
export const OTLP_STATUS_UNSET = 0;
export const OTLP_STATUS_OK = 1;
export const OTLP_STATUS_ERROR = 2;

export interface OtlpSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly name: string;
  readonly kind: number;
  readonly startTimeUnixNano: string;
  readonly endTimeUnixNano: string;
  readonly attributes: readonly OtlpKeyValue[];
  readonly status: { readonly code: number };
}

export interface OtlpResourceSpansPayload {
  readonly resourceSpans: readonly {
    readonly resource: { readonly attributes: readonly OtlpKeyValue[] };
    readonly scopeSpans: readonly {
      readonly scope: { readonly name: string };
      readonly spans: readonly OtlpSpan[];
    }[];
  }[];
}

/** SPAN_KIND_INTERNAL — a firing has no remote caller/callee. */
const SPAN_KIND_INTERNAL = 1;
const SCOPE_NAME = 'autopilot.engine';

function strAttr(key: string, value: string | null): OtlpKeyValue | null {
  return value === null ? null : { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number | null): OtlpKeyValue | null {
  return value === null ? null : { key, value: { intValue: String(Math.trunc(value)) } };
}

function doubleAttr(key: string, value: number | null): OtlpKeyValue | null {
  return value === null ? null : { key, value: { doubleValue: value } };
}

function boolAttr(key: string, value: boolean | null): OtlpKeyValue | null {
  return value === null ? null : { key, value: { boolValue: value } };
}

function isKeyValue(kv: OtlpKeyValue | null): kv is OtlpKeyValue {
  return kv !== null;
}

/**
 * `autopilot.files` value: newline-joined repo-relative paths. Newline because
 * paths routinely contain spaces/commas while a newline in a path is
 * pathological (git itself quotes them), and this file's `OtlpAttributeValue`
 * subset carries no `arrayValue` — a delimited string keeps the epic's "no new
 * schema" bargain. Null (attribute omitted) when the orchestrator computed
 * nothing — an absent list is not an empty commit.
 */
function filesValue(files: readonly string[] | undefined): string | null {
  return files === undefined || files.length === 0 ? null : files.join('\n');
}

/**
 * `gen_ai.*` keys follow the OTel Generative AI semantic conventions (model +
 * token usage); everything else is namespaced under `autopilot.*` since no
 * standard convention covers agent-firing/gate metadata.
 */
function buildAttributes(record: FiringRecord): readonly OtlpKeyValue[] {
  return [
    strAttr('gen_ai.request.model', record.model),
    intAttr('gen_ai.usage.input_tokens', record.tokensIn),
    intAttr('gen_ai.usage.output_tokens', record.tokensOut),
    intAttr('autopilot.firing.number', record.firing),
    strAttr('autopilot.firing.prompt_version', record.promptVersion),
    boolAttr('autopilot.firing.retro', record.retro),
    intAttr('autopilot.firing.attempts', record.attempts),
    boolAttr('autopilot.quota.fallback', record.quotaFallback),
    intAttr('autopilot.quota.streak', record.quotaStreak),
    boolAttr('autopilot.quota.global_exhaust', record.globalExhaust),
    strAttr('autopilot.started_on', record.startedOn),
    intAttr('autopilot.exit_code', record.exitCode),
    boolAttr('autopilot.max_turns_hit', record.maxTurnsHit),
    doubleAttr('autopilot.cost_usd', record.costUsd),
    intAttr('autopilot.tokens.cache_read', record.cacheRead),
    intAttr('autopilot.tokens.cache_create', record.cacheCreate),
    strAttr('autopilot.iter_metrics', record.iterMetrics),
    strAttr('autopilot.item', record.item),
    strAttr('autopilot.outcome', record.outcome),
    boolAttr('autopilot.shipped', record.shipped),
    strAttr('autopilot.gate.result', record.gateResult),
    strAttr('autopilot.git.sha', record.sha),
    boolAttr('autopilot.git.sha_verified', record.shaVerified),
    boolAttr('autopilot.git.head_advanced', record.headAdvanced),
    intAttr('autopilot.tests.before', record.testsBefore),
    intAttr('autopilot.tests.after', record.testsAfter),
    intAttr('autopilot.tests.delta', record.testsDelta),
    strAttr('autopilot.verifier_used', record.verifierUsed),
    strAttr('autopilot.kind', record.kind),
    strAttr('autopilot.area', record.area),
    strAttr('autopilot.deferred_to', record.deferredTo),
    strAttr('autopilot.commit_subject', record.commitSubject),
    strAttr('autopilot.files', filesValue(record.filesTouched)),
  ].filter(isKeyValue);
}

/**
 * Firing/ts/sha deterministically seed the trace+span ID (sha256, truncated)
 * instead of random generation, so re-exporting the same record — e.g. after
 * a delivery retry — produces byte-identical IDs rather than a duplicate span.
 */
function deterministicHex(seed: string, hexLength: number): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, hexLength);
}

function unixNano(isoTs: string, offsetMs: number): string {
  return (BigInt(Date.parse(isoTs) + offsetMs) * 1_000_000n).toString();
}

function statusCode(record: FiringRecord): number {
  if (record.gateResult === 'reverted' || record.isError === true) return OTLP_STATUS_ERROR;
  if (record.shipped) return OTLP_STATUS_OK;
  return OTLP_STATUS_UNSET;
}

/** Map one immutable `FiringRecord` into a single-span OTLP/HTTP JSON payload. */
export function toOtlpResourceSpans(
  record: FiringRecord,
  resource: { readonly serviceName: string; readonly serviceVersion?: string } = {
    serviceName: 'autopilot',
  },
): OtlpResourceSpansPayload {
  const seed = `${record.firing}:${record.ts}:${record.sha ?? ''}`;
  const startNano = unixNano(record.ts, 0);
  const endNano = unixNano(record.ts, record.durationMs ?? 0);

  const resourceAttributes = [
    strAttr('service.name', resource.serviceName),
    strAttr('service.version', resource.serviceVersion ?? null),
  ].filter(isKeyValue);

  const span: OtlpSpan = {
    traceId: deterministicHex(seed, 32),
    spanId: deterministicHex(`span:${seed}`, 16),
    name: 'autopilot.firing',
    kind: SPAN_KIND_INTERNAL,
    startTimeUnixNano: startNano,
    endTimeUnixNano: endNano,
    attributes: buildAttributes(record),
    status: { code: statusCode(record) },
  };

  return {
    resourceSpans: [
      {
        resource: { attributes: resourceAttributes },
        scopeSpans: [{ scope: { name: SCOPE_NAME }, spans: [span] }],
      },
    ],
  };
}

/** A minimal fetch-shaped HTTP client — real `fetch` satisfies this, so do test fakes. */
export type OtlpFetch = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal?: AbortSignal;
  },
) => Promise<{ readonly ok: boolean; readonly status: number }>;

export interface OtlpExporterOptions {
  /** Full OTLP/HTTP JSON traces endpoint, e.g. `https://collector.example/v1/traces`. */
  readonly endpoint: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Defaults to the global `fetch`; inject a fake in tests. */
  readonly fetchImpl?: OtlpFetch;
  /** Abort the request after this many ms. Defaults to 5000. */
  readonly timeoutMs?: number;
}

export interface OtlpExportResult {
  readonly ok: boolean;
  readonly status: number | null;
  readonly error: string | null;
}

const DEFAULT_EXPORT_TIMEOUT_MS = 5000;

/**
 * POST a mapped payload to an OTLP/HTTP JSON collector. Never throws — export
 * failure (network error, timeout, non-2xx) must not take down a firing, so
 * every outcome (including a crashed request) comes back as a result value.
 */
export async function exportOtlpResourceSpans(
  payload: OtlpResourceSpansPayload,
  options: OtlpExporterOptions,
): Promise<OtlpExportResult> {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as OtlpFetch);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : `OTLP export failed: HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
