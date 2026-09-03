// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The FLY-BAR folder UX's second slice (board web-msrhr2d9-xxwa3a): a
 * server-backed directory listing for the "browse a brand-new folder" modal
 * — a plain `<input type="file">` cannot reveal an absolute filesystem path,
 * so picking a not-yet-registered project root needs the server to do the
 * listing. Read-only (no writes, no execution) and reachable only from the
 * dashboard's own loopback-bound HTTP server (`server/main.ts`'s
 * `LOOPBACK_HOST`), the same trust boundary every other local-filesystem
 * read in this app (`/api/docs`, `/api/file`) already relies on.
 */

import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface BrowseFolderEntry {
  readonly name: string;
  readonly path: string;
}

export interface BrowseFolderResult {
  readonly path: string;
  readonly parent: string | null;
  readonly entries: readonly BrowseFolderEntry[];
  readonly drives: readonly string[];
}

const DRIVE_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

/**
 * Every drive letter (`C:\`, `D:\`, …) that currently resolves to a real,
 * mounted directory. Windows-only — every other platform has a single-root
 * filesystem, so `..` navigation from `listBrowsableFolder` already reaches
 * every mount point without a separate concept. On Windows, `parent` goes
 * `null` at a drive root (its own dirname), which otherwise strands the
 * operator on whichever drive their home directory happens to live on with
 * no way back to a repo checked out on a different one. A `statSync` probe
 * (not a directory read) so an empty/unmounted drive letter — a CD-ROM
 * drive with no disc, common on Windows — is skipped rather than throwing.
 */
function listWindowsDrives(): readonly string[] {
  if (process.platform !== 'win32') return [];
  const drives: string[] = [];
  for (const letter of DRIVE_LETTERS) {
    const root = `${letter}:\\`;
    try {
      if (statSync(root).isDirectory()) drives.push(root);
    } catch {
      continue;
    }
  }
  return drives;
}

/**
 * Lists the subdirectories of `requestedPath` (defaulting to the operator's
 * home directory when absent/blank) — directories only, dotfiles and
 * `node_modules` skipped, alphabetical. Returns `null` for anything that
 * doesn't resolve to a readable directory (missing, a file, permission
 * denied) rather than throwing, so the HTTP handler always has a clean
 * success/failure shape to respond with.
 */
export function listBrowsableFolder(requestedPath?: string | null): BrowseFolderResult | null {
  const target = resolve(
    requestedPath && requestedPath.trim().length > 0 ? requestedPath : homedir(),
  );
  let isDir: boolean;
  try {
    isDir = statSync(target).isDirectory();
  } catch {
    return null;
  }
  if (!isDir) return null;

  let dirents;
  try {
    dirents = readdirSync(target, { withFileTypes: true });
  } catch {
    return null;
  }

  const entries = dirents
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map((d) => ({ name: d.name, path: join(target, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = dirname(target);
  return {
    path: target,
    parent: parent === target ? null : parent,
    entries,
    drives: listWindowsDrives(),
  };
}
