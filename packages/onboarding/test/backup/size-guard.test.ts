// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  readdirSync,
  lstatSync,
} from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanForHugeFiles } from '../../src/backup/size-guard.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return {
    ...actual,
    readdirSync: vi.fn(),
    lstatSync: vi.fn(),
  };
});

describe('scanForHugeFiles', () => {
  let dir: string;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-size-guard-'));
    const actual = await vi.importActual<typeof NodeFs>('node:fs');
    vi.mocked(readdirSync).mockImplementation(actual.readdirSync as typeof readdirSync);
    vi.mocked(lstatSync).mockImplementation(actual.lstatSync as typeof lstatSync);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns empty for a directory with only small files', () => {
    writeFileSync(join(dir, 'index.ts'), 'export const x = 1;\n');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'app.ts'), 'console.log("hello world");\n');

    expect(scanForHugeFiles(dir)).toEqual([]);
  });

  it('flags a file above the given byte threshold', () => {
    writeFileSync(join(dir, 'blob.bin'), Buffer.alloc(1024));

    expect(scanForHugeFiles(dir, 512)).toEqual(['blob.bin']);
  });

  it('does not flag a file exactly at the threshold', () => {
    writeFileSync(join(dir, 'exact.bin'), Buffer.alloc(512));

    expect(scanForHugeFiles(dir, 512)).toEqual([]);
  });

  it('flags a nested oversized file with a forward-slash relative path', () => {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'video.mp4'), Buffer.alloc(2048));

    expect(scanForHugeFiles(dir, 1024)).toEqual(['assets/video.mp4']);
  });

  it('never descends into .git or node_modules', () => {
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, '.git', 'pack.bin'), Buffer.alloc(2048));
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'blob.bin'), Buffer.alloc(2048));

    expect(scanForHugeFiles(dir, 1024)).toEqual([]);
  });

  it('skips a dangling symlink without throwing', () => {
    // Creating a symlink needs elevated privileges on some Windows setups
    // (no Developer Mode, no admin) — skip rather than fail on those runners;
    // the behavior under test only matters where symlinks are actually usable.
    try {
      symlinkSync(join(dir, 'does-not-exist'), join(dir, 'broken-link'));
    } catch {
      return;
    }

    expect(() => scanForHugeFiles(dir, 1)).not.toThrow();
    expect(scanForHugeFiles(dir, 1)).toEqual([]);
  });

  it('returns multiple flagged paths sorted', () => {
    writeFileSync(join(dir, 'b.bin'), Buffer.alloc(2048));
    mkdirSync(join(dir, 'a'));
    writeFileSync(join(dir, 'a', 'c.bin'), Buffer.alloc(2048));

    expect(scanForHugeFiles(dir, 1024)).toEqual(['a/c.bin', 'b.bin']);
  });

  it('returns empty for a directory that does not exist', () => {
    expect(scanForHugeFiles(join(dir, 'nope'))).toEqual([]);
  });

  it('defaults to the 100MB GitHub hard-push-limit threshold', () => {
    writeFileSync(join(dir, 'small.bin'), Buffer.alloc(1024));

    expect(scanForHugeFiles(dir)).toEqual([]);
  });

  it('skips a directory entry that is neither a regular file, directory, nor symlink (e.g. a device or socket)', () => {
    const weirdEntry = {
      name: 'weird-device',
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => false,
    };
    vi.mocked(readdirSync).mockReturnValueOnce([weirdEntry] as unknown as ReturnType<
      typeof readdirSync
    >);

    expect(scanForHugeFiles(dir)).toEqual([]);
  });

  it('skips an entry reporting isFile()=false even though the path is an oversized regular file on disk', () => {
    writeFileSync(join(dir, 'mislabeled.bin'), Buffer.alloc(2048));
    const fakeEntry = {
      name: 'mislabeled.bin',
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => false,
    };
    vi.mocked(readdirSync).mockReturnValueOnce([fakeEntry] as unknown as ReturnType<
      typeof readdirSync
    >);

    expect(scanForHugeFiles(dir, 1024)).toEqual([]);
  });

  it('sorts flagged results independent of the directory listing order', () => {
    writeFileSync(join(dir, 'a.bin'), Buffer.alloc(2048));
    writeFileSync(join(dir, 'z.bin'), Buffer.alloc(2048));
    const zEntry = {
      name: 'z.bin',
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => true,
    };
    const aEntry = {
      name: 'a.bin',
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => true,
    };
    vi.mocked(readdirSync).mockReturnValueOnce([zEntry, aEntry] as unknown as ReturnType<
      typeof readdirSync
    >);

    expect(scanForHugeFiles(dir, 1024)).toEqual(['a.bin', 'z.bin']);
  });

  it('skips a file whose stat fails (race: vanished after listing) and keeps scanning siblings', async () => {
    writeFileSync(join(dir, 'gone.bin'), Buffer.alloc(2048));
    writeFileSync(join(dir, 'huge.bin'), Buffer.alloc(2048));
    const gonePath = join(dir, 'gone.bin');
    const actual = await vi.importActual<typeof NodeFs>('node:fs');
    vi.mocked(lstatSync).mockImplementation(((path: NodeFs.PathLike, options?: unknown) => {
      if (path === gonePath) throw new Error('ENOENT: no such file or directory');
      return actual.lstatSync(path as never, options as never);
    }) as typeof lstatSync);

    expect(scanForHugeFiles(dir, 1024)).toEqual(['huge.bin']);
  });
});
