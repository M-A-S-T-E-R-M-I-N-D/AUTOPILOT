// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, migrate, type Store } from '../src/index.js';
import {
  evalRegressionByPromptVersion,
  verifiedKnownGoodFirings,
  evalRegressionOverPinnedSuite,
  evalRegressionByPickSource,
  testFirstCompliance,
  pickDisciplineAudit,
  boardDiversityAudit,
  evaluatePromptVersionGate,
  gateParallelSavings,
  type PromptVersionEval,
} from '../src/eval-gate.js';

let store: Store;

function insertProject(id: string, slug: string, status: string, createdAt: number): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, slug, slug, `/tmp/${slug}`, status, createdAt, createdAt);
}

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
});

afterEach(() => {
  store.close();
});

describe('evalRegressionByPromptVersion', () => {
  function insertFiringEvent(
    projectId: string,
    promptVersion: string | null,
    shipped: boolean,
    numTurns: number | null,
    costUsd: number | null,
    createdAt = 1,
  ): void {
    const payload = JSON.stringify({ promptVersion, shipped, numTurns, costUsd });
    store.db
      .prepare(
        `INSERT INTO events (project_id, type, payload, created_at) VALUES (?, 'firing', ?, ?)`,
      )
      .run(projectId, payload, createdAt);
  }

  it('groups firings by prompt version and reports pass rate, median turns, and cost/solved', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiringEvent('p1', 'v1', true, 10, 1);
    insertFiringEvent('p1', 'v1', true, 20, 3);
    insertFiringEvent('p1', 'v1', false, 30, 0.5);
    insertFiringEvent('p1', 'v2', true, 5, 2);

    const rows = evalRegressionByPromptVersion(store.db, 'p1');
    const v1 = rows.find((r) => r.promptVersion === 'v1');
    const v2 = rows.find((r) => r.promptVersion === 'v2');

    expect(v1).toMatchObject({ firings: 3, shipped: 2, passRate: 2 / 3, medianTurns: 20 });
    expect(v1?.costPerSolved).toBeCloseTo(4.5 / 2);
    expect(v1?.costVariance).toBeGreaterThan(0);
    expect(v2).toMatchObject({
      firings: 1,
      shipped: 1,
      passRate: 1,
      medianTurns: 5,
      costPerSolved: 2,
    });
  });

  it('ignores firing events with no resolvable prompt version', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiringEvent('p1', null, true, 10, 1);
    insertFiringEvent('p1', '', true, 10, 1);
    expect(evalRegressionByPromptVersion(store.db, 'p1')).toEqual([]);
  });

  it('tolerates malformed payload JSON without throwing', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    store.db
      .prepare(
        `INSERT INTO events (project_id, type, payload, created_at) VALUES (?, 'firing', ?, ?)`,
      )
      .run('p1', 'not json', 1);
    expect(evalRegressionByPromptVersion(store.db, 'p1')).toEqual([]);
  });

  it('returns an empty array for a project with no firing events', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(evalRegressionByPromptVersion(store.db, 'p1')).toEqual([]);
  });

  it('reports null cost/variance fields when nothing shipped, and zero pass rate', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiringEvent('p1', 'v1', false, 10, 1);
    const [row] = evalRegressionByPromptVersion(store.db, 'p1');
    expect(row).toMatchObject({ firings: 1, shipped: 0, passRate: 0, costPerSolved: null });
  });
});

