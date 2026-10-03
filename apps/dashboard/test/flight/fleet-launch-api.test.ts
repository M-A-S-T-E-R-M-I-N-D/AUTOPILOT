// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLEET LAUNCH FROM THE FLY BAR (board web-mtdcfel4-0bxf4h): `createFleetLaunchApi`
 * is the impure IO wiring `runFleetLaunch` (flight/fleet-launch.ts, already
 * covered by fleet-launch.test.ts) needs — a real open board read + a real
 * lane start — for the dashboard SERVER's own `POST /api/fleet` route,
 * mirroring what `control/cli.ts`'s `case 'fleet'` already wires for the CLI.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, createTask, type Store } from '@autopilot/store';
import { createFleetLaunchApi } from '../../src/flight/fleet-launch-api.js';
import { deriveFlyProjectId } from '../../src/flight/lock.js';
import { IDLE_STATUS, type StartFlightResult } from '../../src/flight/runner.js';

function project(store: Store, id: string, rootPath: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, rootPath, 100, 100);
}

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('createFleetLaunchApi', () => {
  it("partitions THIS project's open board across lanes and starts each lane via the injected startFlight", async () => {
    dir = mkdtempSync(join(tmpdir(), 'fleet-launch-api-'));
    const dbPath = join(dir, 'store.db');
    const folder = join(dir, 'repo');
    const projectId = deriveFlyProjectId(folder);

    const store = openStore(dbPath);
    migrate(store);
    project(store, projectId, folder);
    createTask(store, { id: 't1', projectId, title: 'ALPHA one', createdAt: 100 });
    createTask(store, { id: 't2', projectId, title: 'BETA two', createdAt: 100 });
    store.close();

    const starts: unknown[] = [];
    const api = createFleetLaunchApi(
      dbPath,
      (body) => {
        starts.push(body);
        return { started: true, message: 'ok', status: IDLE_STATUS } satisfies StartFlightResult;
      },
      0,
    );

    const result = await api({ folder, laneCount: 2, firings: 1, budgetUsd: 5 });

    expect(result.ok).toBe(true);
    expect(starts).toHaveLength(2);
    const scopes = (starts as { taskScope: readonly string[] }[]).map((s) => s.taskScope);
    // Disjoint, and together cover both tasks — same guarantee
    // buildFleetLaunchPlan's own tests already lock down.
    expect(new Set(scopes.flat())).toEqual(new Set(['t1', 't2']));
    expect(scopes[0]?.some((id) => scopes[1]?.includes(id))).toBe(false);
  });

  it('maps a queued (concurrency-capped) lane start to a 202-shaped postFly result', async () => {
    dir = mkdtempSync(join(tmpdir(), 'fleet-launch-api-'));
    const dbPath = join(dir, 'store.db');
    const store = openStore(dbPath);
    migrate(store);
    store.close();

    const api = createFleetLaunchApi(
      dbPath,
      () =>
        ({
          started: false,
          queued: true,
          message: 'queued',
          status: IDLE_STATUS,
        }) satisfies StartFlightResult,
      0,
    );

    const result = await api({ folder: join(dir, 'repo'), laneCount: 1, firings: 1, budgetUsd: 5 });
    expect(result.lines[1]).toContain('202 not started');
  });

  it("starts every lane on the launch's engine and reports the dashboard's reason for a lane it refused", async () => {
    // A lane refused at preflight (say, the Codex CLI is not on PATH) used to
    // come back as a mute "409 not started": the CLI's loopback postFly
    // forwarded the message, this in-process one dropped it.
    dir = mkdtempSync(join(tmpdir(), 'fleet-launch-api-'));
    const dbPath = join(dir, 'store.db');
    const store = openStore(dbPath);
    migrate(store);
    store.close();

    const starts: { engine?: string; engineModel?: string }[] = [];
    const api = createFleetLaunchApi(
      dbPath,
      (body) => {
        starts.push(body);
        return {
          started: false,
          message: 'preflight refused: engine: the Codex CLI does not answer --version',
          status: IDLE_STATUS,
        } satisfies StartFlightResult;
      },
      0,
    );

    const result = await api({
      folder: join(dir, 'repo'),
      laneCount: 2,
      firings: 1,
      budgetUsd: 5,
      engine: 'codex',
      engineModel: 'gpt-5-codex',
    });
    expect(starts.map((s) => [s.engine, s.engineModel])).toEqual([
      ['codex', 'gpt-5-codex'],
      ['codex', 'gpt-5-codex'],
    ]);
    expect(result.lines[1]).toBe(
      '  base: 409 not started — 0 task(s) reserved — preflight refused: engine: the Codex CLI does not answer --version',
    );
  });

  it('empty board still launches every lane with an empty scope (partition-then-pull, not idle)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'fleet-launch-api-'));
    const dbPath = join(dir, 'store.db');
    const store = openStore(dbPath);
    migrate(store);
    store.close();

    const starts: unknown[] = [];
    const api = createFleetLaunchApi(
      dbPath,
      (body) => {
        starts.push(body);
        return { started: true, message: 'ok', status: IDLE_STATUS } satisfies StartFlightResult;
      },
      0,
    );

    await api({ folder: join(dir, 'repo'), laneCount: 2, firings: 1, budgetUsd: 5 });
    expect(starts).toHaveLength(2);
    expect(
      (starts as { taskScope: readonly string[] }[]).every((s) => s.taskScope.length === 0),
    ).toBe(true);
  });
});
