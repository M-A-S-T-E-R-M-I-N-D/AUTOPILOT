// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A CONVERGENCE RED IS THE FLEET'S NEXT TASK (2026-09-25): a real red on the
 * merged head files one high-severity board task, so the flight repairs it
 * before the landing has to refuse it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, setTaskStatus, type Store } from '@autopilot/store';
import {
  fileConvergenceRedTask,
  convergenceRedTaskTitle,
  isFixableConvergenceRed,
  closeResolvedConvergenceRedTasks,
} from '../../src/flight/convergence-red-task.js';

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ap-convred-'));
  store = openStore(join(dir, 'db.sqlite'));
  migrate(store);
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', NULL, 1, 1)`,
    )
    .run();
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const RED = {
  projectId: 'p1',
  targetBranch: 'autopilot/flight',
  check: 'pnpm run ci:doc-commit-refs',
  mergeDetails: "fast-forwarded 'autopilot/flight' onto 'lane'",
  outputTail: 'x'.repeat(2500) + 'check-doc-commit-refs FAILED: 2 unreachable citation(s)',
  now: 1_790_000_000_000,
};

function tasks(): { title: string; status: string; severity: string; body: string }[] {
  return store.db.prepare('SELECT title, status, severity, body FROM tasks').all() as {
    title: string;
    status: string;
    severity: string;
    body: string;
  }[];
}

describe('fileConvergenceRedTask', () => {
  it('files one queued, high-severity task the fleet can pick, carrying the failure', () => {
    expect(fileConvergenceRedTask(store, RED)).toBe('filed');
    const [task] = tasks();
    expect(task).toMatchObject({
      title: convergenceRedTaskTitle(RED.check, RED.targetBranch),
      status: 'queued',
      severity: 'high',
    });
    expect(task?.title).toBe(
      'CONVERGENCE RED: pnpm run ci:doc-commit-refs fails on autopilot/flight — make it pass before landing',
    );
    expect(task?.body.startsWith(RED.mergeDetails)).toBe(true);
    expect(task?.body).toContain('2 unreachable citation(s)');
    // the tail is bounded: merge line, a blank line, and the last 2000 characters
    expect(task?.body.length).toBe(RED.mergeDetails.length + 2 + 2000);
  });

  it('files the same red only once while its task is open, and again once it is done', () => {
    expect(fileConvergenceRedTask(store, RED)).toBe('filed');
    expect(fileConvergenceRedTask(store, { ...RED, now: RED.now + 1 })).toBe('already-open');
    expect(tasks()).toHaveLength(1);
    const id = (store.db.prepare('SELECT id FROM tasks').get() as { id: string }).id;
    setTaskStatus(store, id, 'done', RED.now + 2);
    expect(fileConvergenceRedTask(store, { ...RED, now: RED.now + 3 })).toBe('filed');
    expect(tasks()).toHaveLength(2);
  });

  it('files a different failing check as its own task', () => {
    fileConvergenceRedTask(store, RED);
    expect(
      fileConvergenceRedTask(store, { ...RED, check: 'pnpm run test', now: RED.now + 1 }),
    ).toBe('filed');
    expect(tasks()).toHaveLength(2);
  });

  it('files a different failing check filed in the SAME millisecond as its own task', () => {
    // Two fleet flights (or two checks in one gate run) can both call this
    // with the identical `now` — the id must not collide just because the
    // millisecond does.
    expect(fileConvergenceRedTask(store, RED)).toBe('filed');
    expect(fileConvergenceRedTask(store, { ...RED, check: 'pnpm run test' })).toBe('filed');
    expect(tasks()).toHaveLength(2);
  });

  it('files nothing for a crash or an ungated lane — no firing can fix those in code', () => {
    expect(
      fileConvergenceRedTask(store, { ...RED, check: 'pnpm run test (crashed, no verdict)' }),
    ).toBe('not-fixable');
    expect(
      fileConvergenceRedTask(store, { ...RED, check: 'lane fast-forward (merged head not gated)' }),
    ).toBe('not-fixable');
    expect(tasks()).toEqual([]);
  });

  it('files the merge line alone when the red carried no output', () => {
    const { outputTail: _omit, ...noTail } = RED;
    expect(fileConvergenceRedTask(store, noTail)).toBe('filed');
    expect(tasks()[0]?.body).toBe(RED.mergeDetails);
  });
});

describe('isFixableConvergenceRed', () => {
  it('is true for a real verdict and false for the two non-verdicts', () => {
    expect(isFixableConvergenceRed('pnpm run ci:secret-scan-history')).toBe(true);
    expect(isFixableConvergenceRed('pnpm run test (crashed, no verdict)')).toBe(false);
    expect(isFixableConvergenceRed('lane fast-forward (merged head not gated)')).toBe(false);
  });
});

describe('closeResolvedConvergenceRedTasks', () => {
  it('closes the open task for a check that passes again, and only that one', () => {
    fileConvergenceRedTask(store, RED);
    fileConvergenceRedTask(store, { ...RED, check: 'pnpm run test', now: RED.now + 1 });
    const closed = closeResolvedConvergenceRedTasks(store, {
      projectId: 'p1',
      targetBranch: 'autopilot/flight',
      passedChecks: ['pnpm run typecheck', 'pnpm run test'],
      now: RED.now + 2,
    });
    expect(closed).toBe(1);
    const status = (title: string): string | undefined =>
      tasks().find((t) => t.title === title)?.status;
    expect(status(convergenceRedTaskTitle('pnpm run test', 'autopilot/flight'))).toBe('done');
    expect(status(convergenceRedTaskTitle(RED.check, 'autopilot/flight'))).toBe('queued');
  });

  it('leaves a task for another branch, and closes nothing twice', () => {
    fileConvergenceRedTask(store, RED);
    const on = (targetBranch: string): number =>
      closeResolvedConvergenceRedTasks(store, {
        projectId: 'p1',
        targetBranch,
        passedChecks: [RED.check],
        now: RED.now + 5,
      });
    expect(on('main')).toBe(0);
    expect(on('autopilot/flight')).toBe(1);
    expect(on('autopilot/flight')).toBe(0);
  });
});
