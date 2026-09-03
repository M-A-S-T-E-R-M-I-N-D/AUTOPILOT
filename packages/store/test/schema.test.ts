// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { MIGRATIONS, LATEST_VERSION, CORE_TABLES, validateMigrations } from '../src/schema.js';
import type { Migration } from '../src/schema.js';

describe('schema migrations', () => {
  it('has versions that are contiguous and ascending from 1', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions[0]).toBe(1);
    versions.forEach((v, i) => expect(v).toBe(i + 1));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('gives every migration a non-empty name and up SQL', () => {
    for (const m of MIGRATIONS) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.up.trim().length).toBeGreaterThan(0);
    }
  });

  it('passes its own real MIGRATIONS array through validateMigrations without throwing', () => {
    expect(() => validateMigrations(MIGRATIONS)).not.toThrow();
  });

  it('exposes LATEST_VERSION as the highest migration version', () => {
    expect(LATEST_VERSION).toBe(Math.max(...MIGRATIONS.map((m) => m.version)));
  });

  it('declares the five core tables', () => {
    expect(CORE_TABLES).toEqual(['projects', 'events', 'metrics', 'tasks', 'versions']);
  });

  it('creates each core table in the initial migration', () => {
    const first = MIGRATIONS[0];
    expect(first).toBeDefined();
    for (const t of CORE_TABLES) {
      expect(first?.up).toContain(`CREATE TABLE ${t}`);
    }
  });
});

/**
 * Content assertions per migration's `up` SQL — every ADD COLUMN and CHECK
 * clause a migration introduces, asserted verbatim. Stryker's schema.ts
 * mutation run (CI, 2026-08-19: 27.50%, 22 killed / 58 survived, vs the
 * 100%-killed 33-mutant baseline this file's `describe` blocks matched on
 * 2026-08-14) found the gap: `validateMigrations`'s branches were well
 * covered, but M2 through M15's SQL template literals — the majority of
 * schema.ts by line count — carried NO assertion beyond "non-empty" (only
 * M1's table names were content-checked, above). A mutant that swaps a CHECK
 * boundary or drops a column from these strings changed real migration
 * behavior and nothing here would have noticed. Deliberately `.toContain`,
 * not a real applied-migration test: `migrate.test.ts`'s real-`better-
 * sqlite3` tests cannot kill a schema.ts mutant in CI (Stryker's sandbox
 * cannot load the native binding — see `stryker.store.config.mjs`'s own
 * docstring), so schema.ts's OWN mutation coverage can only ever come from
 * assertions that never open a real database connection.
 */
