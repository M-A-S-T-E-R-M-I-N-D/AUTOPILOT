// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { lstatSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Not gitignore-aware: a fresh onboarding target may have no .gitignore at
// all, so these two are hardcoded rather than deferred to ignore rules that
// might not exist yet — mirrors secret-guard.ts.
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules']);

// GitHub's own hard push limit (warns at 50MB, rejects at 100MB without Git
// LFS): a baseline commit is local-only additive history that can never be
// rewritten under this project's "additive git only" rule, so a huge file
// caught here is refused before it becomes permanent rather than discovered
// only once a push fails.
export const MAX_STAGED_FILE_BYTES = 100 * 1024 * 1024;

function walk(root: string, dir: string, maxBytes: number, flagged: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // dir vanished, permission denied, or never existed — nothing to scan
  }

  for (const entry of entries) {
    // Never follow symlinks: skips dangling targets cleanly and keeps the walk
    // inside root instead of wandering wherever a link points.
    //
    // Stryker disable next-line ConditionalExpression: a Dirent's type is
    // mutually exclusive per entry — isFile()/isDirectory() are already
    // false for ANY symlink dirent regardless of what it points to (verified
    // empirically for both file- and directory-targeted symlinks), so
    // removing this check produces byte-identical output via the isFile()
    // check below. Kept explicit so the "never follow symlinks" invariant
    // survives future refactors of the checks that follow it.
    if (entry.isSymbolicLink()) continue;

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) walk(root, full, maxBytes, flagged);
      continue;
    }
    if (!entry.isFile()) continue; // device/socket/fifo/etc. — not indexable content

    let size: number;
    try {
      size = lstatSync(full).size;
    } catch {
      continue; // unreadable/unindexable: device file, permission error, race, ...
    }
    if (size <= maxBytes) continue;

    const rel = relative(root, full).split(sep).join('/');
    flagged.push(rel);
  }
}

/**
 * Walks a directory tree for files above {@link MAX_STAGED_FILE_BYTES}, so the
 * baseline ritual can refuse to stage them. Every filesystem op is defensive:
 * any entry this process can't safely stat is silently skipped rather than
 * aborting the whole scan.
 *
 * @returns repo-relative, forward-slash, sorted paths of oversized files.
 */
export function scanForHugeFiles(root: string, maxBytes: number = MAX_STAGED_FILE_BYTES): string[] {
  const flagged: string[] = [];
  walk(root, root, maxBytes, flagged);
  return flagged.sort();
}
