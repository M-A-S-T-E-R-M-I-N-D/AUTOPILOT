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
  readBenchmarkAt,
  readBenchmarkEmpty,
  type BenchmarkFiring,
} from '../../src/read/benchmark.js';
import { routeTaskModel } from '../../src/flight/model-scoreboard.js';

const f = (
  modelId: string,
  shipped: boolean,
  costUsd: number | null,
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

  it('prices a model by its priced firings alone, so an engine with no price never reads free (epic 0036)', () => {
    const rows = summarizeModels([
      f('gpt-5-codex', true, null, 10, 1),
      f('gpt-5-codex', false, null, 4, 2),
      f('claude-opus-5-5', true, 2, 10, 3),
      f('claude-opus-5-5', false, null, 4, 4, { died: true }),
    ]);
    const codex = rows.find((r) => r.modelId === 'gpt-5-codex')!;
    expect(codex).toMatchObject({ firings: 2, shipped: 1, costUsd: null, unpriced: 2 });
    expect(codex.costPerShipUsd).toBeNull();
    expect(codex.shipRate).toBe(0.5);
    const opus = rows.find((r) => r.modelId === 'claude-opus-5-5')!;
    expect(opus).toMatchObject({ costUsd: 2, unpriced: 1, costPerShipUsd: 2 });
    expect(summarizeModels([f('claude-opus-5-5', true, 3, 1, 1)])[0]!.unpriced).toBe(0);
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

  it('keeps an unpriced firing unpriced, never at $0 on the cost axis (epic 0036)', () => {
    expect(firingPoints([f('gpt-5-codex', true, null, 6, 1)])[0]!.costUsd).toBeNull();
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

  it('reads one project when asked — the view from inside it (2026-09-27)', () => {
    const now = 200 * 24 * 60 * 60 * 1000;
    const insert = store.db.prepare(
      `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd, duration_ms, turns, model, created_at)
       VALUES (?, ?, 't', 'feat', NULL, 1, 'passed', 2, 600000, 20, ?, ?)`,
    );
    insert.run('p1', 'p1:firing-1', 'claude-opus-5-5', now - 500);
    insert.run('p2', 'p2:firing-1', 'claude-sonnet-5', now - 400);
    const p2 = readBenchmark(store, now, 'p2');
    expect(p2.scope).toEqual({ projectId: 'p2', name: 'p2' });
    expect(p2.models.map((m) => m.modelId)).toEqual(['claude-sonnet-5']);
    expect(readBenchmark(store, now).scope).toBeNull();
    expect(readBenchmark(store, now, 'nope').models).toEqual([]);
  });

  it('leaves out a firing the account-wide quota killed (2026-09-29)', () => {
    const now = 200 * 24 * 60 * 60 * 1000;
    const insert = store.db.prepare(
      `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd, duration_ms, turns, model, created_at)
       VALUES ('p1', ?, 't', 'feat', NULL, ?, ?, ?, 1000, 1, 'claude-opus-5-5', ?)`,
    );
    insert.run('p1:firing-1', 1, 'passed', 3, now - 500);
    insert.run('p1:firing-2', 0, 'no-commit', 0, now - 400);
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES ('p1', 'p1:firing-2', 'firing', ?, ?)`,
      )
      .run(JSON.stringify({ globalExhaust: true, isError: true }), now - 400);
    const opus = readBenchmark(store, now).models.find((m) => m.modelId === 'claude-opus-5-5')!;
    expect([opus.firings, opus.shipped]).toEqual([1, 1]);
  });

  it("reads a firing whose record has no price as unpriced, not the column's $0 (epic 0036)", () => {
    const now = 200 * 24 * 60 * 60 * 1000;
    const insert = store.db.prepare(
      `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd, duration_ms, turns, model, created_at)
       VALUES ('p1', ?, 't', 'feat', NULL, 1, 'passed', ?, 600000, 20, ?, ?)`,
    );
    const record = store.db.prepare(
      `INSERT INTO events (project_id, firing_id, type, payload, created_at)
       VALUES ('p1', ?, 'firing', ?, ?)`,
    );
    // The metrics column stores a null cost as 0; only the record tells it from a free run.
    insert.run('p1:firing-1', 0, 'gpt-5-codex', now - 500);
    record.run('p1:firing-1', JSON.stringify({ costUsd: null, engine: 'codex' }), now - 500);
    insert.run('p1:firing-2', 0, 'qwen3-coder', now - 400);
    record.run('p1:firing-2', JSON.stringify({ costUsd: 0 }), now - 400);
    insert.run('p1:firing-3', 2, 'claude-opus-5-5', now - 300);
    const b = readBenchmark(store, now);
    const codex = b.models.find((m) => m.modelId === 'gpt-5-codex')!;
    expect([codex.costUsd, codex.costPerShipUsd, codex.unpriced]).toEqual([null, null, 1]);
    // A record that says $0 is a free run, and a firing with no record keeps the column's figure.
    const local = b.models.find((m) => m.modelId === 'qwen3-coder')!;
    expect([local.costUsd, local.costPerShipUsd, local.unpriced]).toEqual([0, 0, 0]);
    const opus = b.models.find((m) => m.modelId === 'claude-opus-5-5')!;
    expect([opus.costUsd, opus.unpriced]).toEqual([2, 0]);
    expect(b.points.find((p) => p.modelId === 'gpt-5-codex')!.costUsd).toBeNull();
  });
});

describe('readBenchmarkAt', () => {
  const now = 200 * 24 * 60 * 60 * 1000;

  it('reads a dashboard with no database yet as nothing flown', () => {
    const b = readBenchmarkAt(join(tmpdir(), 'ap-benchmark-nope', 'missing.db'), now);
    expect(b).toEqual(readBenchmarkEmpty(now));
    expect(b).toMatchObject({ generatedAt: now, scope: null, models: [], points: [] });
    expect(b.tiers.map((t) => [t.tier, t.phase, t.leader])).toEqual([
      ['escalated', 'explore', null],
      ['default', 'explore', null],
      ['mechanical', 'explore', null],
    ]);
  });

  it('reads the database at the path, for the fleet or one project, and lets go of it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-benchmark-at-'));
    const dbPath = join(dir, 'db.sqlite');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.db
        .prepare(
          `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
           VALUES ('p1', 'p1', 'alpha', '/tmp/x', 'flying', NULL, 1, 1)`,
        )
        .run();
      s.db
        .prepare(
          `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd, duration_ms, turns, model, created_at)
           VALUES ('p1', 'p1:firing-1', 't', 'feat', NULL, 1, 'passed', 2, 600000, 20, 'claude-opus-5-5', ?)`,
        )
        .run(now - 500);
      s.close();

      const fleet = readBenchmarkAt(dbPath, now);
      expect(fleet.scope).toBeNull();
      expect(fleet.models.map((m) => [m.modelId, m.firings, m.shipped])).toEqual([
        ['claude-opus-5-5', 1, 1],
      ]);
      expect(fleet.points).toHaveLength(1);

      const p1 = readBenchmarkAt(dbPath, now, 'p1');
      expect(p1.scope).toEqual({ projectId: 'p1', name: 'alpha' });
      expect(p1.models.map((m) => m.modelId)).toEqual(['claude-opus-5-5']);
    } finally {
      // Throws (EBUSY) on Windows if a read left the database open.
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
