// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * POST-PUSH VERDICT RITUAL, slice 2 (board web-mtpbmay4-94ii65): the polling
 * primitive slice 1's docstring deferred. Exercised with an injected fake
 * clock/sleep so the whole suite runs instantly — no real wall-clock wait,
 * no fake-timer flakiness.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, recentTasks, type Store } from '@autopilot/store';
import type { WorkflowRunStatus } from '../../src/control/ci-status.js';
import type { PostPushVerdictContext } from '../../src/control/post-push-verdict.js';
import {
  watchPostPushCi,
  createPostPushWatchTrigger,
  DEFAULT_POST_PUSH_WATCH_OPTIONS,
  type LaunchFixFiring,
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

  it('exposes sane production defaults: poll every 30s, give up after 20 minutes', () => {
    expect(DEFAULT_POST_PUSH_WATCH_OPTIONS).toEqual({
      pollIntervalMs: 30_000,
      timeoutMs: 20 * 60_000,
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

  describe('escalation-mode lever (board web-mtpbmazh-3en467)', () => {
    it('invokes launchFixFiring with the freshly filed task when mode is "fly"', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-fly-'));
      try {
        const dbPath = join(dir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1');
        s.close();

        const launchFixFiring: LaunchFixFiring = vi.fn();
        const trigger = createPostPushWatchTrigger(
          dbPath,
          ghRunReporting('failure'),
          launchFixFiring,
          'fly',
        );
        trigger('p1', '/repo', 'main', 'abc1234');

        await vi.waitFor(() => {
          expect(launchFixFiring).toHaveBeenCalledTimes(1);
        });
        const [task, rootPath] = (launchFixFiring as ReturnType<typeof vi.fn>).mock.calls[0] as [
          { title: string },
          string,
        ];
        expect(task.title).toContain('CI RED after landing main → abc1234');
        expect(rootPath).toBe('/repo');
      } finally {
        cleanupDir(dir);
      }
    });

    it('never invokes launchFixFiring in the default "board" mode', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-board-'));
      try {
        const dbPath = join(dir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1');
        s.close();

        const launchFixFiring: LaunchFixFiring = vi.fn();
        const trigger = createPostPushWatchTrigger(
          dbPath,
          ghRunReporting('failure'),
          launchFixFiring,
          'board',
        );
        trigger('p1', '/repo', 'main', 'abc1234');

        await vi.waitFor(() => {
          const s2 = openStore(dbPath);
          const tasks = recentTasks(s2.db, 'p1', 10);
          s2.close();
          expect(tasks).toHaveLength(1);
        });
        expect(launchFixFiring).not.toHaveBeenCalled();
      } finally {
        cleanupDir(dir);
      }
    });

    it('never invokes launchFixFiring for a dedup no-op (an evidence task is already open)', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ap-postpush-trigger-dedup-'));
      try {
        const dbPath = join(dir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1');
        s.close();

        const launchFixFiring: LaunchFixFiring = vi.fn();
        const trigger = createPostPushWatchTrigger(
          dbPath,
          ghRunReporting('failure'),
          launchFixFiring,
          'fly',
        );
        trigger('p1', '/repo', 'main', 'abc1234');
        await vi.waitFor(() => {
          expect(launchFixFiring).toHaveBeenCalledTimes(1);
        });

        trigger('p1', '/repo', 'main', 'def5678');
        // No second positive signal to wait on for an intentional no-op —
        // give the fire-and-forget watch's microtasks a beat to run.
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(launchFixFiring).toHaveBeenCalledTimes(1);
      } finally {
        cleanupDir(dir);
      }
    });
  });
});
