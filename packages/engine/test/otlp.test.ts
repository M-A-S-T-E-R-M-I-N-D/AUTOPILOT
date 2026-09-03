// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toOtlpResourceSpans,
  exportOtlpResourceSpans,
  OTLP_STATUS_OK,
  OTLP_STATUS_ERROR,
  OTLP_STATUS_UNSET,
  type OtlpKeyValue,
  type OtlpFetch,
} from '../src/otlp.js';
import type { FiringRecord } from '../src/telemetry.js';

const BASE_RECORD: FiringRecord = {
  ts: '2026-07-07T00:00:00.000Z',
  firing: 1,
  promptVersion: 'firing-v8.1',
  model: 'opus',
  retro: false,
  attempts: 1,
  quotaFallback: false,
  startedOn: 'primary',
  quotaStreak: 0,
  globalExhaust: false,
  exitCode: 0,
  isError: false,
  stopReason: 'end_turn',
  maxTurnsHit: false,
  numTurns: 12,
  durationMs: 4000,
  costUsd: 6.5,
  realCostUsd: null,
  tokensIn: 100,
  tokensOut: 200,
  cacheRead: 5000,
  cacheCreate: 50,
  iterMetrics: 'ok',
  item: 'AP-1',
  outcome: 'shipped',
  shipped: true,
  completion: 'complete',
  completionMissing: false,
  gateResult: 'passed',
  gateChecks: [{ label: 'typecheck', pass: true, durationMs: 10 }],
  guardDenials: 0,
  guardDenialDetails: [],
  resumed: null,
  sha: 'abc123',
  shaVerified: true,
  headAdvanced: true,
  headBefore: 'h0',
  headAfter: 'h1',
  testsBefore: 10,
  testsAfter: 13,
  testsDelta: 3,
  verifierUsed: null,
  kind: 'feat',
  area: null,
  deferredTo: null,
  testFirst: null,
  pickedRank: null,
  deviationReason: null,
  commitSubject: 'feat(engine): OTLP export for firing records',
};

function attr(attributes: readonly OtlpKeyValue[], key: string): OtlpKeyValue | undefined {
  return attributes.find((a) => a.key === key);
}

