// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, migrate, type Store } from '../src/index.js';
import {
  recentTasks,
  doneTasks,
  listProjects,
  getIndexMeta,
  firingStats,
  openSeverityGauge,
  lastActivityAt,
  backupTiers,
  recentFirings,
  firingCommitRef,
  firingDayCounts,
  firingSeries,
  taskEconomics,
  RUNAWAY_COST_USD,
  RUNAWAY_FIRING_COUNT,
  shippedSlicesByTask,
  SHIPPED_SLICES_LIMIT,
} from '../src/read.js';
import {
  recentActivityEvents,
  activityEventsForFiring,
  nearMissDebriefEvents,
  nearMissRecurringEvents,
  familyRunawayEvents,
  intentCollisionEvents,
  guardDenialEvents,
  syncBackRefusalEvents,
  landGateAlarmEvents,
  convergenceRedEvents,
  e2eLandBlockEvents,
  landedEvents,
  evaluationLabelEvents,
  evaluationLabelSummary,
  evaluationLabelDayCounts,
} from '../src/read-events.js';

let store: Store;

function insertProject(id: string, slug: string, status: string, createdAt: number): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, slug, slug, `/tmp/${slug}`, status, createdAt, createdAt);
}

function insertMetric(
  id: string,
  projectId: string,
  shipped: 0 | 1,
  cost = 0,
  tokensIn = 0,
  tokensOut = 0,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  turns = 0,
  createdAt = 1000,
  realCostUsd: number | null = null,
): void {
  store.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, shipped, cost_usd, real_cost_usd, input_tokens,
                             output_tokens, cache_read_tokens, cache_write_tokens, turns, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      id,
      shipped,
      cost,
      realCostUsd,
      tokensIn,
      tokensOut,
      cacheReadTokens,
      cacheWriteTokens,
      turns,
      createdAt,
    );
}

let taskMetricSeq = 0;
function insertTaskMetric(
  projectId: string,
  item: string,
  cost: number,
  completion: 'slice' | 'complete' | null = 'slice',
): void {
  taskMetricSeq += 1;
  store.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, item, cost_usd, completion, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(projectId, `tm-${taskMetricSeq}`, item, cost, completion, 1000);
}

let taskSeq = 0;
function insertTask(projectId: string, status: string, severity: string | null): void {
  taskSeq += 1;
  store.db
    .prepare(
      `INSERT INTO tasks (id, project_id, title, status, severity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(`task-${taskSeq}`, projectId, 'x', status, severity, 1, 1);
}

function insertEvent(projectId: string, createdAt: number): void {
  store.db
    .prepare(`INSERT INTO events (project_id, type, created_at) VALUES (?, ?, ?)`)
    .run(projectId, 'firing', createdAt);
}

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
});

afterEach(() => {
  store.close();
});

describe('listProjects', () => {
  it('returns projects oldest-first', () => {
    insertProject('p2', 'beta', 'registered', 200);
    insertProject('p1', 'alpha', 'flying', 100);
    const projects = listProjects(store.db);
    expect(projects.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('returns an empty array for a fresh database', () => {
    expect(listProjects(store.db)).toEqual([]);
  });
});

describe('getIndexMeta', () => {
  it('returns null when a project has no index', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(getIndexMeta(store.db, 'p1')).toBeNull();
  });

  it('returns the summary row when indexed', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    const summary = JSON.stringify({ fileCount: 3, totalBytes: 42, languages: [], topDirs: [] });
    store.db
      .prepare(
        `INSERT INTO project_index_meta
           (project_id, tree_hash, file_count, total_bytes, summary, hot_files, tool_version, built_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('p1', 'a'.repeat(64), 3, 42, summary, '[]', '1', 1, 1);
    const meta = getIndexMeta(store.db, 'p1');
    expect(meta?.file_count).toBe(3);
    expect(meta?.total_bytes).toBe(42);
  });
});

describe('firingStats', () => {
  it('counts firings + gate-verified ships and sums cost/tokens/turns', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertMetric('f1', 'p1', 1, 0.5, 100, 20, 40, 8, 5);
    insertMetric('f2', 'p1', 1, 0.25, 50, 10, 20, 4, 3);
    insertMetric('f3', 'p1', 0, 0.1, 30, 5, 10, 2, 2);
    expect(firingStats(store.db, 'p1')).toEqual({
      firings: 3,
      shipped: 2,
      cost: 0.85,
      realCost: null,
      tokensIn: 180,
      tokensOut: 35,
      cacheReadTokens: 70,
      cacheWriteTokens: 14,
      turns: 10,
    });
  });

  it('is zeroed for a project with no firings', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(firingStats(store.db, 'p1')).toEqual({
      firings: 0,
      shipped: 0,
      cost: 0,
      realCost: null,
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      turns: 0,
    });
  });

  it('restricts to firings at/after sinceAt when given (the CURRENT ROUND window)', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertMetric('f1', 'p1', 1, 0.5, 0, 0, 0, 0, 0, 1000); // before the round
    insertMetric('f2', 'p1', 1, 0.25, 0, 0, 0, 0, 0, 2000); // at the boundary
    insertMetric('f3', 'p1', 0, 0.1, 0, 0, 0, 0, 0, 3000); // after the round
    expect(firingStats(store.db, 'p1', 2000)).toEqual({
      firings: 2,
      shipped: 1,
      cost: 0.35,
      realCost: null,
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      turns: 0,
    });
  });

  it('is zeroed with sinceAt when no firings fall in the window', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertMetric('f1', 'p1', 1, 0.5, 0, 0, 0, 0, 0, 1000);
    expect(firingStats(store.db, 'p1', 5000).firings).toBe(0);
  });

  it('sums realCost (cost semantics v3) only over firings that carry it', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertMetric('f1', 'p1', 1, 1, 0, 0, 0, 0, 0, 1000, 0.4);
    insertMetric('f2', 'p1', 1, 1, 0, 0, 0, 0, 0, 1000, 0.6);
    // A firing predating the feature (or an unconfigured pool) leaves it unset —
    // still contributes to `cost` but is ignored, not zero-filled, for `realCost`.
    insertMetric('f3', 'p1', 1, 1, 0, 0, 0, 0, 0, 1000);
    expect(firingStats(store.db, 'p1').realCost).toBeCloseTo(1);
  });

  it('reports realCost null (not 0) when not one firing in the window carries it', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertMetric('f1', 'p1', 1, 1, 0, 0, 0, 0, 0, 1000);
    expect(firingStats(store.db, 'p1').realCost).toBeNull();
  });
});

describe('openSeverityGauge', () => {
  it('counts only OPEN tasks, grouped by severity', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertTask('p1', 'queued', 'critical');
    insertTask('p1', 'in_progress', 'high');
    insertTask('p1', 'queued', 'high');
    insertTask('p1', 'done', 'critical'); // closed — excluded
    insertTask('p1', 'deferred', 'low'); // deferred — excluded
    insertTask('p1', 'queued', null); // no severity — excluded
    expect(openSeverityGauge(store.db, 'p1')).toEqual({
      critical: 1,
      high: 2,
      medium: 0,
      low: 0,
    });
  });

  it('is all-zero when there are no open findings', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(openSeverityGauge(store.db, 'p1')).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    });
  });
});

describe('lastActivityAt', () => {
  it('returns the most recent event timestamp', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertEvent('p1', 500);
    insertEvent('p1', 900);
    insertEvent('p1', 700);
    expect(lastActivityAt(store.db, 'p1')).toBe(900);
  });

  it('returns null when a project has no events', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(lastActivityAt(store.db, 'p1')).toBeNull();
  });
});