describe('verifiedKnownGoodFirings', () => {
  function insertVerifiedMetric(
    projectId: string,
    firingId: string,
    opts: {
      gateResult?: string | null;
      shaVerified?: 0 | 1;
      headAdvanced?: 0 | 1;
      item?: string | null;
      sha?: string | null;
      costUsd?: number;
      turns?: number;
      createdAt?: number;
    } = {},
  ): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, kind, sha, gate_result, sha_verified,
                               head_advanced, cost_usd, turns, created_at)
         VALUES (?, ?, ?, 'feat', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projectId,
        firingId,
        opts.item ?? firingId,
        opts.sha ?? 'abc1234',
        opts.gateResult === undefined ? 'passed' : opts.gateResult,
        opts.shaVerified ?? 1,
        opts.headAdvanced ?? 1,
        opts.costUsd ?? 1,
        opts.turns ?? 10,
        opts.createdAt ?? 100,
      );
  }

  it('returns only firings with a verified-good gate, sha, and head', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertVerifiedMetric('p1', 'good', { createdAt: 100 });
    insertVerifiedMetric('p1', 'red-gate', { gateResult: 'checkpointed', createdAt: 200 });
    insertVerifiedMetric('p1', 'unverified-sha', { shaVerified: 0, createdAt: 300 });
    insertVerifiedMetric('p1', 'no-head-advance', { headAdvanced: 0, createdAt: 400 });

    const rows = verifiedKnownGoodFirings(store.db, 'p1');
    expect(rows.map((r) => r.firingId)).toEqual(['good']);
  });

  it('orders newest-first and respects the limit', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertVerifiedMetric('p1', 'f1', { createdAt: 100 });
    insertVerifiedMetric('p1', 'f2', { createdAt: 200 });
    insertVerifiedMetric('p1', 'f3', { createdAt: 300 });

    const rows = verifiedKnownGoodFirings(store.db, 'p1', 2);
    expect(rows.map((r) => r.firingId)).toEqual(['f3', 'f2']);
  });

  it('returns an empty array for a project with no verified-good firings', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(verifiedKnownGoodFirings(store.db, 'p1')).toEqual([]);
  });

  it('clamps a negative limit instead of handing SQLite an unbounded LIMIT', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertVerifiedMetric('p1', 'f1', { createdAt: 100 });
    insertVerifiedMetric('p1', 'f2', { createdAt: 200 });
    insertVerifiedMetric('p1', 'f3', { createdAt: 300 });

    // SQLite treats `LIMIT -1` as "no limit at all" — an unclamped negative
    // limit would return every verified-good firing ever recorded instead of
    // a bounded pool, same failure class `orient.ts`'s `orientLengths` was
    // fixed against. A negative limit clamps up to the floor of 1 result
    // (the newest firing), not zero and not everything.
    const rows = verifiedKnownGoodFirings(store.db, 'p1', -1);
    expect(rows.map((r) => r.firingId)).toEqual(['f3']);
  });

  it('degrades instead of crashing when limit is NaN', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertVerifiedMetric('p1', 'f1', { createdAt: 100 });

    // Math.max/min/floor all propagate NaN, so an unguarded clamp hands
    // SQLite a NaN `LIMIT` bind, which better-sqlite3 rejects with
    // "datatype mismatch" — same failure class already guarded in
    // `clampLimit` (search.ts) and `clampOrientLengthsLimit` (orient.ts).
    expect(() => verifiedKnownGoodFirings(store.db, 'p1', NaN)).not.toThrow();
  });
});