describe('migration SQL content — one entry per version, matching schema.ts', () => {
  const upOf = (version: number): string => {
    const m = MIGRATIONS.find((mm) => mm.version === version);
    expect(m, `migration v${version} exists`).toBeDefined();
    return m?.up ?? '';
  };

  it('v2 adds the ground-truth columns to metrics', () => {
    const up = upOf(2);
    expect(up).toContain('ALTER TABLE metrics ADD COLUMN head_advanced INTEGER NOT NULL DEFAULT 0');
    expect(up).toContain('ALTER TABLE metrics ADD COLUMN sha_verified  INTEGER NOT NULL DEFAULT 0');
  });

  it('v3 creates the project-index tables with their length/non-negative CHECKs', () => {
    const up = upOf(3);
    expect(up).toContain('CREATE TABLE project_index (');
    expect(up).toContain('CHECK (length(content_hash) = 64)');
    expect(up).toContain('CHECK (size >= 0)');
    expect(up).toContain('CREATE TABLE project_index_meta (');
    expect(up).toContain('CHECK (length(tree_hash) = 64)');
    expect(up).toContain('CHECK (file_count  >= 0)');
    expect(up).toContain('CHECK (total_bytes >= 0)');
  });

  it('v4 creates the trigram-tokenized FTS5 search table', () => {
    const up = upOf(4);
    expect(up).toContain('CREATE VIRTUAL TABLE project_search USING fts5(');
    expect(up).toContain("tokenize = 'trigram'");
  });

  it('v5 adds focus/priority steering columns to tasks', () => {
    const up = upOf(5);
    expect(up).toContain(
      'ALTER TABLE tasks ADD COLUMN focus INTEGER NOT NULL DEFAULT 0 CHECK (focus IN (0, 1))',
    );
    expect(up).toContain('ALTER TABLE tasks ADD COLUMN priority INTEGER');
  });

  it('v6 adds the raw commit_subject column to metrics', () => {
    expect(upOf(6)).toContain('ALTER TABLE metrics ADD COLUMN commit_subject TEXT');
  });

  it("v7 adds metrics.completion, restricted to 'slice'/'complete'", () => {
    expect(upOf(7)).toContain(
      "ALTER TABLE metrics ADD COLUMN completion TEXT CHECK (completion IS NULL OR completion IN ('slice','complete'))",
    );
  });

  it('v8 adds backlog_path to projects', () => {
    expect(upOf(8)).toContain('ALTER TABLE projects ADD COLUMN backlog_path TEXT');
  });

  it('v9 adds the 0/1-or-NULL test_first column to metrics', () => {
    expect(upOf(9)).toContain(
      'ALTER TABLE metrics ADD COLUMN test_first INTEGER CHECK (test_first IS NULL OR test_first IN (0,1))',
    );
  });

  it('v10 adds the 0/1 pause_requested column to projects', () => {
    expect(upOf(10)).toContain(
      'ALTER TABLE projects ADD COLUMN pause_requested INTEGER NOT NULL DEFAULT 0 CHECK (pause_requested IN (0,1))',
    );
  });

  it('v11 adds picked_rank (>= 1 or NULL) and deviation_reason to metrics', () => {
    const up = upOf(11);
    expect(up).toContain(
      'ALTER TABLE metrics ADD COLUMN picked_rank INTEGER CHECK (picked_rank IS NULL OR picked_rank >= 1)',
    );
    expect(up).toContain('ALTER TABLE metrics ADD COLUMN deviation_reason TEXT');
  });

  it("v12 rebuilds tasks with 'github' widened into the source CHECK, preserving every prior column/index", () => {
    const up = upOf(12);
    expect(up).toContain(
      "CHECK (source IN ('inbox','repo','backlog','chat','dashboard','self','github'))",
    );
    expect(up).toContain('INSERT INTO tasks_v12');
    expect(up).toContain('DROP TABLE tasks');
    expect(up).toContain('ALTER TABLE tasks_v12 RENAME TO tasks');
    for (const idx of [
      'idx_tasks_project_status',
      'idx_tasks_severity',
      'idx_tasks_dimension',
      'idx_tasks_focus',
    ]) {
      expect(up).toContain(idx);
    }
  });

  it('v13 adds the 0/1 soul_reviewed column to projects', () => {
    expect(upOf(13)).toContain(
      'ALTER TABLE projects ADD COLUMN soul_reviewed INTEGER NOT NULL DEFAULT 0 CHECK (soul_reviewed IN (0,1))',
    );
  });

  it('v14 adds the soul_proposed text and soul_proposed_at timestamp to projects', () => {
    const up = upOf(14);
    expect(up).toContain('ALTER TABLE projects ADD COLUMN soul_proposed TEXT');
    expect(up).toContain('ALTER TABLE projects ADD COLUMN soul_proposed_at INTEGER');
  });

  it('v15 adds the 0/1-or-NULL resumed column to metrics', () => {
    expect(upOf(15)).toContain(
      'ALTER TABLE metrics ADD COLUMN resumed INTEGER CHECK (resumed IS NULL OR resumed IN (0,1))',
    );
  });

  it('v17 adds the soul_previous snapshot columns to projects (un-ratify undo)', () => {
    const up = upOf(17);
    expect(up).toContain('ALTER TABLE projects ADD COLUMN soul_previous TEXT');
    expect(up).toContain('ALTER TABLE projects ADD COLUMN soul_previous_at INTEGER');
  });

  it('v18 adds the 0/1-or-NULL extended column to metrics', () => {
    // Renumbered from a v17 twin at merge time: fleet-2 (soul_previous) and
    // fleet-8 (metrics.extended) both minted v17 on their own branches — the
    // exact collision class validateMigrations below exists to fail fast on.
    expect(upOf(18)).toContain(
      'ALTER TABLE metrics ADD COLUMN extended INTEGER CHECK (extended IS NULL OR extended IN (0,1))',
    );
  });

  it("v20 creates the singleton fleet table, seeded with the 'fleet' row", () => {
    const up = upOf(20);
    expect(up).toContain('CREATE TABLE fleet (');
    expect(up).toContain("CHECK (id = 'fleet')");
    expect(up).toContain('wisdom_proposed    TEXT');
    expect(up).toContain('wisdom_proposed_at INTEGER');
    expect(up).toContain("INSERT INTO fleet (id, wisdom) VALUES ('fleet', '')");
  });

  it('v21 adds the 0/1 completion_missing column to metrics', () => {
    expect(upOf(21)).toContain(
      'ALTER TABLE metrics ADD COLUMN completion_missing INTEGER NOT NULL DEFAULT 0 CHECK (completion_missing IN (0,1))',
    );
  });

  it('v22 creates firing_seq and backfills it from existing metrics counts', () => {
    const up = upOf(22);
    expect(up).toContain('CREATE TABLE firing_seq (');
    expect(up).toContain(
      'project_id TEXT    PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE',
    );
    expect(up).toContain('n          INTEGER NOT NULL CHECK (n >= 0)');
    expect(up).toContain(
      'INSERT INTO firing_seq (project_id, n)\n  SELECT project_id, COUNT(*) FROM metrics GROUP BY project_id;',
    );
  });
});

describe('validateMigrations — the FLEET INTENT CLAIMS collision guard', () => {
  const migration = (version: number, name: string): Migration => ({
    version,
    name,
    up: `-- ${name}`,
  });

  it('rejects two migrations that independently claim the same version (the real overnight v13 collision)', () => {
    const colliding = [
      migration(1, 'initial_schema'),
      migration(13, 'soul_reviewed'),
      migration(13, 'metrics_resumed'), // fleet-3's parallel v13, unaware of the sibling's own v13
    ];
    expect(() => validateMigrations(colliding)).toThrow(/duplicate migration version 13/);
  });

  it('rejects a non-contiguous version sequence', () => {
    const gap = [migration(1, 'initial_schema'), migration(3, 'skips_two')];
    expect(() => validateMigrations(gap)).toThrow(/contiguous and ascending/);
  });

  it('rejects a migration with an empty name', () => {
    const bad = [{ version: 1, name: '  ', up: '-- sql' }];
    expect(() => validateMigrations(bad)).toThrow(/empty name/);
  });

  it('rejects a migration with empty SQL', () => {
    const bad = [{ version: 1, name: 'nothing_to_do', up: '   ' }];
    expect(() => validateMigrations(bad)).toThrow(/empty SQL/);
  });

  it('accepts a well-formed sequence', () => {
    const good = [migration(1, 'initial_schema'), migration(2, 'second')];
    expect(() => validateMigrations(good)).not.toThrow();
  });
});
