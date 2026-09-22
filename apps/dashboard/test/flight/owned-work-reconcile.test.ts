// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  fetchAssignedIssues,
  planOwnedWorkReconcile,
  reconcileOwnedWork,
  listOwnedWorkTasks,
  type OwnedWorkBoardTask,
} from '../../src/flight/owned-work-reconcile.js';
import { HUMAN_CLOSES_MARKER } from '../../src/flight/claim-contract.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function project(s: Store, id: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, '/tmp/' + id, 100, 100);
}

function tasks(
  s: Store,
  projectId: string,
): { id: string; body: string | null; focus: number; status: string }[] {
  return s.db
    .prepare('SELECT id, body, focus, status FROM tasks WHERE project_id = ? ORDER BY id')
    .all(projectId) as { id: string; body: string | null; focus: number; status: string }[];
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

function execFor(issues: unknown[], viewerLogin: string | undefined): CliExec {
  return vi.fn(async (_bin, args) => {
    if (args[0] === 'issue' && args[1] === 'list') {
      return { code: 0, stdout: JSON.stringify(issues) };
    }
    if (args[0] === 'api' && args[1] === 'user') {
      return viewerLogin === undefined
        ? { code: 1, stdout: '' }
        : { code: 0, stdout: JSON.stringify({ login: viewerLogin }) };
    }
    return { code: 0, stdout: '' };
  });
}

describe('fetchAssignedIssues', () => {
  it('parses gh issue list --assignee @me output', async () => {
    const exec = execFor(
      [{ number: 6, title: 'Fix the thing', url: 'https://github.com/example/repo/issues/6' }],
      'octocat',
    );
    const issues = await fetchAssignedIssues(exec);
    expect(issues).toEqual([
      { number: 6, title: 'Fix the thing', url: 'https://github.com/example/repo/issues/6' },
    ]);
  });

  it('returns [] on a non-zero exit', async () => {
    const exec: CliExec = vi.fn(async () => ({ code: 1, stdout: '' }));
    expect(await fetchAssignedIssues(exec)).toEqual([]);
  });

  it('returns [] on unparseable stdout', async () => {
    const exec: CliExec = vi.fn(async () => ({ code: 0, stdout: 'not json' }));
    expect(await fetchAssignedIssues(exec)).toEqual([]);
  });

  it('drops entries missing a required field', async () => {
    const exec = execFor(
      [
        { number: 6, title: 'Fix the thing', url: 'https://github.com/example/repo/issues/6' },
        { number: 7, title: 'Missing url' },
      ],
      'octocat',
    );
    const issues = await fetchAssignedIssues(exec);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.number).toBe(6);
  });
});

