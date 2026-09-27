// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0026 slice 4 (bulk actions on the tasks screen's selection), its pure
 * half — direct unit coverage for `web/task-bulk.ts`, plus the parity that
 * makes a bulk action safe to wire: for every store status, an action reaches
 * a row exactly when the rendered row draws that action's button, and the
 * request it plans is the one that button posts.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { TASK_STATUSES } from '@autopilot/store';
import { renderShell, clientJs } from '../../src/web/shell.js';
import {
  planTaskBulk,
  taskBulkActions,
  taskBulkChoices,
  taskBulkReaches,
  type TaskBulkAction,
  type TaskBulkTask,
} from '../../src/web/task-bulk.js';

const ROWS: readonly TaskBulkTask[] = [
  { id: 'q1', status: 'queued' },
  { id: 'p1', status: 'needs_approval' },
  { id: 'f1', status: 'in_progress' },
  { id: 'd1', status: 'done' },
  { id: 'p2', status: 'needs_approval' },
  { id: 'x1', status: 'deferred' },
];

describe('taskBulkActions', () => {
  it("lists a proposal's decision first, then an open task's", () => {
    expect(taskBulkActions()).toEqual(['approve', 'reject', 'done', 'delete']);
  });
});

describe('taskBulkReaches', () => {
  it('gives a proposal approve and reject, and nothing else', () => {
    const proposal = { id: 'p', status: 'needs_approval' };
    expect(taskBulkActions().filter((a) => taskBulkReaches(proposal, a))).toEqual([
      'approve',
      'reject',
    ]);
  });

  it('gives every other open task done and delete, a status it does not know included', () => {
    for (const status of ['queued', 'in_progress', 'blocked']) {
      expect(taskBulkActions().filter((a) => taskBulkReaches({ id: 't', status }, a))).toEqual([
        'done',
        'delete',
      ]);
    }
  });

  it('gives a closed task nothing', () => {
    for (const status of ['done', 'deferred']) {
      expect(taskBulkActions().some((a) => taskBulkReaches({ id: 't', status }, a))).toBe(false);
    }
  });
});

describe('planTaskBulk', () => {
  it('approves each selected proposal into the queue, in board order', () => {
    const plan = planTaskBulk(ROWS, ['p2', 'q1', 'p1'], 'approve');
    expect(plan.requests).toEqual([
      { path: '/api/task/status', body: { id: 'p1', status: 'queued' } },
      { path: '/api/task/status', body: { id: 'p2', status: 'queued' } },
    ]);
    expect(plan.skipped).toEqual(['q1']);
    expect(plan.confirm).toBe(false);
  });

  it('marks each selected open task done and names the rows it skips', () => {
    const plan = planTaskBulk(ROWS, ['q1', 'p1', 'f1', 'd1', 'x1'], 'done');
    expect(plan.requests).toEqual([
      { path: '/api/task/status', body: { id: 'q1', status: 'done' } },
      { path: '/api/task/status', body: { id: 'f1', status: 'done' } },
    ]);
    expect(plan.skipped).toEqual(['p1', 'd1', 'x1']);
  });

  it('rejects proposals without asking, and asks before deleting open tasks', () => {
    const reject = planTaskBulk(ROWS, ['p1', 'q1'], 'reject');
    expect(reject.requests).toEqual([{ path: '/api/task/delete', body: { id: 'p1' } }]);
    expect(reject.confirm).toBe(false);

    const del = planTaskBulk(ROWS, ['p1', 'q1', 'f1'], 'delete');
    expect(del.requests).toEqual([
      { path: '/api/task/delete', body: { id: 'q1' } },
      { path: '/api/task/delete', body: { id: 'f1' } },
    ]);
    expect(del.skipped).toEqual(['p1']);
    expect(del.confirm).toBe(true);
  });

  it('ignores a selected id the list does not show, and counts a repeated id once', () => {
    const plan = planTaskBulk(ROWS, ['gone', 'q1', 'q1'], 'done');
    expect(plan.requests).toEqual([
      { path: '/api/task/status', body: { id: 'q1', status: 'done' } },
    ]);
    expect(plan.skipped).toEqual([]);

    const twice = planTaskBulk([ROWS[0]!, ROWS[0]!], ['q1'], 'done');
    expect(twice.requests).toHaveLength(1);
  });

  it('plans nothing for an empty selection', () => {
    for (const action of taskBulkActions()) {
      expect(planTaskBulk(ROWS, [], action)).toEqual({
        action,
        requests: [],
        skipped: [],
        confirm: action === 'delete',
      });
    }
  });
});

