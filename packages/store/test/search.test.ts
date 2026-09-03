// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, migrate, type Store } from '../src/index.js';
import { SqliteSearchStore, buildMatchExpression } from '../src/search.js';
import { openVectorStore, EMBEDDING_DIM, type SqliteVecStore } from '../src/vector.js';

let store: Store;
let search: SqliteSearchStore;

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
  search = new SqliteSearchStore(store);
});

afterEach(() => {
  store.close();
});

describe('buildMatchExpression', () => {
  it('extracts word tokens, quotes them, and ORs for recall', () => {
    expect(buildMatchExpression('how does the cart work')).toBe(
      '"how" OR "does" OR "the" OR "cart" OR "work"',
    );
  });

  it('drops tokens shorter than the trigram floor (3 chars)', () => {
    expect(buildMatchExpression('a to cart')).toBe('"cart"');
  });

  it('de-dupes repeated tokens', () => {
    expect(buildMatchExpression('cart cart cart')).toBe('"cart"');
  });

  it('neutralizes FTS5 syntax by keeping only word chars (no injection)', () => {
    // Quotes, NEAR(), *, : etc. are stripped — the expression is just safe tokens.
    expect(buildMatchExpression('" OR project_id MATCH "x')).toBe('"project_id" OR "match"');
  });

  it('returns null when nothing usable remains', () => {
    expect(buildMatchExpression('!! ?? **')).toBeNull();
    expect(buildMatchExpression('')).toBeNull();
  });
});

describe('SqliteSearchStore', () => {
  function seed(): void {
    search.indexDocument(
      'p1',
      'src/cart.ts',
      'export function addToCart(item) { return items.concat(item); }',
      'typescript',
    );
    search.indexDocument(
      'p1',
      'src/pay.ts',
      'export function pay(amount) { return charge(amount); }',
      'typescript',
    );
    search.indexDocument('p2', 'other.ts', 'export const cart = [];', 'typescript');
  }

  it('indexes and counts documents per project', () => {
    seed();
    expect(search.documentCount('p1')).toBe(2);
    expect(search.documentCount('p2')).toBe(1);
    expect(search.documentCount('missing')).toBe(0);
  });

  it('retrieves by substring inside a code identifier (trigram)', () => {
    seed();
    const hits = search.search('p1', 'cart');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.path).toBe('src/cart.ts');
    expect(hits[0]?.snippet).toContain('[Cart]');
    expect(hits[0]?.score).toBeGreaterThan(0);
  });

  it('scopes results to the requested project only', () => {
    seed();
    const hits = search.search('p2', 'cart');
    expect(hits.map((h) => h.path)).toEqual(['other.ts']);
  });

  it('ranks the more relevant document first', () => {
    search.indexDocument('p1', 'a.ts', 'cart cart cart cart cart', 'ts');
    search.indexDocument('p1', 'b.ts', 'cart mentioned once here', 'ts');
    const hits = search.search('p1', 'cart');
    expect(hits[0]?.path).toBe('a.ts');
    expect(hits[0]?.score).toBeGreaterThanOrEqual(hits[1]?.score ?? 0);
  });

  it('re-indexing a path replaces the old content (idempotent per path)', () => {
    search.indexDocument('p1', 'src/cart.ts', 'export function addToCart() {}', 'ts');
    expect(search.search('p1', 'addToCart')).toHaveLength(1);

    search.indexDocument('p1', 'src/cart.ts', 'export function removeFromCart() {}', 'ts');
    expect(search.documentCount('p1')).toBe(1); // not duplicated
    expect(search.search('p1', 'addToCart')).toHaveLength(0); // old content gone
    expect(search.search('p1', 'removeFromCart')).toHaveLength(1);
  });

  it('removes a single document and a whole project', () => {
    seed();
    search.removeDocument('p1', 'src/cart.ts');
    expect(search.search('p1', 'cart')).toHaveLength(0);
    expect(search.documentCount('p1')).toBe(1);

    search.removeProject('p1');
    expect(search.documentCount('p1')).toBe(0);
    expect(search.documentCount('p2')).toBe(1); // other project untouched
  });

  it('returns an empty list for an unusable query', () => {
    seed();
    expect(search.search('p1', '!!')).toEqual([]);
  });

  it('caps the result count', () => {
    for (let i = 0; i < 10; i += 1) {
      search.indexDocument('p1', `f${i}.ts`, 'cart widget component', 'ts');
    }
    expect(search.search('p1', 'cart', 3)).toHaveLength(3);
  });

  it('clamps a NaN limit instead of crashing on the SQL LIMIT bind', () => {
    // Math.max/min/floor all propagate NaN, so a NaN limit reached the SQL
    // `LIMIT ?` bind unclamped and better-sqlite3 throws "datatype mismatch" —
    // the same failure class clampFiringsPage in read.ts already guards against.
    seed();
    expect(() => search.search('p1', 'cart', Number.NaN)).not.toThrow();
    expect(search.search('p1', 'cart', Number.NaN)).toHaveLength(1);
  });

  it('returns a document’s full indexed content (for retrieval-augmented ask)', () => {
    seed();
    expect(search.documentContent('p1', 'src/cart.ts')).toContain('addToCart');
    expect(search.documentContent('p1', 'missing.ts')).toBeNull();
    expect(search.documentContent('p2', 'src/cart.ts')).toBeNull(); // project-scoped
  });
});