describe('evalRegressionOverPinnedSuite', () => {
  function insertFiringEventWithId(
    projectId: string,
    firingId: string,
    promptVersion: string | null,
    shipped: boolean,
    numTurns: number,
    costUsd: number,
  ): void {
    const payload = JSON.stringify({ promptVersion, shipped, numTurns, costUsd });
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, ?, 'firing', ?, 1)`,
      )
      .run(projectId, firingId, payload);
  }

  it('computes the four numbers only over the pinned firing ids', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiringEventWithId('p1', 'f1', 'v1', true, 10, 1);
    insertFiringEventWithId('p1', 'f2', 'v1', false, 20, 2);
    insertFiringEventWithId('p1', 'f3', 'v1', true, 30, 3); // not pinned — must be excluded

    const rows = evalRegressionOverPinnedSuite(store.db, 'p1', ['f1', 'f2']);
    expect(rows).toEqual([
      {
        promptVersion: 'v1',
        firings: 2,
        shipped: 1,
        passRate: 0.5,
        medianTurns: 15,
        costVariance: 0.25,
        costPerSolved: 3,
      },
    ]);
  });

  it('returns an empty array when no suite is pinned yet', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiringEventWithId('p1', 'f1', 'v1', true, 10, 1);
    expect(evalRegressionOverPinnedSuite(store.db, 'p1', [])).toEqual([]);
  });

  it('returns an empty array when none of the pinned ids have a firing event', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFiringEventWithId('p1', 'f1', 'v1', true, 10, 1);
    expect(evalRegressionOverPinnedSuite(store.db, 'p1', ['does-not-exist'])).toEqual([]);
  });
});

describe('evalRegressionByPickSource', () => {
  function insertTaskWithSource(id: string, projectId: string, source: string): void {
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, source, created_at, updated_at)
         VALUES (?, ?, 'x', 'queued', ?, 1, 1)`,
      )
      .run(id, projectId, source);
  }

  function insertMetricForPick(
    projectId: string,
    firingId: string,
    item: string | null,
    shipped: 0 | 1,
    costUsd: number,
    turns: number,
  ): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, shipped, cost_usd, turns, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(projectId, firingId, item, shipped, costUsd, turns);
  }

  it('buckets a human-authored board task as operator-assigned', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertTaskWithSource('t1', 'p1', 'dashboard');
    insertMetricForPick('p1', 'f1', 't1', 1, 2, 10);
    insertMetricForPick('p1', 'f2', 't1', 0, 1, 20);

    const rows = evalRegressionByPickSource(store.db, 'p1');
    expect(rows).toEqual([
      {
        pickSource: 'operator-assigned',
        firings: 2,
        shipped: 1,
        passRate: 0.5,
        medianTurns: 15,
        costVariance: 0.25,
        costPerSolved: 3,
      },
    ]);
  });

  it('buckets inbox-dropped, KEEPER-accepted GitHub issue, and chat-drafted tasks as operator-assigned (all three are human-authored, not autopilot-mined)', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertTaskWithSource('t1', 'p1', 'inbox');
    insertTaskWithSource('t2', 'p1', 'github');
    insertTaskWithSource('t3', 'p1', 'chat');
    insertMetricForPick('p1', 'f1', 't1', 1, 1, 10);
    insertMetricForPick('p1', 'f2', 't2', 1, 1, 10);
    insertMetricForPick('p1', 'f3', 't3', 1, 1, 10);

    const rows = evalRegressionByPickSource(store.db, 'p1');
    expect(rows).toEqual([
      {
        pickSource: 'operator-assigned',
        firings: 3,
        shipped: 3,
        passRate: 1,
        medianTurns: 10,
        costVariance: 0,
        costPerSolved: 1,
      },
    ]);
  });

  it('buckets self-mined, backlog-lifted, and repo-detected proposals as self-proposed', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertTaskWithSource('t1', 'p1', 'self');
    insertTaskWithSource('t2', 'p1', 'backlog');
    insertTaskWithSource('t3', 'p1', 'repo');
    insertMetricForPick('p1', 'f1', 't1', 1, 1, 10);
    insertMetricForPick('p1', 'f2', 't2', 1, 1, 10);
    insertMetricForPick('p1', 'f3', 't3', 1, 1, 10);

    const rows = evalRegressionByPickSource(store.db, 'p1');
    expect(rows).toEqual([
      {
        pickSource: 'self-proposed',
        firings: 3,
        shipped: 3,
        passRate: 1,
        medianTurns: 10,
        costVariance: 0,
        costPerSolved: 1,
      },
    ]);
  });

  it('buckets a firing with no linked task at all as free-pick', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertMetricForPick('p1', 'f1', null, 1, 1, 10);

    const rows = evalRegressionByPickSource(store.db, 'p1');
    expect(rows).toMatchObject([{ pickSource: 'free-pick', firings: 1, shipped: 1 }]);
  });

  it('buckets an item that names no tracked task row as untracked-item', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertMetricForPick('p1', 'f1', 'ghost-task', 1, 1, 10);

    const rows = evalRegressionByPickSource(store.db, 'p1');
    expect(rows).toMatchObject([{ pickSource: 'untracked-item', firings: 1, shipped: 1 }]);
  });

  it('does not cross project boundaries when resolving a task source', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertProject('p2', 'beta', 'flying', 100);
    insertTaskWithSource('t1', 'p2', 'dashboard'); // same id, different project
    insertMetricForPick('p1', 'f1', 't1', 1, 1, 10);

    const rows = evalRegressionByPickSource(store.db, 'p1');
    expect(rows).toMatchObject([{ pickSource: 'untracked-item', firings: 1 }]);
  });

  it('returns an empty array for a project with no firings', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(evalRegressionByPickSource(store.db, 'p1')).toEqual([]);
  });

  it('orders multiple pick-source buckets by firing count, most-firings first', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertTaskWithSource('t1', 'p1', 'dashboard');
    insertMetricForPick('p1', 'f1', 't1', 1, 1, 10); // operator-assigned: 1 firing
    insertMetricForPick('p1', 'f2', null, 1, 1, 10); // free-pick: 1 of 3
    insertMetricForPick('p1', 'f3', null, 1, 1, 10); // free-pick: 2 of 3
    insertMetricForPick('p1', 'f4', null, 0, 1, 10); // free-pick: 3 of 3

    const rows = evalRegressionByPickSource(store.db, 'p1');
    expect(rows.map((r) => r.pickSource)).toEqual(['free-pick', 'operator-assigned']);
    expect(rows.map((r) => r.firings)).toEqual([3, 1]);
  });
});

