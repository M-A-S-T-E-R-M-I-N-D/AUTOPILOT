// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import { readTaskEconomicsFromStore } from '../../src/read/task-economics.js';

let dir: string | undefined;

function project(store: Store, id: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, '/tmp/x', 'flying', NULL, 1, 1)`,
    )
    .run(id, id, id);
}

function firing(
  store: Store,
  projectId: string,
  firingId: string,
  item: string,
  costUsd: number,
): void {
  store.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd,
                            duration_ms, commit_subject, model, created_at)
       VALUES (?, ?, ?, 'feat', NULL, 1, 'passed', ?, 600000, 'feat: x', 'claude-sonnet-5', 1)`,
    )
    .run(projectId, firingId, item, costUsd);
}

afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('readTaskEconomicsFromStore', () => {
  it('returns an empty map when the db file does not exist', () => {
    dir = mkdtempSync(join(tmpdir(), 'ap-dash-task-econ-'));
    const dbPath = join(dir, 'missing.sqlite');
    expect(readTaskEconomicsFromStore(dbPath, 'fly-a')).toEqual(new Map());
  });

  it("maps each task's lifetime firings and cost, scoped to the requested project", () => {
    dir = mkdtempSync(join(tmpdir(), 'ap-dash-task-econ-'));
    const dbPath = join(dir, 'db.sqlite');
    const store = openStore(dbPath);
    migrate(store);
    project(store, 'fly-a');
    project(store, 'fly-b');
    firing(store, 'fly-a', 'fly-a:firing-1', 'web-t-1', 1.5);
    firing(store, 'fly-a', 'fly-a:firing-2', 'web-t-1', 2.5);
    firing(store, 'fly-a', 'fly-a:firing-3', 'web-t-2', 3);
    firing(store, 'fly-b', 'fly-b:firing-1', 'web-t-1', 100);
    store.close();

    const result = readTaskEconomicsFromStore(dbPath, 'fly-a');

    expect(result).toEqual(
      new Map([
        ['web-t-1', { firings: 2, usd: 4 }],
        ['web-t-2', { firings: 1, usd: 3 }],
      ]),
    );
  });

  it("counts each task's firings whose record carries no price beside its cost (epic 0036)", () => {
    dir = mkdtempSync(join(tmpdir(), 'ap-dash-task-econ-'));
    const dbPath = join(dir, 'db.sqlite');
    const store = openStore(dbPath);
    migrate(store);
    project(store, 'fly-a');
    // A $2.00 Claude firing and two Codex ones on web-t-1, whose runs report no
    // price and whose column stores 0; web-t-2's record is silent on cost.
    const record = store.db.prepare(
      `INSERT INTO events (project_id, firing_id, type, payload, created_at)
       VALUES ('fly-a', ?, 'firing', ?, 1)`,
    );
    firing(store, 'fly-a', 'fly-a:firing-1', 'web-t-1', 2);
    record.run('fly-a:firing-1', JSON.stringify({ costUsd: 2 }));
    firing(store, 'fly-a', 'fly-a:firing-2', 'web-t-1', 0);
    record.run('fly-a:firing-2', JSON.stringify({ costUsd: null }));
    firing(store, 'fly-a', 'fly-a:firing-3', 'web-t-1', 0);
    record.run('fly-a:firing-3', JSON.stringify({ costUsd: null }));
    firing(store, 'fly-a', 'fly-a:firing-4', 'web-t-2', 0);
    record.run('fly-a:firing-4', JSON.stringify({ firing: 4 }));
    store.close();

    expect(readTaskEconomicsFromStore(dbPath, 'fly-a')).toEqual(
      new Map([
        ['web-t-1', { firings: 3, usd: 2, unpriced: 2 }],
        ['web-t-2', { firings: 1, usd: 0 }],
      ]),
    );
  });

  it('returns an empty map when the store cannot be read (e.g. an unmigrated db)', () => {
    dir = mkdtempSync(join(tmpdir(), 'ap-dash-task-econ-'));
    const dbPath = join(dir, 'db.sqlite');
    // A store file that exists but was never migrated has no `metrics`
    // table, so the underlying query throws — the read degrades to empty
    // instead of propagating, like every other read in this module.
    openStore(dbPath).close();

    expect(readTaskEconomicsFromStore(dbPath, 'fly-a')).toEqual(new Map());
  });
});
