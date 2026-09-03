// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openStore, migrate, type Store } from '@autopilot/store';
import { SqliteFiringStore } from '../../src/adapters/store.js';
import type { FiringRecord } from '../../src/telemetry.js';

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
    costUsd: 6,
    realCostUsd: null,
    tokensIn: 100,
    tokensOut: 50,
    cacheRead: 5000,
    cacheCreate: 20,
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
  const now = Date.now();
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', ?, ?)`,
    )
    .run(id, `p-${id.slice(0, 8)}`, 'sandbox', '/repo', now, now);
  return id;
}

describe('SqliteFiringStore', () => {
  it('instance-scoped firing ids: two same-project instances recording the SAME firing number both land (the 3-way fleet crash)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const a = new SqliteFiringStore(store, pid, () => 1, 'fleet-2');
    const b = new SqliteFiringStore(store, pid, () => 2, 'fleet-3');

    a.recordFiring(record());
    b.recordFiring(record()); // same record.firing — used to throw SQLITE_CONSTRAINT_UNIQUE

    const ids = store.db
      .prepare('SELECT firing_id FROM metrics WHERE project_id = ? ORDER BY firing_id')
      .all(pid) as { firing_id: string }[];
    expect(ids.map((r) => r.firing_id)).toEqual([
      `${pid}--fleet-2:firing-1`,
      `${pid}--fleet-3:firing-1`,
    ]);
  });

  it('keeps the exact legacy firing_id format when no instanceId is given', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    new SqliteFiringStore(store, pid, () => 1).recordFiring(record());
    const m = store.db.prepare('SELECT firing_id FROM metrics WHERE project_id = ?').get(pid) as {
      firing_id: string;
    };
    expect(m.firing_id).toBe(`${pid}:firing-1`);
  });

  it('writes the full record to events and a queryable metrics projection', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid, () => 1_700_000_000_000);

    sink.recordFiring(record());

    const metric = store.db.prepare('SELECT * FROM metrics WHERE project_id = ?').get(pid) as {
      firing_id: string;
      item: string;
      kind: string;
      shipped: number;
      self_reported: number;
      gate_result: string;
      cost_usd: number;
      cache_read_tokens: number;
      head_advanced: number;
      sha_verified: number;
      completion: string | null;
    };
    expect(metric.firing_id).toBe(`${pid}:firing-1`);
    expect(metric.item).toBe('AP-1');
    expect(metric.kind).toBe('feat');
    expect(metric.shipped).toBe(1);
    expect(metric.self_reported).toBe(1);
    expect(metric.gate_result).toBe('passed');
    expect(metric.cost_usd).toBe(6);
    expect(metric.cache_read_tokens).toBe(5000);
    // The un-fakeable git cross-checks are queryable (G2), not only in the event payload.
    expect(metric.head_advanced).toBe(1);
    expect(metric.sha_verified).toBe(1);
    // Queryable (not only in the event payload) so reconcileShippedTasks can
    // filter a slice-only ship out of task auto-closing via plain SQL.
    expect(metric.completion).toBe('complete');

    const event = store.db.prepare('SELECT payload FROM events WHERE project_id = ?').get(pid) as {
      payload: string;
    };
    expect(JSON.parse(event.payload)).toMatchObject({
      item: 'AP-1',
      attempts: 1,
      startedOn: 'primary',
    });

    expect(sink.firingCount()).toBe(1);
    store.close();
  });

  it('coerces an out-of-domain commit kind to null (respects the CHECK constraint)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    expect(() =>
      sink.recordFiring(record({ firing: 2, kind: 'totally-invalid-kind' })),
    ).not.toThrow();
    const metric = store.db
      .prepare('SELECT kind FROM metrics WHERE firing_id = ?')
      .get(`${pid}:firing-2`) as { kind: string | null };
    expect(metric.kind).toBeNull();
    store.close();
  });

  it('falls back to 0 for null optional metrics and records false-valued flags', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    sink.recordFiring(
      record({
        firing: 4,
        numTurns: null,
        durationMs: null,
        costUsd: null,
        tokensIn: null,
        tokensOut: null,
        cacheRead: null,
        cacheCreate: null,
        iterMetrics: 'inferred',
        shaVerified: false,
        headAdvanced: false,
        completion: null,
      }),
    );
    const metric = store.db
      .prepare('SELECT * FROM metrics WHERE firing_id = ?')
      .get(`${pid}:firing-4`) as {
      turns: number;
      duration_ms: number;
      cost_usd: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      self_reported: number;
      sha_verified: number;
      head_advanced: number;
      completion: string | null;
    };
    expect(metric.turns).toBe(0);
    expect(metric.duration_ms).toBe(0);
    expect(metric.cost_usd).toBe(0);
    expect(metric.input_tokens).toBe(0);
    expect(metric.output_tokens).toBe(0);
    expect(metric.cache_read_tokens).toBe(0);
    expect(metric.cache_write_tokens).toBe(0);
    expect(metric.self_reported).toBe(0);
    expect(metric.sha_verified).toBe(0);
    expect(metric.head_advanced).toBe(0);
    expect(metric.completion).toBeNull();
    store.close();
  });

  it('records a reverted firing as not-shipped', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    sink.recordFiring(
      record({ firing: 3, shipped: false, outcome: 'reverted', gateResult: 'reverted' }),
    );
    const metric = store.db
      .prepare('SELECT shipped, gate_result FROM metrics WHERE firing_id = ?')
      .get(`${pid}:firing-3`) as { shipped: number; gate_result: string };
    expect(metric.shipped).toBe(0);
    expect(metric.gate_result).toBe('reverted');
    store.close();
  });

  it('persists a slice-only ship as completion="slice" (queryable so the task stays open)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    sink.recordFiring(record({ firing: 5, completion: 'slice' }));
    const metric = store.db
      .prepare('SELECT completion FROM metrics WHERE firing_id = ?')
      .get(`${pid}:firing-5`) as { completion: string | null };
    expect(metric.completion).toBe('slice');
    store.close();
  });

  it('persists self-reported TDD-first compliance as a queryable 0/1/NULL flag', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    sink.recordFiring(record({ firing: 6, kind: 'fix', testFirst: true }));
    sink.recordFiring(record({ firing: 7, kind: 'fix', testFirst: false }));
    sink.recordFiring(record({ firing: 8, kind: 'feat', testFirst: null }));

    const rows = store.db
      .prepare('SELECT firing_id, test_first FROM metrics WHERE project_id = ? ORDER BY firing_id')
      .all(pid) as { firing_id: string; test_first: number | null }[];
    expect(rows).toEqual([
      { firing_id: `${pid}:firing-6`, test_first: 1 },
      { firing_id: `${pid}:firing-7`, test_first: 0 },
      { firing_id: `${pid}:firing-8`, test_first: null },
    ]);
    store.close();
  });

  it('persists self-reported picked_rank and deviation_reason as queryable columns', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    sink.recordFiring(record({ firing: 9, pickedRank: 1, deviationReason: null }));
    sink.recordFiring(
      record({ firing: 10, pickedRank: 3, deviationReason: 'top task needs a human' }),
    );
    sink.recordFiring(record({ firing: 11, pickedRank: null, deviationReason: null }));

    const rows = store.db
      .prepare(
        'SELECT firing_id, picked_rank, deviation_reason FROM metrics WHERE project_id = ? ORDER BY firing_id',
      )
      .all(pid) as {
      firing_id: string;
      picked_rank: number | null;
      deviation_reason: string | null;
    }[];
    // ORDER BY firing_id is a lexicographic string sort ("firing-10" < "firing-9").
    expect(rows).toEqual([
      { firing_id: `${pid}:firing-10`, picked_rank: 3, deviation_reason: 'top task needs a human' },
      { firing_id: `${pid}:firing-11`, picked_rank: null, deviation_reason: null },
      { firing_id: `${pid}:firing-9`, picked_rank: 1, deviation_reason: null },
    ]);
    store.close();
  });

  it('persists the WARM SESSIONS measurable-win signal (resumed) as a queryable 0/1/NULL flag (docs/epics/0009-warm-sessions.md)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    sink.recordFiring(record({ firing: 12, resumed: true }));
    sink.recordFiring(record({ firing: 13, resumed: false }));
    sink.recordFiring(record({ firing: 14, resumed: null }));

    const rows = store.db
      .prepare('SELECT firing_id, resumed FROM metrics WHERE project_id = ? ORDER BY firing_id')
      .all(pid) as { firing_id: string; resumed: number | null }[];
    expect(rows).toEqual([
      { firing_id: `${pid}:firing-12`, resumed: 1 },
      { firing_id: `${pid}:firing-13`, resumed: 0 },
      { firing_id: `${pid}:firing-14`, resumed: null },
    ]);
    store.close();
  });

  it('persists the FINISH-LINE EXTENSION signal (extended) as a queryable 1/NULL flag (docs/epics/0009-warm-sessions.md)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    sink.recordFiring(record({ firing: 15, extended: true }));
    sink.recordFiring(record({ firing: 16 })); // extended omitted — ordinary firing

    const rows = store.db
      .prepare('SELECT firing_id, extended FROM metrics WHERE project_id = ? ORDER BY firing_id')
      .all(pid) as { firing_id: string; extended: number | null }[];
    expect(rows).toEqual([
      { firing_id: `${pid}:firing-15`, extended: 1 },
      { firing_id: `${pid}:firing-16`, extended: null },
    ]);
    store.close();
  });

  it('persists cost semantics v3 realCostUsd as a queryable REAL/NULL column (docs/epics/0013-cost-semantics-v3.md)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    sink.recordFiring(record({ firing: 17, realCostUsd: 1.23 }));
    sink.recordFiring(record({ firing: 18, realCostUsd: null })); // unconfigured

    const rows = store.db
      .prepare(
        'SELECT firing_id, real_cost_usd FROM metrics WHERE project_id = ? ORDER BY firing_id',
      )
      .all(pid) as { firing_id: string; real_cost_usd: number | null }[];
    expect(rows).toEqual([
      { firing_id: `${pid}:firing-17`, real_cost_usd: 1.23 },
      { firing_id: `${pid}:firing-18`, real_cost_usd: null },
    ]);
    store.close();
  });

  it('persists head_before/head_after as queryable git-ground-truth columns (GATE HOLE 3, board web-mtb8hghd-72z52z — auditability for a multi-commit revert)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    sink.recordFiring(
      record({
        firing: 21,
        headBefore: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        headAfter: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    );

    const metric = store.db
      .prepare('SELECT head_before, head_after FROM metrics WHERE firing_id = ?')
      .get(`${pid}:firing-21`) as { head_before: string | null; head_after: string | null };
    expect(metric.head_before).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(metric.head_after).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    store.close();
  });

  it('persists completionMissing as a queryable 0/1 column (board web-msnshawt-1yd7px slice 3/3)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteFiringStore(store, pid);

    sink.recordFiring(record({ firing: 19, completionMissing: true }));
    sink.recordFiring(record({ firing: 20, completionMissing: false }));

    const rows = store.db
      .prepare(
        'SELECT firing_id, completion_missing FROM metrics WHERE project_id = ? ORDER BY firing_id',
      )
      .all(pid) as { firing_id: string; completion_missing: number }[];
    expect(rows).toEqual([
      { firing_id: `${pid}:firing-19`, completion_missing: 1 },
      { firing_id: `${pid}:firing-20`, completion_missing: 0 },
    ]);
    store.close();
  });

  describe('reserveNextFiring (board web-mtbay6wd-hz0p0m — the firing-number collision fix)', () => {
    it('two lanes racing before either has recorded a firing still get distinct, sequential numbers', () => {
      const store = openStore(':memory:');
      migrate(store);
      const pid = seedProject(store);
      const sink = new SqliteFiringStore(store, pid);

      // The exact race: loop.ts calls this once per lane, per iteration,
      // BEFORE the (possibly minutes-long) firing runs — so two fleet lanes
      // can call it back-to-back with nothing recorded in between. The old
      // `firingCount() + 1` read gave both lanes the same number; the atomic
      // reservation below must not.
      const laneA = sink.reserveNextFiring();
      const laneB = sink.reserveNextFiring();

      expect(laneA).toBe(1);
      expect(laneB).toBe(2);
    });

    it('keeps advancing across many racing reservations with no gaps or repeats', () => {
      const store = openStore(':memory:');
      migrate(store);
      const pid = seedProject(store);
      const sink = new SqliteFiringStore(store, pid);

      const reserved = Array.from({ length: 20 }, () => sink.reserveNextFiring());

      expect(reserved).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });

    it('is scoped per project — a second project starts its own counter at 1', () => {
      const store = openStore(':memory:');
      migrate(store);
      const pidA = seedProject(store);
      const pidB = seedProject(store);
      const sinkA = new SqliteFiringStore(store, pidA);
      const sinkB = new SqliteFiringStore(store, pidB);

      expect(sinkA.reserveNextFiring()).toBe(1);
      expect(sinkA.reserveNextFiring()).toBe(2);
      expect(sinkB.reserveNextFiring()).toBe(1);
    });

    it('continues from an already-flying project instead of restarting at 1 (v22 backfill)', () => {
      const store = openStore(':memory:');
      migrate(store);
      const pid = seedProject(store);
      const sink = new SqliteFiringStore(store, pid);

      sink.recordFiring(record({ firing: 1 }));
      sink.recordFiring(record({ firing: 2 }));
      // Simulate the backfill v22's migration runs against pre-existing
      // metrics (schema.test.ts / firing-seq-schema.test.ts cover the
      // migration SQL itself) — here, seed the counter the same way that
      // backfill would for a project already two firings in.
      store.db
        .prepare(
          `INSERT INTO firing_seq (project_id, n) VALUES (?, 2)
             ON CONFLICT(project_id) DO UPDATE SET n = excluded.n`,
        )
        .run(pid);

      expect(sink.reserveNextFiring()).toBe(3);
    });
  });
});