describe('testFirstCompliance', () => {
  function insertFixMetric(
    projectId: string,
    firingId: string,
    kind: string,
    testFirst: 0 | 1 | null,
  ): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, kind, test_first, created_at)
         VALUES (?, ?, ?, ?, 1)`,
      )
      .run(projectId, firingId, kind, testFirst);
  }

  it('rates compliance over fix firings that self-reported testFirst', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFixMetric('p1', 'f1', 'fix', 1);
    insertFixMetric('p1', 'f2', 'fix', 1);
    insertFixMetric('p1', 'f3', 'fix', 0);

    expect(testFirstCompliance(store.db, 'p1')).toEqual({
      fixFirings: 3,
      reported: 3,
      compliant: 2,
      complianceRate: 2 / 3,
    });
  });

  it('excludes non-fix kinds entirely', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFixMetric('p1', 'f1', 'fix', 1);
    insertFixMetric('p1', 'f2', 'feat', 1);

    expect(testFirstCompliance(store.db, 'p1')).toEqual({
      fixFirings: 1,
      reported: 1,
      compliant: 1,
      complianceRate: 1,
    });
  });

  it('counts unreported fix firings toward fixFirings but not reported/compliant', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertFixMetric('p1', 'f1', 'fix', null);
    insertFixMetric('p1', 'f2', 'fix', null);

    expect(testFirstCompliance(store.db, 'p1')).toEqual({
      fixFirings: 2,
      reported: 0,
      compliant: 0,
      complianceRate: null, // never coerced to 0 — "no data" is not "no compliance"
    });
  });

  it('returns zeroed-out counts and a null rate for a project with no fix firings', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(testFirstCompliance(store.db, 'p1')).toEqual({
      fixFirings: 0,
      reported: 0,
      compliant: 0,
      complianceRate: null,
    });
  });

  it('does not cross project boundaries', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertProject('p2', 'beta', 'flying', 100);
    insertFixMetric('p2', 'f1', 'fix', 1);

    expect(testFirstCompliance(store.db, 'p1')).toEqual({
      fixFirings: 0,
      reported: 0,
      compliant: 0,
      complianceRate: null,
    });
  });
});

describe('pickDisciplineAudit', () => {
  function insertRankedMetric(
    projectId: string,
    firingId: string,
    pickedRank: number | null,
    deviationReason: string | null,
  ): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, picked_rank, deviation_reason, created_at)
         VALUES (?, ?, ?, ?, 1)`,
      )
      .run(projectId, firingId, pickedRank, deviationReason);
  }

  it('rates violations over ranked firings that deviated with no recorded reason', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertRankedMetric('p1', 'f1', 1, null);
    insertRankedMetric('p1', 'f2', 3, 'top task needs a human');
    insertRankedMetric('p1', 'f3', 2, null);

    expect(pickDisciplineAudit(store.db, 'p1')).toEqual({
      rankedFirings: 3,
      topPicked: 1,
      justifiedDeviations: 1,
      unjustifiedDeviations: 1,
      violationRate: 1 / 3,
    });
  });

  it('excludes free picks (picked_rank IS NULL) entirely', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertRankedMetric('p1', 'f1', 1, null);
    insertRankedMetric('p1', 'f2', null, null);

    expect(pickDisciplineAudit(store.db, 'p1')).toEqual({
      rankedFirings: 1,
      topPicked: 1,
      justifiedDeviations: 0,
      unjustifiedDeviations: 0,
      violationRate: 0,
    });
  });

  it('treats a blank deviation_reason as unjustified, not justified', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertRankedMetric('p1', 'f1', 2, '   ');

    expect(pickDisciplineAudit(store.db, 'p1')).toEqual({
      rankedFirings: 1,
      topPicked: 0,
      justifiedDeviations: 0,
      unjustifiedDeviations: 1,
      violationRate: 1,
    });
  });

  it('returns zeroed-out counts and a null rate for a project with no ranked firings', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(pickDisciplineAudit(store.db, 'p1')).toEqual({
      rankedFirings: 0,
      topPicked: 0,
      justifiedDeviations: 0,
      unjustifiedDeviations: 0,
      violationRate: null,
    });
  });

  it('does not cross project boundaries', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertProject('p2', 'beta', 'flying', 100);
    insertRankedMetric('p2', 'f1', 3, null);

    expect(pickDisciplineAudit(store.db, 'p1')).toEqual({
      rankedFirings: 0,
      topPicked: 0,
      justifiedDeviations: 0,
      unjustifiedDeviations: 0,
      violationRate: null,
    });
  });
});