describe('toOtlpResourceSpans', () => {
  it('maps a shipped firing into a single-span OTLP/HTTP JSON payload', () => {
    const payload = toOtlpResourceSpans(BASE_RECORD);
    expect(payload.resourceSpans).toHaveLength(1);
    const [resourceSpan] = payload.resourceSpans;
    expect(attr(resourceSpan!.resource.attributes, 'service.name')).toEqual({
      key: 'service.name',
      value: { stringValue: 'autopilot' },
    });

    const [scopeSpan] = resourceSpan!.scopeSpans;
    expect(scopeSpan!.scope.name).toBe('autopilot.engine');

    const [span] = scopeSpan!.spans;
    expect(span!.name).toBe('autopilot.firing');
    expect(span!.status.code).toBe(OTLP_STATUS_OK);
    expect(attr(span!.attributes, 'gen_ai.request.model')).toEqual({
      key: 'gen_ai.request.model',
      value: { stringValue: 'opus' },
    });
    expect(attr(span!.attributes, 'gen_ai.usage.input_tokens')).toEqual({
      key: 'gen_ai.usage.input_tokens',
      value: { intValue: '100' },
    });
    expect(attr(span!.attributes, 'autopilot.cost_usd')).toEqual({
      key: 'autopilot.cost_usd',
      value: { doubleValue: 6.5 },
    });
    expect(attr(span!.attributes, 'autopilot.shipped')).toEqual({
      key: 'autopilot.shipped',
      value: { boolValue: true },
    });
    expect(attr(span!.attributes, 'autopilot.firing.number')).toEqual({
      key: 'autopilot.firing.number',
      value: { intValue: '1' },
    });
  });

  it('omits attributes for null fields instead of emitting a null value', () => {
    const record: FiringRecord = { ...BASE_RECORD, area: null, deferredTo: null, sha: null };
    const span = toOtlpResourceSpans(record).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    expect(attr(span.attributes, 'autopilot.area')).toBeUndefined();
    expect(attr(span.attributes, 'autopilot.deferred_to')).toBeUndefined();
    expect(attr(span.attributes, 'autopilot.git.sha')).toBeUndefined();
  });

  it('omits int/double attributes for null numeric fields', () => {
    const record: FiringRecord = {
      ...BASE_RECORD,
      tokensIn: null,
      cacheRead: null,
      testsBefore: null,
      costUsd: null,
    };
    const span = toOtlpResourceSpans(record).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    expect(attr(span.attributes, 'gen_ai.usage.input_tokens')).toBeUndefined();
    expect(attr(span.attributes, 'autopilot.tokens.cache_read')).toBeUndefined();
    expect(attr(span.attributes, 'autopilot.tests.before')).toBeUndefined();
    expect(attr(span.attributes, 'autopilot.cost_usd')).toBeUndefined();
  });

  it('emits autopilot.files as a newline-joined string, omitted when absent or empty', () => {
    const touched = toOtlpResourceSpans({
      ...BASE_RECORD,
      filesTouched: ['src/a.ts', 'docs/b.md'],
    }).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    expect(attr(touched.attributes, 'autopilot.files')).toEqual({
      key: 'autopilot.files',
      value: { stringValue: 'src/a.ts\ndocs/b.md' },
    });

    const absent = toOtlpResourceSpans(BASE_RECORD).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    expect(attr(absent.attributes, 'autopilot.files')).toBeUndefined();

    const empty = toOtlpResourceSpans({ ...BASE_RECORD, filesTouched: [] }).resourceSpans[0]!
      .scopeSpans[0]!.spans[0]!;
    expect(attr(empty.attributes, 'autopilot.files')).toBeUndefined();
  });

  it('treats a null durationMs as a zero-length span (end == start)', () => {
    const span = toOtlpResourceSpans({ ...BASE_RECORD, durationMs: null }).resourceSpans[0]!
      .scopeSpans[0]!.spans[0]!;
    expect(span.endTimeUnixNano).toBe(span.startTimeUnixNano);
  });

  it('sets ERROR status for a reverted firing, OK for a shipped one, UNSET otherwise', () => {
    const reverted = toOtlpResourceSpans({
      ...BASE_RECORD,
      gateResult: 'reverted',
      shipped: false,
    });
    expect(reverted.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.status.code).toBe(OTLP_STATUS_ERROR);

    const shipped = toOtlpResourceSpans(BASE_RECORD);
    expect(shipped.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.status.code).toBe(OTLP_STATUS_OK);

    const noop = toOtlpResourceSpans({
      ...BASE_RECORD,
      gateResult: 'no-commit',
      shipped: false,
      outcome: 'noop',
    });
    expect(noop.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.status.code).toBe(OTLP_STATUS_UNSET);
  });

  it('derives start/end times from ts + durationMs as unix nanoseconds', () => {
    const span = toOtlpResourceSpans(BASE_RECORD).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    const expectedStart = BigInt(Date.parse(BASE_RECORD.ts)) * 1_000_000n;
    const expectedEnd = BigInt(Date.parse(BASE_RECORD.ts) + BASE_RECORD.durationMs!) * 1_000_000n;
    expect(span.startTimeUnixNano).toBe(expectedStart.toString());
    expect(span.endTimeUnixNano).toBe(expectedEnd.toString());
  });

  it('is deterministic: the same record always yields the same trace/span IDs', () => {
    const first = toOtlpResourceSpans(BASE_RECORD).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    const second = toOtlpResourceSpans(BASE_RECORD).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    expect(first.traceId).toBe(second.traceId);
    expect(first.spanId).toBe(second.spanId);
    expect(first.traceId).toHaveLength(32);
    expect(first.spanId).toHaveLength(16);
    expect(first.traceId).not.toBe(first.spanId);
  });

  it('produces different trace IDs for different firings', () => {
    const a = toOtlpResourceSpans({ ...BASE_RECORD, firing: 1 }).resourceSpans[0]!.scopeSpans[0]!
      .spans[0]!;
    const b = toOtlpResourceSpans({ ...BASE_RECORD, firing: 2 }).resourceSpans[0]!.scopeSpans[0]!
      .spans[0]!;
    expect(a.traceId).not.toBe(b.traceId);
  });

  it('emits every declared gen_ai.* and autopilot.* attribute under its exact key', () => {
    const record: FiringRecord = {
      ...BASE_RECORD,
      area: 'engine',
      deferredTo: 'web-xyz',
      verifierUsed: 'human',
    };
    const span = toOtlpResourceSpans(record).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    expect(span.attributes.map((a) => a.key)).toEqual([
      'gen_ai.request.model',
      'gen_ai.usage.input_tokens',
      'gen_ai.usage.output_tokens',
      'autopilot.firing.number',
      'autopilot.firing.prompt_version',
      'autopilot.firing.retro',
      'autopilot.firing.attempts',
      'autopilot.quota.fallback',
      'autopilot.quota.streak',
      'autopilot.quota.global_exhaust',
      'autopilot.started_on',
      'autopilot.exit_code',
      'autopilot.max_turns_hit',
      'autopilot.cost_usd',
      'autopilot.tokens.cache_read',
      'autopilot.tokens.cache_create',
      'autopilot.iter_metrics',
      'autopilot.item',
      'autopilot.outcome',
      'autopilot.shipped',
      'autopilot.gate.result',
      'autopilot.git.sha',
      'autopilot.git.sha_verified',
      'autopilot.git.head_advanced',
      'autopilot.tests.before',
      'autopilot.tests.after',
      'autopilot.tests.delta',
      'autopilot.verifier_used',
      'autopilot.kind',
      'autopilot.area',
      'autopilot.deferred_to',
      'autopilot.commit_subject',
    ]);
  });

  it('omits a boolean attribute defensively when a required boolean field is corrupted to null', () => {
    const record = { ...BASE_RECORD, retro: null } as unknown as FiringRecord;
    const span = toOtlpResourceSpans(record).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    expect(attr(span.attributes, 'autopilot.firing.retro')).toBeUndefined();
  });

  it('sets ERROR status for a non-reverted firing whose isError is true', () => {
    const span = toOtlpResourceSpans({
      ...BASE_RECORD,
      gateResult: 'checkpointed',
      isError: true,
      shipped: false,
    }).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    expect(span.status.code).toBe(OTLP_STATUS_ERROR);
  });

  it('derives the trace ID as sha256(firing:ts:sha) truncated to 32 hex chars', () => {
    const span = toOtlpResourceSpans(BASE_RECORD).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    const seed = `${BASE_RECORD.firing}:${BASE_RECORD.ts}:${BASE_RECORD.sha}`;
    const expectedTraceId = createHash('sha256').update(seed).digest('hex').slice(0, 32);
    expect(span.traceId).toBe(expectedTraceId);
  });

  it('derives the span ID as sha256(span:firing:ts:sha) truncated to 16 hex chars', () => {
    const span = toOtlpResourceSpans(BASE_RECORD).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    const seed = `${BASE_RECORD.firing}:${BASE_RECORD.ts}:${BASE_RECORD.sha}`;
    const expectedSpanId = createHash('sha256').update(`span:${seed}`).digest('hex').slice(0, 16);
    expect(span.spanId).toBe(expectedSpanId);
  });

  it('produces different trace IDs for the same firing/ts when the sha differs', () => {
    const a = toOtlpResourceSpans({ ...BASE_RECORD, sha: 'sha-one' }).resourceSpans[0]!
      .scopeSpans[0]!.spans[0]!;
    const b = toOtlpResourceSpans({ ...BASE_RECORD, sha: 'sha-two' }).resourceSpans[0]!
      .scopeSpans[0]!.spans[0]!;
    expect(a.traceId).not.toBe(b.traceId);
  });

  it('seeds the trace ID with an empty string (not a placeholder) when sha is null', () => {
    const span = toOtlpResourceSpans({ ...BASE_RECORD, sha: null }).resourceSpans[0]!.scopeSpans[0]!
      .spans[0]!;
    const seed = `${BASE_RECORD.firing}:${BASE_RECORD.ts}:`;
    const expectedTraceId = createHash('sha256').update(seed).digest('hex').slice(0, 32);
    expect(span.traceId).toBe(expectedTraceId);
  });

  it('includes service.version only when provided', () => {
    const withVersion = toOtlpResourceSpans(BASE_RECORD, {
      serviceName: 'autopilot',
      serviceVersion: '0.11.0',
    });
    expect(attr(withVersion.resourceSpans[0]!.resource.attributes, 'service.version')).toEqual({
      key: 'service.version',
      value: { stringValue: '0.11.0' },
    });

    const withoutVersion = toOtlpResourceSpans(BASE_RECORD);
    expect(
      attr(withoutVersion.resourceSpans[0]!.resource.attributes, 'service.version'),
    ).toBeUndefined();
  });
});

