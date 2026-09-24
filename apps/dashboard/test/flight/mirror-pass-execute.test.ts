// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  openStore,
  migrate,
  createTask,
  setTaskStatus,
  setTaskFocus,
  type Store,
} from '@autopilot/store';
import type * as AutopilotStore from '@autopilot/store';
import {
  createMirrorPassPreviewApi,
  createMirrorPassExecuteApi,
  createMirrorPassLandingNotePreviewApi,
  createMirrorPassLandingNoteExecuteApi,
  createMirrorPassDriftPreviewApi,
  createMirrorPassDriftExecuteApi,
  createMirrorPassStaleClaimPreviewApi,
  createMirrorPassStaleClaimExecuteApi,
  createMirrorPassPriorityFollowPreviewApi,
} from '../../src/flight/mirror-pass-execute.js';
import { claimContractBody } from '../../src/flight/claim-contract.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

vi.mock('@autopilot/store', async (importOriginal) => {
  const actual = await importOriginal<typeof AutopilotStore>();
  return { ...actual, openStore: vi.fn(actual.openStore) };
});

function project(s: Store, id: string, rootPath: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, rootPath, 100, 100);
}

function shipSha(s: Store, projectId: string, firingId: string, item: string, sha: string): void {
  s.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, item, sha, shipped, created_at)
       VALUES (?, ?, ?, ?, 1, 100)`,
    )
    .run(projectId, firingId, item, sha);
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

/** A `CliExec` stub answering `gh issue view <n> --json number,state` from
 *  `states` (issue number -> open/closed), and every other call with a bare
 *  success — mirrors `mirror-pass.ts`'s own test doubles. */
function issueViewExec(states: Readonly<Record<number, 'open' | 'closed'>>): CliExec {
  return vi.fn(async (_bin, args) => {
    if (args[0] === 'issue' && args[1] === 'view') {
      const number = Number(args[2]);
      const state = states[number];
      if (state === undefined) return { code: 1, stdout: '' };
      return { code: 0, stdout: JSON.stringify({ number, state: state.toUpperCase() }) };
    }
    return { code: 0, stdout: '' };
  });
}

/** A `CliExec` stub answering identity resolution (`gh api user` as
 *  `login`, `gh repo view` as owned by `ownerLogin`) plus `gh issue view <n>
 *  --json number,state` from `states`, and a bare success for every other
 *  call (the mutating `issue comment`/`issue close`/`issue reopen` calls
 *  `createMirrorPassExecuteApi` sends) — the exec double it needs, since it
 *  composes `resolveSocialIdentity` with `createMirrorPassPreviewApi`'s own
 *  reconcile read. Every call is appended to `calls` so a test can assert
 *  exactly which `gh` argv ran (or didn't). */
function identityAndIssueViewExec(
  login: string,
  ownerLogin: string,
  states: Readonly<Record<number, 'open' | 'closed'>>,
  calls: Array<readonly [string, readonly string[]]> = [],
): CliExec {
  return vi.fn(async (bin, args) => {
    calls.push([bin, args]);
    if (args[0] === 'api' && args[1] === 'user') {
      return { code: 0, stdout: JSON.stringify({ login }) };
    }
    if (args[0] === 'repo' && args[1] === 'view') {
      return {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: `${ownerLogin}/hello-world`,
          url: `https://github.com/${ownerLogin}/hello-world`,
          isPrivate: false,
        }),
      };
    }
    if (args[0] === 'issue' && args[1] === 'view') {
      const number = Number(args[2]);
      const state = states[number];
      if (state === undefined) return { code: 1, stdout: '' };
      return { code: 0, stdout: JSON.stringify({ number, state: state.toUpperCase() }) };
    }
    return { code: 0, stdout: '' };
  });
}

/** A `CliExec` stub answering both `gh issue view <n> --json number,state`
 *  and `gh issue view <n> --json comments` from `issues` (issue number ->
 *  `{state, comments}`) — the two reads
 *  `createMirrorPassLandingNotePreviewApi` composes. */
function issueViewAndCommentsExec(
  issues: Readonly<Record<number, { state: 'open' | 'closed'; comments?: readonly string[] }>>,
): CliExec {
  return vi.fn(async (_bin, args) => {
    if (args[0] === 'issue' && args[1] === 'view') {
      const number = Number(args[2]);
      const entry = issues[number];
      if (entry === undefined) return { code: 1, stdout: '' };
      if (args[4] === 'comments') {
        return {
          code: 0,
          stdout: JSON.stringify({ comments: (entry.comments ?? []).map((body) => ({ body })) }),
        };
      }
      return { code: 0, stdout: JSON.stringify({ number, state: entry.state.toUpperCase() }) };
    }
    return { code: 0, stdout: '' };
  });
}

/** A `CliExec` stub answering both `gh issue view <n> --json number,state`
 *  and `gh issue view <n> --json labels` from `issues` (issue number ->
 *  `{state, labels}`) — the two reads
 *  `createMirrorPassPriorityFollowPreviewApi` composes. */
function issueViewAndLabelsExec(
  issues: Readonly<Record<number, { state: 'open' | 'closed'; labels?: readonly string[] }>>,
): CliExec {
  return vi.fn(async (_bin, args) => {
    if (args[0] === 'issue' && args[1] === 'view') {
      const number = Number(args[2]);
      const entry = issues[number];
      if (entry === undefined) return { code: 1, stdout: '' };
      if (args[4] === 'labels') {
        return {
          code: 0,
          stdout: JSON.stringify({ labels: (entry.labels ?? []).map((name) => ({ name })) }),
        };
      }
      return { code: 0, stdout: JSON.stringify({ number, state: entry.state.toUpperCase() }) };
    }
    return { code: 0, stdout: '' };
  });
}

/** A `CliExec` stub answering identity resolution (same shape as {@link
 *  identityAndIssueViewExec}) plus both `gh issue view <n> --json
 *  number,state` and `gh issue view <n> --json comments` from `issues` (same
 *  shape as {@link issueViewAndCommentsExec}) — the exec double
 *  `createMirrorPassLandingNoteExecuteApi` needs, since it composes
 *  `resolveSocialIdentity` with `createMirrorPassLandingNotePreviewApi`'s own
 *  reads. Every call is appended to `calls` so a test can assert exactly
 *  which `gh` argv ran (or didn't). */
