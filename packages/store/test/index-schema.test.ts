// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openStore, migrate, INDEX_TABLES, type Store } from '../src/index.js';

const HASH = 'a'.repeat(64);

function seedProject(store: Store): string {
  const id = randomUUID();
  const now = Date.now();
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, 'p', '/x', 'flying', ?, ?)`,
    )
    .run(id, `s-${id.slice(0, 8)}`, now, now);
  return id;
}

function insertEntry(store: Store, pid: string, path: string, hash: string, size: number): void {
  store.db
    .prepare(
      `INSERT INTO project_index (project_id, path, content_hash, size, language, updated_at)
       VALUES (?, ?, ?, ?, 'typescript', ?)`,
    )
    .run(pid, path, hash, size, Date.now());
}

describe('project index schema (v3)', () => {
  it('exposes the two index tables', () => {
    expect(INDEX_TABLES).toEqual(['project_index', 'project_index_meta']);
  });

  it('round-trips index rows and enforces the composite PK', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);

    insertEntry(store, pid, 'a.ts', HASH, 10);
    // Same (project, path) upserts, never duplicates.
    store.db
      .prepare(
        `INSERT INTO project_index (project_id, path, content_hash, size, language, updated_at)
         VALUES (?, 'a.ts', ?, 20, 'typescript', ?)
         ON CONFLICT(project_id, path) DO UPDATE SET size = excluded.size`,
      )
      .run(pid, HASH, Date.now());
    const row = store.db
      .prepare('SELECT size FROM project_index WHERE project_id = ?')
      .get(pid) as {
      size: number;
    };
    expect(row.size).toBe(20);
    store.close();
  });

  it('rejects a wrong-length content hash and a negative size (CHECK)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    expect(() => insertEntry(store, pid, 'bad.ts', 'tooshort', 10)).toThrow();
    expect(() => insertEntry(store, pid, 'neg.ts', HASH, -1)).toThrow();
    store.close();
  });

  it('cascades index + meta deletes when the project is removed', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    insertEntry(store, pid, 'a.ts', HASH, 10);
    store.db
      .prepare(
        `INSERT INTO project_index_meta
           (project_id, tree_hash, file_count, total_bytes, summary, hot_files, tool_version, built_at, updated_at)
         VALUES (?, ?, 1, 10, '{}', '[]', '1', ?, ?)`,
      )
      .run(pid, HASH, Date.now(), Date.now());

    store.db.prepare('DELETE FROM projects WHERE id = ?').run(pid);
    const count = store.db
      .prepare('SELECT COUNT(*) AS c FROM project_index WHERE project_id = ?')
      .get(pid) as { c: number };
    const meta = store.db
      .prepare('SELECT COUNT(*) AS c FROM project_index_meta WHERE project_id = ?')
      .get(pid) as { c: number };
    expect(count.c).toBe(0);
    expect(meta.c).toBe(0);
    store.close();
  });
});
