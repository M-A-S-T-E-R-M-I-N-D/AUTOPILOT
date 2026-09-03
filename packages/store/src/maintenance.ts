// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Database housekeeping (EVALUATION-2026-08-27-silent-gate.md §3.8): no
 * VACUUM or FTS5 `optimize` path existed anywhere in the tree, so the
 * `project_search` trigram index's freelist only ever grew — 32.7 MB never
 * reclaimed on the live store. Deliberately NOT wired into any automatic
 * ritual or firing hook: VACUUM rewrites the whole database file and briefly
 * needs as much free disk as the file itself, so it stays an explicit,
 * operator-invoked action (`dashboard vacuum`), never something a firing or
 * a scheduled ritual runs on its own against a store a sibling lane might be
 * mid-transaction on.
 */

import type { Store } from './db.js';

export interface VacuumResult {
  readonly sizeBeforeBytes: number;
  readonly sizeAfterBytes: number;
}

function fileSizeBytes(store: Store): number {
  const pageCount = store.db.pragma('page_count', { simple: true }) as number;
  const pageSize = store.db.pragma('page_size', { simple: true }) as number;
  return pageCount * pageSize;
}

/**
 * Merge the FTS5 `project_search` b-trees first (`optimize`), then VACUUM
 * the whole file — optimizing first means VACUUM rewrites the already-merged,
 * smaller index instead of doing equivalent work twice.
 */
export function vacuumStore(store: Store): VacuumResult {
  const sizeBeforeBytes = fileSizeBytes(store);
  store.db.exec(`INSERT INTO project_search(project_search) VALUES ('optimize')`);
  store.db.exec('VACUUM');
  return { sizeBeforeBytes, sizeAfterBytes: fileSizeBytes(store) };
}
