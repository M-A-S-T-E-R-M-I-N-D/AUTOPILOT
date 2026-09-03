// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, migrate, type Store } from '../src/index.js';
import { openVectorStore, EMBEDDING_DIM, type SqliteVecStore } from '../src/vector.js';

let store: Store;
let vec: SqliteVecStore;

/** A deterministic 384-dim unit-ish vector with weight concentrated at `hot`. */
function v(hot: number, value = 1): Float32Array {
  const arr = new Float32Array(EMBEDDING_DIM);
  arr[hot] = value;
  return arr;
}

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
  const opened = openVectorStore(store);
  if (opened === null) throw new Error('sqlite-vec must load on dev/CI platforms');
  vec = opened;
});
afterEach(() => store.close());

describe('openVectorStore', () => {
  it('returns null (never throws) when the extension cannot load', () => {
    const broken = openVectorStore(store, () => {
      throw new Error('unsupported platform');
    });
    expect(broken).toBeNull();
  });

  it('is idempotent (IF NOT EXISTS) across repeated opens', () => {
    expect(openVectorStore(store)).not.toBeNull();
    expect(openVectorStore(store)).not.toBeNull();
  });
});

describe('SqliteVecStore', () => {
  it('upserts, counts, and finds nearest neighbours project-scoped', () => {
    vec.upsert('p1', 'cart.ts', v(0));
    vec.upsert('p1', 'auth.ts', v(0, 0.9)); // near cart.ts direction
    vec.upsert('p1', 'pay.ts', v(1)); // orthogonal
    vec.upsert('p2', 'other.ts', v(0)); // another project — must not leak across

    const hits = vec.knn('p1', v(0), 2);
    expect(hits.map((h) => h.path)).toEqual(['cart.ts', 'auth.ts']);
    expect(hits[0]?.distance ?? 1).toBeLessThan(hits[1]?.distance ?? 0 + 1);
    expect(vec.count('p1')).toBe(3);
    expect(vec.count('p2')).toBe(1);
  });

  it('re-upserting a path replaces its vector (no duplicates)', () => {
    vec.upsert('p1', 'cart.ts', v(0));
    vec.upsert('p1', 'cart.ts', v(5));
    expect(vec.count('p1')).toBe(1);
    // Now nearest to direction 5, far from direction 0.
    expect(vec.knn('p1', v(5), 1)[0]?.path).toBe('cart.ts');
    expect(vec.knn('p1', v(5), 1)[0]?.distance).toBeCloseTo(0);
  });

  it('removes one path or a whole project', () => {
    vec.upsert('p1', 'a.ts', v(0));
    vec.upsert('p1', 'b.ts', v(1));
    vec.remove('p1', 'a.ts');
    expect(vec.count('p1')).toBe(1);
    vec.remove('p1');
    expect(vec.count('p1')).toBe(0);
  });

  it('rejects wrong-dimension upserts and returns [] for wrong-dimension queries', () => {
    expect(() => vec.upsert('p1', 'x.ts', new Float32Array(3))).toThrow(/384/);
    expect(vec.knn('p1', new Float32Array(3), 2)).toEqual([]);
  });

  it('clamps k so a zero/negative/unbounded caller value cannot crash the query', () => {
    vec.upsert('p1', 'a.ts', v(0));
    vec.upsert('p1', 'b.ts', v(1));
    expect(() => vec.knn('p1', v(0), 0)).not.toThrow();
    expect(vec.knn('p1', v(0), 0)).toHaveLength(1); // clamped up to 1
    expect(() => vec.knn('p1', v(0), -5)).not.toThrow();
    expect(() => vec.knn('p1', v(0), 10_000)).not.toThrow();
    expect(vec.knn('p1', v(0), 10_000)).toHaveLength(2); // clamped down, capped by rows present
  });

  it('clamps a NaN k instead of crashing (Math.max/min/floor all propagate NaN)', () => {
    vec.upsert('p1', 'a.ts', v(0));
    vec.upsert('p1', 'b.ts', v(1));
    expect(() => vec.knn('p1', v(0), Number.NaN)).not.toThrow();
    expect(vec.knn('p1', v(0), Number.NaN)).toHaveLength(1); // NaN clamped to floor (1)
  });
});