describe('planOwnedWorkReconcile', () => {
  const issue = {
    number: 6,
    title: 'Fix the thing',
    url: 'https://github.com/example/repo/issues/6',
  };

  it('upserts a contract-marked task for a newly-assigned issue', () => {
    const plan = planOwnedWorkReconcile([issue], [], 'octocat', 'p1', 100);
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0]).toMatchObject({ id: 'github-6', projectId: 'p1', source: 'github' });
    expect(plan.upserts[0]?.body).toContain(HUMAN_CLOSES_MARKER);
    expect(plan.upserts[0]?.body).toContain('octocat');
    expect(plan.refocus).toEqual([]);
    expect(plan.release).toEqual([]);
  });

  it('plans nothing on a repeat pass once the task exists and is focused', () => {
    const existing: OwnedWorkBoardTask[] = [
      { id: 'github-6', body: `x\n${HUMAN_CLOSES_MARKER}`, focus: 1, status: 'queued' },
    ];
    const plan = planOwnedWorkReconcile([issue], existing, 'octocat', 'p1', 200);
    expect(plan).toEqual({ upserts: [], refocus: [], release: [] });
  });

  it('refocuses an existing task for a still-assigned issue that lost focus', () => {
    const existing: OwnedWorkBoardTask[] = [
      { id: 'github-6', body: `x\n${HUMAN_CLOSES_MARKER}`, focus: 0, status: 'queued' },
    ];
    const plan = planOwnedWorkReconcile([issue], existing, 'octocat', 'p1', 200);
    expect(plan.upserts).toEqual([]);
    expect(plan.refocus).toEqual(['github-6']);
    expect(plan.release).toEqual([]);
  });

  it('never refocuses a done or deferred task', () => {
    const existing: OwnedWorkBoardTask[] = [
      { id: 'github-6', body: `x\n${HUMAN_CLOSES_MARKER}`, focus: 0, status: 'done' },
    ];
    const plan = planOwnedWorkReconcile([issue], existing, 'octocat', 'p1', 200);
    expect(plan.refocus).toEqual([]);
  });

  it('releases (un-focuses) a contract-marked task GitHub no longer says is assigned', () => {
    const existing: OwnedWorkBoardTask[] = [
      { id: 'github-6', body: `x\n${HUMAN_CLOSES_MARKER}`, focus: 1, status: 'queued' },
    ];
    const plan = planOwnedWorkReconcile([], existing, 'octocat', 'p1', 200);
    expect(plan.upserts).toEqual([]);
    expect(plan.refocus).toEqual([]);
    expect(plan.release).toEqual(['github-6']);
  });

  it('never releases a focused task with no claim contract marker', () => {
    const existing: OwnedWorkBoardTask[] = [
      { id: 'github-6', body: 'ordinary task, no marker', focus: 1, status: 'queued' },
    ];
    const plan = planOwnedWorkReconcile([], existing, 'octocat', 'p1', 200);
    expect(plan.release).toEqual([]);
  });

  it('never releases a task whose id is not a github issue task id', () => {
    const existing: OwnedWorkBoardTask[] = [
      { id: 'self-1', body: `x\n${HUMAN_CLOSES_MARKER}`, focus: 1, status: 'queued' },
    ];
    const plan = planOwnedWorkReconcile([], existing, 'octocat', 'p1', 200);
    expect(plan.release).toEqual([]);
  });
});

describe('listOwnedWorkTasks', () => {
  it('returns [] for an empty board', () => {
    expect(listOwnedWorkTasks([])).toEqual([]);
  });

  it('includes a contract-marked, focused task', () => {
    const owned: OwnedWorkBoardTask = {
      id: 'github-6',
      body: `x\n${HUMAN_CLOSES_MARKER}`,
      focus: 1,
      status: 'queued',
    };
    expect(listOwnedWorkTasks([owned])).toEqual([owned]);
  });

  it('excludes a released (un-focused) contract-marked task', () => {
    const released: OwnedWorkBoardTask = {
      id: 'github-6',
      body: `x\n${HUMAN_CLOSES_MARKER}`,
      focus: 0,
      status: 'queued',
    };
    expect(listOwnedWorkTasks([released])).toEqual([]);
  });

  it('excludes a focused task with no claim contract marker', () => {
    const ordinary: OwnedWorkBoardTask = {
      id: 'self-1',
      body: 'ordinary task, no marker',
      focus: 1,
      status: 'queued',
    };
    expect(listOwnedWorkTasks([ordinary])).toEqual([]);
  });

  it('filters a mixed board down to only the owned tasks', () => {
    const owned: OwnedWorkBoardTask = {
      id: 'github-6',
      body: `x\n${HUMAN_CLOSES_MARKER}`,
      focus: 1,
      status: 'queued',
    };
    const released: OwnedWorkBoardTask = {
      id: 'github-7',
      body: `x\n${HUMAN_CLOSES_MARKER}`,
      focus: 0,
      status: 'queued',
    };
    const ordinary: OwnedWorkBoardTask = {
      id: 'self-1',
      body: 'ordinary task, no marker',
      focus: 1,
      status: 'queued',
    };
    expect(listOwnedWorkTasks([owned, released, ordinary])).toEqual([owned]);
  });
});