describe('backupTiers', () => {
  function insertVersion(projectId: string, tier: string, ref: string): void {
    store.db
      .prepare(
        `INSERT INTO versions (id, project_id, tier, ref, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(`${projectId}-${tier}-${ref}`, projectId, tier, ref, 1);
  }

  it('returns the distinct backup tiers recorded for a project', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertVersion('p1', 'myth', 'r1');
    insertVersion('p1', 'legacy', 'r2');
    insertVersion('p1', 'flight', 'r3');
    insertVersion('p1', 'flight', 'r4'); // duplicate tier collapses
    expect(backupTiers(store.db, 'p1')).toEqual(['flight', 'legacy', 'myth']);
  });

  it('returns an empty array for a project with no snapshots', () => {
    insertProject('p1', 'alpha', 'registered', 100);
    expect(backupTiers(store.db, 'p1')).toEqual([]);
  });
});

describe('recentFirings', () => {
  function insertFiring(projectId: string, firingId: string, createdAt: number): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, shipped, gate_result, created_at)
         VALUES (?, ?, ?, 1, 'passed', ?)`,
      )
      .run(projectId, firingId, firingId, createdAt);
  }

  it('returns firings newest-first, bounded by the limit', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiring('p1', 'f1', 100);
    insertFiring('p1', 'f2', 200);
    insertFiring('p1', 'f3', 300);
    const log = recentFirings(store.db, 'p1', 2);
    expect(log.map((f) => f.firing_id)).toEqual(['f3', 'f2']);
  });

  it('returns an empty array for a project with no firings', () => {
    insertProject('p1', 'alpha', 'registered', 100);
    expect(recentFirings(store.db, 'p1')).toEqual([]);
  });

  it('pages further back in history via offset (older firings stay reachable)', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiring('p1', 'f1', 100);
    insertFiring('p1', 'f2', 200);
    insertFiring('p1', 'f3', 300);
    const page = recentFirings(store.db, 'p1', 2, 2);
    expect(page.map((f) => f.firing_id)).toEqual(['f1']);
  });

  it('carries the self-reported completion (slice vs complete)', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, shipped, gate_result, completion, created_at)
         VALUES (?, ?, ?, 1, 'passed', ?, ?)`,
      )
      .run('p1', 'f1', 'f1', 'slice', 100);
    insertFiring('p1', 'f2', 200); // no completion recorded — stays null
    const log = recentFirings(store.db, 'p1');
    expect(log.map((f) => f.completion)).toEqual([null, 'slice']);
  });

  it('carries the model that ran the firing', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, shipped, gate_result, model, created_at)
         VALUES (?, ?, ?, 1, 'passed', ?, ?)`,
      )
      .run('p1', 'f1', 'f1', 'claude-sonnet-5', 100);
    insertFiring('p1', 'f2', 200); // no model recorded — stays null
    const log = recentFirings(store.db, 'p1');
    expect(log.map((f) => f.model)).toEqual([null, 'claude-sonnet-5']);
  });

  it('clamps a negative limit instead of returning every row unbounded', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiring('p1', 'f1', 100);
    insertFiring('p1', 'f2', 200);
    insertFiring('p1', 'f3', 300);
    expect(() => recentFirings(store.db, 'p1', -1)).not.toThrow();
    const log = recentFirings(store.db, 'p1', -1);
    expect(log.length).toBeLessThan(3);
  });

  it('clamps a NaN limit/offset instead of throwing a datatype mismatch', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiring('p1', 'f1', 100);
    expect(() => recentFirings(store.db, 'p1', NaN, NaN)).not.toThrow();
  });

  it('clamps a negative offset to zero rather than erroring', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiring('p1', 'f1', 100);
    insertFiring('p1', 'f2', 200);
    const log = recentFirings(store.db, 'p1', 20, -5);
    expect(log.map((f) => f.firing_id)).toEqual(['f2', 'f1']);
  });

  it('caps at MAX_RECENT_FIRINGS_LIMIT (1000) instead of an unbounded page', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    for (let i = 0; i < 1010; i += 1) {
      insertFiring('p1', `f${i}`, 100 + i);
    }
    expect(recentFirings(store.db, 'p1', 10_000).length).toBeLessThanOrEqual(1000);
  });
});

describe('firingSeries', () => {
  const DAY_1 = Date.UTC(2026, 0, 1); // 2026-01-01
  const DAY_2 = Date.UTC(2026, 0, 2); // 2026-01-02

  function insertFiringMetric(
    projectId: string,
    firingId: string,
    createdAt: number,
    opts: {
      sha?: string;
      kind?: string;
      shipped?: 0 | 1;
      completion?: string;
      costUsd?: number;
      turns?: number;
    } = {},
  ): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, sha, kind, shipped, completion, cost_usd, turns, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projectId,
        firingId,
        opts.sha ?? null,
        opts.kind ?? null,
        opts.shipped ?? 1,
        opts.completion ?? null,
        opts.costUsd ?? 0,
        opts.turns ?? 0,
        createdAt,
      );
  }

  function insertFiringPayload(
    projectId: string,
    firingId: string,
    payload: string,
    createdAt: number,
  ): void {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, 'firing', ?, ?)`,
      )
      .run(projectId, firingId, payload, createdAt);
  }

  it('returns firings oldest-first with the UTC day and payload-derived promptVersion/outcome', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiringMetric('p1', 'f2', DAY_2, { sha: 'bbb', kind: 'fix', costUsd: 2, turns: 20 });
    insertFiringMetric('p1', 'f1', DAY_1, { sha: 'aaa', kind: 'feat', costUsd: 1, turns: 10 });
    insertFiringPayload(
      'p1',
      'f1',
      JSON.stringify({ promptVersion: 'v1', outcome: 'shipped' }),
      DAY_1,
    );
    insertFiringPayload(
      'p1',
      'f2',
      JSON.stringify({ promptVersion: 'v2', outcome: 'noop' }),
      DAY_2,
    );

    const series = firingSeries(store.db, 'p1');
    expect(series.map((p) => p.firingId)).toEqual(['f1', 'f2']);
    expect(series[0]).toMatchObject({
      day: '2026-01-01',
      sha: 'aaa',
      kind: 'feat',
      promptVersion: 'v1',
      outcome: 'shipped',
      costUsd: 1,
      turns: 10,
    });
    expect(series[1]).toMatchObject({ day: '2026-01-02', promptVersion: 'v2', outcome: 'noop' });
  });

  it('leaves promptVersion/outcome null when no firing event was recorded', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiringMetric('p1', 'f1', DAY_1);
    const [point] = firingSeries(store.db, 'p1');
    expect(point).toMatchObject({ promptVersion: null, outcome: null });
  });

  it('tolerates malformed event payload without throwing', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiringMetric('p1', 'f1', DAY_1);
    insertFiringPayload('p1', 'f1', 'not json', DAY_1);
    const [point] = firingSeries(store.db, 'p1');
    expect(point).toMatchObject({ promptVersion: null, outcome: null });
  });

  it('returns an empty array for a project with no firings', () => {
    insertProject('p1', 'alpha', 'registered', 100);
    expect(firingSeries(store.db, 'p1')).toEqual([]);
  });
});

describe('recentActivityEvents', () => {
  function insertActivity(
    projectId: string,
    firingId: string | null,
    payload: string,
    createdAt: number,
  ): void {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, ?, 'activity', ?, ?)`,
      )
      .run(projectId, firingId, payload, createdAt);
  }

  it('returns activity events newest-first, carrying the firing_id they ran in', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertActivity('p1', 'p1:firing-1', '{"tool":"Read"}', 100);
    insertActivity('p1', 'p1:firing-2', '{"tool":"Edit"}', 200);
    const rows = recentActivityEvents(store.db, 'p1');
    expect(rows.map((r) => r.firing_id)).toEqual(['p1:firing-2', 'p1:firing-1']);
  });

  it('carries a null firing_id for events recorded before firing_id existed', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertActivity('p1', null, '{"tool":"Read"}', 100);
    const rows = recentActivityEvents(store.db, 'p1');
    expect(rows[0]!.firing_id).toBeNull();
  });

  it('caps at limit, dropping the older firing entirely from the window', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertActivity('p1', 'p1:firing-1', '{"tool":"Read"}', 100);
    insertActivity('p1', 'p1:firing-2', '{"tool":"Edit"}', 200);
    const rows = recentActivityEvents(store.db, 'p1', 1);
    expect(rows.map((r) => r.firing_id)).toEqual(['p1:firing-2']);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertActivity('p1', 'p1:firing-1', '{"tool":"Read"}', 100);
    insertActivity('p1', 'p1:firing-2', '{"tool":"Edit"}', 200);
    const rows = recentActivityEvents(store.db, 'p1', -1);
    expect(rows.map((r) => r.firing_id)).toEqual(['p1:firing-2']);
  });

  it('degrades instead of crashing when limit is NaN', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertActivity('p1', 'p1:firing-1', '{"tool":"Read"}', 100);

    // Math.max/min/floor all propagate NaN, so an unguarded clamp hands
    // SQLite a NaN `LIMIT` bind, which better-sqlite3 rejects with
    // "datatype mismatch" — same failure class already guarded in
    // `clampLimit` (search.ts) and `clampOrientLengthsLimit` (orient.ts).
    expect(() => recentActivityEvents(store.db, 'p1', NaN)).not.toThrow();
  });

  it('caps at MAX_EVENTS_LIMIT (1000), the clamp shared by every reader in read-events.ts', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    for (let i = 0; i < 1010; i += 1) {
      insertActivity('p1', `p1:firing-${i}`, '{"tool":"Read"}', 100 + i);
    }
    expect(recentActivityEvents(store.db, 'p1', 10_000).length).toBeLessThanOrEqual(1000);
  });
});

