// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the mirror pass ×
// GitHub's own close reasons. GitHub records why an issue was closed: as
// completed, as not planned, or as a duplicate. The last two are a "no" given
// on the page, the native form of the `declined` label the pass already
// leaves alone (mirror-pass-marks.test.ts). The pass never read the reason: a
// board task accepted from issue #N stays queued when the maintainer later
// closes #N as not planned or as a duplicate, and the reconcile reopened #N
// with "Closing it earlier was a false-close".

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, createTask, type Store } from '@autopilot/store';
import {
  fetchIssueState,
  planMirrorPassLandingNote,
  planMirrorPassReconcile,
  type MirrorPassIssueState,
  type MirrorPassTaskCandidate,
} from '../../src/flight/mirror-pass.js';
import { createMirrorPassExecuteApi } from '../../src/flight/mirror-pass-execute.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const queued: MirrorPassTaskCandidate = { id: 'github-42', status: 'queued', landedSha: null };
const closed: MirrorPassIssueState = { number: 42, state: 'closed', assignees: [] };

/** `gh issue view 42 --json …` answering `payload`. Every argv lands in `calls`. */
function viewExec(payload: Record<string, unknown>, calls: string[][]): CliExec {
  return async (_bin, args) => {
    calls.push([...args]);
    return { code: 0, stdout: JSON.stringify({ number: 42, ...payload }) };
  };
}

describe('the mirror pass reads why GitHub closed the issue', () => {
  it('asks gh for the close reason in the same issue view', async () => {
    const calls: string[][] = [];
    await fetchIssueState(viewExec({ state: 'CLOSED', stateReason: 'NOT_PLANNED' }, calls), 42);
    expect(calls).toEqual([
      ['issue', 'view', '42', '--json', 'number,state,assignees,labels,stateReason'],
    ]);
  });

  it.each([
    ['NOT_PLANNED', 'not-planned'],
    ['DUPLICATE', 'duplicate'],
    ['COMPLETED', 'completed'],
    ['not_planned', 'not-planned'],
  ] as const)('reads a closed issue\'s "%s" as closed as %s', async (stateReason, closedAs) => {
    const state = await fetchIssueState(viewExec({ state: 'CLOSED', stateReason }, []), 42);
    expect(state).toEqual({ number: 42, state: 'closed', assignees: [], closedAs });
  });

  it.each([
    ['an open issue that was reopened', { state: 'OPEN', stateReason: 'REOPENED' }],
    ['a closed issue gh gives no reason for', { state: 'CLOSED', stateReason: '' }],
    ['a closed issue with a null reason', { state: 'CLOSED', stateReason: null }],
    ['a reason GitHub does not define', { state: 'CLOSED', stateReason: 'WONTFIX' }],
    ['a payload without the field', { state: 'CLOSED' }],
  ])('leaves the close reason out for %s', async (_label, payload) => {
    const state = await fetchIssueState(viewExec(payload, []), 42);
    expect(state).not.toBeNull();
    expect(state).not.toHaveProperty('closedAs');
  });
});

describe('the mirror pass × a close given as a no (regression, epic 0019 additive-only law)', () => {
  it.each(['not-planned', 'duplicate'] as const)(
    'never reopens an issue closed as %s while its board task is not done',
    (closedAs) => {
      expect(planMirrorPassReconcile(queued, { ...closed, closedAs })).toBeNull();
      expect(
        planMirrorPassReconcile({ ...queued, status: 'deferred' }, { ...closed, closedAs }),
      ).toBeNull();
    },
  );

  it('still reopens an issue closed as completed, or with no reason read', () => {
    expect(planMirrorPassReconcile(queued, { ...closed, closedAs: 'completed' })?.action).toBe(
      'reopen-honestly',
    );
    expect(planMirrorPassReconcile(queued, closed)?.action).toBe('reopen-honestly');
  });

  it('still settles a claimed task when the claimant closes the issue as not planned (claim contract)', () => {
    const claimed: MirrorPassTaskCandidate = {
      ...queued,
      status: 'in_progress',
      humanCloses: true,
    };
    expect(planMirrorPassReconcile(claimed, { ...closed, closedAs: 'not-planned' })?.action).toBe(
      'settle-claimed',
    );
  });

  it('still records a landed commit on an issue closed as not planned', () => {
    const landed: MirrorPassTaskCandidate = {
      id: 'github-42',
      status: 'done',
      landedSha: 'abc1234',
    };
    expect(
      planMirrorPassLandingNote(landed, { ...closed, closedAs: 'not-planned' }, [])?.action,
    ).toBe('note-landing-sha');
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

/** Identity resolves to the repo's own maintainer; `gh issue view <n>` answers
 *  a closed issue with the reason `reasons` gives it; every other call is a
 *  bare success. Every call lands in `calls`. */
function maintainerExec(
  reasons: Readonly<Record<number, string | null>>,
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
      if (!(number in reasons)) return { code: 1, stdout: '' };
      return {
        code: 0,
        stdout: JSON.stringify({ number, state: 'CLOSED', stateReason: reasons[number] }),
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

describe('the mirror pass execute × a close given as a no', () => {
  it('sends no reopen for an issue closed as not planned or as a duplicate, and still reopens the rest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-close-reason-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      for (const n of [5, 6, 7, 8]) {
        createTask(s, { id: `github-${n}`, projectId: 'p1', title: `Issue ${n}`, createdAt: 100 });
      }
      s.close();

      const calls: Array<readonly string[]> = [];
      const exec = maintainerExec(
        { 5: 'NOT_PLANNED', 6: 'DUPLICATE', 7: 'COMPLETED', 8: null },
        calls,
      );

      const report = await createMirrorPassExecuteApi(dbPath, exec)('p1');

      expect(report?.outcomes.map((o) => o.plan.finding?.issueNumber)).toEqual([7, 8]);
      expect(wroteOn(calls, 5)).toBe(false);
      expect(wroteOn(calls, 6)).toBe(false);
      expect(calls).toContainEqual(['issue', 'reopen', '7']);
      expect(calls).toContainEqual(['issue', 'reopen', '8']);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
});
