// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * POST-PUSH VERDICT RITUAL, slice 1 (board web-mtpbmay4-94ii65): the pure
 * green/red decision plus the best-effort evidence-task filing, exercised
 * against a real temp SQLite store the same way `board-triage.test.ts` does.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, recentTasks, type Store } from '@autopilot/store';
import type { WorkflowRunStatus } from '../../src/control/ci-status.js';
import {
  ciRemediationMode,
  closeSupersededCiRedTasks,
  decidePostPushVerdict,
  filePostPushVerdictTask,
  holdSupersededCiRedTasks,
  retireHeldCiRedTasks,
  shouldSpawnRemediationFlight,
  type PostPushVerdictContext,
} from '../../src/control/post-push-verdict.js';

const NOW = Date.parse('2026-09-07T12:00:00Z');

function greenStatus(workflow = 'ci.yml'): WorkflowRunStatus {
  return {
    workflow,
    conclusion: 'success',
    ageLabel: '1m ago',
    createdAtMs: NOW,
    runId: null,
    ok: true,
    detail: 'success (1m ago)',
  };
}

function redStatus(workflow = 'ci.yml'): WorkflowRunStatus {
  return {
    workflow,
    conclusion: 'failure',
    ageLabel: '1m ago',
    createdAtMs: NOW,
    runId: null,
    ok: false,
    detail: 'failure (1m ago)',
  };
}

const CONTEXT: PostPushVerdictContext = {
  projectId: 'proj-1',
  branch: 'main',
  sha: 'abcdef1234567890',
};

describe('decidePostPushVerdict', () => {
  it('records a green conclusion without filing a task', () => {
    const verdict = decidePostPushVerdict(greenStatus(), CONTEXT, NOW);
    expect(verdict).toEqual({ kind: 'recorded', workflow: 'ci.yml', detail: 'success (1m ago)' });
  });

  it('records a still-running conclusion (ok: true) the same as a green one', () => {
    const running: WorkflowRunStatus = {
      workflow: 'ci.yml',
      conclusion: null,
      ageLabel: '30s ago',
      createdAtMs: NOW,
      runId: null,
      ok: true,
      detail: 'in_progress (30s ago)',
    };
    expect(decidePostPushVerdict(running, CONTEXT, NOW).kind).toBe('recorded');
  });

  it('builds a high-severity remediation task for a red conclusion', () => {
    const verdict = decidePostPushVerdict(redStatus(), CONTEXT, NOW);
    expect(verdict.kind).toBe('remediate');
    if (verdict.kind !== 'remediate') throw new Error('unreachable');
    expect(verdict.branch).toBe('main');
    expect(verdict.task.projectId).toBe('proj-1');
    expect(verdict.task.severity).toBe('high');
    expect(verdict.task.dimension).toBeUndefined();
    expect(verdict.task.source).toBe('self');
    expect(verdict.task.title).toContain('CI RED after landing main →');
    expect(verdict.task.title).toContain('abcdef1');
    expect(verdict.task.title).toContain('ci.yml');
    expect(verdict.task.body).toContain('abcdef1');
  });

  it('truncates a very long detail so the title never exceeds 300 characters', () => {
    const longDetail = 'x'.repeat(500);
    const status: WorkflowRunStatus = {
      workflow: 'ci.yml',
      conclusion: 'failure',
      ageLabel: null,
      createdAtMs: null,
      runId: null,
      ok: false,
      detail: longDetail,
    };
    const verdict = decidePostPushVerdict(status, CONTEXT, NOW);
    if (verdict.kind !== 'remediate') throw new Error('unreachable');
    expect(verdict.task.title.length).toBeLessThanOrEqual(300);
  });
});