describe('activityEventsForFiring', () => {
  function insertActivity(
    projectId: string,
    firingId: string | null,
    payload: string,
    createdAt: number,
  ): void {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, ?, 'activity', ?, ?)`,
      )
      .run(projectId, firingId, payload, createdAt);
  }

  it('returns every event for that firing, newest first, ignoring the recency cap', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    // 13 events for firing-1 — one more than recentActivityEvents' default
    // limit of 12 — to prove this reads the full trace, not a capped window.
    for (let i = 0; i < 13; i++) {
      insertActivity('p1', 'p1:firing-1', `{"tool":"Read","target":"${i}"}`, 100 + i);
    }
    insertActivity('p1', 'p1:firing-2', '{"tool":"Edit"}', 500);
    const rows = activityEventsForFiring(store.db, 'p1', 'p1:firing-1');
    expect(rows).toHaveLength(13);
    expect(rows.every((r) => r.firing_id === 'p1:firing-1')).toBe(true);
    expect(JSON.parse(rows[0]!.payload!).target).toBe('12');
  });

  it('scopes strictly to the requested project and firing', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertProject('p2', 'beta', 'flying', 100);
    insertActivity('p1', 'shared-id', '{"tool":"Read"}', 100);
    insertActivity('p2', 'shared-id', '{"tool":"Edit"}', 100);
    insertActivity('p1', 'other-firing', '{"tool":"Grep"}', 100);
    const rows = activityEventsForFiring(store.db, 'p1', 'shared-id');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload!).tool).toBe('Read');
  });

  it('returns an empty array for an unknown firing', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertActivity('p1', 'p1:firing-1', '{"tool":"Read"}', 100);
    expect(activityEventsForFiring(store.db, 'p1', 'nonexistent')).toEqual([]);
  });
});

describe('firingCommitRef', () => {
  function insertMetricWithSha(projectId: string, firingId: string, sha: string | null): void {
    store.db
      .prepare(`INSERT INTO metrics (project_id, firing_id, sha, created_at) VALUES (?, ?, ?, ?)`)
      .run(projectId, firingId, sha, 1000);
  }

  it("returns the firing's recorded commit sha", () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertMetricWithSha('p1', 'f1', 'abc123');
    expect(firingCommitRef(store.db, 'p1', 'f1')).toEqual({ sha: 'abc123' });
  });

  it('returns a null sha for a firing that recorded no commit', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertMetricWithSha('p1', 'f1', null);
    expect(firingCommitRef(store.db, 'p1', 'f1')).toEqual({ sha: null });
  });

  it('returns null for an unknown firing', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertMetricWithSha('p1', 'f1', 'abc123');
    expect(firingCommitRef(store.db, 'p1', 'nonexistent')).toBeNull();
  });

  it('scopes strictly to the requested project', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertProject('p2', 'beta', 'flying', 100);
    insertMetricWithSha('p2', 'shared-id', 'def456');
    expect(firingCommitRef(store.db, 'p1', 'shared-id')).toBeNull();
  });
});

describe('recentTasks', () => {
  beforeEach(() => {
    insertProject('pt', 'pt', 'flying', 1);
  });

  it('lists a project’s tasks with open ones first', () => {
    insertTask('pt', 'done', 'low');
    insertTask('pt', 'queued', 'critical');
    insertTask('pt', 'in_progress', null);
    const rows = recentTasks(store.db, 'pt');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.status).not.toBe('done'); // open first
    expect(rows[1]?.status).not.toBe('done');
    expect(rows[2]?.status).toBe('done');
    expect(rows.every((r) => typeof r.title === 'string')).toBe(true);
  });

  it('scopes to the project and respects the limit', () => {
    insertProject('other', 'other', 'flying', 1);
    insertTask('pt', 'queued', null);
    insertTask('other', 'queued', null);
    expect(recentTasks(store.db, 'pt')).toHaveLength(1);
    insertTask('pt', 'queued', null);
    expect(recentTasks(store.db, 'pt', 1)).toHaveLength(1);
  });

  it('orders by SEVERITY BAND first (HIGH always above), operator priority within a band', () => {
    // Insert deliberately out of order; untagged newest (would win on recency alone).
    const mk = (id: string, severity: string | null, priority: number | null, at: number): void => {
      store.db
        .prepare(
          `INSERT INTO tasks (id, project_id, title, status, severity, priority, source, created_at, updated_at)
           VALUES (?, 'pt', ?, 'queued', ?, ?, 'dashboard', ?, ?)`,
        )
        .run(id, `task ${id}`, severity, priority, at, at);
    };
    mk('t-none', null, null, 900); // newest, untagged → LAST band despite recency
    mk('t-low', 'low', null, 10);
    mk('t-med', 'medium', null, 20);
    mk('t-high-2', 'high', 2, 30);
    mk('t-high-1', 'high', 1, 5); // oldest, but priority 1 within the high band
    mk('t-crit', 'critical', null, 1);

    const ids = recentTasks(store.db, 'pt').map((r) => r.id);
    expect(ids).toEqual(['t-crit', 't-high-1', 't-high-2', 't-med', 't-low', 't-none']);
  });

  it('DONE tasks are history: recency only, never severity-banded below the cut', () => {
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, severity, source, created_at, updated_at)
         VALUES ('d-old-crit', 'pt', 'old critical done', 'done', 'critical', 'dashboard', 1, 1),
                ('d-new-none', 'pt', 'fresh untagged done', 'done', NULL, 'dashboard', 99, 99)`,
      )
      .run();
    const ids = recentTasks(store.db, 'pt').map((r) => r.id);
    expect(ids.indexOf('d-new-none')).toBeLessThan(ids.indexOf('d-old-crit')); // recency wins for history
  });

  it('DONE tasks with a leftover priority STILL sort by recency, not the stale priority', () => {
    // A task reordered while queued keeps its `priority` after it ships — done
    // clears focus, not priority (mutate.ts). History must read newest-first
    // regardless, exactly as the severity band is already neutralized for done.
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, severity, priority, source, created_at, updated_at)
         VALUES ('d-old-prio', 'pt', 'old prioritized done', 'done', NULL, 2, 'dashboard', 1, 1),
                ('d-new-noprio', 'pt', 'fresh done', 'done', NULL, NULL, 'dashboard', 99, 99)`,
      )
      .run();
    const ids = recentTasks(store.db, 'pt').map((r) => r.id);
    expect(ids.indexOf('d-new-noprio')).toBeLessThan(ids.indexOf('d-old-prio'));
  });

  it('FOCUS still outranks severity (the operator lock beats every band)', () => {
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, severity, focus, source, created_at, updated_at)
         VALUES ('t-c', 'pt', 'critical', 'queued', 'critical', 0, 'dashboard', 1, 1),
                ('t-f', 'pt', 'focused low', 'queued', 'low', 1, 'dashboard', 2, 2)`,
      )
      .run();
    const ids = recentTasks(store.db, 'pt').map((r) => r.id);
    expect(ids[0]).toBe('t-f'); // 🎯 focus first, even over critical
  });

  it('surfaces assignee (PARALLEL UNLOCK C board task-CLAIMING) — null until claimed', () => {
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, assignee, source, created_at, updated_at)
         VALUES ('t-unclaimed', 'pt', 'open', 'queued', NULL, 'dashboard', 1, 1),
                ('t-claimed', 'pt', 'taken', 'in_progress', 'instance-a', 'dashboard', 2, 2)`,
      )
      .run();
    const rows = recentTasks(store.db, 'pt');
    expect(rows.find((r) => r.id === 't-unclaimed')?.assignee).toBeNull();
    expect(rows.find((r) => r.id === 't-claimed')?.assignee).toBe('instance-a');
  });

  it('surfaces priority_pinned (web-mt1bwkrf-v5pnx2) — 0 by default, 1 once the operator pins it', () => {
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, priority_pinned, source, created_at, updated_at)
         VALUES ('t-unpinned', 'pt', 'unpinned', 'queued', 0, 'dashboard', 1, 1),
                ('t-pinned', 'pt', 'pinned', 'queued', 1, 'dashboard', 2, 2)`,
      )
      .run();
    const rows = recentTasks(store.db, 'pt');
    expect(rows.find((r) => r.id === 't-unpinned')?.priority_pinned).toBe(0);
    expect(rows.find((r) => r.id === 't-pinned')?.priority_pinned).toBe(1);
  });

  it('surfaces body — null by default, the full text once a source sets it', () => {
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, body, status, source, created_at, updated_at)
         VALUES ('t-no-body', 'pt', 'title only', NULL, 'queued', 'dashboard', 1, 1),
                ('t-with-body', 'pt', 'note title', 'the full note text', 'queued', 'inbox', 2, 2)`,
      )
      .run();
    const rows = recentTasks(store.db, 'pt');
    expect(rows.find((r) => r.id === 't-no-body')?.body).toBeNull();
    expect(rows.find((r) => r.id === 't-with-body')?.body).toBe('the full note text');
  });

  it('clamps a negative limit instead of returning every row unbounded', () => {
    insertTask('pt', 'queued', null);
    insertTask('pt', 'queued', null);
    insertTask('pt', 'queued', null);
    expect(() => recentTasks(store.db, 'pt', -1)).not.toThrow();
    expect(recentTasks(store.db, 'pt', -1).length).toBeLessThan(3);
  });

  it('clamps a NaN limit instead of throwing a datatype mismatch', () => {
    insertTask('pt', 'queued', null);
    expect(() => recentTasks(store.db, 'pt', NaN)).not.toThrow();
  });
});

describe('doneTasks', () => {
  beforeEach(() => {
    insertProject('dt', 'dt', 'flying', 1);
  });

  const mk = (id: string, projectId: string, status: string, updatedAt: number): void => {
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'dashboard', ?, ?)`,
      )
      .run(id, projectId, `title for ${id}`, status, updatedAt, updatedAt);
  };

  it('returns only DONE tasks, most-recently-closed first', () => {
    mk('d-old', 'dt', 'done', 10);
    mk('d-new', 'dt', 'done', 20);
    mk('open', 'dt', 'queued', 30);
    const ids = doneTasks(store.db, 'dt').map((r) => r.id);
    expect(ids).toEqual(['d-new', 'd-old']);
  });

  it('scopes to the project and respects the limit', () => {
    insertProject('other-dt', 'other-dt', 'flying', 1);
    mk('d1', 'dt', 'done', 1);
    mk('d-other', 'other-dt', 'done', 1);
    expect(doneTasks(store.db, 'dt').map((r) => r.id)).toEqual(['d1']);
    mk('d2', 'dt', 'done', 2);
    expect(doneTasks(store.db, 'dt', 1)).toHaveLength(1);
  });

  it('carries the assignee field, honoring the TaskSummaryRow contract it returns', () => {
    // doneTasks is cast `as TaskSummaryRow[]`, whose contract guarantees
    // `assignee: string | null`. If the SELECT omits the column, the key is
    // simply absent at runtime and a consumer reading `.assignee` gets
    // `undefined`, not the promised value — a silent contract violation.
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, assignee, source, created_at, updated_at)
         VALUES ('d-claimed', 'dt', 'claimed done', 'done', 'fleet-2', 'dashboard', 2, 2),
                ('d-unclaimed', 'dt', 'unclaimed done', 'done', NULL, 'dashboard', 1, 1)`,
      )
      .run();
    const rows = doneTasks(store.db, 'dt');
    expect(rows.find((r) => r.id === 'd-claimed')).toHaveProperty('assignee', 'fleet-2');
    expect(rows.find((r) => r.id === 'd-unclaimed')).toHaveProperty('assignee', null);
  });

  it('carries the body field, honoring the TaskSummaryRow contract it returns', () => {
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, body, status, source, created_at, updated_at)
         VALUES ('d-with-body', 'dt', 'note title', 'the full note text', 'done', 'inbox', 1, 1)`,
      )
      .run();
    const rows = doneTasks(store.db, 'dt');
    expect(rows.find((r) => r.id === 'd-with-body')).toHaveProperty('body', 'the full note text');
  });

  it('clamps a negative limit instead of returning every row unbounded', () => {
    mk('d1', 'dt', 'done', 1);
    mk('d2', 'dt', 'done', 2);
    mk('d3', 'dt', 'done', 3);
    expect(() => doneTasks(store.db, 'dt', -1)).not.toThrow();
    expect(doneTasks(store.db, 'dt', -1).length).toBeLessThan(3);
  });

  it('clamps a NaN limit instead of throwing a datatype mismatch', () => {
    mk('d1', 'dt', 'done', 1);
    expect(() => doneTasks(store.db, 'dt', NaN)).not.toThrow();
  });
});

