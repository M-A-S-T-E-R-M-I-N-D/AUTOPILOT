// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../../src/index/language.js';
import {
  makeEntry,
  treeHash,
  diffIndex,
  summarize,
  rankHotFiles,
  buildIndex,
} from '../../src/index/core.js';
import type { IndexEntry } from '../../src/index/model.js';

const enc = (s: string) => new TextEncoder().encode(s);
const entry = (path: string, content: string): IndexEntry => makeEntry(path, enc(content));

describe('detectLanguage', () => {
  it('maps known extensions and degrades the rest to "other"', () => {
    expect(detectLanguage('a.ts')).toBe('typescript');
    expect(detectLanguage('src/deep/a.jsx')).toBe('javascript');
    expect(detectLanguage('m.py')).toBe('python');
    expect(detectLanguage('m.go')).toBe('go');
    expect(detectLanguage('m.rs')).toBe('rust');
    expect(detectLanguage('README.md')).toBe('markdown');
    expect(detectLanguage('Makefile')).toBe('other');
    expect(detectLanguage('x.unknownext')).toBe('other');
  });
});

describe('makeEntry', () => {
  it('hashes to 64 hex, records byte size and language', () => {
    const e = makeEntry('a.ts', enc('hello'));
    expect(e.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(e.size).toBe(5);
    expect(e.language).toBe('typescript');
  });

  it('pins the sha256 algorithm — a known input hashes to its known digest', () => {
    expect(makeEntry('a.ts', enc('hello')).contentHash).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

describe('treeHash', () => {
  it('is order-independent and changes iff a file changes', () => {
    const a = entry('a.ts', 'x');
    const b = entry('b.ts', 'y');
    expect(treeHash([a, b])).toBe(treeHash([b, a]));
    expect(treeHash([a, b])).not.toBe(treeHash([a, entry('b.ts', 'z')]));
  });

  it('pins the NUL/newline separator layout around path and contentHash', () => {
    expect(treeHash([entry('a.ts', 'x')])).toBe(
      '758c0120411e465e6f3aa450d9ff4d85ccbf1ec705e10ba263c4d73fce42516a',
    );
  });
});

describe('diffIndex', () => {
  it('classifies buckets; a changed hash invalidates only that file', () => {
    const prev = [entry('a.ts', '1'), entry('b.ts', '2'), entry('c.ts', '3')];
    const next = [entry('a.ts', '1'), entry('b.ts', 'CHANGED'), entry('d.ts', '4')];
    const d = diffIndex(prev, next);
    expect(d.unchanged.map((e) => e.path)).toEqual(['a.ts']);
    expect(d.changed.map((e) => e.path)).toEqual(['b.ts']);
    expect(d.added.map((e) => e.path)).toEqual(['d.ts']);
    expect(d.removed).toEqual(['c.ts']);
  });
});

describe('summarize / rankHotFiles / buildIndex', () => {
  const entries = [
    entry('src/a.ts', 'aaaa'),
    entry('src/b.ts', 'bb'),
    entry('app.py', 'p'),
    entry('README.md', ''),
  ];

  it('summarizes languages (desc by bytes), dirs, and depth', () => {
    const s = summarize(entries);
    expect(s.fileCount).toBe(4);
    expect(s.totalBytes).toBe(4 + 2 + 1 + 0);
    expect(s.languages[0]?.language).toBe('typescript');
    expect(s.languages[0]?.files).toBe(2); // src/a.ts + src/b.ts, not e.g. 0 or -2
    expect(s.topDirs).toContainEqual({ dir: 'src', files: 2 });
    expect(s.topDirs).toContainEqual({ dir: '.', files: 2 }); // app.py + README.md at root
    expect(s.maxDepth).toBe(1);
  });

  it('ranks hot files by size and builds a path-sorted index', () => {
    expect(rankHotFiles(entries, 2).map((h) => h.path)).toEqual(['src/a.ts', 'src/b.ts']);
    const idx = buildIndex(entries);
    expect(idx.entries.map((e) => e.path)).toEqual(['README.md', 'app.py', 'src/a.ts', 'src/b.ts']);
    expect(idx.treeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('breaks a topDirs file-count tie alphabetically by dir', () => {
    // 'src' and '.' (app.py + README.md) both hold 2 files — '.' must sort first.
    const s = summarize(entries);
    expect(s.topDirs).toEqual([
      { dir: '.', files: 2 },
      { dir: 'src', files: 2 },
    ]);
  });

  it('breaks a languages total-bytes tie alphabetically by language', () => {
    // typescript inserted before python — only the tie-break (not insertion
    // order) can produce the alphabetical result asserted below.
    const tied = [entry('b.ts', 'xyz'), entry('a.py', 'xyz')]; // both 3 bytes
    const s = summarize(tied);
    expect(s.languages.map((l) => l.language)).toEqual(['python', 'typescript']);
  });

  it('breaks a rankHotFiles size tie alphabetically by path', () => {
    const tied = [entry('z.ts', 'same'), entry('a.ts', 'same')]; // both 4 bytes
    expect(rankHotFiles(tied).map((h) => h.path)).toEqual(['a.ts', 'z.ts']);
  });

  it('breaks a same-size 3-way rankHotFiles tie regardless of input order', () => {
    // Every pairwise direction (b-vs-c, c-vs-a, b-vs-a) is exercised here —
    // only the real `a.path < b.path` comparison (not a stubbed constant)
    // can produce the fully alphabetical result asserted below.
    const tied = [entry('b.ts', 'same'), entry('c.ts', 'same'), entry('a.ts', 'same')];
    expect(rankHotFiles(tied).map((h) => h.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('keeps duplicate-path entries in original relative order (byPath exact-match tie)', () => {
    // Neither path is < nor > the other — only the comparator's final `0` branch
    // (a real content-hash mismatch under one path, e.g. a stale duplicate scan)
    // decides this, and a stable sort must then preserve input order.
    const first = entry('dup.ts', 'first-content');
    const second = entry('dup.ts', 'second-content');
    const idx = buildIndex([first, second]);
    expect(idx.entries.map((e) => e.contentHash)).toEqual([first.contentHash, second.contentHash]);
  });
});
