// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openStore, migrate, type Store } from '@autopilot/store';
import { SqliteFiringStore } from '../../src/adapters/store.js';
import { SqlitePacer } from '../../src/adapters/pacer.js';
import type { PaceConfig } from '../../src/pace.js';
import type { FiringRecord } from '../../src/telemetry.js';

const CONFIG: PaceConfig = {
  baseSleepMin: 5,
  hourlyCapUsd: 10,
  weeklyCapUsd: 100,
};

const NOW = 1_700_000_000_000;
const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;

function record(over: Partial<FiringRecord> = {}): FiringRecord {
  return {
    ts: '2026-07-07T00:00:00Z',
    firing: 1,
    promptVersion: 'v',
    model: 'fable',
    retro: false,
    attempts: 1,
    quotaFallback: false,
    startedOn: 'primary',
    quotaStreak: 0,
    globalExhaust: false,
    exitCode: 0,
    isError: false,
    stopReason: 'end_turn',
    maxTurnsHit: false,
    numTurns: 8,
    durationMs: 1200,
    costUsd: 0,
    realCostUsd: null,
    tokensIn: 100,
    tokensOut: 50,
    cacheRead: 0,
    cacheCreate: 0,
    iterMetrics: 'ok',
    item: 'AP-1',
    outcome: 'shipped',
    shipped: true,
    completion: 'complete',
    completionMissing: false,
    gateResult: 'passed',
    gateChecks: [],
    guardDenials: 0,
    guardDenialDetails: [],
    resumed: null,
    sha: 'abc1234',
    shaVerified: true,
    headAdvanced: true,
    headBefore: 'h0',
    headAfter: 'h1',
    testsBefore: 10,
    testsAfter: 12,
    testsDelta: 2,
    verifierUsed: 'gate',
    kind: 'feat',
    area: null,
    deferredTo: null,
    testFirst: null,
    pickedRank: null,
    deviationReason: null,
    commitSubject: 'feat: ship AP-1',
    ...over,
  };
}

function seedProject(store: Store): string {
  const id = randomUUID();
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', ?, ?)`,
    )
    .run(id, `p-${id.slice(0, 8)}`, 'sandbox', '/repo', NOW, NOW);
  return id;
}

/** Backdates a firing's `created_at` by writing it straight through the sink's clock. */
function firingAt(store: Store, pid: string, tsMs: number, costUsd: number, firing: number): void {
  new SqliteFiringStore(store, pid, () => tsMs).recordFiring(record({ firing, costUsd }));
}

describe('SqlitePacer', () => {
  it('paces at the base cadence with no recorded spend', async () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const pacer = new SqlitePacer(store, pid, CONFIG, () => NOW);

    await expect(pacer.nextPaceMin()).resolves.toBe(5);
    store.close();
  });

  it('slows down once real recent spend approaches the hourly cap', async () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    firingAt(store, pid, NOW - 10 * 60 * 1000, 9, 1); // $9 within the last hour, cap is $10
    const pacer = new SqlitePacer(store, pid, CONFIG, () => NOW);

    const paced = await pacer.nextPaceMin();
    expect(paced).toBeGreaterThan(5);
    store.close();
  });

  it('ignores spend older than the trailing hour/week windows', async () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    firingAt(store, pid, NOW - HOUR_MS - 60_000, 9, 1); // just outside the hourly window
    firingAt(store, pid, NOW - WEEK_MS - 60_000, 90, 2); // just outside the weekly window
    const pacer = new SqlitePacer(store, pid, CONFIG, () => NOW);

    await expect(pacer.nextPaceMin()).resolves.toBe(5);
    store.close();
  });

  it("scopes spend to this project — another project's spend never bleeds in", async () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const otherPid = seedProject(store);
    firingAt(store, otherPid, NOW - 10 * 60 * 1000, 9, 1);
    const pacer = new SqlitePacer(store, pid, CONFIG, () => NOW);

    await expect(pacer.nextPaceMin()).resolves.toBe(5);
    store.close();
  });

  it('defaults its clock to the real Date.now() when none is injected', async () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const pacer = new SqlitePacer(store, pid, CONFIG);

    await expect(pacer.nextPaceMin()).resolves.toBe(5);
    store.close();
  });
});