describe('filePostPushVerdictTask', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-post-push-verdict-'));
    store = openStore(join(dir, 'store.db'));
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'registered', NULL, ?, ?)`,
      )
      .run('proj-1', 'proj-1', 'proj-1', dir, NOW, NOW);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is a no-op for a recorded (green) verdict', () => {
    const verdict = decidePostPushVerdict(greenStatus(), CONTEXT, NOW);
    expect(filePostPushVerdictTask(store, verdict)).toBe(false);
    expect(recentTasks(store.db, 'proj-1', 10)).toHaveLength(0);
  });

  it('files an evidence task for a remediate (red) verdict', () => {
    const verdict = decidePostPushVerdict(redStatus(), CONTEXT, NOW);
    expect(filePostPushVerdictTask(store, verdict)).toBe(true);
    const tasks = recentTasks(store.db, 'proj-1', 10);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toContain('CI RED after landing main →');
    expect(tasks[0]?.severity).toBe('high');
  });

  it('dedups: a second red verdict for the same branch while one is still open files nothing new', () => {
    const first = decidePostPushVerdict(redStatus(), CONTEXT, NOW);
    const second = decidePostPushVerdict(redStatus(), CONTEXT, NOW + 60_000);
    expect(filePostPushVerdictTask(store, first)).toBe(true);
    expect(filePostPushVerdictTask(store, second)).toBe(false);
    expect(recentTasks(store.db, 'proj-1', 10)).toHaveLength(1);
  });

  it('does not dedup across different branches', () => {
    const onMain = decidePostPushVerdict(redStatus(), CONTEXT, NOW);
    const onOther = decidePostPushVerdict(
      redStatus(),
      { ...CONTEXT, branch: 'release/1.0' },
      NOW + 60_000,
    );
    expect(filePostPushVerdictTask(store, onMain)).toBe(true);
    expect(filePostPushVerdictTask(store, onOther)).toBe(true);
    expect(recentTasks(store.db, 'proj-1', 10)).toHaveLength(2);
  });
});

describe('closeSupersededCiRedTasks', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-post-push-close-'));
    store = openStore(join(dir, 'store.db'));
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'registered', NULL, ?, ?)`,
      )
      .run('proj-1', 'proj-1', 'proj-1', dir, NOW, NOW);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function fileRed(branch = 'main'): string {
    const verdict = decidePostPushVerdict(redStatus(), { ...CONTEXT, branch }, NOW);
    if (verdict.kind !== 'remediate') throw new Error('unreachable');
    expect(filePostPushVerdictTask(store, verdict)).toBe(true);
    return verdict.task.id;
  }

  function statusOf(id: string): string | undefined {
    return (
      store.db.prepare('SELECT status FROM tasks WHERE id = ?').get(id) as
        { status: string } | undefined
    )?.status;
  }

  function green(createdAtMs: number | null, conclusion = 'success'): WorkflowRunStatus {
    return { ...greenStatus(), conclusion, createdAtMs };
  }

  it('closes the open CI RED task once a later landing on the same branch runs green (2026-09-30)', () => {
    // ap-muno081m-ci-red: eb525b6's red sat on top of the board for ten
    // hours through four green landings, because nothing ever closed it.
    const id = fileRed();
    expect(
      closeSupersededCiRedTasks(store, 'proj-1', 'main', green(NOW + 60_000), NOW + 90_000),
    ).toBe(1);
    expect(statusOf(id)).toBe('done');
  });

  it('leaves the red open when the green run started before the red was filed', () => {
    // An earlier landing's run concluding late says nothing about a later
    // commit's red.
    const id = fileRed();
    expect(
      closeSupersededCiRedTasks(store, 'proj-1', 'main', green(NOW - 60_000), NOW + 90_000),
    ).toBe(0);
    expect(statusOf(id)).not.toBe('done');
  });

  it('closes nothing on a run with no readable creation time', () => {
    const id = fileRed();
    expect(closeSupersededCiRedTasks(store, 'proj-1', 'main', green(null), NOW + 90_000)).toBe(0);
    expect(statusOf(id)).not.toBe('done');
  });

  it('closes nothing on a skipped or neutral run — only a success proves the red is gone', () => {
    const id = fileRed();
    for (const conclusion of ['skipped', 'neutral']) {
      expect(
        closeSupersededCiRedTasks(store, 'proj-1', 'main', green(NOW + 60_000, conclusion), NOW),
      ).toBe(0);
    }
    expect(statusOf(id)).not.toBe('done');
  });

  it("leaves another branch's red alone", () => {
    const id = fileRed('release/1.0');
    expect(closeSupersededCiRedTasks(store, 'proj-1', 'main', green(NOW + 60_000), NOW)).toBe(0);
    expect(statusOf(id)).not.toBe('done');
  });

  it('matches the branch literally — an underscore in its name is no wildcard', () => {
    const id = fileRed('releaseX1');
    expect(closeSupersededCiRedTasks(store, 'proj-1', 'release_1', green(NOW + 60_000), NOW)).toBe(
      0,
    );
    expect(statusOf(id)).not.toBe('done');
  });

  it("leaves a red alone when the green run is another workflow's", () => {
    const id = fileRed();
    const otherGreen = { ...green(NOW + 60_000), workflow: 'codeql.yml' };
    expect(closeSupersededCiRedTasks(store, 'proj-1', 'main', otherGreen, NOW)).toBe(0);
    expect(statusOf(id)).not.toBe('done');
  });

  it('closes a red the next landing HELD, the same as a workable one (2026-10-01)', () => {
    const id = fileRed();
    expect(
      holdSupersededCiRedTasks(store, 'proj-1', 'main', 'fedcba9876543210', NOW + 10_000),
    ).toBe(1);
    expect(statusOf(id)).toBe('deferred');
    expect(
      closeSupersededCiRedTasks(store, 'proj-1', 'main', green(NOW + 60_000), NOW + 90_000),
    ).toBe(1);
    expect(statusOf(id)).toBe('done');
  });
});