function identityAndIssueViewAndCommentsExec(
  login: string,
  ownerLogin: string,
  issues: Readonly<Record<number, { state: 'open' | 'closed'; comments?: readonly string[] }>>,
  calls: Array<readonly [string, readonly string[]]> = [],
): CliExec {
  return vi.fn(async (bin, args) => {
    calls.push([bin, args]);
    if (args[0] === 'api' && args[1] === 'user') {
      return { code: 0, stdout: JSON.stringify({ login }) };
    }
    if (args[0] === 'repo' && args[1] === 'view') {
      return {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: `${ownerLogin}/hello-world`,
          url: `https://github.com/${ownerLogin}/hello-world`,
          isPrivate: false,
        }),
      };
    }
    if (args[0] === 'issue' && args[1] === 'view') {
      const number = Number(args[2]);
      const entry = issues[number];
      if (entry === undefined) return { code: 1, stdout: '' };
      if (args[4] === 'comments') {
        return {
          code: 0,
          stdout: JSON.stringify({ comments: (entry.comments ?? []).map((body) => ({ body })) }),
        };
      }
      return { code: 0, stdout: JSON.stringify({ number, state: entry.state.toUpperCase() }) };
    }
    return { code: 0, stdout: '' };
  });
}

/** A `CliExec` stub answering `gh issue list --state open --json
 *  number,title,url,labels,assignees` from `poolIssues` and `gh issue view
 *  <n> --json number,state,assignees,comments,updatedAt` from `activity`
 *  (issue number -> state/assignee/updatedAt) — the two reads
 *  `createMirrorPassStaleClaimPreviewApi` composes. */
function poolListAndActivityExec(
  poolIssues: ReadonlyArray<{
    number: number;
    labels: readonly string[];
    assignees: readonly string[];
  }>,
  activity: Readonly<
    Record<number, { state: 'OPEN' | 'CLOSED'; assignee: string; updatedAt: string }>
  >,
): CliExec {
  return vi.fn(async (_bin, args) => {
    if (args[0] === 'issue' && args[1] === 'list') {
      return {
        code: 0,
        stdout: JSON.stringify(
          poolIssues.map((issue) => ({
            number: issue.number,
            title: `issue #${issue.number}`,
            url: `https://github.com/x/y/issues/${issue.number}`,
            labels: issue.labels.map((name) => ({ name })),
            assignees: issue.assignees.map((login) => ({ login })),
          })),
        ),
      };
    }
    if (args[0] === 'issue' && args[1] === 'view') {
      const number = Number(args[2]);
      const entry = activity[number];
      if (entry === undefined) return { code: 1, stdout: '' };
      return {
        code: 0,
        stdout: JSON.stringify({
          number,
          state: entry.state,
          assignees: [{ login: entry.assignee }],
          comments: [],
          updatedAt: entry.updatedAt,
        }),
      };
    }
    return { code: 0, stdout: '' };
  });
}

/** A `CliExec` stub answering identity resolution (same shape as {@link
 *  identityAndIssueViewExec}) plus both `gh issue list ...` and `gh issue
 *  view <n> --json number,state,assignees,comments,updatedAt` from
 *  `poolIssues`/`activity` (same shape as {@link poolListAndActivityExec})
 *  — the exec double `createMirrorPassStaleClaimExecuteApi` needs, since it
 *  composes `resolveSocialIdentity` with `createMirrorPassStaleClaimPreviewApi`'s
 *  own reads. Every call is appended to `calls` so a test can assert exactly
 *  which `gh` argv ran (or didn't). */
function identityAndPoolListAndActivityExec(
  login: string,
  ownerLogin: string,
  poolIssues: ReadonlyArray<{
    number: number;
    labels: readonly string[];
    assignees: readonly string[];
  }>,
  activity: Readonly<
    Record<number, { state: 'OPEN' | 'CLOSED'; assignee: string; updatedAt: string }>
  >,
  calls: Array<readonly [string, readonly string[]]> = [],
): CliExec {
  return vi.fn(async (bin, args) => {
    calls.push([bin, args]);
    if (args[0] === 'api' && args[1] === 'user') {
      return { code: 0, stdout: JSON.stringify({ login }) };
    }
    if (args[0] === 'repo' && args[1] === 'view') {
      return {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: `${ownerLogin}/hello-world`,
          url: `https://github.com/${ownerLogin}/hello-world`,
          isPrivate: false,
        }),
      };
    }
    if (args[0] === 'issue' && args[1] === 'list') {
      return {
        code: 0,
        stdout: JSON.stringify(
          poolIssues.map((issue) => ({
            number: issue.number,
            title: `issue #${issue.number}`,
            url: `https://github.com/x/y/issues/${issue.number}`,
            labels: issue.labels.map((name) => ({ name })),
            assignees: issue.assignees.map((assigneeLogin) => ({ login: assigneeLogin })),
          })),
        ),
      };
    }
    if (args[0] === 'issue' && args[1] === 'view') {
      const number = Number(args[2]);
      const entry = activity[number];
      if (entry === undefined) return { code: 1, stdout: '' };
      return {
        code: 0,
        stdout: JSON.stringify({
          number,
          state: entry.state,
          assignees: [{ login: entry.assignee }],
          comments: [],
          updatedAt: entry.updatedAt,
        }),
      };
    }
    return { code: 0, stdout: '' };
  });
}

