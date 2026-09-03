// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openStore, migrate, FIRING_SEQ_TABLES, type Store } from '../src/index.js';
import { MIGRATIONS } from '../src/schema.js';

function seedProject(store: Store): string {
  const id = randomUUID();
  const now = Date.now();
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', ?, ?)`,
    )
    .run(id, `p-${id.slice(0, 8)}`, 'sandbox', '/repo', now, now);
  return id;
}

function seedMetric(store: Store, projectId: string, firingId: string): void {
  store.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, shipped, self_reported, created_at)
       VALUES (?, ?, 0, 0, ?)`,
    )
    .run(projectId, firingId, Date.now());
}

let store: Store;

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
});
afterEach(() => store.close());

describe('firing_seq schema (v22)', () => {
  it('exposes the single utility table', () => {
    expect(FIRING_SEQ_TABLES).toEqual(['firing_seq']);
  });

  it('starts empty on a fresh database with no existing metrics', () => {
    const count = store.db.prepare('SELECT COUNT(*) AS c FROM firing_seq').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('upgrading an already-flying project (metrics predate v22) backfills its counter', () => {
    // Build a pre-v22 database by hand: a fresh connection with only v1..v21
    // applied, then seed metrics rows the way a project already mid-flight
    // would have accumulated them — before ever running v22's migration.
    const legacy = openStore(':memory:');
    for (const m of MIGRATIONS.filter((mm) => mm.version <= 21)) legacy.db.exec(m.up);
    const pid = seedProject(legacy);
    seedMetric(legacy, pid, `${pid}:firing-1`);
    seedMetric(legacy, pid, `${pid}:firing-2`);
    seedMetric(legacy, pid, `${pid}:firing-3`);

    // Now apply v22 — the real upgrade path a live project's database takes.
    const v22 = MIGRATIONS.find((mm) => mm.version === 22);
    expect(v22).toBeDefined();
    legacy.db.exec(v22?.up ?? '');

    const seeded = legacy.db.prepare('SELECT n FROM firing_seq WHERE project_id = ?').get(pid) as
      { n: number } | undefined;
    expect(seeded?.n).toBe(3);
    legacy.close();
  });

  it('rejects a firing_seq row for an unknown project (foreign key)', () => {
    expect(() =>
      store.db
        .prepare('INSERT INTO firing_seq (project_id, n) VALUES (?, 0)')
        .run('no-such-project'),
    ).toThrow();
  });

  it('rejects a negative counter (CHECK)', () => {
    const pid = seedProject(store);
    expect(() =>
      store.db.prepare('INSERT INTO firing_seq (project_id, n) VALUES (?, -1)').run(pid),
    ).toThrow();
  });
});
