// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, migrate, type Store } from '../src/index.js';
import {
  landingFrequency,
  taskLeadTime,
  changeFailureRate,
  mttr,
  doraSnapshot,
} from '../src/dora.js';

let store: Store;

function insertProject(id: string, slug: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', 100, 100)`,
    )
    .run(id, slug, slug, `/tmp/${slug}`);
}

interface MetricFixture {
  readonly firingId: string;
  readonly item?: string | null;
  readonly kind?: string | null;
  readonly shipped?: 0 | 1;
  readonly headAdvanced?: 0 | 1;
  readonly completion?: 'slice' | 'complete' | null;
  readonly commitSubject?: string | null;
  readonly createdAt: number;
}

function insertMetric(projectId: string, m: MetricFixture): void {
  store.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, item, kind, shipped, head_advanced,
                             completion, commit_subject, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      m.firingId,
      m.item ?? null,
      m.kind ?? null,
      m.shipped ?? 1,
      m.headAdvanced ?? 1,
      m.completion ?? null,
      m.commitSubject ?? null,
      m.createdAt,
    );
}

function insertTask(id: string, projectId: string, createdAt: number): void {
  store.db
    .prepare(
      `INSERT INTO tasks (id, project_id, title, status, created_at, updated_at)
       VALUES (?, ?, 'x', 'queued', ?, ?)`,
    )
    .run(id, projectId, createdAt, createdAt);
}

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
  insertProject('p1', 'alpha');
});

afterEach(() => {
  store.close();
});

describe('landingFrequency', () => {
  it('counts only shipped + head_advanced firings inside the window', () => {
    insertMetric('p1', { firingId: 'f1', shipped: 1, headAdvanced: 1, createdAt: 900 });
    insertMetric('p1', { firingId: 'f2', shipped: 1, headAdvanced: 0, createdAt: 900 }); // claimed, never verified
    insertMetric('p1', { firingId: 'f3', shipped: 0, headAdvanced: 1, createdAt: 900 }); // noop
    insertMetric('p1', { firingId: 'f4', shipped: 1, headAdvanced: 1, createdAt: 100 }); // outside window

    const result = landingFrequency(store.db, 'p1', 500, 1000);
    expect(result.landings).toBe(1);
    expect(result.windowDays).toBeCloseTo(500 / (24 * 60 * 60 * 1000));
    expect(result.perDay).toBeCloseTo(1 / (500 / (24 * 60 * 60 * 1000)));
  });

  it('returns zero landings for a project with no firings', () => {
    const result = landingFrequency(store.db, 'p1', 7 * 24 * 60 * 60 * 1000, 1000);
    expect(result.landings).toBe(0);
    expect(result.perDay).toBe(0);
  });
});

describe('taskLeadTime', () => {
  it('measures completedAt (firing) minus createdAt (task), complete-only', () => {
    insertTask('t1', 'p1', 1000);
    insertMetric('p1', { firingId: 'f1', item: 't1', completion: 'slice', createdAt: 2000 }); // advanced, not closed
    insertMetric('p1', { firingId: 'f2', item: 't1', completion: 'complete', createdAt: 5000 });

    insertTask('t2', 'p1', 1000);
    insertMetric('p1', { firingId: 'f3', item: 't2', completion: 'complete', createdAt: 3000 });

    const result = taskLeadTime(store.db, 'p1');
    expect(result.tasksCompleted).toBe(2);
    expect(result.meanLeadTimeMs).toBeCloseTo((4000 + 2000) / 2);
    expect(result.medianLeadTimeMs).toBeCloseTo((4000 + 2000) / 2);
  });

  it('ignores free-picks (no linked task) and unshipped firings', () => {
    insertMetric('p1', { firingId: 'f1', item: null, completion: 'complete', createdAt: 2000 });
    insertTask('t1', 'p1', 1000);
    insertMetric('p1', {
      firingId: 'f2',
      item: 't1',
      completion: 'complete',
      shipped: 0,
      createdAt: 3000,
    });

    const result = taskLeadTime(store.db, 'p1');
    expect(result.tasksCompleted).toBe(0);
    expect(result.medianLeadTimeMs).toBeNull();
    expect(result.meanLeadTimeMs).toBeNull();
  });

  it('still counts a completed task with a negative lead time (clock skew) — only the duration stats exclude it', () => {
    insertTask('t1', 'p1', 9000); // created AFTER the firing that completed it — clock skew
    insertMetric('p1', { firingId: 'f1', item: 't1', completion: 'complete', createdAt: 1000 });

    insertTask('t2', 'p1', 1000);
    insertMetric('p1', { firingId: 'f2', item: 't2', completion: 'complete', createdAt: 3000 });

    const result = taskLeadTime(store.db, 'p1');
    expect(result.tasksCompleted).toBe(2);
    expect(result.medianLeadTimeMs).toBe(2000);
    expect(result.meanLeadTimeMs).toBe(2000);
  });
});

