// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE BENCHMARK (operator, 2026-09-26): every model the fleet has flown,
 * from its own firings — per model, per firing, per scoreboard tier.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  summarizeModels,
  firingPoints,
  scoreboardTiers,
  readBenchmark,
  type BenchmarkFiring,
} from '../../src/read/benchmark.js';
import { routeTaskModel } from '../../src/flight/model-scoreboard.js';

const f = (
  modelId: string,
  shipped: boolean,
  costUsd: number,
  minutes: number,
  at: number,
  extra: Partial<BenchmarkFiring> = {},
): BenchmarkFiring => ({
  modelId,
  shipped,
  died: false,
  costUsd,
  durationMs: minutes * 60_000,
  turns: 30,
  at,
  ...extra,
});

describe('summarizeModels', () => {
  it('rolls firings up per served model, with vendor and label, most flown first', () => {
    const rows = summarizeModels([
      f('claude-opus-5-5', true, 3, 10, 5),
      f('claude-opus-5-5', true, 5, 20, 6),
      f('claude-opus-5-5', false, 2, 4, 7, { died: true }),
      f('claude-sonnet-5', true, 1, 8, 1),
    ]);
    expect(rows.map((r) => r.modelId)).toEqual(['claude-opus-5-5', 'claude-sonnet-5']);
    const opus = rows[0]!;
    expect(opus).toMatchObject({
      vendorId: 'anthropic',
      firings: 3,
      shipped: 2,
      died: 1,
      costUsd: 10,
      costPerShipUsd: 5,
      medianMinutes: 10,
      firstAt: 5,
      lastAt: 7,
    });
    expect(opus.shipRate).toBeCloseTo(2 / 3);
    expect(opus.label).not.toBe('');
  });

  it('has no cost per ship for a model that never shipped, and names an unknown vendor honestly', () => {
    const [row] = summarizeModels([f('some-local-model', false, 0.5, 3, 1)]);
    expect(row!.costPerShipUsd).toBeNull();
    expect(row!.vendorId).toBe('unknown');
  });
});

describe('firingPoints', () => {
  it('turns each firing into a scatter point with its outcome', () => {
    expect(
      firingPoints([
        f('m', true, 1, 6, 1),
        f('m', false, 2, 3, 2, { died: true }),
        f('m', false, 3, 9, 3),
      ]).map((p) => [p.outcome, p.minutes]),
    ).toEqual([
      ['shipped', 6],
      ['died', 3],
      ['no-ship', 9],
    ]);
  });
});

describe('scoreboardTiers', () => {
  it('reports every tier, exploring until each arm has its firings, then naming the leader', () => {
    const many = (tier: 'escalated', modelId: string, n: number, shipped: number, cost: number) =>
      Array.from({ length: n }, (_, i) => ({ tier, modelId, shipped: i < shipped, costUsd: cost }));
    const tiers = scoreboardTiers([
      ...many('escalated', 'claude-fable-5-1', 15, 14, 5),
      ...many('escalated', 'claude-opus-5-5', 15, 15, 3),
    ]);
    expect(tiers.map((t) => t.tier)).toEqual(['escalated', 'default', 'mechanical']);
    expect(tiers[0]).toMatchObject({ phase: 'exploit', leader: 'opus' });
    expect(tiers[1]).toMatchObject({ phase: 'explore', leader: null });
    expect(tiers[0]!.arms.find((a) => a.alias === 'opus')).toMatchObject({
      firings: 15,
      shipRate: 1,
      costPerShipUsd: 3,
    });
  });
});

describe('readBenchmark', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-benchmark-'));
    store = openStore(join(dir, 'db.sqlite'));
    migrate(store);
    for (const id of ['p1', 'p2']) {
      store.db
        .prepare(
          `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
           VALUES (?, ?, ?, '/tmp/x', 'flying', NULL, 1, 1)`,
        )
        .run(id, id, id);
    }
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads every project in the window, and the scoreboard it routed by', () => {
    const now = 200 * 24 * 60 * 60 * 1000;
    const insert = store.db.prepare(
      `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd, duration_ms, turns, model, created_at)
       VALUES (?, ?, 't', 'feat', NULL, ?, 'passed', ?, 600000, 20, ?, ?)`,
    );
    routeTaskModel(
      store,
      'p1',
      'default',
      't',
      { AUTOPILOT_DEFAULT_MODEL: 'opus' },
      now - 1000,
      'base',
    );
    insert.run('p1', 'p1:firing-1', 1, 3, 'claude-opus-5-5', now - 500);
    insert.run('p2', 'p2:firing-1', 0, 1, 'claude-sonnet-5', now - 400);
    insert.run('p2', 'p2:firing-0', 1, 9, 'claude-sonnet-5', now - 400 * 24 * 60 * 60 * 1000);
    const b = readBenchmark(store, now);
    expect(b.models.map((m) => [m.modelId, m.firings])).toEqual([
      ['claude-opus-5-5', 1],
      ['claude-sonnet-5', 1],
    ]);
    expect(b.points).toHaveLength(2);
    expect(
      b.tiers.find((t) => t.tier === 'default')!.arms.find((a) => a.alias === 'opus')!.firings,
    ).toBe(1);
    expect(b.rule.minFirings).toBe(15);
    expect(b.windowDays).toBe(90);
  });
});
