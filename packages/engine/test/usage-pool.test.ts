// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  parseTranscriptLine,
  parseTranscriptJsonl,
  dedupeTranscriptEntries,
  sumListPriceCostUsd,
  computeRealCostUsd,
  type TranscriptCostEntry,
} from '../src/usage-pool.js';

function line(o: Record<string, unknown>): string {
  return JSON.stringify(o);
}

describe('parseTranscriptLine', () => {
  it('extracts message.id, requestId, timestamp, and costUSD', () => {
    const entry = parseTranscriptLine(
      line({
        type: 'assistant',
        message: { id: 'msg_1', role: 'assistant' },
        requestId: 'req_1',
        timestamp: '2026-08-01T00:00:00.000Z',
        costUSD: 0.5,
      }),
    );
    expect(entry).toEqual({
      dedupeKey: JSON.stringify(['msg_1', 'req_1']),
      timestampMs: Date.parse('2026-08-01T00:00:00.000Z'),
      costUsd: 0.5,
    });
  });

  it('returns null for a blank line', () => {
    expect(parseTranscriptLine('')).toBeNull();
    expect(parseTranscriptLine('   ')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseTranscriptLine('{not json')).toBeNull();
  });

  it('returns null for a non-object JSON value', () => {
    expect(parseTranscriptLine('42')).toBeNull();
    expect(parseTranscriptLine('null')).toBeNull();
  });

  it('has a null dedupeKey when neither message.id nor requestId is present', () => {
    const entry = parseTranscriptLine(line({ timestamp: '2026-08-01T00:00:00.000Z', costUSD: 1 }));
    expect(entry?.dedupeKey).toBeNull();
  });

  it('has a null timestampMs when timestamp is absent or unparseable', () => {
    expect(parseTranscriptLine(line({ costUSD: 1 }))?.timestampMs).toBeNull();
    expect(
      parseTranscriptLine(line({ timestamp: 'not-a-date', costUSD: 1 }))?.timestampMs,
    ).toBeNull();
  });

  it('has a null costUsd when costUSD is absent', () => {
    expect(
      parseTranscriptLine(line({ timestamp: '2026-08-01T00:00:00.000Z' }))?.costUsd,
    ).toBeNull();
  });

  it('does not collide dedupeKeys when message.id or requestId itself contains the delimiter', () => {
    const a = parseTranscriptLine(line({ message: { id: 'a:b' }, requestId: 'c' }));
    const b = parseTranscriptLine(line({ message: { id: 'a' }, requestId: 'b:c' }));
    expect(a?.dedupeKey).not.toBeNull();
    expect(a?.dedupeKey).not.toEqual(b?.dedupeKey);
  });

  it('does not collide a genuinely absent id with an empty-string id', () => {
    const absent = parseTranscriptLine(line({ requestId: 'r' }));
    const empty = parseTranscriptLine(line({ message: { id: '' }, requestId: 'r' }));
    expect(absent?.dedupeKey).not.toEqual(empty?.dedupeKey);
  });
});

describe('parseTranscriptJsonl', () => {
  it('parses every non-blank line and drops malformed ones', () => {
    const raw = [
      line({
        message: { id: 'a' },
        requestId: 'r1',
        timestamp: '2026-08-01T00:00:00.000Z',
        costUSD: 1,
      }),
      '',
      '{broken',
      line({
        message: { id: 'b' },
        requestId: 'r2',
        timestamp: '2026-08-02T00:00:00.000Z',
        costUSD: 2,
      }),
    ].join('\n');
    const entries = parseTranscriptJsonl(raw);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.dedupeKey)).toEqual([
      JSON.stringify(['a', 'r1']),
      JSON.stringify(['b', 'r2']),
    ]);
  });
});

