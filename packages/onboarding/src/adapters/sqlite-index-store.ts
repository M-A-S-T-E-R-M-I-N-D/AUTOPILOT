// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { Store, Language } from '@autopilot/store';
import type { IndexStorePort, StoredIndex } from '../index/ports.js';
import type { IndexEntry, ProjectIndex, IndexDiff } from '../index/model.js';

interface MetaRow {
  tree_hash: string;
  tool_version: string;
}
interface EntryRow {
  path: string;
  content_hash: string;
  size: number;
  language: Language;
}

/**
 * SQLite adapter for the project index (migration v3). `save` applies the diff —
 * upsert added ∪ changed, delete removed, upsert the summary row — in ONE
 * transaction; unchanged rows keep their `updated_at`. `built_at` is preserved
 * across refreshes (set once, on the first build).
 */
export class SqliteIndexStore implements IndexStorePort {
  constructor(
    private readonly store: Store,
    private readonly now: () => number = () => Date.now(),
  ) {}

  load(projectId: string): StoredIndex | null {
    const meta = this.store.db
      .prepare('SELECT tree_hash, tool_version FROM project_index_meta WHERE project_id = ?')
      .get(projectId) as MetaRow | undefined;
    if (!meta) return null;

    const rows = this.store.db
      .prepare('SELECT path, content_hash, size, language FROM project_index WHERE project_id = ?')
      .all(projectId) as EntryRow[];
    const entries: IndexEntry[] = rows.map((r) => ({
      path: r.path,
      contentHash: r.content_hash,
      size: r.size,
      language: r.language,
    }));
    return { entries, treeHash: meta.tree_hash, toolVersion: meta.tool_version };
  }

  save(projectId: string, index: ProjectIndex, diff: IndexDiff, toolVersion: string): void {
    const now = this.now();
    const upsertEntry = this.store.db.prepare(
      `INSERT INTO project_index (project_id, path, content_hash, size, language, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, path) DO UPDATE SET
         content_hash = excluded.content_hash,
         size         = excluded.size,
         language     = excluded.language,
         updated_at   = excluded.updated_at`,
    );
    const deleteEntry = this.store.db.prepare(
      'DELETE FROM project_index WHERE project_id = ? AND path = ?',
    );
    const upsertMeta = this.store.db.prepare(
      `INSERT INTO project_index_meta
         (project_id, tree_hash, file_count, total_bytes, summary, hot_files, tool_version, built_at, updated_at)
       VALUES (@project_id, @tree_hash, @file_count, @total_bytes, @summary, @hot_files, @tool_version, @built_at, @updated_at)
       ON CONFLICT(project_id) DO UPDATE SET
         tree_hash    = excluded.tree_hash,
         file_count   = excluded.file_count,
         total_bytes  = excluded.total_bytes,
         summary      = excluded.summary,
         hot_files    = excluded.hot_files,
         tool_version = excluded.tool_version,
         updated_at   = excluded.updated_at`,
    );

    const apply = this.store.db.transaction(() => {
      for (const entry of [...diff.added, ...diff.changed]) {
        upsertEntry.run(projectId, entry.path, entry.contentHash, entry.size, entry.language, now);
      }
      for (const path of diff.removed) {
        deleteEntry.run(projectId, path);
      }
      upsertMeta.run({
        project_id: projectId,
        tree_hash: index.treeHash,
        file_count: index.summary.fileCount,
        total_bytes: index.summary.totalBytes,
        summary: JSON.stringify(index.summary),
        hot_files: JSON.stringify(index.hotFiles),
        tool_version: toolVersion,
        built_at: now,
        updated_at: now,
      });
    });
    apply();
  }
}
