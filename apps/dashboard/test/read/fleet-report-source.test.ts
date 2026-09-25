// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fleet report's store reads: a fleet's lanes record firings under their
 * own project ids but share the base project's board and events.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, createTask, type Store } from '@autopilot/store';
import { readReportFirings, readReportConvergence } from '../../src/read/fleet-report-source.js';

let dir: string;
let store: Store;

function project(id: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, '/tmp/x', 'flying', NULL, 1, 1)`,
    )
    .run(id, id, id);
}

function firing(
  projectId: string,
  firingId: string,
  item: string | null,
  shipped: 0 | 1,
  at: number,
): void {
  store.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd,
                            duration_ms, commit_subject, model, created_at)
       VALUES (?, ?, ?, 'feat', NULL, ?, ?, 1.5, 600000, ?, 'claude-sonnet-5', ?)`,
    )
    .run(
      projectId,
      firingId,
      item,
      shipped,
      shipped ? 'passed' : 'no-commit',
      shipped ? 'feat: x' : null,
      at,
    );
}

function event(type: string, payload: unknown, at: number, projectId = 'fly-a'): void {
  store.db
    .prepare(
      'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
    )
    .run(projectId, type, typeof payload === 'string' ? payload : JSON.stringify(payload), at);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ap-fleet-report-'));
  store = openStore(join(dir, 'db.sqlite'));
  migrate(store);
  for (const id of ['fly-a', 'fly-a--fleet-2', 'fly-ab', 'fly_a--fleet-2']) project(id);
  createTask(store, {
    id: 'web-t-1',
    projectId: 'fly-a',
    title: 'VERDICT blocked web-x-1: y',
    createdAt: 1,
  });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('readReportFirings', () => {
  it("reads the base project and its lanes since the moment, with the board task's title", () => {
    firing('fly-a', 'fly-a:firing-1', 'web-t-1', 0, 100);
    firing('fly-a--fleet-2', 'fly-a--fleet-2:firing-2', null, 1, 200);
    firing('fly-a', 'fly-a:firing-0', null, 1, 50); // before the window
    firing('fly-ab', 'fly-ab:firing-9', null, 1, 300); // another project that shares a prefix
    firing('fly_a--fleet-2', 'fly_a--fleet-2:firing-9', null, 1, 300); // `_` is not a wildcard
    const rows = readReportFirings(store.db, 'fly-a', 100);
    expect(rows.map((r) => r.firingId)).toEqual(['fly-a:firing-1', 'fly-a--fleet-2:firing-2']);
    expect(rows[0]).toMatchObject({
      title: 'VERDICT blocked web-x-1: y',
      subject: null,
      shipped: false,
      gateResult: 'no-commit',
      costUsd: 1.5,
      durationMs: 600000,
      model: 'claude-sonnet-5',
    });
    expect(rows[1]).toMatchObject({ title: null, subject: 'feat: x', shipped: true, died: null });
  });
});

describe('readReportConvergence', () => {
  it('reads greens and reds in order, and survives a payload it cannot parse', () => {
    event('convergence-green', { branch: 'b', signature: 's', ms: 1 }, 100);
    event(
      'convergence-red',
      { check: 'pnpm run test', merge: 'fast-forwarded x', queuedMs: 5000 },
      200,
    );
    event('convergence-red', 'not json', 300);
    event('convergence-red', { check: 'x', merge: 'y' }, 50); // before the window
    event('convergence-red', { check: 'x', merge: 'y' }, 400, 'fly-ab'); // another project
    expect(readReportConvergence(store.db, 'fly-a', 100)).toEqual([
      { verdict: 'green', check: null, merge: null },
      { verdict: 'red', check: 'pnpm run test', merge: 'fast-forwarded x', queuedMs: 5000 },
      { verdict: 'red', check: null, merge: null },
    ]);
  });

  it("reads a fleet lane's own convergence verdicts too — a lane records its gate under its own project id, same as a firing", () => {
    event(
      'convergence-red',
      { check: 'pnpm run test', merge: 'fast-forwarded x' },
      150,
      'fly-a--fleet-2',
    );
    event('convergence-red', { check: 'x', merge: 'y' }, 150, 'fly_a--fleet-2'); // `_` is not a wildcard
    expect(readReportConvergence(store.db, 'fly-a', 100)).toEqual([
      { verdict: 'red', check: 'pnpm run test', merge: 'fast-forwarded x' },
    ]);
  });
});
