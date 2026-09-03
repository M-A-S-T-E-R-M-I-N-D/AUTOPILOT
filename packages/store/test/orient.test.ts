// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, migrate, type Store } from '../src/index.js';
import { orientLengths } from '../src/orient.js';

let store: Store;

function insertProject(id: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'registered', 1, 1)`,
    )
    .run(id, id, id, `/tmp/${id}`);
}

function insertActivity(projectId: string, firingId: string, tool: string): void {
  store.db
    .prepare(
      `INSERT INTO events (project_id, firing_id, type, payload, created_at)
       VALUES (?, ?, 'activity', ?, 1000)`,
    )
    .run(projectId, firingId, JSON.stringify({ tool, target: 'x', kind: 'file' }));
}

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
  insertProject('p1');
});

afterEach(() => {
  store.close();
});

describe('orientLengths', () => {
  it('counts actions before the first edit-class tool use, newest firing first', () => {
    insertActivity('p1', 'f1', 'Read');
    insertActivity('p1', 'f1', 'Grep');
    insertActivity('p1', 'f1', 'Edit');
    insertActivity('p1', 'f2', 'Read');
    insertActivity('p1', 'f2', 'Read');
    insertActivity('p1', 'f2', 'Read');
    insertActivity('p1', 'f2', 'Write');

    expect(orientLengths(store.db, 'p1')).toEqual([
      { firingId: 'f2', actionsBeforeFirstEdit: 3 },
      { firingId: 'f1', actionsBeforeFirstEdit: 2 },
    ]);
  });

  it('reports 0 when a firing edits immediately', () => {
    insertActivity('p1', 'f1', 'Write');
    insertActivity('p1', 'f1', 'Bash');

    expect(orientLengths(store.db, 'p1')).toEqual([{ firingId: 'f1', actionsBeforeFirstEdit: 0 }]);
  });

  it('excludes firings that never used an edit-class tool', () => {
    insertActivity('p1', 'f1', 'Read');
    insertActivity('p1', 'f1', 'Bash');
    insertActivity('p1', 'f2', 'Read');
    insertActivity('p1', 'f2', 'NotebookEdit');

    expect(orientLengths(store.db, 'p1')).toEqual([{ firingId: 'f2', actionsBeforeFirstEdit: 1 }]);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    for (let i = 0; i < 3; i += 1) {
      insertActivity('p1', `f${i}`, 'Edit');
    }

    // SQLite treats `LIMIT -1` as "no limit at all" — an unclamped negative
    // limit would return every firing ever recorded instead of a bounded
    // recent window, same failure class `clampLimit` (search.ts) and
    // `clampFiringsPage` (read.ts) already guard against. A negative limit
    // clamps up to the floor of 1 result (the newest firing), not zero and
    // not everything.
    expect(orientLengths(store.db, 'p1', -1)).toEqual([
      { firingId: 'f2', actionsBeforeFirstEdit: 0 },
    ]);
  });

  it('degrades instead of crashing when limit is NaN', () => {
    insertActivity('p1', 'f1', 'Edit');

    // Math.max/min/floor all propagate NaN, so an unguarded clamp hands
    // SQLite a NaN `LIMIT` bind, which better-sqlite3 rejects with
    // "datatype mismatch" — same failure class already guarded in
    // `clampLimit` (search.ts) and `clampFiringsPage` (read.ts).
    expect(() => orientLengths(store.db, 'p1', NaN)).not.toThrow();
  });

  it('caps the result count at MAX_ORIENT_LENGTHS_LIMIT (100), same as search()', () => {
    for (let i = 0; i < 110; i += 1) {
      insertActivity('p1', `f${i}`, 'Edit');
    }
    expect(orientLengths(store.db, 'p1', 1000).length).toBeLessThanOrEqual(100);
  });
});