describe('holdSupersededCiRedTasks / retireHeldCiRedTasks (2026-10-01)', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-post-push-hold-'));
    store = openStore(join(dir, 'store.db'));
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'registered', NULL, ?, ?)`,
      )
      .run('proj-1', 'proj-1', 'proj-1', dir, NOW, NOW);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** Files the red for `sha`; `at` keeps two filings in one test from
   *  minting the same `ap-<time>-ci-red` id. */
  function fileRed(sha: string, branch = 'main', at = NOW): string {
    const verdict = decidePostPushVerdict(redStatus(), { ...CONTEXT, branch, sha }, at);
    if (verdict.kind !== 'remediate') throw new Error('unreachable');
    expect(filePostPushVerdictTask(store, verdict)).toBe(true);
    return verdict.task.id;
  }

  function rowOf(id: string): { status: string; body: string | null } {
    return store.db.prepare('SELECT status, body FROM tasks WHERE id = ?').get(id) as {
      status: string;
      body: string | null;
    };
  }

  it('defers the workable red an earlier landing filed, with the reason on its body', () => {
    // Round 52, fleet-4: 022a827's red was claimed two minutes after
    // 220199f8 was pushed and refuted twice, while 220199f8's own run was
    // on its way to closing it.
    const id = fileRed('022a827f0000000');
    expect(holdSupersededCiRedTasks(store, 'proj-1', 'main', '220199f8aaaaaaa', NOW + 5)).toBe(1);
    const row = rowOf(id);
    expect(row.status).toBe('deferred');
    expect(row.body).toContain('Held: landing 220199f onto main was pushed after this red');
    expect(row.body).toContain('green closes this task, red files a fresh one');
  });

  it('holds an in-progress red too — a lane mid-refutation does not get to pick it again', () => {
    const id = fileRed('022a827f0000000');
    store.db.prepare("UPDATE tasks SET status = 'in_progress' WHERE id = ?").run(id);
    expect(holdSupersededCiRedTasks(store, 'proj-1', 'main', '220199f8aaaaaaa', NOW + 5)).toBe(1);
    expect(rowOf(id).status).toBe('deferred');
  });

  it("leaves the red that names this very landing alone — it IS this landing's verdict", () => {
    const id = fileRed('220199f8aaaaaaa');
    expect(holdSupersededCiRedTasks(store, 'proj-1', 'main', '220199f8aaaaaaa', NOW + 5)).toBe(0);
    expect(rowOf(id).status).toBe('queued');
  });

  it("leaves another branch's red alone and holds nothing twice", () => {
    const other = fileRed('022a827f0000000', 'release/1.0');
    const id = fileRed('022a827f0000000', 'main', NOW + 1);
    expect(holdSupersededCiRedTasks(store, 'proj-1', 'main', '220199f8aaaaaaa', NOW + 5)).toBe(1);
    expect(rowOf(other).status).toBe('queued');
    // A resumed watch (the dashboard restarts right after a landing) holds
    // again: nothing is workable any more, and the note is not appended twice.
    expect(holdSupersededCiRedTasks(store, 'proj-1', 'main', '220199f8aaaaaaa', NOW + 9)).toBe(0);
    expect(rowOf(id).body?.match(/Held: landing/g)).toHaveLength(1);
  });

  it('a red conclusion retires the held reds — the fresh task is the live evidence', () => {
    const old = fileRed('022a827f0000000');
    expect(holdSupersededCiRedTasks(store, 'proj-1', 'main', '220199f8aaaaaaa', NOW + 5)).toBe(1);
    const fresh = fileRed('220199f8aaaaaaa', 'main', NOW + 6);
    expect(retireHeldCiRedTasks(store, 'proj-1', 'main', '220199f8aaaaaaa', NOW + 10)).toBe(1);
    expect(rowOf(old).status).toBe('done');
    expect(rowOf(fresh).status).toBe('queued');
  });

  it('retires only held (deferred) reds of this branch, never a workable one', () => {
    const workable = fileRed('022a827f0000000');
    const other = fileRed('022a827f0000000', 'release/1.0', NOW + 1);
    store.db.prepare("UPDATE tasks SET status = 'deferred' WHERE id = ?").run(other);
    expect(retireHeldCiRedTasks(store, 'proj-1', 'main', '220199f8aaaaaaa', NOW + 10)).toBe(0);
    expect(rowOf(workable).status).toBe('queued');
    expect(rowOf(other).status).toBe('deferred');
  });

  it('never throws when the store cannot be read', () => {
    store.close();
    expect(holdSupersededCiRedTasks(store, 'proj-1', 'main', '220199f8aaaaaaa', NOW)).toBe(0);
    expect(retireHeldCiRedTasks(store, 'proj-1', 'main', '220199f8aaaaaaa', NOW)).toBe(0);
    store = openStore(join(dir, 'store.db'));
  });
});

describe('ciRemediationMode', () => {
  it('defaults to board when unset', () => {
    expect(ciRemediationMode({})).toBe('board');
  });

  it('reads fly only from an exact match', () => {
    expect(ciRemediationMode({ AUTOPILOT_CI_REMEDIATION: 'fly' })).toBe('fly');
  });

  it('falls back to board on any other value — fail closed against a typo', () => {
    expect(ciRemediationMode({ AUTOPILOT_CI_REMEDIATION: 'Fly' })).toBe('board');
    expect(ciRemediationMode({ AUTOPILOT_CI_REMEDIATION: 'FLY' })).toBe('board');
    expect(ciRemediationMode({ AUTOPILOT_CI_REMEDIATION: 'yes' })).toBe('board');
    expect(ciRemediationMode({ AUTOPILOT_CI_REMEDIATION: '' })).toBe('board');
  });
});

describe('shouldSpawnRemediationFlight', () => {
  it('never spawns in board mode, even with a fresh task and an idle folder', () => {
    expect(shouldSpawnRemediationFlight('board', true, 'registered')).toBe(false);
    expect(shouldSpawnRemediationFlight('board', true, null)).toBe(false);
  });

  it('never spawns when nothing new was filed (dedup no-op — nothing to fix)', () => {
    expect(shouldSpawnRemediationFlight('fly', false, 'registered')).toBe(false);
    expect(shouldSpawnRemediationFlight('fly', false, null)).toBe(false);
  });

  it('never spawns while the folder is already flying — a live flight owns it', () => {
    expect(shouldSpawnRemediationFlight('fly', true, 'flying')).toBe(false);
  });

  it('never spawns over an explicit operator pause', () => {
    expect(shouldSpawnRemediationFlight('fly', true, 'paused')).toBe(false);
  });

  it('spawns in fly mode when a new task was filed and the folder is idle', () => {
    expect(shouldSpawnRemediationFlight('fly', true, 'registered')).toBe(true);
    expect(shouldSpawnRemediationFlight('fly', true, null)).toBe(true);
  });
});
