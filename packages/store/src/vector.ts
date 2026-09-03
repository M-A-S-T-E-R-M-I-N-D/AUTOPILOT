// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The vector leg of the hybrid ranker (docs/ECOSYSTEM-RESEARCH.md §2): sqlite-vec
 * loaded into the SAME better-sqlite3 database as FTS5 + telemetry — zero extra
 * infrastructure. The vec0 virtual table lives OUTSIDE the checksum-frozen
 * migration chain on purpose: it is a DERIVED, rebuildable index that exists only
 * where the native extension loads, so it is created lazily (`IF NOT EXISTS`) and
 * everything degrades gracefully (BM25-only search) where it cannot.
 */

import * as sqliteVec from 'sqlite-vec';
import type { Store } from './db.js';

/** 384 dims = bge-small / MiniLM class local models (the adopted embedders). */
export const EMBEDDING_DIM = 384;

const MAX_K = 50;

/** Clamp a caller-supplied `k` to `[1, MAX_K]` — mirrors `search.ts`'s `clampLimit`
 * so `knn` can never crash on a negative/fractional/unbounded/NaN `k` (Math.max/min/
 * floor all propagate NaN, and a NaN `k = ?` bind throws "datatype mismatch"). */
function clampK(k: number): number {
  const safeK = Number.isFinite(k) ? Math.floor(k) : 1;
  return Math.min(Math.max(1, safeK), MAX_K);
}

export interface VectorHit {
  readonly path: string;
  readonly distance: number;
}

/** Loads the extension into a connection; injectable so failure paths are testable. */
export type VecLoader = (db: Store['db']) => void;

/**
 * Open the vector store over an existing Store connection. Returns null when the
 * sqlite-vec extension cannot load on this platform — callers fall back to
 * BM25-only retrieval, never crash.
 */
export function openVectorStore(
  store: Store,
  loader: VecLoader = (db) => sqliteVec.load(db),
): SqliteVecStore | null {
  try {
    loader(store.db);
    store.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS project_vectors USING vec0(
         project_id TEXT,
         path TEXT,
         embedding float[${EMBEDDING_DIM}]
       )`,
    );
    return new SqliteVecStore(store);
  } catch {
    return null;
  }
}

/** Float32Array → the BLOB binding sqlite-vec expects. */
function toBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export class SqliteVecStore {
  constructor(private readonly store: Store) {}

  /** Insert-or-replace one file's embedding (vec0 has no native upsert). */
  upsert(projectId: string, path: string, vector: Float32Array): void {
    if (vector.length !== EMBEDDING_DIM) {
      throw new Error(`expected a ${EMBEDDING_DIM}-dim vector, got ${vector.length}`);
    }
    const tx = this.store.db.transaction(() => {
      this.store.db
        .prepare('DELETE FROM project_vectors WHERE project_id = ? AND path = ?')
        .run(projectId, path);
      this.store.db
        .prepare('INSERT INTO project_vectors (project_id, path, embedding) VALUES (?, ?, ?)')
        .run(projectId, path, toBlob(vector));
    });
    tx();
  }

  /** Drop one file's vector, or ALL of a project's when no path is given. */
  remove(projectId: string, path?: string): void {
    if (path !== undefined) {
      this.store.db
        .prepare('DELETE FROM project_vectors WHERE project_id = ? AND path = ?')
        .run(projectId, path);
    } else {
      this.store.db.prepare('DELETE FROM project_vectors WHERE project_id = ?').run(projectId);
    }
  }

  count(projectId: string): number {
    const row = this.store.db
      .prepare('SELECT COUNT(*) AS c FROM project_vectors WHERE project_id = ?')
      .get(projectId) as { c: number };
    return row.c;
  }

  /** K-nearest files to the query vector, best (smallest distance) first. */
  knn(projectId: string, query: Float32Array, k: number): VectorHit[] {
    if (query.length !== EMBEDDING_DIM) return [];
    return this.store.db
      .prepare(
        `SELECT path, distance FROM project_vectors
          WHERE embedding MATCH ? AND k = ? AND project_id = ?
          ORDER BY distance`,
      )
      .all(toBlob(query), clampK(k), projectId) as VectorHit[];
  }
}