describe('hybridSearch (BM25 ⊕ vectors via RRF)', () => {
  const dim = EMBEDDING_DIM;
  const v = (hot: number): Float32Array => {
    const arr = new Float32Array(dim);
    arr[hot] = 1;
    return arr;
  };

  function seedHybrid(): SqliteVecStore {
    const vec = openVectorStore(store);
    if (vec === null) throw new Error('sqlite-vec must load in tests');
    search.indexDocument('p1', 'cart.ts', 'export function addToCart(item) {}', 'ts');
    search.indexDocument('p1', 'checkout.ts', 'export function checkout(cart) {}', 'ts');
    search.indexDocument('p1', 'billing.ts', 'export function charge(invoice) {}', 'ts');
    vec.upsert('p1', 'cart.ts', v(0));
    vec.upsert('p1', 'billing.ts', v(1));
    return vec;
  }

  it('is plain BM25 when there is no vector store or no query vector', () => {
    seedHybrid();
    const noVec = search.hybridSearch('p1', 'cart', null, null);
    expect(noVec.map((h) => h.path)).toContain('cart.ts');
  });

  it('degrades to plain BM25 when the vector store exists but has zero hits for the project', () => {
    // A vec store is open and a query vector is supplied, but nothing has been
    // upserted for this project yet (e.g. embeddings backfill hasn't run) —
    // knn() returns [], so the fused-ranking path must not be taken.
    const vec = openVectorStore(store);
    if (vec === null) throw new Error('sqlite-vec must load in tests');
    search.indexDocument('p1', 'cart.ts', 'export function addToCart(item) {}', 'ts');

    const hits = search.hybridSearch('p1', 'cart', v(0), vec);
    expect(hits.map((h) => h.path)).toEqual(search.search('p1', 'cart').map((h) => h.path));
  });

  it('a doc ranked by BOTH legs beats keyword-only and vector-only docs', () => {
    const vec = seedHybrid();
    // Query text says "cart" (matches cart.ts + checkout.ts); query vector points
    // at cart.ts's direction. cart.ts is in both legs → consensus top.
    const hits = search.hybridSearch('p1', 'cart', v(0), vec);
    expect(hits[0]?.path).toBe('cart.ts');
  });

  it('surfaces a vector-only hit (semantic match with zero keyword overlap)', () => {
    const vec = seedHybrid();
    // Text query matches nothing about billing; the vector leg finds billing.ts.
    const hits = search.hybridSearch('p1', 'cart', v(1), vec);
    const billing = hits.find((h) => h.path === 'billing.ts');
    expect(billing).toBeDefined();
    expect(billing?.snippet).toContain('charge'); // content excerpt, not BM25 snippet
    expect(billing?.language).toBe('ts');
  });

  it('falls back to "other"/empty-snippet for a vector-only hit never FTS-indexed', () => {
    // A path can be embedded (e.g. a binary asset run through an image captioner)
    // without ever going through indexDocument, so it has no project_search row at
    // all — documentContent/languageOf both resolve to null for it.
    const vec = openVectorStore(store);
    if (vec === null) throw new Error('sqlite-vec must load in tests');
    search.indexDocument('p1', 'cart.ts', 'export function addToCart(item) {}', 'ts');
    vec.upsert('p1', 'cart.ts', v(0));
    vec.upsert('p1', 'ghost.png', v(1));

    const hits = search.hybridSearch('p1', 'cart', v(1), vec);
    const ghost = hits.find((h) => h.path === 'ghost.png');
    expect(ghost).toBeDefined();
    expect(ghost?.language).toBe('other');
    expect(ghost?.snippet).toBe('');
  });

  it("clamps a negative limit instead of crashing (matches search()'s own clamp)", () => {
    // search() clamps limit to >= 1 before it ever reaches SQL (line 162), but
    // hybridSearch's vector leg and final slice used the raw, unclamped limit —
    // vec.knn's underlying `k = ?` binding throws on a negative k, so a caller
    // whose limit arithmetic can go negative (e.g. pagination) got a crash from
    // the vector leg despite the doc comment's "callers never branch" promise.
    const vec = seedHybrid();
    expect(() => search.hybridSearch('p1', 'cart', v(0), vec, -1)).not.toThrow();
    const hits = search.hybridSearch('p1', 'cart', v(0), vec, -1);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('caps the fused result count at MAX_LIMIT (50), same as search()', () => {
    const vec = openVectorStore(store);
    if (vec === null) throw new Error('sqlite-vec must load in tests');
    for (let i = 0; i < 60; i += 1) {
      search.indexDocument('p1', `f${i}.ts`, 'cart widget component', 'ts');
      vec.upsert('p1', `f${i}.ts`, v(0));
    }
    const hits = search.hybridSearch('p1', 'cart', v(0), vec, 1000);
    expect(hits.length).toBeLessThanOrEqual(50);
  });
});
