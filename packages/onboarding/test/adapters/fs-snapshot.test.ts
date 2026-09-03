// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFsSnapshot } from '../../src/adapters/fs-snapshot.js';
import { detectGate } from '../../src/gate/detect.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return {
    ...actual,
    readdirSync: vi.fn(),
  };
});

describe('readFsSnapshot', () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-snap-'));
    const actual = await vi.importActual<typeof NodeFs>('node:fs');
    vi.mocked(readdirSync).mockImplementation(actual.readdirSync);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('walks the tree, ignores node_modules/.git, reads root manifests, and drives detection', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {};');
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'junk.js'), 'x');
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, '.git', 'config'), 'x');

    const snap = readFsSnapshot(dir);

    expect(snap.has('package.json')).toBe(true);
    expect(snap.has('src/index.ts')).toBe(true);
    expect(snap.files.some((f) => f.includes('node_modules'))).toBe(false);
    expect(snap.files.some((f) => f.includes('.git'))).toBe(false);
    expect(snap.read('package.json')).toContain('vitest');

    // End-to-end: detection over a real filesystem walk.
    const d = detectGate(snap);
    expect(d.spec.ecosystem).toBe('js');
    expect(d.spec.test?.label).toBe('pnpm run test');
  });

  it('degrades to an empty snapshot on a nonexistent directory', () => {
    const snap = readFsSnapshot(join(dir, 'does-not-exist'));
    expect(snap.files).toEqual([]);
    expect(detectGate(snap).spec.ecosystem).toBe('unknown');
  });

  it('honors the maxDepth bound', () => {
    mkdirSync(join(dir, 'a', 'b', 'c'), { recursive: true });
    writeFileSync(join(dir, 'a', 'at-limit.go'), 'package x');
    writeFileSync(join(dir, 'a', 'b', 'c', 'deep.go'), 'package x');
    const shallow = readFsSnapshot(dir, { maxDepth: 1 });
    // 'a/at-limit.go' sits exactly at depth 1 — still walked (the limit is
    // inclusive, `depth > maxDepth`, not `depth >= maxDepth`).
    expect(shallow.files.some((f) => f.endsWith('at-limit.go'))).toBe(true);
    expect(shallow.files.some((f) => f.endsWith('deep.go'))).toBe(false);
    const deep = readFsSnapshot(dir, { maxDepth: 6 });
    expect(deep.files.some((f) => f.endsWith('deep.go'))).toBe(true);
  });

  it('excludes an entry that is neither a directory nor a regular file', () => {
    const weird = { name: 'weird', isDirectory: () => false, isFile: () => false } as NodeFs.Dirent;
    const file = {
      name: 'keep.txt',
      isDirectory: () => false,
      isFile: () => true,
    } as NodeFs.Dirent;
    vi.mocked(readdirSync).mockImplementation(((_path: NodeFs.PathLike, _options: unknown) => [
      weird,
      file,
    ]) as typeof readdirSync);

    const snap = readFsSnapshot(dir);

    expect(snap.files).toEqual(['keep.txt']);
  });

  it('sorts the listed files regardless of directory-read order', () => {
    const makeFileEntry = (name: string): NodeFs.Dirent =>
      ({ name, isDirectory: () => false, isFile: () => true }) as NodeFs.Dirent;
    vi.mocked(readdirSync).mockImplementation(((_path: NodeFs.PathLike, _options: unknown) => [
      makeFileEntry('z.txt'),
      makeFileEntry('a.txt'),
    ]) as typeof readdirSync);

    const snap = readFsSnapshot(dir);

    expect(snap.files).toEqual(['a.txt', 'z.txt']);
  });

  it('reads content only for root-level manifests, not nested manifests or non-manifest root files', () => {
    writeFileSync(join(dir, 'package.json'), '{"root":true}');
    writeFileSync(join(dir, 'README.md'), 'not a manifest');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'package.json'), '{"nested":true}');

    const snap = readFsSnapshot(dir);

    expect(snap.read('package.json')).toBe('{"root":true}');
    expect(snap.read('README.md')).toBeNull();
    expect(snap.read('src/package.json')).toBeNull();
  });

  it('reads content for every recognized root-level manifest extension', () => {
    writeFileSync(join(dir, 'pyproject.toml'), 'py');
    writeFileSync(join(dir, 'Cargo.toml'), 'cargo');
    writeFileSync(join(dir, 'go.mod'), 'gomod');
    writeFileSync(join(dir, 'setup.cfg'), 'cfg');

    const snap = readFsSnapshot(dir);

    expect(snap.read('pyproject.toml')).toBe('py');
    expect(snap.read('Cargo.toml')).toBe('cargo');
    expect(snap.read('go.mod')).toBe('gomod');
    expect(snap.read('setup.cfg')).toBe('cfg');
  });
});