describe('boardDiversityAudit', () => {
  function insertDeviatedMetric(
    projectId: string,
    firingId: string,
    pickedRank: number | null,
    item: string | null,
    createdAt: number,
  ): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, picked_rank, item, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(projectId, firingId, pickedRank, item, createdAt);
  }

  it('flags a run of consecutive firings that all deviated onto the same item', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertDeviatedMetric('p1', 'f1', 3, 'web-abc', 1);
    insertDeviatedMetric('p1', 'f2', 3, 'web-abc', 2);
    insertDeviatedMetric('p1', 'f3', 2, 'web-abc', 3);
    insertDeviatedMetric('p1', 'f4', 4, 'web-xyz', 4);

    expect(boardDiversityAudit(store.db, 'p1')).toEqual({
      deviatedFirings: 4,
      distinctItems: 2,
      longestSameItemStreak: 3,
      mostRepeatedItem: 'web-abc',
    });
  });

  it('resets the streak once diversity returns, then re-extends it', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertDeviatedMetric('p1', 'f1', 2, 'web-abc', 1);
    insertDeviatedMetric('p1', 'f2', 2, 'web-xyz', 2);
    insertDeviatedMetric('p1', 'f3', 2, 'web-xyz', 3);
    insertDeviatedMetric('p1', 'f4', 2, 'web-xyz', 4);

    expect(boardDiversityAudit(store.db, 'p1')).toEqual({
      deviatedFirings: 4,
      distinctItems: 2,
      longestSameItemStreak: 3,
      mostRepeatedItem: 'web-xyz',
    });
  });

  it('excludes the triage-top pick (picked_rank = 1) and item-less firings', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertDeviatedMetric('p1', 'f1', 1, 'web-abc', 1);
    insertDeviatedMetric('p1', 'f2', 2, null, 2);
    insertDeviatedMetric('p1', 'f3', 2, 'web-xyz', 3);

    expect(boardDiversityAudit(store.db, 'p1')).toEqual({
      deviatedFirings: 1,
      distinctItems: 1,
      longestSameItemStreak: 1,
      mostRepeatedItem: 'web-xyz',
    });
  });

  it('returns zeroed-out counts and a null repeated item for a project with no deviations', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(boardDiversityAudit(store.db, 'p1')).toEqual({
      deviatedFirings: 0,
      distinctItems: 0,
      longestSameItemStreak: 0,
      mostRepeatedItem: null,
    });
  });

  it('does not cross project boundaries', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertProject('p2', 'beta', 'flying', 100);
    insertDeviatedMetric('p2', 'f1', 3, 'web-abc', 1);

    expect(boardDiversityAudit(store.db, 'p1')).toEqual({
      deviatedFirings: 0,
      distinctItems: 0,
      longestSameItemStreak: 0,
      mostRepeatedItem: null,
    });
  });
});

