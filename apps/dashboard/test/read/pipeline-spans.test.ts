// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { toOtlpResourceSpans, type FiringRecord } from '@autopilot/engine';
import { firingPayloadSpan } from '../../src/read/pipeline-spans.js';

/** Same real, engine-shaped record the pipeline-graph golden test uses. */
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

describe('firingPayloadSpan', () => {
  it('round-trips a durable FiringRecord payload into the exact span the exporter emits', () => {
    const expected = toOtlpResourceSpans(BASE_RECORD).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;

    const span = firingPayloadSpan(JSON.stringify(BASE_RECORD));

    expect(span).toEqual(expected);
    expect(span!.name).toBe('autopilot.firing');
    // Deterministic identity: re-projecting the same payload yields byte-identical ids.
    expect(firingPayloadSpan(JSON.stringify(BASE_RECORD))).toEqual(span);
  });

  it('returns null for a firing that recorded no payload event', () => {
    expect(firingPayloadSpan(null)).toBeNull();
  });

  it('returns null for unparseable payload JSON', () => {
    expect(firingPayloadSpan('{not json')).toBeNull();
  });

  it('returns null for a payload that is not a record object', () => {
    expect(firingPayloadSpan('"just a string"')).toBeNull();
    expect(firingPayloadSpan('null')).toBeNull();
  });

  it('returns null when ts is missing or does not parse as a date', () => {
    const noTs = { ...BASE_RECORD, ts: undefined };
    expect(firingPayloadSpan(JSON.stringify(noTs))).toBeNull();
    const badTs = { ...BASE_RECORD, ts: 'not-a-date' };
    expect(firingPayloadSpan(JSON.stringify(badTs))).toBeNull();
  });
});
