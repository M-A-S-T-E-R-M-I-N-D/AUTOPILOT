// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { listBrowsableFolder } from '../../src/server/browse-folder.js';

describe('listBrowsableFolder', () => {
  it('lists subdirectories, skipping dotfiles and node_modules, alphabetically', () => {
    const root = mkdtempSync(join(tmpdir(), 'browse-folder-'));
    try {
      mkdirSync(join(root, 'zebra'));
      mkdirSync(join(root, 'alpha'));
      mkdirSync(join(root, '.git'));
      mkdirSync(join(root, 'node_modules'));

      const result = listBrowsableFolder(root);

      expect(result?.entries.map((e) => e.name)).toEqual(['alpha', 'zebra']);
      expect(result?.entries[0]?.path).toBe(join(root, 'alpha'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns the parent directory, or null at the filesystem root', () => {
    const root = mkdtempSync(join(tmpdir(), 'browse-folder-'));
    try {
      const child = join(root, 'child');
      mkdirSync(child);

      expect(listBrowsableFolder(child)?.parent).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns null for a path that is a file, not a directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'browse-folder-'));
    try {
      const filePath = join(root, 'a-file.txt');
      writeFileSync(filePath, 'x');

      expect(listBrowsableFolder(filePath)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns null for a path that does not exist', () => {
    expect(listBrowsableFolder('/definitely/does/not/exist/anywhere')).toBeNull();
  });

  it('defaults to the home directory when no path is given', () => {
    expect(listBrowsableFolder(null)?.path).toBe(homedir());
    expect(listBrowsableFolder('')?.path).toBe(homedir());
  });

  it('lists mounted drive letters on Windows, empty elsewhere', () => {
    const drives = listBrowsableFolder(homedir())?.drives;
    expect(drives).toBeDefined();
    if (process.platform === 'win32') {
      expect(drives?.length).toBeGreaterThan(0);
      expect(drives?.every((d) => /^[A-Z]:\\$/.test(d))).toBe(true);
    } else {
      expect(drives).toEqual([]);
    }
  });
});
