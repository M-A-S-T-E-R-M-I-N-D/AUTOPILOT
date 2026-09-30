// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * POST-PUSH VERDICT RITUAL, slice 2 (board web-mtpbmay4-94ii65): the polling
 * primitive slice 1's docstring deferred. Exercised with an injected fake
 * clock/sleep so the whole suite runs instantly — no real wall-clock wait,
 * no fake-timer flakiness.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, recentTasks, createTask, type Store } from '@autopilot/store';
import type { WorkflowRunStatus } from '../../src/control/ci-status.js';
import type { PostPushVerdictContext } from '../../src/control/post-push-verdict.js';
import {
  watchPostPushCi,
  isRunFor,
  createPostPushWatchTrigger,
  DEFAULT_POST_PUSH_WATCH_OPTIONS,
  resumeUnfinishedWatches,
  unfinishedWatches,
} from '../../src/control/post-push-watch.js';

/** `tasks.project_id` is a real FK against `projects(id)` (enforced —
 *  `db.ts` turns `foreign_keys` ON) — filing a task for a project row that
 *  doesn't exist throws, which `filePostPushVerdictTask`'s own try/catch
 *  swallows into a silent `false`. A test asserting a task WAS filed must
 *  seed this row first, same as `post-push-verdict.test.ts` does. */
