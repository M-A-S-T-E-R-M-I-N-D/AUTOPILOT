// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { IndexEntry, ProjectIndex, IndexDiff } from './model.js';

/** Enumerates + reads the working tree (git ls-files or an fs walk). Read-only. */
export interface FileSource {
  list(): Promise<readonly string[]>; // repo-relative POSIX paths, ignore-filtered
  read(path: string): Promise<Uint8Array>;
}

/** What re-lock needs to resume from the stored index. */
export interface StoredIndex {
  readonly entries: readonly IndexEntry[];
  readonly treeHash: string;
  readonly toolVersion: string;
}

/** Persistence boundary — the SQLite adapter implements this. */
export interface IndexStorePort {
  load(projectId: string): StoredIndex | null;
  /** Apply the diff (upsert added+changed, delete removed) + upsert meta, one txn. */
  save(projectId: string, index: ProjectIndex, diff: IndexDiff, toolVersion: string): void;
}

/**
 * Optional full-text content sink for retrieval (M4 RAG). The store's
 * SqliteSearchStore satisfies this structurally. Only the changed slice of the
 * index is fed here — the same incremental discipline as the metadata index.
 */
export interface ContentIndexPort {
  indexDocument(projectId: string, path: string, content: string, language: string): void;
  removeDocument(projectId: string, path: string): void;
}