describe('exportOtlpResourceSpans', () => {
  // Computed in beforeEach (not at describe scope) so a mutant that makes
  // toOtlpResourceSpans throw (e.g. an invalid hash algorithm) fails inside a
  // running test instead of crashing the whole suite at collection time,
  // which Stryker's vitest runner cannot attribute to any specific mutant.
  let payload: ReturnType<typeof toOtlpResourceSpans>;

  beforeEach(() => {
    payload = toOtlpResourceSpans(BASE_RECORD);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the global fetch when no fetchImpl is injected', async () => {
    const globalFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', globalFetch);

    const result = await exportOtlpResourceSpans(payload, {
      endpoint: 'https://collector.example/v1/traces',
    });

    expect(result).toEqual({ ok: true, status: 200, error: null });
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });

  it('POSTs the payload as JSON and reports ok on a 2xx response', async () => {
    const fetchImpl: OtlpFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await exportOtlpResourceSpans(payload, {
      endpoint: 'https://collector.example/v1/traces',
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, status: 200, error: null });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://collector.example/v1/traces');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('merges caller-supplied headers without dropping content-type', async () => {
    const fetchImpl: OtlpFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await exportOtlpResourceSpans(payload, {
      endpoint: 'https://collector.example/v1/traces',
      fetchImpl,
      headers: { authorization: 'Bearer token' },
    });

    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer token',
    });
  });

  it('reports a non-2xx response as a failed export without throwing', async () => {
    const fetchImpl: OtlpFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await exportOtlpResourceSpans(payload, {
      endpoint: 'https://collector.example/v1/traces',
      fetchImpl,
    });

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: 'OTLP export failed: HTTP 503',
    });
  });

  it('turns a network error into a failed result instead of throwing', async () => {
    const fetchImpl: OtlpFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await exportOtlpResourceSpans(payload, {
      endpoint: 'https://collector.example/v1/traces',
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, status: null, error: 'ECONNREFUSED' });
  });

  it('stringifies a non-Error rejection instead of crashing on `.message`', async () => {
    const fetchImpl: OtlpFetch = vi.fn().mockRejectedValue('connection reset');
    const result = await exportOtlpResourceSpans(payload, {
      endpoint: 'https://collector.example/v1/traces',
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, status: null, error: 'connection reset' });
  });

  it('defaults the abort timeout to 5000ms when timeoutMs is not specified', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const fetchImpl: OtlpFetch = vi.fn(
        (_url, init) =>
          new Promise<{ ok: boolean; status: number }>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          }),
      );
      const resultPromise = exportOtlpResourceSpans(payload, {
        endpoint: 'https://collector.example/v1/traces',
        fetchImpl,
      });

      // `options.timeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS` with timeoutMs
      // undefined must resolve to 5000, not to `undefined` (as a mutated
      // `&&` would yield) — so nothing should have aborted yet well short
      // of that.
      await vi.advanceTimersByTimeAsync(100);
      expect(aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(4900);
      expect(aborted).toBe(true);
      const result = await resultPromise;
      expect(result).toEqual({ ok: false, status: null, error: 'aborted' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the abort timer after a successful export, leaving no dangling timer', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl: OtlpFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      await exportOtlpResourceSpans(payload, {
        endpoint: 'https://collector.example/v1/traces',
        fetchImpl,
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts and reports failure when the request exceeds the timeout', async () => {
    const fetchImpl: OtlpFetch = vi.fn(
      (_url, init) =>
        new Promise<{ ok: boolean; status: number }>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new Error('This operation was aborted')),
          );
        }),
    );
    const result = await exportOtlpResourceSpans(payload, {
      endpoint: 'https://collector.example/v1/traces',
      fetchImpl,
      timeoutMs: 5,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toMatch(/aborted/i);
  });
});