describe('createMirrorPassPreviewApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      expect(await createMirrorPassPreviewApi(dbPath, issueViewExec({}))('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('plans a close-with-landing-note when a done task landed but its issue is still open', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-close-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-42',
        projectId: 'p1',
        title: 'Fix the fleet table keyboard nav',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-42', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-42', 'abc1234');
      s.close();

      const plans = await createMirrorPassPreviewApi(dbPath, issueViewExec({ 42: 'open' }))('p1');

      expect(plans).toHaveLength(1);
      expect(plans?.[0]?.finding).toMatchObject({
        action: 'close-with-landing-note',
        taskId: 'github-42',
        issueNumber: 42,
        sha: 'abc1234',
      });
      expect(plans?.[0]?.commands).toHaveLength(2);
    } finally {
      cleanupDir(dir);
    }
  });

  it('plans a reopen-honestly when the board no longer says done but the issue is closed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-reopen-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-7',
        projectId: 'p1',
        title: 'Regression in the search palette',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-7', 'deferred', 200);
      s.close();

      const plans = await createMirrorPassPreviewApi(dbPath, issueViewExec({ 7: 'closed' }))('p1');

      expect(plans?.[0]?.finding).toMatchObject({
        action: 'reopen-honestly',
        taskId: 'github-7',
        issueNumber: 7,
      });
    } finally {
      cleanupDir(dir);
    }
  });

  it('finds nothing to reconcile when the board and the issue already agree, and never mutates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-insync-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-3',
        projectId: 'p1',
        title: 'Already closed the right way',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-3', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-3', 'def5678');
      s.close();

      const exec = issueViewExec({ 3: 'closed' });
      const plans = await createMirrorPassPreviewApi(dbPath, exec)('p1');

      expect(plans).toHaveLength(1);
      expect(plans?.[0]?.finding).toBeNull();
      expect(plans?.[0]?.commands).toHaveLength(0);
      // Read-only: the `issue view` read and the #40 `git cat-file` existence
      // check happened — no comment/close/reopen write.
      expect(exec).toHaveBeenCalledTimes(2);
      const calls = (exec as ReturnType<typeof vi.fn>).mock.calls as Array<
        [string, readonly string[]]
      >;
      expect(calls.map((c) => [c[0], c[1][0], c[1][1]])).toEqual([
        ['git', '-C', dir],
        ['gh', 'issue', 'view'],
      ]);
    } finally {
      cleanupDir(dir);
    }
  });

  it('ignores a non-github task id — nothing to reconcile it against', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-nongithub-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'web-abc123',
        projectId: 'p1',
        title: 'A self-mined proposal, not from github',
        createdAt: 100,
      });
      s.close();

      const plans = await createMirrorPassPreviewApi(dbPath, issueViewExec({}))('p1');

      expect(plans).toHaveLength(0);
    } finally {
      cleanupDir(dir);
    }
  });

  it('picks the most recently shipped SHA when a task shipped more than once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-resha-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-9',
        projectId: 'p1',
        title: 'A multi-slice task',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-9', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-9', 'first000');
      shipSha(s, 'p1', 'firing-2', 'github-9', 'second111');
      s.close();

      const plans = await createMirrorPassPreviewApi(dbPath, issueViewExec({ 9: 'open' }))('p1');

      expect(plans?.[0]?.finding).toMatchObject({ sha: 'second111' });
    } finally {
      cleanupDir(dir);
    }
  });

  it('defaults to the real CLI exec when none is injected', () => {
    expect(() => createMirrorPassPreviewApi('/tmp/unused.db')).not.toThrow();
  });

  it('opens the store read-only — a preview never writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createMirrorPassPreviewApi(dbPath, issueViewExec({}))('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('createMirrorPassExecuteApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-execute-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const exec = identityAndIssueViewExec('octocat', 'octocat', {});
      expect(await createMirrorPassExecuteApi(dbPath, exec)('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('skips with identity-unresolved and sends zero mutations when gh cannot resolve who is acting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-execute-unresolved-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, { id: 'github-42', projectId: 'p1', title: 'Fix it', createdAt: 100 });
      setTaskStatus(s, 'github-42', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-42', 'abc1234');
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec: CliExec = vi.fn(async (bin, args) => {
        calls.push([bin, args]);
        return { code: 1, stdout: '' };
      });

      const report = await createMirrorPassExecuteApi(dbPath, exec)('p1');

      expect(report).toEqual({
        identity: undefined,
        outcomes: [],
        skippedReason: 'identity-unresolved',
      });
      expect(calls.some(([, args]) => args.includes('close') || args.includes('reopen'))).toBe(
        false,
      );
    } finally {
      cleanupDir(dir);
    }
  });

  it('skips with guest and sends zero mutations for a non-maintainer identity', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-execute-guest-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, { id: 'github-42', projectId: 'p1', title: 'Fix it', createdAt: 100 });
      setTaskStatus(s, 'github-42', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-42', 'abc1234');
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndIssueViewExec('a-contributor', 'octocat', { 42: 'open' }, calls);

      const report = await createMirrorPassExecuteApi(dbPath, exec)('p1');

      expect(report?.skippedReason).toBe('guest');
      expect(report?.outcomes).toEqual([]);
      expect(report?.identity).toMatchObject({ login: 'a-contributor', role: 'user' });
      // Role honesty: identity resolution ran, but the board task read and any
      // issue view/mutation never did.
      expect(calls.some(([, args]) => args[0] === 'issue')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('sends the close-with-landing-note commands for a maintainer identity', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-execute-close-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-42',
        projectId: 'p1',
        title: 'Fix the fleet table keyboard nav',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-42', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-42', 'abc1234');
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndIssueViewExec('octocat', 'octocat', { 42: 'open' }, calls);

      const report = await createMirrorPassExecuteApi(dbPath, exec)('p1');

      expect(report?.skippedReason).toBeUndefined();
      expect(report?.identity).toMatchObject({ login: 'octocat', role: 'maintainer' });
      expect(report?.outcomes).toHaveLength(1);
      expect(report?.outcomes[0]?.plan.finding).toMatchObject({
        action: 'close-with-landing-note',
        issueNumber: 42,
      });
      expect(report?.outcomes[0]?.commandOutcomes).toEqual([
        {
          command: expect.objectContaining({
            args: ['issue', 'comment', '42', '--body', expect.any(String)],
          }),
          ok: true,
        },
        { command: expect.objectContaining({ args: ['issue', 'close', '42'] }), ok: true },
      ]);
      expect(calls).toContainEqual(['gh', ['issue', 'close', '42']]);
    } finally {
      cleanupDir(dir);
    }
  });

  it('sends the reopen-honestly commands when the board no longer says done', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-execute-reopen-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-7',
        projectId: 'p1',
        title: 'Regression in the search palette',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-7', 'deferred', 200);
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndIssueViewExec('octocat', 'octocat', { 7: 'closed' }, calls);

      const report = await createMirrorPassExecuteApi(dbPath, exec)('p1');

      expect(report?.outcomes[0]?.plan.finding).toMatchObject({ action: 'reopen-honestly' });
      expect(calls).toContainEqual(['gh', ['issue', 'reopen', '7']]);
    } finally {
      cleanupDir(dir);
    }
  });

  it('sends nothing when the board and the issue already agree', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-execute-insync-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-3',
        projectId: 'p1',
        title: 'Already closed the right way',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-3', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-3', 'def5678');
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndIssueViewExec('octocat', 'octocat', { 3: 'closed' }, calls);

      const report = await createMirrorPassExecuteApi(dbPath, exec)('p1');

      expect(report?.outcomes).toEqual([]);
      expect(calls.some(([, args]) => args[0] === 'issue' && args[1] !== 'view')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('settles a claimed task (status done, unfocused) via settleClaimedTasks when the claimant closed the issue', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-execute-settle-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-42',
        projectId: 'p1',
        title: 'Fix the fleet table keyboard nav',
        body: claimContractBody(42, 'https://github.com/octocat/hello-world/issues/42'),
        createdAt: 100,
      });
      setTaskStatus(s, 'github-42', 'in_progress', 200);
      setTaskFocus(s, 'github-42', true, 200);
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndIssueViewExec('octocat', 'octocat', { 42: 'closed' }, calls);

      const report = await createMirrorPassExecuteApi(dbPath, exec)('p1');

      expect(report?.outcomes).toHaveLength(1);
      expect(report?.outcomes[0]?.plan.finding).toMatchObject({
        action: 'settle-claimed',
        issueNumber: 42,
      });
      // Settle only posts the note — the issue is already closed by the
      // claimant, so no close/reopen call is sent.
      expect(report?.outcomes[0]?.commandOutcomes).toEqual([
        {
          command: expect.objectContaining({
            args: ['issue', 'comment', '42', '--body', expect.any(String)],
          }),
          ok: true,
        },
      ]);
      expect(
        calls.some(
          ([, args]) => args[0] === 'issue' && (args[1] === 'close' || args[1] === 'reopen'),
        ),
      ).toBe(false);

      const s2 = openStore(dbPath, { readonly: true });
      const row = s2.db
        .prepare('SELECT status, focus FROM tasks WHERE id = ?')
        .get('github-42') as {
        status: string;
        focus: number;
      };
      s2.close();
      expect(row).toEqual({ status: 'done', focus: 0 });
    } finally {
      cleanupDir(dir);
    }
  });

  it('defaults to the real CLI exec when none is injected', () => {
    expect(() => createMirrorPassExecuteApi('/tmp/unused.db')).not.toThrow();
  });

  it('opens the store read-only — this reconcile never writes to the board itself', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-execute-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createMirrorPassExecuteApi(
        dbPath,
        identityAndIssueViewExec('octocat', 'octocat', {}),
      )('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('createMirrorPassLandingNotePreviewApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      expect(
        await createMirrorPassLandingNotePreviewApi(dbPath, issueViewAndCommentsExec({}))('nope'),
      ).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('notes the landing SHA when a done task landed but its already-closed issue never recorded it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-fires-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-11',
        projectId: 'p1',
        title: 'Landed but closed by hand, no note',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-11', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-11', 'cafe123');
      s.close();

      const plans = await createMirrorPassLandingNotePreviewApi(
        dbPath,
        issueViewAndCommentsExec({ 11: { state: 'closed', comments: [] } }),
      )('p1');

      expect(plans).toHaveLength(1);
      expect(plans?.[0]?.finding).toMatchObject({
        action: 'note-landing-sha',
        taskId: 'github-11',
        issueNumber: 11,
        sha: 'cafe123',
      });
      expect(plans?.[0]?.command).toMatchObject({
        args: ['issue', 'comment', '11', '--body', expect.stringContaining('cafe123')],
      });
    } finally {
      cleanupDir(dir);
    }
  });

  it('does not duplicate the note when a comment already carries the landing SHA', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-dedup-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-12',
        projectId: 'p1',
        title: 'Already noted',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-12', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-12', 'beef456');
      s.close();

      const plans = await createMirrorPassLandingNotePreviewApi(
        dbPath,
        issueViewAndCommentsExec({
          12: { state: 'closed', comments: ['Landed in beef456 — noting for the record.'] },
        }),
      )('p1');

      expect(plans?.[0]?.finding).toBeNull();
      expect(plans?.[0]?.command).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it("skips a still-open issue — that gap is derivation 1/4's close-with-landing-note", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-open-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-13',
        projectId: 'p1',
        title: 'Still open',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-13', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-13', 'aaaa111');
      s.close();

      const exec = issueViewAndCommentsExec({ 13: { state: 'open' } });
      const plans = await createMirrorPassLandingNotePreviewApi(dbPath, exec)('p1');

      expect(plans?.[0]?.finding).toBeNull();
      // Read-only, and no comments fetch needed for a still-open issue.
      expect(exec).toHaveBeenCalledTimes(1);
    } finally {
      cleanupDir(dir);
    }
  });

  it('opens the store read-only — a preview never writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createMirrorPassLandingNotePreviewApi(dbPath, issueViewAndCommentsExec({}))('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('createMirrorPassLandingNoteExecuteApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-execute-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const exec = identityAndIssueViewAndCommentsExec('octocat', 'octocat', {});
      expect(await createMirrorPassLandingNoteExecuteApi(dbPath, exec)('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('skips with identity-unresolved and sends zero mutations when gh cannot resolve who is acting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-execute-unresolved-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, { id: 'github-11', projectId: 'p1', title: 'Fix it', createdAt: 100 });
      setTaskStatus(s, 'github-11', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-11', 'cafe123');
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec: CliExec = vi.fn(async (bin, args) => {
        calls.push([bin, args]);
        return { code: 1, stdout: '' };
      });

      const report = await createMirrorPassLandingNoteExecuteApi(dbPath, exec)('p1');

      expect(report).toEqual({
        identity: undefined,
        outcomes: [],
        skippedReason: 'identity-unresolved',
      });
      expect(calls.some(([, args]) => args[0] === 'issue' && args[1] === 'comment')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('skips with guest and sends zero mutations for a non-maintainer identity', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-execute-guest-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, { id: 'github-11', projectId: 'p1', title: 'Fix it', createdAt: 100 });
      setTaskStatus(s, 'github-11', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-11', 'cafe123');
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndIssueViewAndCommentsExec(
        'a-contributor',
        'octocat',
        { 11: { state: 'closed', comments: [] } },
        calls,
      );

      const report = await createMirrorPassLandingNoteExecuteApi(dbPath, exec)('p1');

      expect(report?.skippedReason).toBe('guest');
      expect(report?.outcomes).toEqual([]);
      expect(report?.identity).toMatchObject({ login: 'a-contributor', role: 'user' });
      // Role honesty: identity resolution ran, but the board task read and any
      // issue view/comment call never did.
      expect(calls.some(([, args]) => args[0] === 'issue')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('sends the landing-note comment for a maintainer identity when the note is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-execute-fires-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-11',
        projectId: 'p1',
        title: 'Landed but closed by hand, no note',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-11', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-11', 'cafe123');
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndIssueViewAndCommentsExec(
        'octocat',
        'octocat',
        { 11: { state: 'closed', comments: [] } },
        calls,
      );

      const report = await createMirrorPassLandingNoteExecuteApi(dbPath, exec)('p1');

      expect(report?.skippedReason).toBeUndefined();
      expect(report?.identity).toMatchObject({ login: 'octocat', role: 'maintainer' });
      expect(report?.outcomes).toHaveLength(1);
      expect(report?.outcomes[0]?.plan.finding).toMatchObject({
        action: 'note-landing-sha',
        issueNumber: 11,
        sha: 'cafe123',
      });
      expect(report?.outcomes[0]?.commandOutcome).toEqual({
        command: expect.objectContaining({
          args: ['issue', 'comment', '11', '--body', expect.stringContaining('cafe123')],
        }),
        ok: true,
      });
      expect(calls).toContainEqual([
        'gh',
        ['issue', 'comment', '11', '--body', expect.stringContaining('cafe123')],
      ]);
    } finally {
      cleanupDir(dir);
    }
  });

  it('sends nothing when a comment already carries the landing SHA', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-execute-dedup-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, { id: 'github-12', projectId: 'p1', title: 'Already noted', createdAt: 100 });
      setTaskStatus(s, 'github-12', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-12', 'beef456');
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndIssueViewAndCommentsExec(
        'octocat',
        'octocat',
        { 12: { state: 'closed', comments: ['Landed in beef456 — noting for the record.'] } },
        calls,
      );

      const report = await createMirrorPassLandingNoteExecuteApi(dbPath, exec)('p1');

      expect(report?.outcomes).toEqual([]);
      expect(calls.some(([, args]) => args[0] === 'issue' && args[1] === 'comment')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('defaults to the real CLI exec when none is injected', () => {
    expect(() => createMirrorPassLandingNoteExecuteApi('/tmp/unused.db')).not.toThrow();
  });

  it('opens the store read-only — this reconcile never writes to the board itself', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-landing-note-execute-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createMirrorPassLandingNoteExecuteApi(
        dbPath,
        identityAndIssueViewAndCommentsExec('octocat', 'octocat', {}),
      )('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});

/** A `CliExec` stub answering identity resolution (same shape as {@link
 *  identityAndIssueViewExec}) plus the four `gh issue|pr list` reads {@link
 *  createMirrorPassDriftExecuteApi} composes via `social-pass.ts`'s {@link
 *  fetchOwnSubmissions}/{@link fetchOpenThreads} (own issues/PRs, open
 *  issues/PRs — `--author <login>` on the "own" pair distinguishes them from
 *  the open-threads pair) and a bare success for `gh issue create`. Every
 *  call is appended to `calls` so a test can assert exactly which `gh` argv
 *  ran (or didn't). */
function identityAndSocialListsExec(
  login: string,
  ownerLogin: string,
  ownIssueTitles: readonly string[] = [],
  openIssueTitles: readonly string[] = [],
  calls: Array<readonly [string, readonly string[]]> = [],
): CliExec {
  return vi.fn(async (bin, args) => {
    calls.push([bin, args]);
    if (args[0] === 'api' && args[1] === 'user') {
      return { code: 0, stdout: JSON.stringify({ login }) };
    }
    if (args[0] === 'repo' && args[1] === 'view') {
      return {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: `${ownerLogin}/hello-world`,
          url: `https://github.com/${ownerLogin}/hello-world`,
          isPrivate: false,
        }),
      };
    }
    if (args[0] === 'issue' && args[1] === 'list') {
      const titles = args.includes('--author') ? ownIssueTitles : openIssueTitles;
      return {
        code: 0,
        stdout: JSON.stringify(
          titles.map((title, i) => ({
            number: i + 1,
            title,
            url: `https://github.com/x/y/issues/${i + 1}`,
            state: 'OPEN',
          })),
        ),
      };
    }
    if (args[0] === 'pr' && args[1] === 'list') {
      return { code: 0, stdout: JSON.stringify([]) };
    }
    if (args[0] === 'issue' && args[1] === 'create') {
      return { code: 0, stdout: '' };
    }
    return { code: 0, stdout: '' };
  });
}

describe('createMirrorPassDriftPreviewApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      expect(await createMirrorPassDriftPreviewApi(dbPath)('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('finds nothing to flag when the project has no README at all', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-nodocs-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const plan = await createMirrorPassDriftPreviewApi(dbPath)('p1');

      expect(plan).toEqual({ versionDrift: null, countsDrift: null, linkDrift: null });
    } finally {
      cleanupDir(dir);
    }
  });

  it('reports a version drift when the project README and package.json disagree', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-version-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();
      writeFileSync(join(dir, 'README.md'), 'Current version **0.24.0** — see below.');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.25.0' }));

      const plan = await createMirrorPassDriftPreviewApi(dbPath)('p1');

      expect(plan?.versionDrift).toMatchObject({
        claimedVersion: '0.24.0',
        actualVersion: '0.25.0',
      });
      expect(plan?.countsDrift).toBeNull();
      expect(plan?.linkDrift).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('reports a counts drift when the project README and THIRD-PARTY-LICENSES.md disagree', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-counts-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();
      writeFileSync(join(dir, 'README.md'), 'shoulders of 2 open-source projects — see THANKS.md');
      mkdirSync(join(dir, 'docs'));
      writeFileSync(
        join(dir, 'docs', 'THIRD-PARTY-LICENSES.md'),
        ['| package | version(s) | license |', '| --- | --- | --- |', '| a | 1.0.0 | MIT |'].join(
          '\n',
        ),
      );

      const plan = await createMirrorPassDriftPreviewApi(dbPath)('p1');

      expect(plan?.countsDrift).toMatchObject({ claimedCount: 2, actualCount: 1 });
      expect(plan?.versionDrift).toBeNull();
      expect(plan?.linkDrift).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('reports a link drift when the project README points at a path that does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-links-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();
      writeFileSync(join(dir, 'README.md'), '[ghost doc](docs/ghost.md)');

      const plan = await createMirrorPassDriftPreviewApi(dbPath)('p1');

      expect(plan?.linkDrift).toEqual({
        action: 'file-broken-link-issue',
        source: 'README.md',
        brokenLinks: ['docs/ghost.md'],
      });
      expect(plan?.versionDrift).toBeNull();
      expect(plan?.countsDrift).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('opens the store read-only — a preview never writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createMirrorPassDriftPreviewApi(dbPath)('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('createMirrorPassDriftExecuteApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-execute-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const exec = identityAndSocialListsExec('octocat', 'octocat');
      expect(await createMirrorPassDriftExecuteApi(dbPath, exec)('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('skips with identity-unresolved and sends zero mutations when gh cannot resolve who is acting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-execute-unresolved-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();
      writeFileSync(join(dir, 'README.md'), 'Current version **0.24.0** — see below.');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.25.0' }));

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec: CliExec = vi.fn(async (bin, args) => {
        calls.push([bin, args]);
        return { code: 1, stdout: '' };
      });

      const report = await createMirrorPassDriftExecuteApi(dbPath, exec)('p1');

      expect(report).toEqual({
        identity: undefined,
        outcomes: [],
        duplicates: [],
        skippedReason: 'identity-unresolved',
      });
      expect(calls.some(([, args]) => args[0] === 'issue' && args[1] === 'create')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('skips with guest and sends zero mutations for a non-maintainer identity', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-execute-guest-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();
      writeFileSync(join(dir, 'README.md'), 'Current version **0.24.0** — see below.');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.25.0' }));

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndSocialListsExec('a-contributor', 'octocat', [], [], calls);

      const report = await createMirrorPassDriftExecuteApi(dbPath, exec)('p1');

      expect(report?.skippedReason).toBe('guest');
      expect(report?.outcomes).toEqual([]);
      expect(report?.duplicates).toEqual([]);
      expect(report?.identity).toMatchObject({ login: 'a-contributor', role: 'user' });
      // Role honesty: identity resolution ran, but the drift reads never
      // reach a single `gh issue create` call.
      expect(calls.some(([, args]) => args[0] === 'issue' && args[1] === 'create')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('files a new issue for a maintainer identity when a version drift is found', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-execute-fires-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();
      writeFileSync(join(dir, 'README.md'), 'Current version **0.24.0** — see below.');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.25.0' }));

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndSocialListsExec('octocat', 'octocat', [], [], calls);

      const report = await createMirrorPassDriftExecuteApi(dbPath, exec)('p1');

      expect(report?.skippedReason).toBeUndefined();
      expect(report?.identity).toMatchObject({ login: 'octocat', role: 'maintainer' });
      expect(report?.duplicates).toEqual([]);
      expect(report?.outcomes).toHaveLength(1);
      expect(report?.outcomes[0]?.finding).toMatchObject({
        claimedVersion: '0.24.0',
        actualVersion: '0.25.0',
      });
      expect(report?.outcomes[0]?.commandOutcome).toEqual({
        command: expect.objectContaining({
          args: ['issue', 'create', '--title', expect.any(String), '--body', expect.any(String)],
        }),
        ok: true,
      });
      expect(calls.some(([, args]) => args[0] === 'issue' && args[1] === 'create')).toBe(true);
    } finally {
      cleanupDir(dir);
    }
  });

  it('reports a duplicate and files nothing when a matching issue is already open', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-execute-duplicate-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();
      writeFileSync(join(dir, 'README.md'), 'Current version **0.24.0** — see below.');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.25.0' }));

      const existingTitle = 'README.md claims version 0.24.0, tree is at 0.25.0';
      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndSocialListsExec('octocat', 'octocat', [existingTitle], [], calls);

      const report = await createMirrorPassDriftExecuteApi(dbPath, exec)('p1');

      expect(report?.skippedReason).toBeUndefined();
      expect(report?.outcomes).toEqual([]);
      expect(report?.duplicates).toEqual([existingTitle]);
      expect(calls.some(([, args]) => args[0] === 'issue' && args[1] === 'create')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('sends nothing when the project has no README/docs drift to report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-execute-clean-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const exec = identityAndSocialListsExec('octocat', 'octocat');

      const report = await createMirrorPassDriftExecuteApi(dbPath, exec)('p1');

      expect(report).toEqual({
        identity: expect.objectContaining({ login: 'octocat' }),
        outcomes: [],
        duplicates: [],
      });
    } finally {
      cleanupDir(dir);
    }
  });

  it('defaults to the real CLI exec when none is injected', () => {
    expect(() => createMirrorPassDriftExecuteApi('/tmp/unused.db')).not.toThrow();
  });

  it('opens the store read-only — a drift execute never writes to the board itself', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-drift-execute-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createMirrorPassDriftExecuteApi(
        dbPath,
        identityAndSocialListsExec('octocat', 'octocat'),
      )('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('createMirrorPassStaleClaimPreviewApi', () => {
  const NOW = Date.UTC(2026, 8, 9, 12, 0, 0);
  const now = (): number => NOW;

  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const exec = poolListAndActivityExec([], {});
      expect(await createMirrorPassStaleClaimPreviewApi(dbPath, exec, now)('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('plans a reap finding for a claimed pool issue quiet past the stale threshold', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-fires-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const exec = poolListAndActivityExec(
        [{ number: 5, labels: ['pool: web'], assignees: ['someone'] }],
        { 5: { state: 'OPEN', assignee: 'someone', updatedAt: '2026-08-01T00:00:00Z' } },
      );

      const plans = await createMirrorPassStaleClaimPreviewApi(dbPath, exec, now)('p1');

      expect(plans).toHaveLength(1);
      expect(plans?.[0]?.finding).toMatchObject({
        action: 'reap-stale-claim',
        issueNumber: 5,
        assignee: 'someone',
      });
      expect(plans?.[0]?.commands).toHaveLength(2);
    } finally {
      cleanupDir(dir);
    }
  });

  it('finds nothing to reap for a freshly-claimed pool issue, and never mutates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-fresh-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const exec = poolListAndActivityExec(
        [{ number: 6, labels: ['pool: web'], assignees: ['someone'] }],
        { 6: { state: 'OPEN', assignee: 'someone', updatedAt: '2026-09-09T00:00:00Z' } },
      );

      const plans = await createMirrorPassStaleClaimPreviewApi(dbPath, exec, now)('p1');

      expect(plans?.[0]?.finding).toBeNull();
      expect(plans?.[0]?.commands).toHaveLength(0);
      // Read-only: only the `issue list` + `issue view` reads happened.
      expect(exec).toHaveBeenCalledTimes(2);
    } finally {
      cleanupDir(dir);
    }
  });

  it('ignores an unclaimed pool issue — nothing assigned, nothing to reap', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-unclaimed-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const exec = poolListAndActivityExec(
        [{ number: 7, labels: ['pool: web'], assignees: [] }],
        {},
      );

      const plans = await createMirrorPassStaleClaimPreviewApi(dbPath, exec, now)('p1');

      expect(plans).toHaveLength(0);
    } finally {
      cleanupDir(dir);
    }
  });

  it('ignores an issue with no pool label — never in the pool to begin with', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-nolabel-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const exec = poolListAndActivityExec([{ number: 8, labels: [], assignees: ['someone'] }], {
        8: { state: 'OPEN', assignee: 'someone', updatedAt: '2026-08-01T00:00:00Z' },
      });

      const plans = await createMirrorPassStaleClaimPreviewApi(dbPath, exec, now)('p1');

      expect(plans).toHaveLength(0);
    } finally {
      cleanupDir(dir);
    }
  });

  it('defaults to the real CLI exec and Date.now when none is injected', () => {
    expect(() => createMirrorPassStaleClaimPreviewApi('/tmp/unused.db')).not.toThrow();
  });

  it('opens the store read-only — a preview never writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createMirrorPassStaleClaimPreviewApi(
        dbPath,
        poolListAndActivityExec([], {}),
        now,
      )('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('createMirrorPassStaleClaimExecuteApi', () => {
  const NOW = Date.UTC(2026, 8, 9, 12, 0, 0);
  const now = (): number => NOW;

  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-execute-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const exec = identityAndPoolListAndActivityExec('octocat', 'octocat', [], {});
      expect(await createMirrorPassStaleClaimExecuteApi(dbPath, exec, now)('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('skips with identity-unresolved and sends zero mutations when gh cannot resolve who is acting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-execute-unresolved-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec: CliExec = vi.fn(async (bin, args) => {
        calls.push([bin, args]);
        return { code: 1, stdout: '' };
      });

      const report = await createMirrorPassStaleClaimExecuteApi(dbPath, exec, now)('p1');

      expect(report).toEqual({
        identity: undefined,
        outcomes: [],
        skippedReason: 'identity-unresolved',
      });
      expect(calls.some(([, args]) => args[0] === 'issue')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('skips with guest and sends zero mutations for a non-maintainer identity', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-execute-guest-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndPoolListAndActivityExec(
        'a-contributor',
        'octocat',
        [{ number: 5, labels: ['pool: web'], assignees: ['someone'] }],
        { 5: { state: 'OPEN', assignee: 'someone', updatedAt: '2026-08-01T00:00:00Z' } },
        calls,
      );

      const report = await createMirrorPassStaleClaimExecuteApi(dbPath, exec, now)('p1');

      expect(report?.skippedReason).toBe('guest');
      expect(report?.outcomes).toEqual([]);
      expect(report?.identity).toMatchObject({ login: 'a-contributor', role: 'user' });
      // Role honesty: identity resolution ran, but the pool list/activity
      // reads and any issue comment/edit call never did.
      expect(calls.some(([, args]) => args[0] === 'issue')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('sends the reap commands for a maintainer identity when a claim is stale', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-execute-fires-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const calls: Array<readonly [string, readonly string[]]> = [];
      const exec = identityAndPoolListAndActivityExec(
        'octocat',
        'octocat',
        [{ number: 5, labels: ['pool: web'], assignees: ['someone'] }],
        { 5: { state: 'OPEN', assignee: 'someone', updatedAt: '2026-08-01T00:00:00Z' } },
        calls,
      );

      const report = await createMirrorPassStaleClaimExecuteApi(dbPath, exec, now)('p1');

      expect(report?.skippedReason).toBeUndefined();
      expect(report?.identity).toMatchObject({ login: 'octocat', role: 'maintainer' });
      expect(report?.outcomes).toHaveLength(1);
      expect(report?.outcomes[0]?.plan.finding).toMatchObject({
        action: 'reap-stale-claim',
        issueNumber: 5,
        assignee: 'someone',
      });
      expect(report?.outcomes[0]?.commandOutcomes).toEqual([
        {
          command: expect.objectContaining({
            args: ['issue', 'comment', '5', '--body', expect.any(String)],
          }),
          ok: true,
        },
        {
          command: expect.objectContaining({
            args: ['issue', 'edit', '5', '--remove-assignee', 'someone'],
          }),
          ok: true,
        },
      ]);
      expect(calls).toContainEqual(['gh', ['issue', 'edit', '5', '--remove-assignee', 'someone']]);
    } finally {
      cleanupDir(dir);
    }
  });

  it('sends nothing when no claimed pool issue is stale', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-execute-fresh-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const exec = identityAndPoolListAndActivityExec(
        'octocat',
        'octocat',
        [{ number: 6, labels: ['pool: web'], assignees: ['someone'] }],
        { 6: { state: 'OPEN', assignee: 'someone', updatedAt: '2026-09-09T00:00:00Z' } },
      );

      const report = await createMirrorPassStaleClaimExecuteApi(dbPath, exec, now)('p1');

      expect(report?.skippedReason).toBeUndefined();
      expect(report?.outcomes).toEqual([]);
    } finally {
      cleanupDir(dir);
    }
  });

  it('defaults to the real CLI exec and Date.now when none is injected', () => {
    expect(() => createMirrorPassStaleClaimExecuteApi('/tmp/unused.db')).not.toThrow();
  });

  it('opens the store read-only — this reconcile never writes to the board itself', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-stale-claim-execute-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createMirrorPassStaleClaimExecuteApi(
        dbPath,
        identityAndPoolListAndActivityExec('octocat', 'octocat', [], {}),
        now,
      )('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});

/**
 * #40 (gabibi555): the reconcile's two unchecked claims, checked. A done
 * task with no shipped firing behind it, or a landing SHA the checkout no
 * longer has, gets ONE unverified note and stays open; the note is never
 * posted twice.
 */
describe('#40 — unverified claims are noted, never closed on', () => {
  function gitAwareExec(
    states: Readonly<Record<number, 'open' | 'closed'>>,
    opts: {
      shaExists?: boolean;
      comments?: readonly string[];
      login?: string;
      owner?: string;
    } = {},
    calls: Array<readonly string[]> = [],
  ): CliExec {
    return vi.fn(async (bin, args) => {
      calls.push([bin, ...args]);
      if (bin === 'git') return { code: opts.shaExists === false ? 1 : 0, stdout: '' };
      if (args[0] === 'api' && args[1] === 'user')
        return { code: 0, stdout: JSON.stringify({ login: opts.login ?? 'owner' }) };
      if (args[0] === 'repo' && args[1] === 'view') {
        return {
          code: 0,
          stdout: JSON.stringify({
            nameWithOwner: `${opts.owner ?? 'owner'}/x`,
            url: 'https://github.com/owner/x',
            isPrivate: false,
          }),
        };
      }
      if (args[0] === 'issue' && args[1] === 'view' && args[4] === 'comments') {
        return {
          code: 0,
          stdout: JSON.stringify({ comments: (opts.comments ?? []).map((body) => ({ body })) }),
        };
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        const number = Number(args[2]);
        const state = states[number];
        if (state === undefined) return { code: 1, stdout: '' };
        return { code: 0, stdout: JSON.stringify({ number, state: state.toUpperCase() }) };
      }
      return { code: 0, stdout: '' };
    });
  }

  function doneTask(dbPath: string, dir: string, shipped: boolean): void {
    const s = openStore(dbPath);
    migrate(s);
    project(s, 'p1', dir);
    createTask(s, { id: 'github-42', projectId: 'p1', title: 'Fix it', createdAt: 100 });
    setTaskStatus(s, 'github-42', 'done', 200);
    if (shipped) shipSha(s, 'p1', 'firing-1', 'github-42', 'abc1234');
    s.close();
  }

  it('a done task nobody shipped plans one note and no close', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-40-'));
    try {
      const dbPath = join(dir, 'a.db');
      doneTask(dbPath, dir, false);
      const plans = await createMirrorPassPreviewApi(dbPath, gitAwareExec({ 42: 'open' }))('p1');
      expect(plans?.[0]?.finding).toMatchObject({ action: 'note-unverified', issueNumber: 42 });
      expect(plans?.[0]?.commands.map((c) => c.args[1])).toEqual(['comment']);
    } finally {
      cleanupDir(dir);
    }
  });

  it('a shipped task whose landing commit vanished plans a note, asking git first', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-40-sha-'));
    try {
      const dbPath = join(dir, 'a.db');
      doneTask(dbPath, dir, true);
      const calls: Array<readonly string[]> = [];
      const plans = await createMirrorPassPreviewApi(
        dbPath,
        gitAwareExec({ 42: 'open' }, { shaExists: false }, calls),
      )('p1');
      expect(calls).toContainEqual(['git', '-C', dir, 'cat-file', '-e', 'abc1234^{commit}']);
      expect(plans?.[0]?.finding).toMatchObject({ action: 'note-unverified' });
      expect(plans?.[0]?.finding?.comment).toContain('abc1234 no longer exists');
    } finally {
      cleanupDir(dir);
    }
  });

  it('a shipped task whose commit exists still closes with its landing note', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-40-ok-'));
    try {
      const dbPath = join(dir, 'a.db');
      doneTask(dbPath, dir, true);
      const plans = await createMirrorPassPreviewApi(
        dbPath,
        gitAwareExec({ 42: 'open' }, { shaExists: true }),
      )('p1');
      expect(plans?.[0]?.finding).toMatchObject({
        action: 'close-with-landing-note',
        sha: 'abc1234',
      });
    } finally {
      cleanupDir(dir);
    }
  });

  it('an issue that already carries the unverified note gets nothing sent again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-40-noted-'));
    try {
      const dbPath = join(dir, 'a.db');
      doneTask(dbPath, dir, false);
      const calls: Array<readonly string[]> = [];
      const report = await createMirrorPassExecuteApi(
        dbPath,
        gitAwareExec(
          { 42: 'open' },
          { comments: ['Done on the AUTOPILOT board, but unverified: earlier note.'] },
          calls,
        ),
      )('p1');
      expect(report?.outcomes).toEqual([]);
      expect(calls.some((c) => c[1] === 'issue' && (c[2] === 'comment' || c[2] === 'close'))).toBe(
        false,
      );
    } finally {
      cleanupDir(dir);
    }
  });
});

/** Sets a task's priority band + pin state directly via raw SQL — the same
 *  "helper functions reach past the public mutate API for test setup" stance
 *  {@link project}/{@link shipSha} already take, since `@autopilot/store`
 *  exposes no "create a task at priority X" constructor. */
function setPriority(s: Store, taskId: string, priority: number | null, pinned: boolean): void {
  s.db
    .prepare('UPDATE tasks SET priority = ?, priority_pinned = ? WHERE id = ?')
    .run(priority, pinned ? 1 : 0, taskId);
}

describe('createMirrorPassPriorityFollowPreviewApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-priority-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      expect(
        await createMirrorPassPriorityFollowPreviewApi(dbPath, issueViewAndLabelsExec({}))('nope'),
      ).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it("plans a set-priority-from-label when the maintainer's live label outranks the board", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-priority-fires-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, { id: 'github-21', projectId: 'p1', title: 'Not yet steered', createdAt: 100 });
      s.close();

      const plans = await createMirrorPassPriorityFollowPreviewApi(
        dbPath,
        issueViewAndLabelsExec({ 21: { state: 'open', labels: ['priority: high'] } }),
      )('p1');

      expect(plans).toHaveLength(1);
      expect(plans?.[0]?.finding).toMatchObject({
        action: 'set-priority-from-label',
        taskId: 'github-21',
        issueNumber: 21,
        label: 'priority: high',
        priority: 100,
      });
      expect(plans?.[0]?.command).toMatchObject({ kind: 'set-task-priority', priority: 100 });
    } finally {
      cleanupDir(dir);
    }
  });

  it('finds nothing once the board already matches the label and is pinned', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-priority-synced-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, { id: 'github-22', projectId: 'p1', title: 'Already steered', createdAt: 100 });
      setPriority(s, 'github-22', 100, true);
      s.close();

      const plans = await createMirrorPassPriorityFollowPreviewApi(
        dbPath,
        issueViewAndLabelsExec({ 22: { state: 'open', labels: ['priority: high'] } }),
      )('p1');

      expect(plans?.[0]?.finding).toBeNull();
      expect(plans?.[0]?.command).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('never fetches labels for a task that already landed (done) — nothing left to steer', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-priority-done-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, { id: 'github-23', projectId: 'p1', title: 'Landed already', createdAt: 100 });
      setTaskStatus(s, 'github-23', 'done', 200);
      s.close();

      const exec = issueViewAndLabelsExec({ 23: { state: 'closed', labels: ['priority: high'] } });
      const plans = await createMirrorPassPriorityFollowPreviewApi(dbPath, exec)('p1');

      expect(plans?.[0]?.finding).toBeNull();
      // Read-only, and no labels fetch needed once a task has landed.
      expect(exec).toHaveBeenCalledTimes(1);
    } finally {
      cleanupDir(dir);
    }
  });

  it('opens the store read-only — a preview never writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-priority-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createMirrorPassPriorityFollowPreviewApi(dbPath, issueViewAndLabelsExec({}))('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});
