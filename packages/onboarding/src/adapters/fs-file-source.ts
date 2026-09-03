// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { FileSource } from '../index/ports.js';
import { IGNORE_DIRS } from './ignore.js';

const DEFAULT_MAX_DEPTH = 12;

export interface FsFileSourceOptions {
  readonly maxDepth?: number;
}

/**
 * A {@link FileSource} over a real directory — the impure edge of indexing.
 * Read-only against the tree (only ever reads), upholding the "no repo touched
 * before MYTH/LEGACY" invariant. Ignores VCS/build/dependency dirs so the index
 * stays cheap (heavy trees like node_modules are never walked).
 */
export class FsFileSource implements FileSource {
  private readonly maxDepth: number;

  constructor(
    private readonly root: string,
    options: FsFileSourceOptions = {},
  ) {
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  }

  list(): Promise<readonly string[]> {
    const files: string[] = [];
    const walk = (dir: string, depth: number): void => {
      if (depth > this.maxDepth) return;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.has(entry.name)) walk(join(dir, entry.name), depth + 1);
        } else if (entry.isFile()) {
          files.push(relative(this.root, join(dir, entry.name)).split(sep).join('/'));
        }
      }
    };
    walk(this.root, 0);
    files.sort();
    return Promise.resolve(files);
  }

  read(path: string): Promise<Uint8Array> {
    return Promise.resolve(readFileSync(join(this.root, path)));
  }
}