describe('reconcileOwnedWork', () => {
  it('creates and focuses a board task for a newly-assigned issue', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-owned-work-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');

      const exec = execFor(
        [{ number: 6, title: 'Fix the thing', url: 'https://github.com/example/repo/issues/6' }],
        'octocat',
      );

      const result = await reconcileOwnedWork(exec, s, 'p1', [], () => 100);

      expect(result.created).toBe(1);
      const rows = tasks(s, 'p1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: 'github-6', focus: 1 });
      expect(rows[0]?.body).toContain(HUMAN_CLOSES_MARKER);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('changes nothing on a second pass over the same assignment', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-owned-work-repeat-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');

      const exec = execFor(
        [{ number: 6, title: 'Fix the thing', url: 'https://github.com/example/repo/issues/6' }],
        'octocat',
      );

      await reconcileOwnedWork(exec, s, 'p1', [], () => 100);
      const existing = tasks(s, 'p1').map((t) => ({ ...t }));
      const second = await reconcileOwnedWork(exec, s, 'p1', existing, () => 200);

      expect(second.created).toBe(0);
      expect(second.focused).toBe(0);
      expect(second.released).toBe(0);
      expect(tasks(s, 'p1')).toHaveLength(1);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('un-focuses the task once GitHub no longer says the issue is assigned', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-owned-work-release-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');

      const claimExec = execFor(
        [{ number: 6, title: 'Fix the thing', url: 'https://github.com/example/repo/issues/6' }],
        'octocat',
      );
      await reconcileOwnedWork(claimExec, s, 'p1', [], () => 100);
      const existing = tasks(s, 'p1').map((t) => ({ ...t }));
      expect(existing[0]?.focus).toBe(1);

      const unclaimExec = execFor([], 'octocat');
      const result = await reconcileOwnedWork(unclaimExec, s, 'p1', existing, () => 200);

      expect(result.released).toBe(1);
      const rows = tasks(s, 'p1');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.focus).toBe(0);
      expect(rows[0]?.body).toContain(HUMAN_CLOSES_MARKER);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('posts exactly one pickup comment when a task is newly created', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-owned-work-comment-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');

      const exec = execFor(
        [{ number: 6, title: 'Fix the thing', url: 'https://github.com/example/repo/issues/6' }],
        'octocat',
      );

      const result = await reconcileOwnedWork(exec, s, 'p1', [], () => 100);

      expect(result.commented).toBe(1);
      expect(exec).toHaveBeenCalledWith('gh', [
        'issue',
        'comment',
        '6',
        '--body',
        expect.stringContaining('octocat'),
      ]);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('does not repost the pickup comment on a second pass over the same assignment', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-owned-work-comment-repeat-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');

      const exec = execFor(
        [{ number: 6, title: 'Fix the thing', url: 'https://github.com/example/repo/issues/6' }],
        'octocat',
      );

      await reconcileOwnedWork(exec, s, 'p1', [], () => 100);
      const existing = tasks(s, 'p1').map((t) => ({ ...t }));
      const second = await reconcileOwnedWork(exec, s, 'p1', existing, () => 200);

      expect(second.commented).toBe(0);
      const commentCalls = vi
        .mocked(exec)
        .mock.calls.filter(([, args]) => args[0] === 'issue' && args[1] === 'comment');
      expect(commentCalls).toHaveLength(1);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('does not post a pickup comment when only refocusing an existing task', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-owned-work-comment-refocus-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');

      const exec = execFor(
        [{ number: 6, title: 'Fix the thing', url: 'https://github.com/example/repo/issues/6' }],
        'octocat',
      );
      await reconcileOwnedWork(exec, s, 'p1', [], () => 100);

      // The task lost focus some other way (e.g. a KEEPER pass) but GitHub
      // still says the issue is assigned — this is a refocus, not a new pickup.
      s.db.prepare('UPDATE tasks SET focus = 0 WHERE id = ?').run('github-6');
      const existing = tasks(s, 'p1').map((t) => ({ ...t }));
      expect(existing[0]?.focus).toBe(0);

      const result = await reconcileOwnedWork(exec, s, 'p1', existing, () => 200);

      expect(result.focused).toBe(1);
      expect(result.commented).toBe(0);
      const commentCalls = vi
        .mocked(exec)
        .mock.calls.filter(([, args]) => args[0] === 'issue' && args[1] === 'comment');
      expect(commentCalls).toHaveLength(1);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('plans and writes nothing when the viewer login cannot be resolved', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-owned-work-noauth-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');

      const exec = execFor(
        [{ number: 6, title: 'Fix the thing', url: 'https://github.com/example/repo/issues/6' }],
        undefined,
      );

      const result = await reconcileOwnedWork(exec, s, 'p1', [], () => 100);

      expect(result.created).toBe(0);
      expect(tasks(s, 'p1')).toHaveLength(0);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });
});