describe('changeFailureRate', () => {
  it('divides revert-kind shipped commits by all shipped commits', () => {
    insertMetric('p1', { firingId: 'f1', kind: 'feat', createdAt: 900 });
    insertMetric('p1', { firingId: 'f2', kind: 'fix', createdAt: 900 });
    insertMetric('p1', { firingId: 'f3', kind: 'revert', createdAt: 900 });
    insertMetric('p1', { firingId: 'f4', kind: 'revert', shipped: 0, createdAt: 900 }); // not shipped, excluded

    const result = changeFailureRate(store.db, 'p1', 1000, 1000);
    expect(result.shipped).toBe(3);
    expect(result.reverts).toBe(1);
    expect(result.rate).toBeCloseTo(1 / 3);
  });

  it('returns a null rate (not 0) when nothing has shipped', () => {
    const result = changeFailureRate(store.db, 'p1', 1000, 1000);
    expect(result.shipped).toBe(0);
    expect(result.rate).toBeNull();
  });
});

describe('mttr', () => {
  it('measures the gap from a checkpoint firing to the next firing', () => {
    insertMetric('p1', {
      firingId: 'f1',
      commitSubject: 'wip(autopilot): checkpoint — firing 268 died mid-unit',
      createdAt: 1000,
    });
    insertMetric('p1', { firingId: 'f2', commitSubject: 'fix(store): resume', createdAt: 4000 });

    const result = mttr(store.db, 'p1');
    expect(result.checkpoints).toBe(1);
    expect(result.resolved).toBe(1);
    expect(result.meanRecoveryMs).toBe(3000);
    expect(result.medianRecoveryMs).toBe(3000);
  });

  it('excludes a checkpoint with no later firing yet (still an open incident)', () => {
    insertMetric('p1', { firingId: 'f1', commitSubject: 'feat: normal ship', createdAt: 1000 });
    insertMetric('p1', {
      firingId: 'f2',
      commitSubject: 'wip(autopilot): checkpoint — mid-unit',
      createdAt: 2000,
    });

    const result = mttr(store.db, 'p1');
    expect(result.checkpoints).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.meanRecoveryMs).toBeNull();
  });

  it('reports zero checkpoints for a project with no checkpoint commits', () => {
    insertMetric('p1', { firingId: 'f1', commitSubject: 'feat: normal ship', createdAt: 1000 });
    const result = mttr(store.db, 'p1');
    expect(result.checkpoints).toBe(0);
    expect(result.resolved).toBe(0);
  });

  it('a checkpoint immediately followed by another checkpoint is not yet resolved — recovery measures to the next NON-checkpoint firing, not the next row', () => {
    insertMetric('p1', {
      firingId: 'f1',
      commitSubject: 'wip(autopilot): checkpoint — firing 100 died mid-unit',
      createdAt: 1000,
    });
    insertMetric('p1', {
      firingId: 'f2',
      commitSubject: 'wip(autopilot): checkpoint — firing 101 died mid-unit',
      createdAt: 2000,
    });
    insertMetric('p1', { firingId: 'f3', commitSubject: 'fix(store): resume', createdAt: 5000 });

    const result = mttr(store.db, 'p1');
    expect(result.checkpoints).toBe(2);
    expect(result.resolved).toBe(2);
    // f1's real recovery is 5000-1000=4000 (to the actual resume), not 2000-1000=1000
    // (to f2, which was itself still a dying firing, not a recovery).
    expect(result.meanRecoveryMs).toBe(3500);
    expect(result.medianRecoveryMs).toBe(3500);
  });
});

describe('doraSnapshot', () => {
  it('bundles all four metrics for one project', () => {
    const snapshot = doraSnapshot(store.db, 'p1', 1000);
    expect(snapshot).toHaveProperty('landingFrequency');
    expect(snapshot).toHaveProperty('taskLeadTime');
    expect(snapshot).toHaveProperty('changeFailureRate');
    expect(snapshot).toHaveProperty('mttr');
  });
});