function project(s: Store, id: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'registered', NULL, ?, ?)`,
    )
    .run(id, id, id, '/repo', 100, 100);
}

/** Same best-effort Windows-EBUSY-tolerant cleanup `execute.test.ts` uses. */
function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    /* OS will reclaim %TEMP% eventually */
  }
}

const NOW = Date.parse('2026-09-07T12:00:00Z');

const CONTEXT: PostPushVerdictContext = {
  projectId: 'proj-1',
  branch: 'main',
  sha: 'abcdef1234567890',
};

function runningStatus(workflow = 'ci.yml'): WorkflowRunStatus {
  return {
    workflow,
    conclusion: null,
    ageLabel: '10s ago',
    createdAtMs: NOW,
    runId: null,
    ok: true,
    detail: 'in_progress (10s ago)',
  };
}

function concludedStatus(
  conclusion: 'success' | 'failure',
  workflow = 'ci.yml',
): WorkflowRunStatus {
  return {
    workflow,
    conclusion,
    ageLabel: '1m ago',
    createdAtMs: NOW,
    runId: null,
    ok: conclusion === 'success',
    detail: `${conclusion} (1m ago)`,
  };
}

/** A manually-advanced clock: `sleep` fast-forwards `now()` by the requested
 *  amount instead of actually waiting, so the loop under test resolves in
 *  real time while `now()` still reports the elapsed virtual time it relies
 *  on to notice its own deadline. */
function fakeClock(startMs: number) {
  let t = startMs;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('watchPostPushCi', () => {
  it("keeps polling past the PREVIOUS commit's concluded run until its own run concludes", async () => {
    // 2026-09-24: the prior commit's red run was still the latest one listed
    // right after the push, and was read as this landing's verdict
    const clock = fakeClock(NOW);
    const own = CONTEXT.sha;
    const checkStatus = vi
      .fn()
      .mockResolvedValueOnce({ ...concludedStatus('failure'), headSha: 'f00dfeedbeef' })
      .mockResolvedValueOnce({ ...runningStatus(), headSha: own })
      .mockResolvedValueOnce({ ...concludedStatus('success'), headSha: own });
    const outcome = await watchPostPushCi(
      CONTEXT,
      checkStatus,
      { pollIntervalMs: 1000, timeoutMs: 10_000 },
      clock.sleep,
      clock.now,
    );
    expect(outcome).toMatchObject({ kind: 'concluded', verdict: { kind: 'recorded' } });
    expect(checkStatus).toHaveBeenCalledTimes(3);
  });

  it("times out rather than judging by another commit's run", async () => {
    const clock = fakeClock(NOW);
    const checkStatus = vi
      .fn()
      .mockResolvedValue({ ...concludedStatus('failure'), headSha: 'f00dfeedbeef' });
    const outcome = await watchPostPushCi(
      CONTEXT,
      checkStatus,
      { pollIntervalMs: 1000, timeoutMs: 3000 },
      clock.sleep,
      clock.now,
    );
    expect(outcome).toEqual({ kind: 'timed-out', workflow: 'ci.yml' });
  });

  it('returns concluded on the very first check when CI already finished green', async () => {
    const clock = fakeClock(NOW);
    const checkStatus = vi.fn().mockResolvedValue(concludedStatus('success'));
    const outcome = await watchPostPushCi(
      CONTEXT,
      checkStatus,
      { pollIntervalMs: 1000, timeoutMs: 5000 },
      clock.sleep,
      clock.now,
    );
    expect(outcome).toEqual({
      kind: 'concluded',
      verdict: { kind: 'recorded', workflow: 'ci.yml', detail: 'success (1m ago)' },
      status: concludedStatus('success'),
    });
    expect(checkStatus).toHaveBeenCalledTimes(1);
  });

  it('polls through in-progress checks and returns a remediate verdict once CI concludes red', async () => {
    const clock = fakeClock(NOW);
    const checkStatus = vi
      .fn()
      .mockResolvedValueOnce(runningStatus())
      .mockResolvedValueOnce(runningStatus())
      .mockResolvedValueOnce(concludedStatus('failure'));
    const outcome = await watchPostPushCi(
      CONTEXT,
      checkStatus,
      { pollIntervalMs: 1000, timeoutMs: 10_000 },
      clock.sleep,
      clock.now,
    );
    expect(outcome.kind).toBe('concluded');
    if (outcome.kind !== 'concluded') throw new Error('unreachable');
    expect(outcome.verdict.kind).toBe('remediate');
    expect(checkStatus).toHaveBeenCalledTimes(3);
  });

  it('gives up and reports timed-out when CI never concludes before the deadline', async () => {
    const clock = fakeClock(NOW);
    const checkStatus = vi.fn().mockResolvedValue(runningStatus());
    const outcome = await watchPostPushCi(
      CONTEXT,
      checkStatus,
      { pollIntervalMs: 1000, timeoutMs: 3000 },
      clock.sleep,
      clock.now,
    );
    expect(outcome).toEqual({ kind: 'timed-out', workflow: 'ci.yml' });
    // deadline = NOW+3000ms; checks land at virtual t=0,1000,2000,3000 (last
    // one sees the deadline reached and stops without sleeping again).
    expect(checkStatus).toHaveBeenCalledTimes(4);
  });

  it('exposes sane production defaults: poll every 30s, give up after 45 minutes (2026-09-27)', () => {
    // 20 minutes timed out a third of landings: main's ci.yml runs took 12
    // to 21 minutes, and a timed-out watch decided nothing.
    expect(DEFAULT_POST_PUSH_WATCH_OPTIONS).toEqual({
      pollIntervalMs: 30_000,
      timeoutMs: 45 * 60_000,
    });
  });
});

describe('createPostPushWatchTrigger (slice 3 — starting a watch from a real green land)', () => {
  /** A `run` factory whose `gh run list` already reports a CONCLUDED run —
   *  `watchPostPushCi` resolves on its very first `checkStatus()` call, so
   *  these tests need no fake clock/sleep and no real poll wait. */
  function ghRunReporting(conclusion: 'success' | 'failure') {
    return () => (args: readonly string[]) => {
      expect(args).toContain('run');
      return JSON.stringify([
        { status: 'completed', conclusion, createdAt: new Date().toISOString() },
      ]);
    };
  }

  it('files a CI RED evidence task when the watched run concludes red', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-red-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      s.close();

      const trigger = createPostPushWatchTrigger(dbPath, ghRunReporting('failure'));
      trigger('p1', '/repo', 'main', 'abc1234');

      await vi.waitFor(() => {
        const s2 = openStore(dbPath);
        const tasks = recentTasks(s2.db, 'p1', 10);
        s2.close();
        expect(tasks.some((t) => t.title.startsWith('CI RED after landing main → abc1234'))).toBe(
          true,
        );
      });
    } finally {
      cleanupDir(dir);
    }
  });

  it('files no task when the watched run concludes green', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-green-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      s.close();

      const trigger = createPostPushWatchTrigger(dbPath, ghRunReporting('success'));
      trigger('p1', '/repo', 'main', 'abc1234');

      // Give the fire-and-forget watch's microtasks a beat to run, then
      // confirm nothing was filed — there is no positive signal to
      // vi.waitFor on for an intentional absence.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const s2 = openStore(dbPath);
      const tasks = recentTasks(s2.db, 'p1', 10);
      s2.close();
      expect(tasks).toHaveLength(0);
    } finally {
      cleanupDir(dir);
    }
  });

  it('closes the CI RED task an earlier landing filed once this landing runs green (2026-09-30)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-heal-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      createTask(s, {
        id: 'ap-old-ci-red',
        projectId: 'p1',
        title: 'CI RED after landing main → eb525b6: ci.yml — failure (23m ago)',
        severity: 'high',
        source: 'self',
        createdAt: Date.now() - 60 * 60_000,
      });
      s.close();

      createPostPushWatchTrigger(dbPath, ghRunReporting('success'))(
        'p1',
        '/repo',
        'main',
        'abc1234',
      );

      await vi.waitFor(() => {
        const s2 = openStore(dbPath);
        const row = s2.db.prepare("SELECT status FROM tasks WHERE id = 'ap-old-ci-red'").get() as {
          status: string;
        };
        s2.close();
        expect(row.status).toBe('done');
      });
    } finally {
      cleanupDir(dir);
    }
  });

  it('leaves a post-push-watch record of what it saw, green or red (2026-09-27)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-record-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      s.close();

      createPostPushWatchTrigger(dbPath, ghRunReporting('success'))(
        'p1',
        '/repo',
        'main',
        'abc1234',
      );

      await vi.waitFor(() => {
        const s2 = openStore(dbPath);
        const rows = s2.db
          .prepare("SELECT payload FROM events WHERE type = 'post-push-watch'")
          .all() as { payload: string }[];
        s2.close();
        expect(rows.map((r) => JSON.parse(r.payload) as unknown)).toEqual([
          { sha: 'abc1234', outcome: 'concluded', verdict: 'recorded' },
        ]);
      });
    } finally {
      cleanupDir(dir);
    }
  });

  it('builds its GhRun against the given rootPath', () => {
    const run = vi.fn(ghRunReporting('success'));
    const trigger = createPostPushWatchTrigger(join(tmpdir(), 'unused.db'), run);
    trigger('p1', '/my/repo', 'main', 'abc1234');
    expect(run).toHaveBeenCalledWith('/my/repo');
  });

  it('never throws or leaves an unhandled rejection when opening the store fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-badstore-'));
    try {
      // A directory, not a real sqlite file — openStore throws opening it.
      const badDbPath = join(dir, 'not-a-db');
      mkdirSync(badDbPath);

      const trigger = createPostPushWatchTrigger(badDbPath, ghRunReporting('failure'));
      expect(() => trigger('p1', '/repo', 'main', 'abc1234')).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('createPostPushWatchTrigger — fly escalation mode (board web-mtpbmazh-3en467)', () => {
  function ghRunReporting(conclusion: 'success' | 'failure') {
    return () => (args: readonly string[]) => {
      expect(args).toContain('run');
      return JSON.stringify([
        { status: 'completed', conclusion, createdAt: new Date().toISOString() },
      ]);
    };
  }

  const ORIGINAL_ENV = process.env['AUTOPILOT_CI_REMEDIATION'];
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env['AUTOPILOT_CI_REMEDIATION'];
    else process.env['AUTOPILOT_CI_REMEDIATION'] = ORIGINAL_ENV;
  });

  it('spawns a single-lane firing scoped to the filed task when AUTOPILOT_CI_REMEDIATION=fly and the folder is idle', async () => {
    process.env['AUTOPILOT_CI_REMEDIATION'] = 'fly';
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-fly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      s.close();

      const spawnFlight = vi.fn();
      const trigger = createPostPushWatchTrigger(dbPath, ghRunReporting('failure'), spawnFlight, 5);
      trigger('p1', '/repo', 'main', 'abc1234');

      await vi.waitFor(() => {
        expect(spawnFlight).toHaveBeenCalledTimes(1);
      });
      const [folder, firings, budgetUsd, totalBudgetUsd, instanceId, taskScope] = spawnFlight.mock
        .calls[0] as [string, number, number, unknown, unknown, string[]];
      expect(folder).toBe('/repo');
      expect(firings).toBe(1);
      expect(budgetUsd).toBe(5);
      expect(totalBudgetUsd).toBeUndefined();
      expect(instanceId).toBeUndefined();
      expect(taskScope).toHaveLength(1);
      expect(taskScope[0]).toMatch(/^ap-.*-ci-red$/);
    } finally {
      cleanupDir(dir);
    }
  });

  it('does not spawn in the default board mode even with spawnFlight supplied', async () => {
    delete process.env['AUTOPILOT_CI_REMEDIATION'];
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-board-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      s.close();

      const spawnFlight = vi.fn();
      const trigger = createPostPushWatchTrigger(dbPath, ghRunReporting('failure'), spawnFlight);
      trigger('p1', '/repo', 'main', 'abc1234');

      await vi.waitFor(() => {
        const s2 = openStore(dbPath);
        const tasks = recentTasks(s2.db, 'p1', 10);
        s2.close();
        expect(tasks).toHaveLength(1);
      });
      expect(spawnFlight).not.toHaveBeenCalled();
    } finally {
      cleanupDir(dir);
    }
  });

  it('does not spawn a second flight when the project is already flying', async () => {
    process.env['AUTOPILOT_CI_REMEDIATION'] = 'fly';
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-flying-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.db
        .prepare(
          `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
        )
        .run('p1', 'p1', 'p1', '/repo', 100, 100);
      s.close();

      const spawnFlight = vi.fn();
      const trigger = createPostPushWatchTrigger(dbPath, ghRunReporting('failure'), spawnFlight);
      trigger('p1', '/repo', 'main', 'abc1234');

      await vi.waitFor(() => {
        const s2 = openStore(dbPath);
        const tasks = recentTasks(s2.db, 'p1', 10);
        s2.close();
        expect(tasks).toHaveLength(1);
      });
      expect(spawnFlight).not.toHaveBeenCalled();
    } finally {
      cleanupDir(dir);
    }
  });

  it('does not spawn on a dedup no-op (an evidence task for this branch is already open)', async () => {
    process.env['AUTOPILOT_CI_REMEDIATION'] = 'fly';
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-dedup-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      s.close();

      const spawnFlight = vi.fn();
      const trigger = createPostPushWatchTrigger(dbPath, ghRunReporting('failure'), spawnFlight);
      trigger('p1', '/repo', 'main', 'abc1234');
      await vi.waitFor(() => {
        expect(spawnFlight).toHaveBeenCalledTimes(1);
      });

      spawnFlight.mockClear();
      const trigger2 = createPostPushWatchTrigger(dbPath, ghRunReporting('failure'), spawnFlight);
      trigger2('p1', '/repo', 'main', 'def5678');
      // Give the fire-and-forget watch's microtasks a beat — there is no
      // positive signal to wait on for an intentional non-spawn.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(spawnFlight).not.toHaveBeenCalled();
    } finally {
      cleanupDir(dir);
    }
  });

  it('does not spawn when no spawnFlight dependency is supplied at all', async () => {
    process.env['AUTOPILOT_CI_REMEDIATION'] = 'fly';
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-nospawn-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      s.close();

      const trigger = createPostPushWatchTrigger(dbPath, ghRunReporting('failure'));
      expect(() => trigger('p1', '/repo', 'main', 'abc1234')).not.toThrow();
      await vi.waitFor(() => {
        const s2 = openStore(dbPath);
        const tasks = recentTasks(s2.db, 'p1', 10);
        s2.close();
        expect(tasks).toHaveLength(1);
      });
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('isRunFor', () => {
  it('matches short and full SHAs either way round, and takes a run that names no commit', () => {
    expect(isRunFor({ headSha: '4b47e76365f48ee0' }, '4b47e76')).toBe(true);
    expect(isRunFor({ headSha: '4b47e76' }, '4b47e76365f48ee0')).toBe(true);
    expect(isRunFor({ headSha: 'fb2f9db8aaaa' }, '4b47e76')).toBe(false);
    expect(isRunFor({}, '4b47e76')).toBe(true);
    expect(isRunFor({ headSha: 'fb2f9db8' }, '')).toBe(true);
  });
});

describe('a watch survives the restart its landing causes (2026-09-27)', () => {
  function seed(dbPath: string, rows: [string, Record<string, unknown>, number][]): void {
    const s = openStore(dbPath);
    migrate(s);
    project(s, 'p1');
    const insert = s.db.prepare(
      "INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES ('p1', NULL, ?, ?, ?)",
    );
    for (const [type, payload, at] of rows) insert.run(type, JSON.stringify(payload), at);
    s.close();
  }

  it('resumes only the watches started in the last hour that recorded no outcome, once per commit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-resume-'));
    try {
      const dbPath = join(dir, 'a.db');
      const now = NOW;
      const started = (sha: string, at: number): [string, Record<string, unknown>, number] => [
        'post-push-watch-started',
        { rootPath: '/repo', branch: 'main', sha },
        at,
      ];
      seed(dbPath, [
        started('died-young', now - 10 * 60_000), // the landing restarted the dashboard
        started('died-young', now - 9 * 60_000), // a second start for the same commit
        started('finished', now - 30 * 60_000),
        [
          'post-push-watch',
          { sha: 'finished', outcome: 'concluded', verdict: 'recorded' },
          now - 5 * 60_000,
        ],
        started('too-old', now - 2 * 60 * 60_000),
      ]);
      const trigger = vi.fn();
      expect(resumeUnfinishedWatches(dbPath, trigger, now)).toBe(1);
      expect(trigger).toHaveBeenCalledWith('p1', '/repo', 'main', 'died-young');
    } finally {
      cleanupDir(dir);
    }
  });

  it('records the start the moment it is triggered, so the next process can find it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-started-'));
    try {
      const dbPath = join(dir, 'a.db');
      seed(dbPath, []);
      // A gh that never concludes: the watch keeps polling, as it would
      // when the process is killed mid-watch.
      createPostPushWatchTrigger(
        dbPath,
        () => () => JSON.stringify([{ status: 'in_progress', conclusion: '' }]),
      )('p1', '/repo', 'main', 'abc1234');
      const s = openStore(dbPath);
      const pending = unfinishedWatches(s.db, Date.now());
      s.close();
      expect(pending).toEqual([
        { projectId: 'p1', rootPath: '/repo', branch: 'main', sha: 'abc1234' },
      ]);
    } finally {
      cleanupDir(dir);
    }
  });
});
