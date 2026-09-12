// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE CLAIM CONTRACT (operator directive, 2026-09-12): a person who claims a
 * pool issue gets their own pilot FOCUSED on it, delivering a slice per
 * firing, until THEY close the issue. Three readers must agree — the claim
 * path (task body + focus), the firing's done-hook (never closes it), and
 * the mirror pass (settles it on the claimant's close, never reopens on its
 * account). This file proves all three against the same marker.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openStore, migrate, createTask, type Store } from '@autopilot/store';
import type { GitVcs, FiringOutcome } from '@autopilot/engine';
import type { CliExec } from '../../src/connection/cli-probe.js';
import {
  HUMAN_CLOSES_MARKER,
  CLAIMED_TASK_PROMPT_NOTE,
  claimContractBody,
  isHumanClosedTask,
} from '../../src/flight/claim-contract.js';
import { planPoolIssueTask, claimAndQueuePoolIssueTask } from '../../src/flight/pool-client.js';
import { markTaskDoneIfShipped } from '../../src/flight/firing-hooks.js';
import { planMirrorPassReconcile, planMirrorPassCommands } from '../../src/flight/mirror-pass.js';

function memoryStore(): Store {
  const store = openStore(':memory:');
  migrate(store);
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
    )
    .run();
  return store;
}

function taskRow(store: Store, id: string): { status: string; focus: number; body: string | null } {
  return store.db.prepare('SELECT status, focus, body FROM tasks WHERE id = ?').get(id) as {
    status: string;
    focus: number;
    body: string | null;
  };
}

const POOL_ISSUE = {
  number: 42,
  title: 'Keyboard nav is broken',
  url: 'https://github.com/example/repo/issues/42',
  labels: [{ name: 'pool: accessibility' }],
  assignees: [],
};

function execFor(issues: unknown[], viewerLogin: string): CliExec {
  return vi.fn(async (_bin, args) => {
    if (args[0] === 'issue' && args[1] === 'list')
      return { code: 0, stdout: JSON.stringify(issues) };
    if (args[0] === 'api' && args[1] === 'user')
      return { code: 0, stdout: JSON.stringify({ login: viewerLogin }) };
    return { code: 0, stdout: '' };
  });
}

function outcomeWithRecord(record: {
  shipped: boolean;
  item: string;
  completion: 'slice' | 'complete';
  sha: string;
}): FiringOutcome {
  return { record } as unknown as FiringOutcome;
}

const vcs = {
  head: async () => 'headsha',
  showPatch: async () => '',
  fileExists: async () => false,
} as unknown as GitVcs;

describe('the marker', () => {
  it('is carried by the contract body and read back from any row shape', () => {
    const body = claimContractBody(42, 'https://github.com/example/repo/issues/42');
    expect(body).toContain('#42');
    expect(body).toContain(HUMAN_CLOSES_MARKER);
    expect(isHumanClosedTask({ body })).toBe(true);
    expect(isHumanClosedTask({ body: 'an ordinary task' })).toBe(false);
    expect(isHumanClosedTask({ body: null })).toBe(false);
    expect(isHumanClosedTask({})).toBe(false);
  });
});

describe('the claim path', () => {
  it('plans the claimed issue as a task that carries the contract', () => {
    const input = planPoolIssueTask(
      {
        number: 42,
        title: 'Keyboard nav is broken',
        url: POOL_ISSUE.url,
        labels: ['pool: accessibility'],
        assignees: [],
      },
      { decision: 'claim', reasoning: 'r' },
      'p1',
      100,
    );
    expect(input?.id).toBe('github-42');
    expect(isHumanClosedTask({ body: input?.body })).toBe(true);
  });

  it('queues the task FOCUSED, so the next firing claims it first and keeps slicing', async () => {
    const store = memoryStore();
    const result = await claimAndQueuePoolIssueTask(
      42,
      'p1',
      execFor([POOL_ISSUE], 'octocat'),
      store,
      () => 100,
    );
    expect(result.decision.decision).toBe('claim');
    expect(result.taskQueued).toBe(true);
    expect(result.focused).toBe(true);
    const row = taskRow(store, 'github-42');
    expect(row.status).toBe('queued');
    expect(row.focus).toBe(1);
    expect(row.body).toContain(HUMAN_CLOSES_MARKER);
    store.close();
  });

  it('the prompt note tells the agent to slice, not to finish', () => {
    expect(CLAIMED_TASK_PROMPT_NOTE).toMatch(/slice/);
    expect(CLAIMED_TASK_PROMPT_NOTE).toMatch(/claimant closes/);
  });
});

describe("the firing's done-hook", () => {
  let store: Store;
  beforeEach(() => {
    store = memoryStore();
    createTask(store, {
      id: 'github-42',
      projectId: 'p1',
      title: 'Keyboard nav is broken',
      body: claimContractBody(42),
      source: 'github',
      createdAt: 1,
    });
  });

  it('demotes a "complete" tag on a claimed task and tells the next firing why', async () => {
    const note = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'github-42', completion: 'complete', sha: 'abc' }),
      vcs,
    );
    expect(note).toContain('COMPLETION DEMOTED');
    expect(note).toContain('claim contract');
    expect(taskRow(store, 'github-42').status).toBe('queued');
  });

  it('lets a slice through and keeps the task open', async () => {
    const note = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'github-42', completion: 'slice', sha: 'abc' }),
      vcs,
    );
    expect(note).toBeUndefined();
    expect(taskRow(store, 'github-42').status).toBe('queued');
  });

  it('still closes an ordinary task on a verified complete', async () => {
    createTask(store, { id: 'web-a', projectId: 'p1', title: 'Ordinary task', createdAt: 1 });
    await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc' }),
      vcs,
    );
    expect(taskRow(store, 'web-a').status).toBe('done');
  });
});

describe('the mirror pass', () => {
  it("settles the task when the claimant closed the issue — the claimant's word is the only one that counts", () => {
    const finding = planMirrorPassReconcile(
      { id: 'github-42', status: 'in_progress', landedSha: null, humanCloses: true },
      { number: 42, state: 'closed' },
    );
    expect(finding).toMatchObject({
      action: 'settle-claimed',
      taskId: 'github-42',
      issueNumber: 42,
    });
    const commands = planMirrorPassCommands(finding!);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.args.slice(0, 3)).toEqual(['issue', 'comment', '42']);
  });

  it('still reopens honestly when an ordinary task is not done', () => {
    const finding = planMirrorPassReconcile(
      { id: 'github-42', status: 'in_progress', landedSha: null },
      { number: 42, state: 'closed' },
    );
    expect(finding?.action).toBe('reopen-honestly');
  });

  it('leaves a claimed task alone while its issue is still open', () => {
    expect(
      planMirrorPassReconcile(
        { id: 'github-42', status: 'queued', landedSha: null, humanCloses: true },
        { number: 42, state: 'open' },
      ),
    ).toBeNull();
  });
});
