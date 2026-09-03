// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { makeFsSnapshot } from '../../src/gate/snapshot.js';
import { triageFolder, DOMINANCE_RATIO } from '../../src/onboard/folder-triage.js';

function snapshotOf(files: readonly string[]) {
  return makeFsSnapshot({ files, contents: {} });
}

describe('triageFolder', () => {
  it('classifies an empty folder with no inventory', () => {
    const result = triageFolder(snapshotOf([]));
    expect(result).toEqual({ kind: 'empty', inventory: [], totalFiles: 0 });
  });

  it('classifies a folder dominated by code files', () => {
    const result = triageFolder(snapshotOf(['a.ts', 'b.ts', 'c.ts', 'readme.md']));
    expect(result.kind).toBe('code');
    expect(result.totalFiles).toBe(4);
  });

  it('classifies a folder dominated by docs files', () => {
    const result = triageFolder(snapshotOf(['a.md', 'b.txt', 'c.rst', 'd.png']));
    expect(result.kind).toBe('docs');
  });

  it('classifies a folder dominated by media files', () => {
    const result = triageFolder(snapshotOf(['a.png', 'b.jpg', 'c.mp4', 'd.json']));
    expect(result.kind).toBe('media');
  });

  it('classifies a folder dominated by data files', () => {
    const result = triageFolder(snapshotOf(['a.json', 'b.csv', 'c.yaml', 'd.png']));
    expect(result.kind).toBe('data');
  });

  it('names the folder "code" outright when a manifest marker is present, even without file-count dominance', () => {
    const result = triageFolder(
      snapshotOf(['package.json', 'a.png', 'b.jpg', 'c.mp4', 'd.gif', 'e.svg']),
    );
    expect(result.kind).toBe('code');
  });

  it('detects a manifest marker regardless of casing or directory nesting', () => {
    const result = triageFolder(snapshotOf(['nested/dir/Cargo.toml', 'a.png', 'b.jpg', 'c.mp4']));
    expect(result.kind).toBe('code');
  });

  it('falls back to "mixed" when no category reaches the dominance ratio', () => {
    const result = triageFolder(snapshotOf(['a.md', 'b.png', 'c.json', 'd.ts']));
    expect(result.kind).toBe('mixed');
  });

  it('falls back to "mixed" when unrecognized extensions dominate, never naming the kind "other"', () => {
    const result = triageFolder(snapshotOf(['a.xyz', 'b.xyz', 'c.xyz', 'd.md']));
    expect(result.kind).toBe('mixed');
    expect(result.inventory[0]).toEqual({ category: 'other', count: 3 });
  });

  it('counts "other" files toward the total, diluting dominance', () => {
    // 3 of 5 files are code (60%) — exactly at the ratio, so it still names
    // the kind despite two unrecognized files diluting the pool.
    const result = triageFolder(snapshotOf(['a.ts', 'b.ts', 'c.ts', 'd.xyz', 'e.xyz']));
    expect(result.kind).toBe('code');
  });

  it('requires the dominance ratio to be met, not merely approached', () => {
    // 2 of 4 files are code (50%), below DOMINANCE_RATIO (0.6) — mixed.
    expect(DOMINANCE_RATIO).toBe(0.6);
    const result = triageFolder(snapshotOf(['a.ts', 'b.ts', 'c.md', 'd.png']));
    expect(result.kind).toBe('mixed');
  });

  it('sorts inventory largest-first, breaking ties by category name', () => {
    const result = triageFolder(snapshotOf(['a.ts', 'b.md', 'c.png', 'd.json', 'e.ts', 'f.ts']));
    // code=3, then a four-way tie at 1 each (data, docs, media) sorted alphabetically.
    expect(result.inventory).toEqual([
      { category: 'code', count: 3 },
      { category: 'data', count: 1 },
      { category: 'docs', count: 1 },
      { category: 'media', count: 1 },
    ]);
  });

  it('treats a leading-dot basename as hidden, not as an extension', () => {
    const result = triageFolder(snapshotOf(['.gitignore', '.env', 'a.ts', 'b.ts', 'c.ts']));
    // '.gitignore' and '.env' both categorize as 'other' (no extension), so
    // code is 3 of 5 files (60%) — still dominant.
    expect(result.kind).toBe('code');
    expect(result.inventory).toContainEqual({ category: 'other', count: 2 });
  });
});
