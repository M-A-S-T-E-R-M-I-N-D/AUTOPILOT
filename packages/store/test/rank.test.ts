// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion, RRF_K } from '../src/rank.js';

describe('reciprocalRankFusion', () => {
  it('fuses two ranked lists by rank position (k=60 default, per the RRF paper)', () => {
    const fused = reciprocalRankFusion([
      ['a.ts', 'b.ts', 'c.ts'], // keyword (BM25) ranking
      ['b.ts', 'a.ts', 'd.ts'], // vector ranking
    ]);
    // b: 1/(60+2) + 1/(60+1) > a: 1/(60+1) + 1/(60+2) — equal, then a vs b tie…
    // a and b tie exactly (symmetric ranks) → stable order by first appearance.
    expect(
      fused
        .slice(0, 2)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['a.ts', 'b.ts']);
    // c and d each appear once at rank 3 → tie below a/b.
    expect(fused.map((r) => r.id)).toHaveLength(4);
    expect(fused[2]?.score).toBeGreaterThan(0);
  });

  it('ranks a document found by BOTH retrievers above one found by only one', () => {
    const fused = reciprocalRankFusion([
      ['both.ts', 'kw-only.ts'],
      ['both.ts', 'vec-only.ts'],
    ]);
    expect(fused[0]?.id).toBe('both.ts');
    expect(fused[0]?.score).toBeGreaterThan(fused[1]?.score ?? 0);
  });

  it('a high rank in one list beats mediocre ranks when k weighting says so', () => {
    // doc X is #1 for keywords only; doc Y is #5 in both lists.
    const lists = [
      ['x.ts', 'p1', 'p2', 'p3', 'y.ts'],
      ['q1', 'q2', 'q3', 'q4', 'y.ts'],
    ];
    const fused = reciprocalRankFusion(lists);
    const x = fused.find((r) => r.id === 'x.ts');
    const y = fused.find((r) => r.id === 'y.ts');
    // 1/(60+1) ≈ .0164 vs 2×1/(60+5) ≈ .0308 → y wins (both-lists consensus).
    expect((y?.score ?? 0) > (x?.score ?? 0)).toBe(true);
  });

  it('handles empty inputs and a custom k', () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
    const fused = reciprocalRankFusion([['a']], 1);
    expect(fused[0]?.score).toBeCloseTo(1 / (1 + 1));
  });

  it('exports the standard k from the paper', () => {
    expect(RRF_K).toBe(60);
  });

  it('returns results sorted by score descending — not by insertion or list order', () => {
    // First-seen (insertion) order across the scan is mid, low, high — the
    // OPPOSITE of the correct score order below, and its reverse doesn't
    // match either. A missing sort, a no-op sort, or a sort with the
    // comparator's subtraction flipped to addition would all produce some
    // order other than this exact one.
    const fused = reciprocalRankFusion([
      ['mid.ts', 'low.ts', 'high.ts'],
      ['high.ts'], // high.ts ranked #1 here too → highest total score
    ]);
    expect(fused.map((r) => r.id)).toEqual(['high.ts', 'mid.ts', 'low.ts']);
  });

  it('skips a hole in a sparse ranked list (defensive out-of-bounds guard)', () => {
    // eslint-disable-next-line no-sparse-arrays -- exercises the `id === undefined` guard
    const sparse = ['a.ts', , 'c.ts'] as readonly string[];
    const fused = reciprocalRankFusion([sparse]);
    expect(fused.map((r) => r.id)).toEqual(['a.ts', 'c.ts']);
  });
});
