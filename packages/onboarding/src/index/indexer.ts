// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { makeEntry, buildIndex, diffIndex } from './core.js';
import type { FileSource, IndexStorePort, ContentIndexPort } from './ports.js';
import type { IndexEntry, IndexDiff } from './model.js';

/** Bump when the hashing/scanning logic changes so stored rows can't be trusted. */
export const INDEXER_VERSION = '1';

/** Files above this size are skipped by the full-text index (kept out of FTS). */
export const MAX_INDEXED_BYTES = 512 * 1024;
const BINARY_SNIFF_BYTES = 8000;

/** Cheap binary sniff: a NUL byte in the head means "don't full-text this". */
function isProbablyText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < n; i += 1) if (bytes[i] === 0) return false;
  return true;
}

const decoder = new TextDecoder('utf-8', { fatal: false });

/**
 * Build (cold) or incrementally refresh (warm) a project's index. Always hashes
 * the current bytes (correctness-first), diffs against what's stored, and
 * persists only the delta in one transaction — unchanged rows are never
 * rewritten (the "rolling residue" that collapses the 124:1 re-read). On re-lock
 * with no change the diff is empty and only meta.updated_at moves: a no-op resume.
 *
 * When a `contentIndex` is supplied (M4 RAG), the SAME changed slice is mirrored
 * into full-text search: added/changed text files are (re)indexed, removed ones
 * dropped, and binary/oversized files are excluded (and cleared if they used to
 * be text). Unchanged files are never re-indexed — retrieval rides the same
 * incremental discipline as the metadata index.
 */
export async function refreshProjectIndex(
  source: FileSource,
  store: IndexStorePort,
  projectId: string,
  contentIndex?: ContentIndexPort,
): Promise<IndexDiff> {
  const paths = [...(await source.list())].sort();
  const entries: IndexEntry[] = [];
  const bytesByPath = new Map<string, Uint8Array>();
  for (const path of paths) {
    let bytes: Uint8Array;
    try {
      bytes = await source.read(path);
    } catch {
      // Unreadable (locked, deleted mid-walk, permission) — skip this one file
      // rather than aborting the whole flight. Onboarding must be robust.
      continue;
    }
    entries.push(makeEntry(path, bytes));
    if (contentIndex) bytesByPath.set(path, bytes);
  }

  const model = buildIndex(entries);
  const prev = store.load(projectId);
  const trusted = prev !== null && prev.toolVersion === INDEXER_VERSION;
  const diff = diffIndex(trusted ? prev.entries : [], entries);

  store.save(projectId, model, diff, INDEXER_VERSION);

  if (contentIndex) syncContentIndex(contentIndex, projectId, diff, bytesByPath);
  return diff;
}

/** Mirror only the diff into the full-text index (added/changed in, removed out). */
function syncContentIndex(
  contentIndex: ContentIndexPort,
  projectId: string,
  diff: IndexDiff,
  bytesByPath: Map<string, Uint8Array>,
): void {
  for (const entry of [...diff.added, ...diff.changed]) {
    const bytes = bytesByPath.get(entry.path);
    if (bytes && bytes.byteLength <= MAX_INDEXED_BYTES && isProbablyText(bytes)) {
      contentIndex.indexDocument(projectId, entry.path, decoder.decode(bytes), entry.language);
    } else {
      // Oversized or binary now — make sure no stale text lingers for this path.
      contentIndex.removeDocument(projectId, entry.path);
    }
  }
  for (const path of diff.removed) contentIndex.removeDocument(projectId, path);
}
