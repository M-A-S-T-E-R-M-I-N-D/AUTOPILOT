// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import type { CommitWithFiles } from '@autopilot/engine';
import {
  detectLaneHalfSteps,
  gatherLaneHalfSteps,
  readInProgressLaneTasks,
  readShippedSlices,
  type InProgressLaneTask,
  type ShippedSliceRef,
} from '../../src/landing/lane-half-step.js';

function commit(shortSha: string, subject: string, files: readonly string[]): CommitWithFiles {
  return { shortSha, subject, files };
}

const OPEN: InProgressLaneTask = {
  id: 'web-mtq2cubl-e5z0ae',
  title: 'connect.ts splices',
  assignee: 'fleet-3',
};

function slice(over: Partial<ShippedSliceRef> = {}): ShippedSliceRef {
  return { taskId: OPEN.id, sha: null, headAfter: null, commitSubject: null, ...over };
}

describe('detectLaneHalfSteps (pure)', () => {
  it('attributes a diff commit to an open task by the ledger short SHA (prefix either way)', () => {
    const diff = [commit('abc1234def0', 'feat(connect): splice 3 of 8', ['src/connect.ts'])];
    const out = detectLaneHalfSteps(diff, [OPEN], [slice({ sha: 'abc1234' })]);
    expect(out).toEqual([
      {
        taskId: OPEN.id,
        title: OPEN.title,
        assignee: 'fleet-3',
        commits: ['abc1234def0'],
        files: ['src/connect.ts'],
      },
    ]);
  });

  it('attributes by the engine-observed full head_after when the self-reported sha is missing', () => {
    const diff = [commit('9f8e7d6', 'feat(connect): splice 4 of 8', ['src/connect.ts'])];
    const full = '9f8e7d6c5b4a3928170605f4e3d2c1b0a9f8e7d6';
    const out = detectLaneHalfSteps(diff, [OPEN], [slice({ headAfter: full })]);
    expect(out.map((w) => w.commits)).toEqual([['9f8e7d6']]);
  });

  it('attributes by exact recorded subject when the SHA changed under a reland', () => {
    const diff = [commit('1111111', 'feat(connect): splice 5 of 8', ['src/connect.ts'])];
    const out = detectLaneHalfSteps(
      diff,
      [OPEN],
      [slice({ sha: '2222222', commitSubject: 'feat(connect): splice 5 of 8' })],
    );
    expect(out.map((w) => w.commits)).toEqual([['1111111']]);
  });

  it('attributes by the task id in the subject even with no ledger row at all', () => {
    const diff = [commit('3333333', `feat(connect): splice 6 of 8 (${OPEN.id})`, ['src/x.ts'])];
    expect(detectLaneHalfSteps(diff, [OPEN], []).map((w) => w.files)).toEqual([['src/x.ts']]);
  });

  it('never matches on a SHA prefix shorter than 7 characters', () => {
    const diff = [commit('abc1234', 'feat: unrelated', ['a.ts'])];
    expect(detectLaneHalfSteps(diff, [OPEN], [slice({ sha: 'abc' })])).toEqual([]);
    expect(detectLaneHalfSteps(diff, [OPEN], [slice({ headAfter: 'abc12' })])).toEqual([]);
  });

  it('collects every attributed commit in diff order and de-duplicates files', () => {
    const diff = [
      commit('aaaaaaa', 'feat: one', ['src/connect.ts', 'test/connect.test.ts']),
      commit('bbbbbbb', 'feat: stranger', ['docs/x.md']),
      commit('ccccccc', 'feat: two', ['src/connect.ts', 'src/other.ts']),
    ];
    const out = detectLaneHalfSteps(
      diff,
      [OPEN],
      [slice({ sha: 'aaaaaaa' }), slice({ sha: 'ccccccc' })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.commits).toEqual(['aaaaaaa', 'ccccccc']);
    expect(out[0]?.files).toEqual(['src/connect.ts', 'test/connect.test.ts', 'src/other.ts']);
  });

  it('omits an open task with no commit in the diff, and never crosses ledger rows between tasks', () => {
    const other: InProgressLaneTask = { id: 'web-other-000000', title: 'other', assignee: null };
    const diff = [commit('aaaaaaa', 'feat: one', ['a.ts'])];
    // The ledger row belongs to `other`, so OPEN must not claim the commit.
    const out = detectLaneHalfSteps(
      diff,
      [OPEN, other],
      [slice({ taskId: other.id, sha: 'aaaaaaa' })],
    );
    expect(out.map((w) => w.taskId)).toEqual([other.id]);
    expect(out[0]?.assignee).toBeNull();
  });

  it('returns [] for an empty diff or no open tasks', () => {
    expect(detectLaneHalfSteps([], [OPEN], [slice({ sha: 'aaaaaaa' })])).toEqual([]);
    expect(detectLaneHalfSteps([commit('aaaaaaa', 'x', ['a'])], [], [])).toEqual([]);
  });
});

describe('lane half-step store reads', () => {
  function withStore(run: (s: Store) => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'ap-half-step-'));
    const s = openStore(join(dir, 'a.db'));
    try {
      migrate(s);
      s.db
        .prepare(
          `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
           VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'registered', 1, 1), ('p2', 'p2', 'p2', '/tmp/p2', 'registered', 1, 1)`,
        )
        .run();
      run(s);
    } finally {
      s.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }

  function task(
    s: Store,
    id: string,
    projectId: string,
    status: string,
    assignee: string | null,
  ): void {
    s.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, assignee, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
      )
      .run(id, projectId, `title ${id}`, status, assignee);
  }

  function ship(
    s: Store,
    firingId: string,
    projectId: string,
    item: string,
    shipped: 0 | 1,
    sha: string | null,
    subject: string | null,
  ): void {
    s.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, sha, shipped, commit_subject, completion, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'slice', 1)`,
      )
      .run(projectId, firingId, item, sha, shipped, subject);
  }

  it('readInProgressLaneTasks returns only this project’s in_progress tasks', () => {
    withStore((s) => {
      task(s, 't-open', 'p1', 'in_progress', 'fleet-3');
      task(s, 't-operator', 'p1', 'in_progress', null);
      task(s, 't-queued', 'p1', 'queued', 'fleet-2');
      task(s, 't-done', 'p1', 'done', 'fleet-3');
      task(s, 't-elsewhere', 'p2', 'in_progress', 'fleet-3');
      const ids = readInProgressLaneTasks(s, 'p1')
        .map((t) => t.id)
        .sort();
      expect(ids).toEqual(['t-open', 't-operator']);
    });
  });

  it('readShippedSlices returns only shipped ledger rows for the asked task ids, oldest first', () => {
    withStore((s) => {
      ship(s, 'f1', 'p1', 't-open', 1, 'aaaaaaa', 'feat: one');
      ship(s, 'f2', 'p1', 't-open', 0, 'bbbbbbb', 'noop');
      ship(s, 'f3', 'p1', 't-other', 1, 'ccccccc', 'feat: other');
      ship(s, 'f4', 'p2', 't-open', 1, 'ddddddd', 'feat: wrong project');
      ship(s, 'f5', 'p1', 't-open', 1, 'eeeeeee', 'feat: two');
      expect(readShippedSlices(s, 'p1', ['t-open'])).toEqual([
        { taskId: 't-open', sha: 'aaaaaaa', headAfter: null, commitSubject: 'feat: one' },
        { taskId: 't-open', sha: 'eeeeeee', headAfter: null, commitSubject: 'feat: two' },
      ]);
      expect(readShippedSlices(s, 'p1', [])).toEqual([]);
    });
  });

  it('gatherLaneHalfSteps joins open tasks, their ledger, and the diff end to end', () => {
    withStore((s) => {
      task(s, 't-open', 'p1', 'in_progress', 'fleet-3');
      task(s, 't-done', 'p1', 'done', 'fleet-2');
      ship(s, 'f1', 'p1', 't-open', 1, 'aaaaaaa', 'feat: half-step');
      ship(s, 'f2', 'p1', 't-done', 1, 'bbbbbbb', 'feat: finished');
      const diff = [
        commit('aaaaaaa', 'feat: half-step', ['src/connect.ts']),
        commit('bbbbbbb', 'feat: finished', ['src/done.ts']),
      ];
      expect(gatherLaneHalfSteps(s, 'p1', diff)).toEqual([
        {
          taskId: 't-open',
          title: 'title t-open',
          assignee: 'fleet-3',
          commits: ['aaaaaaa'],
          files: ['src/connect.ts'],
        },
      ]);
    });
  });

  it('gatherLaneHalfSteps is [] with nothing to land or nothing open, and works read-only', () => {
    withStore((s) => {
      task(s, 't-open', 'p1', 'in_progress', 'fleet-3');
      ship(s, 'f1', 'p1', 't-open', 1, 'aaaaaaa', 'feat: half-step');
      expect(gatherLaneHalfSteps(s, 'p1', [])).toEqual([]);
      expect(gatherLaneHalfSteps(s, 'p2', [commit('aaaaaaa', 'feat: half-step', ['a'])])).toEqual(
        [],
      );
    });
  });
});
