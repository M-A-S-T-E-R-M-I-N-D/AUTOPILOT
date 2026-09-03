// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsFileSource } from '../../src/adapters/fs-file-source.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return {
    ...actual,
    readdirSync: vi.fn(),
  };
});

describe('FsFileSource', () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-fs-source-'));
    const actual = await vi.importActual<typeof NodeFs>('node:fs');
    vi.mocked(readdirSync).mockImplementation(actual.readdirSync);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads a file relative to the root', async () => {
    writeFileSync(join(dir, 'a.txt'), 'hello');
    const source = new FsFileSource(dir);

    expect(new TextDecoder().decode(await source.read('a.txt'))).toBe('hello');
  });

  it('lists files as repo-relative POSIX paths, sorted', async () => {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'b.txt'), 'b');
    writeFileSync(join(dir, 'src', 'a.ts'), 'a');
    const source = new FsFileSource(dir);

    expect(await source.list()).toEqual(['b.txt', 'src/a.ts']);
  });

  it('skips a subtree it cannot read instead of throwing, and keeps walking siblings', async () => {
    mkdirSync(join(dir, 'denied'));
    writeFileSync(join(dir, 'denied', 'secret.txt'), 'x');
    writeFileSync(join(dir, 'keep.txt'), 'k');
    const deniedPath = join(dir, 'denied');
    const { readdirSync: realReaddirSync } = await vi.importActual<typeof NodeFs>('node:fs');
    vi.mocked(readdirSync).mockImplementation(((path: NodeFs.PathLike, options: unknown) => {
      if (path === deniedPath) throw new Error('EACCES: permission denied');
      return realReaddirSync(path as never, options as never);
    }) as typeof readdirSync);
    const source = new FsFileSource(dir);

    await expect(source.list()).resolves.toEqual(['keep.txt']);
  });

  it('skips a directory listed in IGNORE_DIRS (e.g. node_modules)', async () => {
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'junk.js'), 'junk');
    writeFileSync(join(dir, 'keep.ts'), 'keep');
    const source = new FsFileSource(dir);

    await expect(source.list()).resolves.toEqual(['keep.ts']);
  });

  it('honors options.maxDepth, excluding entries deeper than the limit', async () => {
    writeFileSync(join(dir, 'root.txt'), 'r');
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'nested.txt'), 'n');
    mkdirSync(join(dir, 'sub', 'subsub'));
    writeFileSync(join(dir, 'sub', 'subsub', 'deep.txt'), 'd');
    const source = new FsFileSource(dir, { maxDepth: 1 });

    await expect(source.list()).resolves.toEqual(['root.txt', 'sub/nested.txt']);
  });

  it('excludes an entry that is neither a directory nor a regular file', async () => {
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
    const source = new FsFileSource(dir);

    await expect(source.list()).resolves.toEqual(['keep.txt']);
  });

  it('sorts the listed files regardless of directory-read order', async () => {
    const makeFileEntry = (name: string): NodeFs.Dirent =>
      ({ name, isDirectory: () => false, isFile: () => true }) as NodeFs.Dirent;
    vi.mocked(readdirSync).mockImplementation(((_path: NodeFs.PathLike, _options: unknown) => [
      makeFileEntry('z.txt'),
      makeFileEntry('a.txt'),
    ]) as typeof readdirSync);
    const source = new FsFileSource(dir);

    await expect(source.list()).resolves.toEqual(['a.txt', 'z.txt']);
  });
});
