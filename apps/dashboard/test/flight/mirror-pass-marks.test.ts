// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the mirror pass ×
// the maintainer's marks. A board task accepted from issue #N stays on the
// board when the maintainer later declines #N (`declined`) or puts it on hold
// by hand (`status: awaiting-human`, `status: blocked`). Triage never answers
// such an issue (issue-triage.ts HOLD_LABELS) and the pool claim skips it
// (pool-client.ts planClaimPoolIssue). The mirror pass read none of the three:
// on a declined issue the maintainer had closed it reopened the issue and
// called the close "a false-close", and on a held one it closed, noted or
// settled as if the mark were not there.

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, createTask, setTaskStatus, type Store } from '@autopilot/store';
import {
  fetchIssueState,
  planMirrorPassReconcile,
  planMirrorPassLandingNote,
  type MirrorPassFinding,
  type MirrorPassIssueState,
  type MirrorPassTaskCandidate,
} from '../../src/flight/mirror-pass.js';
import {
  createMirrorPassExecuteApi,
  createMirrorPassLandingNoteExecuteApi,
} from '../../src/flight/mirror-pass-execute.js';
import { HOLD_LABELS } from '../../src/flight/issue-triage.js';
import { DECLINED_LABEL } from '../../src/flight/pool-client.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const seeded = (name: string): string =>
  HOUSE_TAXONOMY_LABELS.find((label) => label.name === name)?.name ?? '';
const marks = [seeded('declined'), seeded('status: awaiting-human'), seeded('status: blocked')];

/** One reconcile finding per row, each reached on an issue with no labels. */
const findingCases: ReadonlyArray<{
  readonly action: MirrorPassFinding['action'];
  readonly task: MirrorPassTaskCandidate;
  readonly issue: MirrorPassIssueState;
}> = [
  {
    action: 'reopen-honestly',
    task: { id: 'github-42', status: 'queued', landedSha: null },
    issue: { number: 42, state: 'closed', assignees: [] },
  },
  {
    action: 'close-with-landing-note',
    task: { id: 'github-42', status: 'done', landedSha: 'abc1234', doneVerified: true },
    issue: { number: 42, state: 'open', assignees: [] },
  },
  {
    action: 'close-by-assignee',
    task: { id: 'github-42', status: 'done', landedSha: null, doneVerified: false },
    issue: { number: 42, state: 'open', assignees: ['octocat'] },
  },
  {
    action: 'note-unverified',
    task: { id: 'github-42', status: 'done', landedSha: null, doneVerified: false },
    issue: { number: 42, state: 'open', assignees: [] },
  },
  {
    action: 'settle-claimed',
    task: { id: 'github-42', status: 'in_progress', landedSha: null, humanCloses: true },
    issue: { number: 42, state: 'closed', assignees: [] },
  },
];

const markedFindingCases = marks.flatMap((mark) =>
  findingCases.map((entry) => ({ mark, ...entry })),
);

describe('the mirror pass × the maintainer marks (regression, epic 0019 additive-only law)', () => {
  it('reads the labels the seeder stamps', () => {
    expect([DECLINED_LABEL, ...HOLD_LABELS]).toEqual(marks);
  });

  it('asks gh for the labels in the same issue view and keeps their names', async () => {
    const calls: string[][] = [];
    const exec: CliExec = async (_bin, args) => {
      calls.push([...args]);
      return {
        code: 0,
        stdout: JSON.stringify({
          number: 42,
          state: 'CLOSED',
          labels: [{ name: 'declined' }, { name: 'area: web' }, { nope: 1 }, null],
        }),
      };
    };

    expect(await fetchIssueState(exec, 42)).toEqual({
      number: 42,
      state: 'closed',
      assignees: [],
      labels: ['declined', 'area: web'],
    });
    expect(calls).toEqual([['issue', 'view', '42', '--json', 'number,state,assignees,labels']]);
  });

  it.each(markedFindingCases)(
    'plans no $action on an issue marked "$mark"',
    ({ mark, action, task, issue }) => {
      expect(planMirrorPassReconcile(task, issue, 'octocat')?.action).toBe(action);
      expect(
        planMirrorPassReconcile(task, { ...issue, labels: ['area: web', mark] }, 'octocat'),
      ).toBeNull();
    },
  );

  it('reads a mark in another casing or hyphenation the same way', () => {
    const { task, issue } = findingCases[0]!;
    expect(planMirrorPassReconcile(task, { ...issue, labels: ['Declined'] })).toBeNull();
    expect(
      planMirrorPassReconcile(task, { ...issue, labels: ['Status: Awaiting Human'] }),
    ).toBeNull();
  });

  it('still plans the finding on an issue whose labels carry no mark', () => {
    const { task, issue } = findingCases[0]!;
    expect(
      planMirrorPassReconcile(task, { ...issue, labels: ['area: web', 'priority: high'] })?.action,
    ).toBe('reopen-honestly');
  });

  it.each(marks)('posts no landing note on a closed issue marked "%s"', (mark) => {
    const task: MirrorPassTaskCandidate = { id: 'github-42', status: 'done', landedSha: 'abc1234' };
    const issue: MirrorPassIssueState = { number: 42, state: 'closed', assignees: [] };

    expect(planMirrorPassLandingNote(task, issue, [])?.action).toBe('note-landing-sha');
    expect(planMirrorPassLandingNote(task, { ...issue, labels: [mark] }, [])).toBeNull();
  });
});