describe('gateParallelSavings', () => {
  function insertGateChecksEvent(
    projectId: string,
    checks: { label: string; durationMs: number }[],
    createdAt = 1,
  ): void {
    const payload = JSON.stringify({ gateChecks: checks });
    store.db
      .prepare(
        `INSERT INTO events (project_id, type, payload, created_at) VALUES (?, 'firing', ?, ?)`,
      )
      .run(projectId, payload, createdAt);
  }

  it('compares the sum vs the max of concurrent typecheck/lint/format durations', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertGateChecksEvent('p1', [
      { label: 'pnpm run typecheck', durationMs: 3000 },
      { label: 'pnpm run lint', durationMs: 2000 },
      { label: 'pnpm run format:check', durationMs: 1000 },
      { label: 'pnpm run test', durationMs: 9000 }, // not parallel-eligible — excluded
    ]);

    expect(gateParallelSavings(store.db, 'p1')).toEqual({
      sampledFirings: 1,
      sequentialMs: 6000,
      observedMs: 3000,
      savedMs: 3000,
      savedPct: 0.5,
    });
  });

  it('sums savings across multiple sampled firings', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertGateChecksEvent(
      'p1',
      [
        { label: 'pnpm run typecheck', durationMs: 1000 },
        { label: 'pnpm run lint', durationMs: 1000 },
      ],
      1,
    );
    insertGateChecksEvent(
      'p1',
      [
        { label: 'pnpm run typecheck', durationMs: 4000 },
        { label: 'pnpm run lint', durationMs: 2000 },
      ],
      2,
    );

    expect(gateParallelSavings(store.db, 'p1')).toEqual({
      sampledFirings: 2,
      sequentialMs: 8000,
      observedMs: 5000,
      savedMs: 3000,
      savedPct: 3000 / 8000,
    });
  });

  it('skips firings with fewer than 2 parallel-eligible checks — no concurrency to measure', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertGateChecksEvent('p1', [{ label: 'pnpm run typecheck', durationMs: 1000 }]);
    insertGateChecksEvent('p1', [{ label: 'pnpm run test', durationMs: 5000 }]);

    expect(gateParallelSavings(store.db, 'p1')).toEqual({
      sampledFirings: 0,
      sequentialMs: 0,
      observedMs: 0,
      savedMs: 0,
      savedPct: null,
    });
  });

  it('tolerates malformed payload JSON and missing gateChecks without throwing', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    store.db
      .prepare(
        `INSERT INTO events (project_id, type, payload, created_at) VALUES (?, 'firing', ?, ?)`,
      )
      .run('p1', 'not json', 1);
    store.db
      .prepare(
        `INSERT INTO events (project_id, type, payload, created_at) VALUES (?, 'firing', ?, ?)`,
      )
      .run('p1', JSON.stringify({ shipped: true }), 2);

    expect(gateParallelSavings(store.db, 'p1')).toEqual({
      sampledFirings: 0,
      sequentialMs: 0,
      observedMs: 0,
      savedMs: 0,
      savedPct: null,
    });
  });

  it('returns zeroed-out counts and a null pct for a project with no firing events', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    expect(gateParallelSavings(store.db, 'p1')).toEqual({
      sampledFirings: 0,
      sequentialMs: 0,
      observedMs: 0,
      savedMs: 0,
      savedPct: null,
    });
  });

  it('does not cross project boundaries', () => {
    insertProject('p1', 'alpha', 'flying', 100);
    insertProject('p2', 'beta', 'flying', 100);
    insertGateChecksEvent('p2', [
      { label: 'pnpm run typecheck', durationMs: 1000 },
      { label: 'pnpm run lint', durationMs: 1000 },
    ]);

    expect(gateParallelSavings(store.db, 'p1')).toEqual({
      sampledFirings: 0,
      sequentialMs: 0,
      observedMs: 0,
      savedMs: 0,
      savedPct: null,
    });
  });
});