describe('taskBulkChoices', () => {
  it('offers each action some selected row can take, with how many it reaches', () => {
    expect(taskBulkChoices(ROWS, ['p1', 'p2', 'q1'])).toEqual([
      { action: 'approve', count: 2 },
      { action: 'reject', count: 2 },
      { action: 'done', count: 1 },
      { action: 'delete', count: 1 },
    ]);
  });

  it('offers nothing for an empty selection or one of closed rows only', () => {
    expect(taskBulkChoices(ROWS, [])).toEqual([]);
    expect(taskBulkChoices(ROWS, ['d1', 'x1'])).toEqual([]);
  });
});

describe('embedding via .toString()', () => {
  it('runs from its own source alone, the way shell.ts embeds client helpers', () => {
    const fns = [taskBulkActions, taskBulkReaches, planTaskBulk, taskBulkChoices];
    const source = fns.map((fn) => fn.toString()).join('\n');
    const names = fns.map((fn) => fn.name).join(', ');
    const embedded = new Function(source + '\nreturn { ' + names + ' };')() as {
      planTaskBulk: typeof planTaskBulk;
      taskBulkChoices: typeof taskBulkChoices;
    };
    expect(embedded.taskBulkChoices(ROWS, ['p1', 'f1']).map((c) => c.action)).toEqual([
      'approve',
      'reject',
      'done',
      'delete',
    ]);
    expect(embedded.planTaskBulk(ROWS, ['f1'], 'delete').confirm).toBe(true);
  });
});

/** One row per store status, plus one the vocabulary does not know yet. */
const BOARD_STATUSES: readonly string[] = [...TASK_STATUSES, 'blocked'];

function boardTask(status: string) {
  return {
    id: 't-' + status,
    title: 'Task that is ' + status,
    status,
    source: 'dashboard',
    severity: null,
    dimension: null,
    focus: false,
    priority: null,
    at: 1,
  };
}

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [
    {
      id: 'p1',
      slug: 'alpha',
      name: 'Alpha',
      status: 'idle',
      createdAt: 1,
      fileCount: 2,
      totalBytes: 100,
      languages: [],
      topDirs: [],
      hotFiles: [],
      gate: null,
      backedUp: false,
      firings: 0,
      shipped: 0,
      cost: 0,
      tokensIn: 0,
      tokensOut: 0,
      shipRate: null,
      openFindings: 0,
      gauge: { critical: 0, high: 0, medium: 0, low: 0 },
      lastActivityAt: null,
      flightLog: [],
      activity: [],
      tasks: BOARD_STATUSES.map(boardTask),
    },
  ],
  empty: false,
};

/** The row button each action presses once per row. */
const ROW_BUTTON: Record<TaskBulkAction, string> = {
  approve: '[data-task-approve]',
  reject: '[data-task-delete][data-confirm="no"]',
  done: '[data-task-done]',
  delete: '[data-task-delete][data-confirm="yes"]',
};

/** Every task write the client sent since boot, as the plan spells a request. */
function taskWrites(): Array<{ path: string; body: unknown }> {
  return (globalThis.fetch as Mock).mock.calls
    .filter(([url]) => url === '/api/task/status' || url === '/api/task/delete')
    .map(([url, init]) => ({
      path: String(url),
      body: JSON.parse(String((init as RequestInit).body)) as unknown,
    }));
}

describe('parity with the rendered Tasks row', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reaches a row exactly when it draws the button, and plans the request that button posts', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    for (const status of BOARD_STATUSES) {
      const task = { id: 't-' + status, status };
      const row = document.querySelector(`.task[data-task-id="${task.id}"]`);
      expect(row, `row for ${status}`).not.toBeNull();
      for (const action of taskBulkActions()) {
        const button = row!.querySelector<HTMLButtonElement>(ROW_BUTTON[action]);
        expect(button !== null, `${action} on a ${status} row`).toBe(taskBulkReaches(task, action));
        if (!button) continue;
        const before = taskWrites().length;
        button.click();
        const sent = taskWrites().slice(before);
        expect(sent.length, `${action} on a ${status} row posts`).toBeGreaterThan(0);
        const planned = planTaskBulk([task], [task.id], action).requests[0];
        for (const write of sent) expect(write).toEqual(planned);
      }
    }
  });
});