function project(s: Store, id: string, rootPath: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, rootPath, 100, 100);
}

function shipSha(s: Store, projectId: string, item: string, sha: string): void {
  s.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, item, sha, shipped, created_at)
       VALUES (?, ?, ?, ?, 1, 100)`,
    )
    .run(projectId, `firing-${item}`, item, sha);
}

/** Identity resolves to the repo's own maintainer; `gh issue view <n>` answers
 *  from `issues` (a state view, or `--json comments` with none posted yet);
 *  every other call is a bare success. Every call lands in `calls`. */
function maintainerExec(
  issues: Readonly<Record<number, { state: 'OPEN' | 'CLOSED'; labels: readonly string[] }>>,
  calls: Array<readonly string[]>,
): CliExec {
  return vi.fn(async (_bin, args) => {
    calls.push(args);
    if (args[0] === 'api' && args[1] === 'user') {
      return { code: 0, stdout: JSON.stringify({ login: 'octocat' }) };
    }
    if (args[0] === 'repo' && args[1] === 'view') {
      return {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'octocat/hello-world',
          url: 'https://github.com/octocat/hello-world',
          isPrivate: false,
        }),
      };
    }
    if (args[0] === 'issue' && args[1] === 'view') {
      const number = Number(args[2]);
      const entry = issues[number];
      if (entry === undefined) return { code: 1, stdout: '' };
      if (args[4] === 'comments') return { code: 0, stdout: JSON.stringify({ comments: [] }) };
      return {
        code: 0,
        stdout: JSON.stringify({
          number,
          state: entry.state,
          labels: entry.labels.map((name) => ({ name })),
        }),
      };
    }
    return { code: 0, stdout: '' };
  });
}

/** True when `calls` holds a write (`comment`, `close`, `reopen`) on `issue`. */
function wroteOn(calls: ReadonlyArray<readonly string[]>, issue: number): boolean {
  return calls.some(
    (args) => args[0] === 'issue' && args[1] !== 'view' && args[2] === String(issue),
  );
}

describe('the mirror pass execute × the maintainer marks', () => {
  async function withProject(
    seed: (s: Store) => void,
    run: (dbPath: string) => Promise<void>,
  ): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-marks-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      seed(s);
      s.close();
      await run(dbPath);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }

  it.each(marks)(
    'never reopens a closed issue marked "%s", and still reopens its unmarked neighbour',
    async (mark) => {
      await withProject(
        (s) => {
          createTask(s, { id: 'github-5', projectId: 'p1', title: 'Marked', createdAt: 100 });
          createTask(s, { id: 'github-6', projectId: 'p1', title: 'Unmarked', createdAt: 100 });
        },
        async (dbPath) => {
          const calls: Array<readonly string[]> = [];
          const exec = maintainerExec(
            { 5: { state: 'CLOSED', labels: [mark] }, 6: { state: 'CLOSED', labels: [] } },
            calls,
          );

          const report = await createMirrorPassExecuteApi(dbPath, exec)('p1');

          expect(report?.outcomes.map((o) => o.plan.finding?.issueNumber)).toEqual([6]);
          expect(wroteOn(calls, 5)).toBe(false);
          expect(calls).toContainEqual(['issue', 'reopen', '6']);
        },
      );
    },
  );

  it.each(marks)(
    'posts no landing note on a closed issue marked "%s", and still notes its unmarked neighbour',
    async (mark) => {
      await withProject(
        (s) => {
          for (const id of ['github-5', 'github-6']) {
            createTask(s, { id, projectId: 'p1', title: id, createdAt: 100 });
            setTaskStatus(s, id, 'done', 200);
            shipSha(s, 'p1', id, 'abc1234');
          }
        },
        async (dbPath) => {
          const calls: Array<readonly string[]> = [];
          const exec = maintainerExec(
            { 5: { state: 'CLOSED', labels: [mark] }, 6: { state: 'CLOSED', labels: [] } },
            calls,
          );

          const report = await createMirrorPassLandingNoteExecuteApi(dbPath, exec)('p1');

          expect(report?.outcomes.map((o) => o.plan.finding?.issueNumber)).toEqual([6]);
          expect(wroteOn(calls, 5)).toBe(false);
          expect(calls).not.toContainEqual(['issue', 'view', '5', '--json', 'comments']);
          expect(wroteOn(calls, 6)).toBe(true);
        },
      );
    },
  );
});