describe('evaluatePromptVersionGate', () => {
  function evalRow(overrides: Partial<PromptVersionEval> = {}): PromptVersionEval {
    return {
      promptVersion: 'v-candidate',
      firings: 10,
      shipped: 9,
      passRate: 0.9,
      medianTurns: 20,
      costVariance: 0.1,
      costPerSolved: 2,
      ...overrides,
    };
  }

  it('passes when the candidate matches or beats the baseline on all three numbers', () => {
    const baseline = evalRow({
      promptVersion: 'v-base',
      passRate: 0.8,
      medianTurns: 20,
      costPerSolved: 2,
    });
    const candidate = evalRow({
      promptVersion: 'v-candidate',
      passRate: 0.9,
      medianTurns: 18,
      costPerSolved: 1.8,
    });
    expect(evaluatePromptVersionGate(candidate, baseline)).toEqual({
      ok: true,
      candidate: 'v-candidate',
      baseline: 'v-base',
      reasons: [],
    });
  });

  it('fails when pass rate drops past the tolerance', () => {
    const baseline = evalRow({ promptVersion: 'v-base', passRate: 0.9 });
    const candidate = evalRow({ promptVersion: 'v-candidate', passRate: 0.5 });
    const result = evaluatePromptVersionGate(candidate, baseline);
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toMatch(/pass rate dropped/);
  });

  it('fails when cost per solved task rises past the tolerance', () => {
    const baseline = evalRow({ promptVersion: 'v-base', costPerSolved: 2 });
    const candidate = evalRow({ promptVersion: 'v-candidate', costPerSolved: 5 });
    const result = evaluatePromptVersionGate(candidate, baseline);
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toMatch(/cost\/solved rose/);
  });

  it('fails when median turns rise past the tolerance', () => {
    const baseline = evalRow({ promptVersion: 'v-base', medianTurns: 20 });
    const candidate = evalRow({ promptVersion: 'v-candidate', medianTurns: 40 });
    const result = evaluatePromptVersionGate(candidate, baseline);
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toMatch(/median turns rose/);
  });

  it('collects every violated dimension, not just the first', () => {
    const baseline = evalRow({
      promptVersion: 'v-base',
      passRate: 0.9,
      costPerSolved: 2,
      medianTurns: 10,
    });
    const candidate = evalRow({
      promptVersion: 'v-candidate',
      passRate: 0.3,
      costPerSolved: 10,
      medianTurns: 100,
    });
    const result = evaluatePromptVersionGate(candidate, baseline);
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(3);
  });

  it('passes provisionally when the candidate has too few firings to judge', () => {
    const baseline = evalRow({ promptVersion: 'v-base', passRate: 0.9 });
    const candidate = evalRow({ promptVersion: 'v-candidate', firings: 2, passRate: 0 });
    const result = evaluatePromptVersionGate(candidate, baseline);
    expect(result.ok).toBe(true);
    expect(result.reasons[0]).toMatch(/insufficient sample/);
  });

  it('passes provisionally when there is no baseline to compare against', () => {
    const candidate = evalRow({ promptVersion: 'v-first' });
    const result = evaluatePromptVersionGate(candidate, null);
    expect(result).toEqual({
      ok: true,
      candidate: 'v-first',
      baseline: null,
      reasons: [expect.stringMatching(/no prior version/)],
    });
  });

  it('does not divide by a zero baseline cost or zero baseline turns', () => {
    const baseline = evalRow({ promptVersion: 'v-base', costPerSolved: 0, medianTurns: 0 });
    const candidate = evalRow({ promptVersion: 'v-candidate', costPerSolved: 5, medianTurns: 50 });
    expect(() => evaluatePromptVersionGate(candidate, baseline)).not.toThrow();
  });
});
