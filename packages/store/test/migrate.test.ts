// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore, type Store } from '../src/db.js';
import { migrate, currentVersion } from '../src/migrate.js';
import {
  LATEST_VERSION,
  CORE_TABLES,
  INDEX_TABLES,
  SEARCH_TABLES,
  FLEET_TABLES,
  FIRING_SEQ_TABLES,
} from '../src/schema.js';

function tableNames(store: Store): string[] {
  const rows = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

function count(store: Store, table: string): number {
  const row = store.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return row.c;
}

function seedProject(store: Store): string {
  const id = randomUUID();
  const now = Date.now();
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'registered', ?, ?)`,
    )
    .run(id, `slug-${id.slice(0, 8)}`, 'AUTOPILOT', '/repo', now, now);
  return id;
}

describe('migrate', () => {
  it('creates every core table plus schema_migrations on a fresh database', () => {
    const store = openStore(':memory:');
    const result = migrate(store);
    expect(result.version).toBe(LATEST_VERSION);
    expect(result.applied).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    ]);

    const names = tableNames(store);
    for (const t of CORE_TABLES) expect(names).toContain(t);
    expect(names).toContain('schema_migrations');
    expect(names).toContain('project_index');
    expect(names).toContain('project_index_meta');
    expect(names).toContain('project_search');
    expect(names).toContain('fleet');
    expect(names).toContain('firing_seq');
    store.close();
  });

  it('every migrated table belongs to an exported *_TABLES group — so a new table cannot go undocumented', () => {
    // docs/DATA-MODEL.md is generated from these constants, and
    // `ci:data-model --check` compares the doc against that generator's own
    // output — a tautology that can only catch drift, never MISSING coverage.
    // That is how `fleet` (v20) and `firing_seq` (v22) both shipped
    // undocumented while the check stayed green. This asserts the constants
    // against the REAL schema instead, which is the non-tautological half.
    const store = openStore(':memory:');
    migrate(store);
    const covered = new Set<string>([
      ...CORE_TABLES,
      ...INDEX_TABLES,
      ...SEARCH_TABLES,
      ...FLEET_TABLES,
      ...FIRING_SEQ_TABLES,
      'schema_migrations', // runner-owned, documented under its own group
    ]);
    // Two kinds of table are SQLite's, not ours: FTS5's shadow tables
    // (project_search_data/_idx/…, implementation detail of the one virtual
    // table in SEARCH_TABLES) and sqlite_sequence (auto-created for
    // AUTOINCREMENT). Neither is ours to document.
    const own = tableNames(store).filter(
      (t) => !t.startsWith('project_search_') && !t.startsWith('sqlite_'),
    );
    const undocumented = own.filter((t) => !covered.has(t));
    expect(undocumented, `add these to a *_TABLES constant: ${undocumented.join(', ')}`).toEqual(
      [],
    );
    store.close();
  });

  it('is idempotent — a second run applies nothing', () => {
    const store = openStore(':memory:');
    migrate(store);
    const second = migrate(store);
    expect(second.applied).toEqual([]);
    expect(second.version).toBe(LATEST_VERSION);
    expect(currentVersion(store)).toBe(LATEST_VERSION);
    store.close();
  });

  it('reports version 0 for an unmigrated database', () => {
    const store = openStore(':memory:');
    expect(currentVersion(store)).toBe(0);
    store.close();
  });

  it('enforces foreign keys (event without a project is rejected)', () => {
    const store = openStore(':memory:');
    migrate(store);
    expect(() =>
      store.db
        .prepare('INSERT INTO events (project_id, type, created_at) VALUES (?, ?, ?)')
        .run('does-not-exist', 'firing_start', Date.now()),
    ).toThrow();
    store.close();
  });

  it('round-trips a project, task, metric, event, and version', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const now = Date.now();

    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, severity, dimension, source, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', 'high', 'cybersecurity', 'repo', ?, ?)`,
      )
      .run(randomUUID(), pid, 'Close the seeded vuln', now, now);
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, kind, shipped, cost_usd, created_at)
         VALUES (?, ?, 'feat', 1, 6.0, ?)`,
      )
      .run(pid, `firing-${randomUUID()}`, now);
    store.db
      .prepare('INSERT INTO events (project_id, type, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(pid, 'firing_start', '{"phase":"ORIENT"}', now);
    store.db
      .prepare(
        'INSERT INTO versions (id, project_id, tier, ref, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(randomUUID(), pid, 'legacy', 'baseline-sha', now);

    expect(count(store, 'tasks')).toBe(1);
    expect(count(store, 'metrics')).toBe(1);
    expect(count(store, 'events')).toBe(1);
    expect(count(store, 'versions')).toBe(1);
    store.close();
  });

  it('rejects out-of-domain values via CHECK constraints', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const now = Date.now();
    expect(() =>
      store.db
        .prepare(
          'INSERT INTO tasks (id, project_id, title, severity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(randomUUID(), pid, 'bad severity', 'catastrophic', now, now),
    ).toThrow();
    store.close();
  });

  it('v12 widens tasks.source to accept github while preserving existing rows and indexes', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const now = Date.now();

    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, source, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', 'repo', ?, ?)`,
      )
      .run('pre-v12', pid, 'existed before the source widened', now, now);

    expect(() =>
      store.db
        .prepare(
          `INSERT INTO tasks (id, project_id, title, status, source, created_at, updated_at)
           VALUES (?, ?, ?, 'queued', 'github', ?, ?)`,
        )
        .run('from-github', pid, 'accepted by KEEPER triage', now, now),
    ).not.toThrow();

    expect(() =>
      store.db
        .prepare(
          `INSERT INTO tasks (id, project_id, title, status, source, created_at, updated_at)
           VALUES (?, ?, ?, 'queued', 'not-a-real-source', ?, ?)`,
        )
        .run('bad-source', pid, 'still rejected', now, now),
    ).toThrow();

    expect(count(store, 'tasks')).toBe(2);
    const names = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tasks'")
      .all() as { name: string }[];
    expect(names.map((r) => r.name).sort()).toEqual([
      'idx_tasks_dimension',
      'idx_tasks_focus',
      'idx_tasks_project_status',
      'idx_tasks_severity',
      'sqlite_autoindex_tasks_1',
    ]);
    store.close();
  });

  it('cascades deletes from a project to its children', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    store.db
      .prepare('INSERT INTO events (project_id, type, created_at) VALUES (?, ?, ?)')
      .run(pid, 'orient', Date.now());
    expect(count(store, 'events')).toBe(1);
    store.db.prepare('DELETE FROM projects WHERE id = ?').run(pid);
    expect(count(store, 'events')).toBe(0);
    store.close();
  });

  it('persists across reopen on a real file and stays a no-op', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-store-'));
    const dbPath = join(dir, 'telemetry.db');
    try {
      const first = openStore(dbPath);
      migrate(first);
      const pid = seedProject(first);
      first.close();

      const second = openStore(dbPath);
      expect(currentVersion(second)).toBe(LATEST_VERSION);
      expect(migrate(second).applied).toEqual([]);
      expect(count(second, 'projects')).toBe(1);
      expect(pid.length).toBeGreaterThan(0);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects schema drift when an applied migration checksum changes', () => {
    const store = openStore(':memory:');
    migrate(store);
    store.db.prepare("UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1").run();
    expect(() => migrate(store)).toThrow(/schema drift/);
    store.close();
  });

  it('refuses to migrate a database newer than this build', () => {
    const store = openStore(':memory:');
    migrate(store);
    // Simulate a future migration applied by a newer binary.
    store.db
      .prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      )
      .run(999, 'from_the_future', 'future', Date.now());
    expect(() => migrate(store)).toThrow(/newer than this build/);
    store.close();
  });
});