describe('taskEconomics', () => {
  beforeEach(() => {
    insertProject('pe', 'pe', 'flying', 1);
  });

  it('sums lifetime cost/firings per task, ignoring firings with no item', () => {
    insertTaskMetric('pe', 'task-a', 5);
    insertTaskMetric('pe', 'task-a', 3);
    insertMetric('no-item-1', 'pe', 1, 100); // item is null — must not be grouped in
    const rows = taskEconomics(store.db, 'pe');
    expect(rows).toEqual([
      { taskId: 'task-a', cumulativeCostUsd: 8, firingCount: 2, allSlices: true, isRunaway: false },
    ]);
  });

  it('scopes to the given project', () => {
    insertProject('other', 'other', 'flying', 1);
    insertTaskMetric('pe', 'task-a', 5);
    insertTaskMetric('other', 'task-a', 999);
    const rows = taskEconomics(store.db, 'pe');
    expect(rows).toEqual([
      { taskId: 'task-a', cumulativeCostUsd: 5, firingCount: 1, allSlices: true, isRunaway: false },
    ]);
  });

  it('allSlices is false once ANY firing reports completion complete', () => {
    insertTaskMetric('pe', 'task-a', 5, 'slice');
    insertTaskMetric('pe', 'task-a', 5, 'complete');
    const rows = taskEconomics(store.db, 'pe');
    expect(rows[0]).toMatchObject({ allSlices: false, isRunaway: false });
  });

  it('flags a runaway once lifetime cost clears the threshold with no completion', () => {
    insertTaskMetric('pe', 'task-a', RUNAWAY_COST_USD + 0.01);
    const rows = taskEconomics(store.db, 'pe');
    expect(rows[0]).toMatchObject({ isRunaway: true });
  });

  it('does NOT flag a cost-runaway task that already completed', () => {
    insertTaskMetric('pe', 'task-a', RUNAWAY_COST_USD + 50, 'complete');
    const rows = taskEconomics(store.db, 'pe');
    expect(rows[0]).toMatchObject({ isRunaway: false, allSlices: false });
  });

  it('re-flags a task that keeps burning past both thresholds AFTER a completion — a single closed firing must not buy permanent immunity (the "attribution to a CLOSED task" evasion)', () => {
    insertTaskMetric('pe', 'task-a', 1, 'complete');
    for (let i = 0; i < RUNAWAY_FIRING_COUNT + 1; i++) {
      insertTaskMetric('pe', 'task-a', RUNAWAY_COST_USD, 'slice');
    }
    const rows = taskEconomics(store.db, 'pe');
    expect(rows[0]).toMatchObject({ isRunaway: true });
  });

  it('flags a runaway once lifetime firing count clears the threshold with no completion', () => {
    for (let i = 0; i < RUNAWAY_FIRING_COUNT + 1; i++) insertTaskMetric('pe', 'task-a', 0.1);
    const rows = taskEconomics(store.db, 'pe');
    expect(rows[0]).toMatchObject({ firingCount: RUNAWAY_FIRING_COUNT + 1, isRunaway: true });
  });

  it('does not flag a task under both thresholds', () => {
    insertTaskMetric('pe', 'task-a', 1);
    insertTaskMetric('pe', 'task-a', 1);
    const rows = taskEconomics(store.db, 'pe');
    expect(rows[0]).toMatchObject({ isRunaway: false });
  });

  it('returns an empty array for a project with no item-tagged firings', () => {
    expect(taskEconomics(store.db, 'pe')).toEqual([]);
  });
});

