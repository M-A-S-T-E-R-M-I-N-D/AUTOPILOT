// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { makeFsSnapshot, type FsSnapshot } from '../gate/snapshot.js';
import { IGNORE_DIRS } from './ignore.js';

/** Root-level manifests whose CONTENT the detectors read (everything else is
 *  listed by path only, so a snapshot stays cheap). */
const READ_ROOT_FILES = new Set([
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'setup.cfg',
]);

const DEFAULT_MAX_DEPTH = 6;

export interface ReadFsSnapshotOptions {
  readonly maxDepth?: number;
}

/**
 * Walk a real directory into a pure {@link FsSnapshot} (the impure edge of gate
 * detection). Read-only against the tree — it only ever reads, upholding the
 * "no repo touched before MYTH/LEGACY" DoD invariant.
 */
export function readFsSnapshot(root: string, options: ReadFsSnapshotOptions = {}): FsSnapshot {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const files: string[] = [];
  const contents: Record<string, string> = {};

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
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
        const rel = relative(root, join(dir, entry.name)).split(sep).join('/');
        files.push(rel);
        if (READ_ROOT_FILES.has(entry.name) && !rel.includes('/')) {
          try {
            contents[rel] = readFileSync(join(dir, entry.name), 'utf8');
          } catch {
            /* unreadable manifest — leave absent */
          }
        }
      }
    }
  };

  walk(root, 0);
  files.sort();
  return makeFsSnapshot({ files, contents });
}