describe('dedupeTranscriptEntries', () => {
  function entry(partial: Partial<TranscriptCostEntry>): TranscriptCostEntry {
    return { dedupeKey: null, timestampMs: null, costUsd: null, ...partial };
  }

  it('keeps the latest-timestamped entry for a repeated key (avoids ccusage #888 first-wins undercount)', () => {
    const intermediate = entry({ dedupeKey: 'k', timestampMs: 100, costUsd: 0.1 });
    const final = entry({ dedupeKey: 'k', timestampMs: 200, costUsd: 0.9 });
    // intermediate appears first in the array (as it would in a real transcript)
    const deduped = dedupeTranscriptEntries([intermediate, final]);
    expect(deduped).toEqual([final]);
  });

  it('keeps every entry with a null dedupeKey (nothing to dedupe against)', () => {
    const a = entry({ dedupeKey: null, costUsd: 1 });
    const b = entry({ dedupeKey: null, costUsd: 2 });
    expect(dedupeTranscriptEntries([a, b])).toEqual([a, b]);
  });

  it('is unaffected by input order when timestamps differ', () => {
    const earlier = entry({ dedupeKey: 'k', timestampMs: 1, costUsd: 1 });
    const later = entry({ dedupeKey: 'k', timestampMs: 2, costUsd: 2 });
    expect(dedupeTranscriptEntries([later, earlier])).toEqual([later]);
  });
});

describe('sumListPriceCostUsd', () => {
  function entry(partial: Partial<TranscriptCostEntry>): TranscriptCostEntry {
    return { dedupeKey: null, timestampMs: null, costUsd: null, ...partial };
  }

  it('sums cost for entries within the window', () => {
    const entries = [
      entry({ dedupeKey: 'a', timestampMs: 1_000, costUsd: 1 }),
      entry({ dedupeKey: 'b', timestampMs: 2_000, costUsd: 2 }),
    ];
    expect(sumListPriceCostUsd(entries, 0, 3_000)).toBe(3);
  });

  it('excludes entries outside [windowStartMs, windowEndMs)', () => {
    const entries = [
      entry({ dedupeKey: 'a', timestampMs: 500, costUsd: 1 }), // before window
      entry({ dedupeKey: 'b', timestampMs: 1_500, costUsd: 2 }), // in window
      entry({ dedupeKey: 'c', timestampMs: 3_000, costUsd: 4 }), // at/after end (exclusive)
    ];
    expect(sumListPriceCostUsd(entries, 1_000, 3_000)).toBe(2);
  });

  it('excludes entries with no parseable timestamp rather than assuming in-window', () => {
    const entries = [entry({ dedupeKey: 'a', timestampMs: null, costUsd: 5 })];
    expect(sumListPriceCostUsd(entries, 0, 10_000)).toBe(0);
  });

  it('treats a null costUsd as contributing nothing', () => {
    const entries = [entry({ dedupeKey: 'a', timestampMs: 1_000, costUsd: null })];
    expect(sumListPriceCostUsd(entries, 0, 2_000)).toBe(0);
  });

  it('deduplicates by dedupeKey before summing', () => {
    const entries = [
      entry({ dedupeKey: 'k', timestampMs: 1_000, costUsd: 1 }),
      entry({ dedupeKey: 'k', timestampMs: 1_500, costUsd: 9 }), // supersedes the entry above
    ];
    expect(sumListPriceCostUsd(entries, 0, 2_000)).toBe(9);
  });

  it('returns 0 for an empty entry list', () => {
    expect(sumListPriceCostUsd([], 0, 1_000)).toBe(0);
  });
});

describe('computeRealCostUsd', () => {
  it('scales costUsd by subscriptionPriceUsd / machineWide30dListPriceUsd', () => {
    // this firing cost $10 of the machine's $100 30d list-price pool; the
    // subscription's real fixed price is $20 → this firing's real share is $2
    expect(computeRealCostUsd(10, 20, 100)).toBe(2);
  });

  it('returns 0 when costUsd is 0, regardless of the ratio', () => {
    expect(computeRealCostUsd(0, 20, 100)).toBe(0);
  });

  it('returns null when costUsd is null', () => {
    expect(computeRealCostUsd(null, 20, 100)).toBeNull();
  });

  it('returns null when subscriptionPriceUsd is null (operator has not configured it)', () => {
    expect(computeRealCostUsd(10, null, 100)).toBeNull();
  });

  it('returns null when machineWide30dListPriceUsd is null (pool entirely unreadable)', () => {
    expect(computeRealCostUsd(10, 20, null)).toBeNull();
  });

  it('returns null when machineWide30dListPriceUsd is 0 (avoids a divide-by-zero)', () => {
    expect(computeRealCostUsd(10, 20, 0)).toBeNull();
  });

  it('returns null when machineWide30dListPriceUsd is negative (nonsensical denominator)', () => {
    expect(computeRealCostUsd(10, 20, -5)).toBeNull();
  });
});