let sliceMetricSeq = 0;
function insertSliceMetric(
  projectId: string,
  item: string,
  opts: {
    shipped?: 0 | 1;
    completion?: 'slice' | 'complete' | null;
    commitSubject?: string | null;
  } = {},
): void {
  sliceMetricSeq += 1;
  store.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, item, shipped, completion, commit_subject, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      `sm-${sliceMetricSeq}`,
      item,
      opts.shipped ?? 1,
      opts.completion === undefined ? 'slice' : opts.completion,
      opts.commitSubject === undefined ? `commit subject ${sliceMetricSeq}` : opts.commitSubject,
      1000,
    );
}

describe('shippedSlicesByTask', () => {
  beforeEach(() => {
    insertProject('ss', 'ss', 'flying', 1);
  });

  it('collects shipped-slice commit subjects for a task, oldest first', () => {
    insertSliceMetric('ss', 'task-a', { commitSubject: 'feat: first slice' });
    insertSliceMetric('ss', 'task-a', { commitSubject: 'feat: second slice' });
    const byTask = shippedSlicesByTask(store.db, 'ss');
    expect(byTask.get('task-a')).toEqual(['feat: first slice', 'feat: second slice']);
  });

  it('excludes a "complete" firing — only a partial slice belongs in the ledger', () => {
    insertSliceMetric('ss', 'task-a', { completion: 'complete', commitSubject: 'feat: done' });
    expect(shippedSlicesByTask(store.db, 'ss').get('task-a')).toBeUndefined();
  });

  it('excludes an unshipped (gate-reverted) firing', () => {
    insertSliceMetric('ss', 'task-a', { shipped: 0 });
    expect(shippedSlicesByTask(store.db, 'ss').get('task-a')).toBeUndefined();
  });

  it('excludes a shipped slice with no commit subject recorded', () => {
    insertSliceMetric('ss', 'task-a', { commitSubject: null });
    expect(shippedSlicesByTask(store.db, 'ss').get('task-a')).toBeUndefined();
  });

  it('scopes to the given project', () => {
    insertProject('ss-other', 'ss-other', 'flying', 1);
    insertSliceMetric('ss', 'task-a', { commitSubject: 'in scope' });
    insertSliceMetric('ss-other', 'task-a', { commitSubject: 'out of scope' });
    expect(shippedSlicesByTask(store.db, 'ss').get('task-a')).toEqual(['in scope']);
  });

  it('groups independently per task id', () => {
    insertSliceMetric('ss', 'task-a', { commitSubject: 'a slice' });
    insertSliceMetric('ss', 'task-b', { commitSubject: 'b slice' });
    const byTask = shippedSlicesByTask(store.db, 'ss');
    expect(byTask.get('task-a')).toEqual(['a slice']);
    expect(byTask.get('task-b')).toEqual(['b slice']);
  });

  it('caps the ledger at SHIPPED_SLICES_LIMIT, keeping the most recent', () => {
    for (let i = 0; i < SHIPPED_SLICES_LIMIT + 3; i++) {
      insertSliceMetric('ss', 'task-a', { commitSubject: `slice ${i}` });
    }
    const list = shippedSlicesByTask(store.db, 'ss').get('task-a');
    expect(list).toHaveLength(SHIPPED_SLICES_LIMIT);
    expect(list?.[0]).toBe('slice 3');
    expect(list?.[list.length - 1]).toBe(`slice ${SHIPPED_SLICES_LIMIT + 2}`);
  });

  it('returns an empty map for a project with no slice metrics', () => {
    expect(shippedSlicesByTask(store.db, 'ss').size).toBe(0);
  });
});

