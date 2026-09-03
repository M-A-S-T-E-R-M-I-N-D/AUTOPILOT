// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure search-bar math (`web/search-history.ts`)
 * — extracted under epic 0002 "shell decomposition", slice 2.
 * `search-history.test.ts` already regression-tests the remembered-query
 * dedupe/cap behavior indirectly through the rendered DOM in `clientJs()`;
 * these tests exercise the real functions directly instead. `searchProjectsSig`
 * (thirty-second cut) had no test coverage at all beforehand, direct or
 * indirect — no test asserted that an unchanged project set leaves the
 * `<select>` untouched versus a changed set rebuilding it. `searchHitMeta`
 * (sixty-second cut) previously only had indirect DOM coverage
 * (`search-hit-tooltips.test.ts`), and only ever against a single score
 * (3.256) — never a score that rounds differently (down vs up), an
 * already-round score, or a zero score.
 */

import { describe, it, expect } from 'vitest';
import {
  rememberedHistory,
  searchProjectsSig,
  searchHitMeta,
} from '../../src/web/search-history.js';

describe('rememberedHistory', () => {
  it('adds a new query to the front of an empty list', () => {
    expect(rememberedHistory([], 'find the flight runner', 10)).toEqual(['find the flight runner']);
  });

  it('moves a repeated query to the front instead of duplicating it', () => {
    expect(rememberedHistory(['a', 'b', 'c'], 'b', 10)).toEqual(['b', 'a', 'c']);
  });

  it('caps the result at max entries, dropping the oldest', () => {
    const list = Array.from({ length: 10 }, (_, i) => 'query ' + i);
    expect(rememberedHistory(list, 'new query', 10)).toEqual(['new query', ...list.slice(0, 9)]);
  });

  it('does not mutate the input array', () => {
    const list = ['a', 'b', 'c'];
    rememberedHistory(list, 'b', 10);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty list for max = 0 instead of throwing', () => {
    expect(rememberedHistory(['a', 'b'], 'c', 0)).toEqual([]);
  });

  it('returns an empty list for a negative max instead of throwing RangeError', () => {
    // Array.prototype.length rejects negative assignments outright
    // (`[].length = -1` throws `RangeError: Invalid array length`) — a
    // negative max must clamp to empty, not propagate the crash.
    expect(rememberedHistory(['a', 'b'], 'c', -1)).toEqual([]);
  });
});

describe('searchProjectsSig', () => {
  it('produces the same signature for the same project set', () => {
    const projects = [
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' },
    ];
    expect(searchProjectsSig(projects)).toBe(searchProjectsSig(projects.slice()));
  });

  it('changes when a project is added', () => {
    const before = [{ id: 'p1', name: 'Alpha' }];
    const after = [
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' },
    ];
    expect(searchProjectsSig(before)).not.toBe(searchProjectsSig(after));
  });

  it('changes when a project is renamed', () => {
    const before = [{ id: 'p1', name: 'Alpha' }];
    const after = [{ id: 'p1', name: 'Alpha renamed' }];
    expect(searchProjectsSig(before)).not.toBe(searchProjectsSig(after));
  });

  it('falls back to slug then id when name is missing', () => {
    expect(searchProjectsSig([{ id: 'p1', slug: 'alpha-slug' }])).not.toBe(
      searchProjectsSig([{ id: 'p1', name: 'Alpha' }]),
    );
    expect(searchProjectsSig([{ id: 'p1' }])).toContain('p1');
  });

  it('returns an empty string for an empty project list', () => {
    expect(searchProjectsSig([])).toBe('');
  });
});

describe('searchHitMeta', () => {
  it('rounds the score down to one decimal in the tip', () => {
    expect(searchHitMeta('src/foo.ts', 'typescript', 3.256)).toEqual({
      tip: 'typescript — relevance 3.3 (higher matches better)',
      ariaLabel: 'src/foo.ts: typescript — relevance 3.3',
    });
  });

  it('rounds the score up to one decimal in the tip', () => {
    expect(searchHitMeta('src/bar.ts', 'python', 1.24)).toEqual({
      tip: 'python — relevance 1.2 (higher matches better)',
      ariaLabel: 'src/bar.ts: python — relevance 1.2',
    });
  });

  it('keeps a trailing .0 for an already-round score', () => {
    expect(searchHitMeta('src/baz.ts', 'go', 2)).toEqual({
      tip: 'go — relevance 2.0 (higher matches better)',
      ariaLabel: 'src/baz.ts: go — relevance 2.0',
    });
  });

  it('handles a zero score', () => {
    expect(searchHitMeta('src/qux.ts', 'rust', 0)).toEqual({
      tip: 'rust — relevance 0.0 (higher matches better)',
      ariaLabel: 'src/qux.ts: rust — relevance 0.0',
    });
  });

  // D1 ATTRIBUTE PAYLOAD (epic 0015): aria-label must not duplicate the
  // full data-tip sentence verbatim — it states the same path/language/
  // score facts, not the "(higher matches better)" explanatory clause the
  // tip alone owns.
  it('does not duplicate the explanatory tip clause into the aria-label', () => {
    expect(searchHitMeta('src/foo.ts', 'typescript', 3.256).ariaLabel).not.toContain(
      'higher matches better',
    );
  });
});