describe('nearMissDebriefEvents', () => {
  const insertNearMissDebrief = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'near-miss-debrief', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('nmd', 'nmd', 'flying', 1);
  });

  it('returns near-miss-debrief events newest first, ignoring other event types', () => {
    insertNearMissDebrief(
      'nmd',
      '{"guardDenials":0,"intentCollisions":1,"rescues":0,"syncBackRefusals":0,"checkpointErrors":0}',
      100,
    );
    insertNearMissDebrief(
      'nmd',
      '{"guardDenials":1,"intentCollisions":0,"rescues":0,"syncBackRefusals":0,"checkpointErrors":0}',
      200,
    );
    insertEvent('nmd', 300); // type 'firing' — must not leak in
    expect(nearMissDebriefEvents(store.db, 'nmd')).toEqual([
      {
        payload:
          '{"guardDenials":1,"intentCollisions":0,"rescues":0,"syncBackRefusals":0,"checkpointErrors":0}',
        created_at: 200,
      },
      {
        payload:
          '{"guardDenials":0,"intentCollisions":1,"rescues":0,"syncBackRefusals":0,"checkpointErrors":0}',
        created_at: 100,
      },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('nmd-other', 'nmd-other', 'flying', 1);
    insertNearMissDebrief('nmd', '{"guardDenials":0}', 100);
    insertNearMissDebrief('nmd-other', '{"guardDenials":9}', 100);
    expect(nearMissDebriefEvents(store.db, 'nmd')).toHaveLength(1);
    insertNearMissDebrief('nmd', '{"guardDenials":1}', 200);
    expect(nearMissDebriefEvents(store.db, 'nmd', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertNearMissDebrief('nmd', '{"guardDenials":0}', 100);
    insertNearMissDebrief('nmd', '{"guardDenials":1}', 200);
    expect(nearMissDebriefEvents(store.db, 'nmd', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no near-miss-debrief events', () => {
    expect(nearMissDebriefEvents(store.db, 'nmd')).toEqual([]);
  });
});

describe('nearMissRecurringEvents', () => {
  const insertNearMissRecurring = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'near-miss-recurring', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('nmr', 'nmr', 'flying', 1);
  });

  it('returns near-miss-recurring events newest first, ignoring other event types', () => {
    insertNearMissRecurring('nmr', '{"nearMissClass":"guardDenials","streak":2}', 100);
    insertNearMissRecurring('nmr', '{"nearMissClass":"rescues","streak":3}', 200);
    insertEvent('nmr', 300); // type 'firing' — must not leak in
    expect(nearMissRecurringEvents(store.db, 'nmr')).toEqual([
      { payload: '{"nearMissClass":"rescues","streak":3}', created_at: 200 },
      { payload: '{"nearMissClass":"guardDenials","streak":2}', created_at: 100 },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('nmr-other', 'nmr-other', 'flying', 1);
    insertNearMissRecurring('nmr', '{"nearMissClass":"mine","streak":1}', 100);
    insertNearMissRecurring('nmr-other', '{"nearMissClass":"theirs","streak":1}', 100);
    expect(nearMissRecurringEvents(store.db, 'nmr')).toHaveLength(1);
    insertNearMissRecurring('nmr', '{"nearMissClass":"mine","streak":2}', 200);
    expect(nearMissRecurringEvents(store.db, 'nmr', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertNearMissRecurring('nmr', '{"nearMissClass":"mine","streak":1}', 100);
    insertNearMissRecurring('nmr', '{"nearMissClass":"mine","streak":2}', 200);
    expect(nearMissRecurringEvents(store.db, 'nmr', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no near-miss-recurring events', () => {
    expect(nearMissRecurringEvents(store.db, 'nmr')).toEqual([]);
  });
});

describe('familyRunawayEvents', () => {
  const insertFamilyRunaway = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'family-runaway', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('fr', 'fr', 'flying', 1);
  });

  it('returns family-runaway events newest first, ignoring other event types', () => {
    insertFamilyRunaway('fr', '{"family":"older *"}', 100);
    insertFamilyRunaway('fr', '{"family":"newer *"}', 200);
    insertEvent('fr', 300); // type 'firing' — must not leak in
    expect(familyRunawayEvents(store.db, 'fr')).toEqual([
      { payload: '{"family":"newer *"}', created_at: 200 },
      { payload: '{"family":"older *"}', created_at: 100 },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('fr-other', 'fr-other', 'flying', 1);
    insertFamilyRunaway('fr', '{"family":"mine"}', 100);
    insertFamilyRunaway('fr-other', '{"family":"theirs"}', 100);
    expect(familyRunawayEvents(store.db, 'fr')).toHaveLength(1);
    insertFamilyRunaway('fr', '{"family":"mine 2"}', 200);
    expect(familyRunawayEvents(store.db, 'fr', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertFamilyRunaway('fr', '{"family":"mine"}', 100);
    insertFamilyRunaway('fr', '{"family":"mine 2"}', 200);
    expect(familyRunawayEvents(store.db, 'fr', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no family-runaway events', () => {
    expect(familyRunawayEvents(store.db, 'fr')).toEqual([]);
  });
});

describe('intentCollisionEvents', () => {
  const insertIntentCollision = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'intent-collision', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('ic', 'ic', 'flying', 1);
  });

  it('returns intent-collision events newest first, ignoring other event types', () => {
    insertIntentCollision('ic', '{"file":"a.ts","sibling":"fleet-2","intent":"older claim"}', 100);
    insertIntentCollision('ic', '{"file":"b.ts","sibling":"fleet-3","intent":"newer claim"}', 200);
    insertEvent('ic', 300); // type 'firing' — must not leak in
    expect(intentCollisionEvents(store.db, 'ic')).toEqual([
      { payload: '{"file":"b.ts","sibling":"fleet-3","intent":"newer claim"}', created_at: 200 },
      { payload: '{"file":"a.ts","sibling":"fleet-2","intent":"older claim"}', created_at: 100 },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('ic-other', 'ic-other', 'flying', 1);
    insertIntentCollision('ic', '{"file":"mine.ts","sibling":"x","intent":"mine"}', 100);
    insertIntentCollision('ic-other', '{"file":"theirs.ts","sibling":"y","intent":"theirs"}', 100);
    expect(intentCollisionEvents(store.db, 'ic')).toHaveLength(1);
    insertIntentCollision('ic', '{"file":"mine2.ts","sibling":"x","intent":"mine"}', 200);
    expect(intentCollisionEvents(store.db, 'ic', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertIntentCollision('ic', '{"file":"mine.ts","sibling":"x","intent":"mine"}', 100);
    insertIntentCollision('ic', '{"file":"mine2.ts","sibling":"x","intent":"mine"}', 200);
    expect(intentCollisionEvents(store.db, 'ic', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no intent-collision events', () => {
    expect(intentCollisionEvents(store.db, 'ic')).toEqual([]);
  });
});

describe('guardDenialEvents', () => {
  const insertGuardDenial = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'guard-denial', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('gd', 'gd', 'flying', 1);
  });

  it('returns guard-denial events newest first, ignoring other event types', () => {
    insertGuardDenial('gd', '{"kind":"containment","target":"/etc/passwd"}', 100);
    insertGuardDenial('gd', '{"kind":"read-hygiene","target":"dist/bundle.js"}', 200);
    insertEvent('gd', 300); // type 'firing' — must not leak in
    expect(guardDenialEvents(store.db, 'gd')).toEqual([
      { payload: '{"kind":"read-hygiene","target":"dist/bundle.js"}', created_at: 200 },
      { payload: '{"kind":"containment","target":"/etc/passwd"}', created_at: 100 },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('gd-other', 'gd-other', 'flying', 1);
    insertGuardDenial('gd', '{"kind":"containment","target":"mine"}', 100);
    insertGuardDenial('gd-other', '{"kind":"containment","target":"theirs"}', 100);
    expect(guardDenialEvents(store.db, 'gd')).toHaveLength(1);
    insertGuardDenial('gd', '{"kind":"containment","target":"mine 2"}', 200);
    expect(guardDenialEvents(store.db, 'gd', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertGuardDenial('gd', '{"kind":"containment","target":"mine"}', 100);
    insertGuardDenial('gd', '{"kind":"containment","target":"mine 2"}', 200);
    expect(guardDenialEvents(store.db, 'gd', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no guard-denial events', () => {
    expect(guardDenialEvents(store.db, 'gd')).toEqual([]);
  });
});

describe('syncBackRefusalEvents', () => {
  const insertSyncBackRefusal = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'sync-back-refusal', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('sbr', 'sbr', 'flying', 1);
  });

  it('returns sync-back-refusal events newest first, ignoring other event types', () => {
    insertSyncBackRefusal('sbr', '{"reason":"per-firing sync-back conflict"}', 100);
    insertSyncBackRefusal('sbr', '{"reason":"flight-end retry conflict"}', 200);
    insertEvent('sbr', 300); // type 'firing' — must not leak in
    expect(syncBackRefusalEvents(store.db, 'sbr')).toEqual([
      { payload: '{"reason":"flight-end retry conflict"}', created_at: 200 },
      { payload: '{"reason":"per-firing sync-back conflict"}', created_at: 100 },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('sbr-other', 'sbr-other', 'flying', 1);
    insertSyncBackRefusal('sbr', '{"reason":"mine"}', 100);
    insertSyncBackRefusal('sbr-other', '{"reason":"theirs"}', 100);
    expect(syncBackRefusalEvents(store.db, 'sbr')).toHaveLength(1);
    insertSyncBackRefusal('sbr', '{"reason":"mine 2"}', 200);
    expect(syncBackRefusalEvents(store.db, 'sbr', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertSyncBackRefusal('sbr', '{"reason":"mine"}', 100);
    insertSyncBackRefusal('sbr', '{"reason":"mine 2"}', 200);
    expect(syncBackRefusalEvents(store.db, 'sbr', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no sync-back-refusal events', () => {
    expect(syncBackRefusalEvents(store.db, 'sbr')).toEqual([]);
  });
});

describe('landGateAlarmEvents', () => {
  const insertLandGateAlarm = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'land-gate-alarm', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('lga', 'lga', 'flying', 1);
  });

  it('returns land-gate-alarm events newest first, ignoring other event types', () => {
    insertLandGateAlarm('lga', '{"details":"typecheck failed"}', 100);
    insertLandGateAlarm('lga', '{"details":"tests failed"}', 200);
    insertEvent('lga', 300); // type 'firing' — must not leak in
    expect(landGateAlarmEvents(store.db, 'lga')).toEqual([
      { payload: '{"details":"tests failed"}', created_at: 200 },
      { payload: '{"details":"typecheck failed"}', created_at: 100 },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('lga-other', 'lga-other', 'flying', 1);
    insertLandGateAlarm('lga', '{"details":"mine"}', 100);
    insertLandGateAlarm('lga-other', '{"details":"theirs"}', 100);
    expect(landGateAlarmEvents(store.db, 'lga')).toHaveLength(1);
    insertLandGateAlarm('lga', '{"details":"mine 2"}', 200);
    expect(landGateAlarmEvents(store.db, 'lga', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertLandGateAlarm('lga', '{"details":"mine"}', 100);
    insertLandGateAlarm('lga', '{"details":"mine 2"}', 200);
    expect(landGateAlarmEvents(store.db, 'lga', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no land-gate-alarm events', () => {
    expect(landGateAlarmEvents(store.db, 'lga')).toEqual([]);
  });
});

describe('convergenceRedEvents', () => {
  const insertConvergenceRed = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'convergence-red', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('cvr', 'cvr', 'flying', 1);
  });

  it('returns convergence-red events newest first, ignoring other event types', () => {
    insertConvergenceRed('cvr', '{"branch":"flight","check":"typecheck","merge":"first"}', 100);
    insertConvergenceRed('cvr', '{"branch":"flight","check":"build","merge":"second"}', 200);
    insertEvent('cvr', 300); // type 'firing' — must not leak in
    expect(convergenceRedEvents(store.db, 'cvr')).toEqual([
      { payload: '{"branch":"flight","check":"build","merge":"second"}', created_at: 200 },
      { payload: '{"branch":"flight","check":"typecheck","merge":"first"}', created_at: 100 },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('cvr-other', 'cvr-other', 'flying', 1);
    insertConvergenceRed('cvr', '{"check":"typecheck","merge":"mine"}', 100);
    insertConvergenceRed('cvr-other', '{"check":"typecheck","merge":"theirs"}', 100);
    expect(convergenceRedEvents(store.db, 'cvr')).toHaveLength(1);
    insertConvergenceRed('cvr', '{"check":"typecheck","merge":"mine 2"}', 200);
    expect(convergenceRedEvents(store.db, 'cvr', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertConvergenceRed('cvr', '{"check":"typecheck","merge":"mine"}', 100);
    insertConvergenceRed('cvr', '{"check":"typecheck","merge":"mine 2"}', 200);
    expect(convergenceRedEvents(store.db, 'cvr', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no convergence-red events', () => {
    expect(convergenceRedEvents(store.db, 'cvr')).toEqual([]);
  });
});

describe('e2eLandBlockEvents', () => {
  const insertE2eLandBlock = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'e2e-land-block', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('elb', 'elb', 'flying', 1);
  });

  it('returns e2e-land-block events newest first, ignoring other event types', () => {
    insertE2eLandBlock('elb', '{"detail":"ci.yml is failure on main"}', 100);
    insertE2eLandBlock('elb', '{"detail":"ci.yml is timed_out on main"}', 200);
    insertEvent('elb', 300); // type 'firing' — must not leak in
    expect(e2eLandBlockEvents(store.db, 'elb')).toEqual([
      { payload: '{"detail":"ci.yml is timed_out on main"}', created_at: 200 },
      { payload: '{"detail":"ci.yml is failure on main"}', created_at: 100 },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('elb-other', 'elb-other', 'flying', 1);
    insertE2eLandBlock('elb', '{"detail":"mine"}', 100);
    insertE2eLandBlock('elb-other', '{"detail":"theirs"}', 100);
    expect(e2eLandBlockEvents(store.db, 'elb')).toHaveLength(1);
    insertE2eLandBlock('elb', '{"detail":"mine 2"}', 200);
    expect(e2eLandBlockEvents(store.db, 'elb', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertE2eLandBlock('elb', '{"detail":"mine"}', 100);
    insertE2eLandBlock('elb', '{"detail":"mine 2"}', 200);
    expect(e2eLandBlockEvents(store.db, 'elb', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no e2e-land-block events', () => {
    expect(e2eLandBlockEvents(store.db, 'elb')).toEqual([]);
  });
});

describe('landedEvents', () => {
  const insertLanded = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'landed', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('ld', 'ld', 'flying', 1);
  });

  it('returns landed events newest first, ignoring other event types', () => {
    insertLanded('ld', '{"details":"merged."}', 100);
    insertLanded('ld', '{"details":"merged again."}', 200);
    insertEvent('ld', 300); // type 'firing' — must not leak in
    expect(landedEvents(store.db, 'ld')).toEqual([
      { payload: '{"details":"merged again."}', created_at: 200 },
      { payload: '{"details":"merged."}', created_at: 100 },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('ld-other', 'ld-other', 'flying', 1);
    insertLanded('ld', '{"details":"mine"}', 100);
    insertLanded('ld-other', '{"details":"theirs"}', 100);
    expect(landedEvents(store.db, 'ld')).toHaveLength(1);
    insertLanded('ld', '{"details":"mine 2"}', 200);
    expect(landedEvents(store.db, 'ld', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertLanded('ld', '{"details":"mine"}', 100);
    insertLanded('ld', '{"details":"mine 2"}', 200);
    expect(landedEvents(store.db, 'ld', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no landed events', () => {
    expect(landedEvents(store.db, 'ld')).toEqual([]);
  });
});

describe('evaluationLabelEvents', () => {
  const insertEvaluationLabel = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'evaluation-label', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('el', 'el', 'flying', 1);
  });

  it('returns evaluation-label events newest first, ignoring other event types', () => {
    insertEvaluationLabel('el', '{"taskId":"t1","title":"older","verdict":"approved"}', 100);
    insertEvaluationLabel('el', '{"taskId":"t2","title":"newer","verdict":"rejected"}', 200);
    insertEvent('el', 300); // type 'firing' — must not leak in
    expect(evaluationLabelEvents(store.db, 'el')).toEqual([
      { payload: '{"taskId":"t2","title":"newer","verdict":"rejected"}', created_at: 200 },
      { payload: '{"taskId":"t1","title":"older","verdict":"approved"}', created_at: 100 },
    ]);
  });

  it('scopes to the given project and respects the limit', () => {
    insertProject('el-other', 'el-other', 'flying', 1);
    insertEvaluationLabel('el', '{"taskId":"mine","title":"mine","verdict":"approved"}', 100);
    insertEvaluationLabel(
      'el-other',
      '{"taskId":"theirs","title":"theirs","verdict":"approved"}',
      100,
    );
    expect(evaluationLabelEvents(store.db, 'el')).toHaveLength(1);
    insertEvaluationLabel('el', '{"taskId":"mine2","title":"mine 2","verdict":"rejected"}', 200);
    expect(evaluationLabelEvents(store.db, 'el', 1)).toHaveLength(1);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertEvaluationLabel('el', '{"taskId":"mine","title":"mine","verdict":"approved"}', 100);
    insertEvaluationLabel('el', '{"taskId":"mine2","title":"mine 2","verdict":"rejected"}', 200);
    expect(evaluationLabelEvents(store.db, 'el', -1)).toHaveLength(1);
  });

  it('returns an empty array for a project with no evaluation-label events', () => {
    expect(evaluationLabelEvents(store.db, 'el')).toEqual([]);
  });
});

describe('evaluationLabelSummary', () => {
  const insertEvaluationLabel = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'evaluation-label', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('els', 'els', 'flying', 1);
  });

  it('counts approved and rejected verdicts and rates approvals', () => {
    insertEvaluationLabel('els', '{"taskId":"t1","title":"a","verdict":"approved"}', 100);
    insertEvaluationLabel('els', '{"taskId":"t2","title":"b","verdict":"approved"}', 200);
    insertEvaluationLabel('els', '{"taskId":"t3","title":"c","verdict":"rejected"}', 300);

    expect(evaluationLabelSummary(store.db, 'els')).toEqual({
      total: 3,
      approved: 2,
      rejected: 1,
      approvalRate: 2 / 3,
    });
  });

  it('returns zeroed-out counts and a null rate for a project with no evaluation labels', () => {
    expect(evaluationLabelSummary(store.db, 'els')).toEqual({
      total: 0,
      approved: 0,
      rejected: 0,
      approvalRate: null, // never coerced to 0 — "no data" is not "no approvals"
    });
  });

  it('skips a malformed or non-matching-verdict payload without throwing', () => {
    insertEvaluationLabel('els', 'not json', 100);
    insertEvaluationLabel('els', '{"taskId":"t1","title":"a"}', 200); // no verdict field
    insertEvaluationLabel('els', null, 300);
    insertEvaluationLabel('els', '{"taskId":"t2","title":"b","verdict":"approved"}', 400);

    expect(evaluationLabelSummary(store.db, 'els')).toEqual({
      total: 1,
      approved: 1,
      rejected: 0,
      approvalRate: 1,
    });
  });

  it('does not cross project boundaries', () => {
    insertProject('els-other', 'els-other', 'flying', 1);
    insertEvaluationLabel('els', '{"taskId":"mine","title":"mine","verdict":"approved"}', 100);
    insertEvaluationLabel(
      'els-other',
      '{"taskId":"theirs","title":"theirs","verdict":"rejected"}',
      100,
    );

    expect(evaluationLabelSummary(store.db, 'els')).toEqual({
      total: 1,
      approved: 1,
      rejected: 0,
      approvalRate: 1,
    });
  });

  it('ignores other event types', () => {
    insertEvent('els', 100); // type 'firing' — must not leak in
    expect(evaluationLabelSummary(store.db, 'els')).toEqual({
      total: 0,
      approved: 0,
      rejected: 0,
      approvalRate: null,
    });
  });
});

describe('evaluationLabelDayCounts', () => {
  const DAY_1 = Date.UTC(2026, 0, 1); // 2026-01-01
  const DAY_2 = Date.UTC(2026, 0, 2); // 2026-01-02

  const insertEvaluationLabel = (projectId: string, payload: string | null, at: number): void => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, NULL, 'evaluation-label', ?, ?)`,
      )
      .run(projectId, payload, at);
  };

  beforeEach(() => {
    insertProject('eld', 'eld', 'flying', 1);
  });

  it('buckets approved and rejected verdicts by UTC calendar day, oldest first', () => {
    insertEvaluationLabel('eld', '{"taskId":"t1","title":"a","verdict":"approved"}', DAY_2);
    insertEvaluationLabel('eld', '{"taskId":"t2","title":"b","verdict":"approved"}', DAY_1);
    insertEvaluationLabel('eld', '{"taskId":"t3","title":"c","verdict":"rejected"}', DAY_1);

    expect(evaluationLabelDayCounts(store.db, 'eld')).toEqual([
      { day: '2026-01-01', approved: 1, rejected: 1 },
      { day: '2026-01-02', approved: 1, rejected: 0 },
    ]);
  });

  it('returns an empty array for a project with no evaluation labels', () => {
    expect(evaluationLabelDayCounts(store.db, 'eld')).toEqual([]);
  });

  it('skips a malformed or non-matching-verdict payload without throwing', () => {
    insertEvaluationLabel('eld', 'not json', DAY_1);
    insertEvaluationLabel('eld', '{"taskId":"t1","title":"a"}', DAY_1); // no verdict field
    insertEvaluationLabel('eld', null, DAY_1);
    insertEvaluationLabel('eld', '{"taskId":"t2","title":"b","verdict":"approved"}', DAY_1);

    expect(evaluationLabelDayCounts(store.db, 'eld')).toEqual([
      { day: '2026-01-01', approved: 1, rejected: 0 },
    ]);
  });

  it('does not cross project boundaries', () => {
    insertProject('eld-other', 'eld-other', 'flying', 1);
    insertEvaluationLabel('eld', '{"taskId":"mine","title":"mine","verdict":"approved"}', DAY_1);
    insertEvaluationLabel(
      'eld-other',
      '{"taskId":"theirs","title":"theirs","verdict":"rejected"}',
      DAY_1,
    );

    expect(evaluationLabelDayCounts(store.db, 'eld')).toEqual([
      { day: '2026-01-01', approved: 1, rejected: 0 },
    ]);
  });

  it('ignores other event types', () => {
    insertEvent('eld', DAY_1); // type 'firing' — must not leak in
    expect(evaluationLabelDayCounts(store.db, 'eld')).toEqual([]);
  });
});

describe('firingDayCounts', () => {
  const DAY_1 = Date.UTC(2026, 0, 1); // 2026-01-01
  const DAY_2 = Date.UTC(2026, 0, 2); // 2026-01-02

  let firingSeq = 0;
  const insertFiringMetric = (
    projectId: string,
    shipped: 0 | 1,
    gateResult: string | null,
    at: number,
  ): void => {
    firingSeq += 1;
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, shipped, gate_result, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(projectId, `fdc-${firingSeq}`, shipped, gateResult, at);
  };

  beforeEach(() => {
    insertProject('fdc', 'fdc', 'flying', 1);
  });

  it('buckets ships/deaths/other by UTC calendar day, oldest first', () => {
    insertFiringMetric('fdc', 1, 'passed', DAY_2);
    insertFiringMetric('fdc', 1, 'passed', DAY_1);
    insertFiringMetric('fdc', 0, 'reverted', DAY_1);
    insertFiringMetric('fdc', 0, null, DAY_1);

    expect(firingDayCounts(store.db, 'fdc')).toEqual([
      { day: '2026-01-01', ships: 1, deaths: 1, other: 1 },
      { day: '2026-01-02', ships: 1, deaths: 0, other: 0 },
    ]);
  });

  it('returns an empty array for a project with no firings', () => {
    expect(firingDayCounts(store.db, 'fdc')).toEqual([]);
  });

  it('classifies reverted/checkpointed as deaths and every other unshipped result as other', () => {
    insertFiringMetric('fdc', 0, 'reverted', DAY_1);
    insertFiringMetric('fdc', 0, 'checkpointed', DAY_1);
    insertFiringMetric('fdc', 0, 'passed', DAY_1); // e.g. a self-reported non-ship on a passed gate
    insertFiringMetric('fdc', 0, null, DAY_1); // no gate ever ran

    expect(firingDayCounts(store.db, 'fdc')).toEqual([
      { day: '2026-01-01', ships: 0, deaths: 2, other: 2 },
    ]);
  });

  it('does not cross project boundaries', () => {
    insertProject('fdc-other', 'fdc-other', 'flying', 1);
    insertFiringMetric('fdc', 1, 'passed', DAY_1);
    insertFiringMetric('fdc-other', 0, 'reverted', DAY_1);

    expect(firingDayCounts(store.db, 'fdc')).toEqual([
      { day: '2026-01-01', ships: 1, deaths: 0, other: 0 },
    ]);
  });
});
