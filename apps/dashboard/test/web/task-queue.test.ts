// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure task-queue tally math (`web/task-queue.ts`)
 * — extracted under epic 0002 "shell decomposition", slice 2.
 * `task-history-more-tooltip.test.ts` already regression-tests the closed-task
 * pagination indirectly through the rendered DOM in `clientJs()`; these tests
 * exercise the real functions directly instead.
 */

import { describe, it, expect } from 'vitest';
import {
  taskFocusActive,
  taskQueueCounts,
  taskHistoryMoreMeta,
  probableTaskTitle,
  moveTaskOrder,
  domTaskOrder,
  taskBurnLabel,
  taskRunawayTip,
  suggestedTurnBudget,
  taskBudgetRiskTip,
  taskDimensionBudgetRiskTip,
  DEFAULT_FIRING_TURNS,
  taskStalenessDays,
  taskStalenessTip,
  STALE_TASK_DAYS,
  taskTitleTip,
  taskMoveTip,
  taskFocusTip,
  taskActionTip,
  taskDimensionChip,
  taskSeverityChip,
  queueForecastMeta,
  QUEUE_FORECAST_WINDOW,
} from '../../src/web/task-queue.js';

const fmtCost = (n: number) => '$' + n.toFixed(2);
const fmtDuration = (ms: number) => Math.round(ms / 1000) + 's';
const fmtAgo = (ts: number) => Math.round((1_700_000_000_000 - ts) / 1000) + 's ago';

describe('queueForecastMeta', () => {
  const firing = (completion: string | null, cost = 0.5) => ({ cost, completion });

  it('is null with an empty queue or no recorded firings', () => {
    expect(queueForecastMeta(0, [firing('complete')], fmtCost)).toBeNull();
    expect(queueForecastMeta(3, [], fmtCost)).toBeNull();
  });

  it('projects firings and cost from the recent completion pace', () => {
    // 5 completes over 20 firings = 0.25/firing; 4 open tasks → 16 firings.
    const log = Array.from({ length: 20 }, (_, i) => firing(i % 4 === 0 ? 'complete' : 'slice'));
    const meta = queueForecastMeta(4, log, fmtCost);
    expect(meta?.text).toBe('Queue drains in ~16 firings / ~$8.00');
    expect(meta?.tip).toContain('the last 20 firings');
    expect(meta?.tip).toContain('5 tasks completed at $0.50/firing average');
    expect(meta?.tip).toContain('A pace extrapolation, not a promise');
  });

  it('only reads the newest QUEUE_FORECAST_WINDOW firings', () => {
    // Newest 20 have zero completes; the older 'complete' rows must not count.
    const log = [
      ...Array.from({ length: QUEUE_FORECAST_WINDOW }, () => firing('slice')),
      ...Array.from({ length: 10 }, () => firing('complete')),
    ];
    const meta = queueForecastMeta(2, log, fmtCost);
    expect(meta?.text).toBe('Queue drain: unknown — 0 tasks completed in the last 20 firings');
    expect(meta?.tip).toContain('no honest completion rate to project 2 open tasks from');
  });

  it('uses singular phrasing for one firing and one open task', () => {
    const meta = queueForecastMeta(1, [firing('complete', 0.25)], fmtCost);
    expect(meta?.text).toBe('Queue drains in ~1 firing / ~$0.25');
    expect(meta?.tip).toContain('the last 1 firing');
    expect(meta?.tip).toContain('1 open task');
  });
});

describe('taskFocusActive', () => {
  it('is false when no task is focused', () => {
    expect(taskFocusActive([{ status: 'queued' }, { status: 'done' }])).toBe(false);
  });

  it('is true when any task carries focus', () => {
    expect(taskFocusActive([{ status: 'queued' }, { status: 'in_progress', focus: true }])).toBe(
      true,
    );
  });

  it('is false for an empty task list', () => {
    expect(taskFocusActive([])).toBe(false);
  });
});

describe('taskQueueCounts', () => {
  it('counts queued/in_progress as open and done/deferred as closed', () => {
    const tasks = [
      { status: 'queued' },
      { status: 'in_progress' },
      { status: 'done' },
      { status: 'deferred' },
      { status: 'done' },
    ];
    expect(taskQueueCounts(tasks, undefined, 15)).toEqual({
      openCount: 2,
      closedTotal: 3,
      closedVisible: 3,
    });
  });

  it('does not count a task in some other status (e.g. needs_approval) toward either bucket', () => {
    expect(taskQueueCounts([{ status: 'needs_approval' }], undefined, 15)).toEqual({
      openCount: 0,
      closedTotal: 0,
      closedVisible: 0,
    });
  });

  it('clamps closedVisible to historyChunk when nothing has been revealed yet', () => {
    const closed = Array.from({ length: 20 }, () => ({ status: 'done' }));
    expect(taskQueueCounts(closed, undefined, 15)).toEqual({
      openCount: 0,
      closedTotal: 20,
      closedVisible: 15,
    });
  });

  it('clamps closedVisible to closedTotal once revealedCount exceeds it', () => {
    const closed = Array.from({ length: 20 }, () => ({ status: 'done' }));
    expect(taskQueueCounts(closed, 30, 15)).toEqual({
      openCount: 0,
      closedTotal: 20,
      closedVisible: 20,
    });
  });

  it('uses revealedCount over historyChunk once the operator has loaded more', () => {
    const closed = Array.from({ length: 20 }, () => ({ status: 'done' }));
    expect(taskQueueCounts(closed, 15 + 15, 15)).toEqual({
      openCount: 0,
      closedTotal: 20,
      closedVisible: 20,
    });
  });

  it('returns all-zero counts for an empty task list', () => {
    expect(taskQueueCounts([], undefined, 15)).toEqual({
      openCount: 0,
      closedTotal: 0,
      closedVisible: 0,
    });
  });
});

describe('taskHistoryMoreMeta', () => {
  it('formats "showing X of Y" text and clamps the tip to what remains', () => {
    expect(taskHistoryMoreMeta(15, 16, 15)).toEqual({
      text: 'Load more done (showing 15 of 16)',
      tip: 'Reveal 1 more done/deferred tasks',
    });
  });

  it('clamps the tip to historyChunk when more than a chunk remains', () => {
    expect(taskHistoryMoreMeta(5, 50, 15)).toEqual({
      text: 'Load more done (showing 5 of 50)',
      tip: 'Reveal 15 more done/deferred tasks',
    });
  });

  it('reveals every remaining task when nothing has been shown yet', () => {
    expect(taskHistoryMoreMeta(0, 3, 15)).toEqual({
      text: 'Load more done (showing 0 of 3)',
      tip: 'Reveal 3 more done/deferred tasks',
    });
  });
});

describe('probableTaskTitle', () => {
  it('returns the first queued/in_progress task title', () => {
    const tasks = [
      { status: 'done', title: 'Done task' },
      { status: 'queued', title: 'Next up' },
      { status: 'in_progress', title: 'Should not be reached' },
    ];
    expect(probableTaskTitle(tasks)).toBe('Next up');
  });

  it('finds an in_progress task ahead of a later queued one', () => {
    const tasks = [
      { status: 'in_progress', title: 'Currently working' },
      { status: 'queued', title: 'Waiting' },
    ];
    expect(probableTaskTitle(tasks)).toBe('Currently working');
  });

  it('returns null when no task is workable', () => {
    const tasks = [
      { status: 'done', title: 'Done task' },
      { status: 'deferred', title: 'Deferred task' },
      { status: 'needs_approval', title: 'Proposal' },
    ];
    expect(probableTaskTitle(tasks)).toBeNull();
  });

  it('returns null for an empty task list', () => {
    expect(probableTaskTitle([])).toBeNull();
  });
});

describe('moveTaskOrder', () => {
  it('moves an id up one slot', () => {
    expect(moveTaskOrder(['a', 'b', 'c'], 'b', -1)).toEqual({
      order: ['b', 'a', 'c'],
      toIndex: 0,
    });
  });

  it('moves an id down one slot', () => {
    expect(moveTaskOrder(['a', 'b', 'c'], 'b', 1)).toEqual({
      order: ['a', 'c', 'b'],
      toIndex: 2,
    });
  });

  it('returns null when moving the first id up', () => {
    expect(moveTaskOrder(['a', 'b', 'c'], 'a', -1)).toBeNull();
  });

  it('returns null when moving the last id down', () => {
    expect(moveTaskOrder(['a', 'b', 'c'], 'c', 1)).toBeNull();
  });

  it('returns null when the id is not present', () => {
    expect(moveTaskOrder(['a', 'b', 'c'], 'z', 1)).toBeNull();
  });

  it('does not mutate the input array', () => {
    const items = ['a', 'b', 'c'];
    moveTaskOrder(items, 'b', -1);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

const fakeRow = (id: string | null) => ({ getAttribute: () => id });

describe('domTaskOrder', () => {
  it('reads ids off children in list order', () => {
    expect(domTaskOrder({ children: [fakeRow('a'), fakeRow('b'), fakeRow('c')] })).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('skips children without a data-task-id', () => {
    expect(domTaskOrder({ children: [fakeRow('a'), fakeRow(null), fakeRow('c')] })).toEqual([
      'a',
      'c',
    ]);
  });

  it('returns an empty array for an empty list', () => {
    expect(domTaskOrder({ children: [] })).toEqual([]);
  });
});

describe('taskBurnLabel', () => {
  it('pluralizes "slice"/"firing has" for a single slice', () => {
    expect(taskBurnLabel({ slices: 1, cost: 12, wallMs: 0 }, fmtCost, fmtDuration)).toEqual({
      text: '1 slice · $12.00',
      tip: '1 firing has worked this task — $12.00 total',
    });
  });

  it('pluralizes "slices"/"firings have" for multiple slices', () => {
    expect(taskBurnLabel({ slices: 3, cost: 45, wallMs: 0 }, fmtCost, fmtDuration)).toEqual({
      text: '3 slices · $45.00',
      tip: '3 firings have worked this task — $45.00 total',
    });
  });

  it('appends wall time to both text and tip when wallMs > 0', () => {
    expect(taskBurnLabel({ slices: 2, cost: 10, wallMs: 5000 }, fmtCost, fmtDuration)).toEqual({
      text: '2 slices · $10.00 · 5s',
      tip: '2 firings have worked this task — $10.00 total, 5s wall time',
    });
  });

  it('omits wall time from both text and tip when wallMs is 0', () => {
    const label = taskBurnLabel({ slices: 1, cost: 1, wallMs: 0 }, fmtCost, fmtDuration);
    expect(label.text).toBe('1 slice · $1.00');
    expect(label.tip).not.toContain('wall time');
  });
});

describe('taskRunawayTip', () => {
  it('pluralizes "firings" for more than one firing', () => {
    expect(taskRunawayTip(87.5, 14, fmtCost)).toBe(
      'This task has burned $87.50 across 14 firings without ever closing — TASK ECONOMICS flags it for your review.',
    );
  });

  it('singularizes "firing" for exactly one firing', () => {
    expect(taskRunawayTip(3, 1, fmtCost)).toBe(
      'This task has burned $3.00 across 1 firing without ever closing — TASK ECONOMICS flags it for your review.',
    );
  });
});

describe('suggestedTurnBudget', () => {
  it('returns null when the task has never turn-capped', () => {
    expect(suggestedTurnBudget(0, 120)).toBeNull();
  });

  it('bumps the default by 50% for a single turn-cap death', () => {
    expect(suggestedTurnBudget(1, 120)).toBe(180);
  });

  it('bumps further for each additional turn-cap death', () => {
    expect(suggestedTurnBudget(2, 120)).toBe(240);
    expect(suggestedTurnBudget(3, 120)).toBe(300);
  });
});

describe('taskBudgetRiskTip', () => {
  it('singularizes "time" for exactly one turn-cap death', () => {
    expect(taskBudgetRiskTip(1, 180, 120)).toBe(
      'This task hit the 120-turn cap 1 time without finishing — try budgeting ~180 turns for the next firing.',
    );
  });

  it('pluralizes "times" for more than one turn-cap death', () => {
    expect(taskBudgetRiskTip(3, 300, 120)).toBe(
      'This task hit the 120-turn cap 3 times without finishing — try budgeting ~300 turns for the next firing.',
    );
  });
});

describe('taskDimensionBudgetRiskTip', () => {
  it('singularizes "time" for exactly one turn-cap death among dimension peers', () => {
    expect(taskDimensionBudgetRiskTip('security', 1, 180, 120)).toBe(
      'Other security tasks hit the 120-turn cap 1 time — this looks like similar work, so try budgeting ~180 turns before you start.',
    );
  });

  it('pluralizes "times" for more than one turn-cap death among dimension peers', () => {
    expect(taskDimensionBudgetRiskTip('perf', 3, 300, 120)).toBe(
      'Other perf tasks hit the 120-turn cap 3 times — this looks like similar work, so try budgeting ~300 turns before you start.',
    );
  });
});

describe('DEFAULT_FIRING_TURNS', () => {
  it('is a positive turn ceiling', () => {
    expect(DEFAULT_FIRING_TURNS).toBeGreaterThan(0);
  });
});

describe('taskStalenessDays', () => {
  it('floors the day count between at and nowMs', () => {
    const at = 1_700_000_000_000;
    expect(taskStalenessDays(at, at + 3 * 86_400_000 + 1000)).toBe(3);
  });

  it('clamps at 0 for a task created after nowMs (clock skew)', () => {
    expect(taskStalenessDays(1_700_000_000_000, 1_699_999_999_000)).toBe(0);
  });

  it('is 0 for a task created this instant', () => {
    expect(taskStalenessDays(1_700_000_000_000, 1_700_000_000_000)).toBe(0);
  });
});

describe('taskStalenessTip', () => {
  it('pluralizes "days" for more than one day', () => {
    expect(taskStalenessTip(21)).toBe(
      'This task has sat on the board 21 days without closing — TRIAGE factors staleness into its ranking.',
    );
  });

  it('uses the singular "day" for exactly one day', () => {
    expect(taskStalenessTip(1)).toBe(
      'This task has sat on the board 1 day without closing — TRIAGE factors staleness into its ranking.',
    );
  });
});

describe('STALE_TASK_DAYS', () => {
  it('is a positive threshold', () => {
    expect(STALE_TASK_DAYS).toBeGreaterThan(0);
  });
});

describe('taskTitleTip', () => {
  it('includes the operator priority clause when priority is set', () => {
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the result carries only the tip
    // text — no title-prefixed ariaLabel duplicating it verbatim; the DOM
    // wiring exposes the tip via aria-describedby instead.
    expect(taskTitleTip(1_700_000_000_000 - 3000, 2, fmtAgo)).toEqual({
      tip: 'Added 3s ago · operator priority 2',
    });
  });

  it('omits the priority clause when priority is null', () => {
    expect(taskTitleTip(1_700_000_000_000 - 60000, null, fmtAgo)).toEqual({
      tip: 'Added 60s ago',
    });
  });

  it('omits the priority clause when priority is undefined', () => {
    expect(taskTitleTip(1_700_000_000_000, undefined, fmtAgo)).toEqual({
      tip: 'Added 0s ago',
    });
  });

  it('includes a priority of 0 (nullish, not falsy, check)', () => {
    expect(taskTitleTip(1_700_000_000_000, 0, fmtAgo)).toEqual({
      tip: 'Added 0s ago · operator priority 0',
    });
  });
});

describe('taskMoveTip', () => {
  it('reads "earlier" for the up direction', () => {
    expect(taskMoveTip('up', 'Ship the thing', 2, 5)).toBe(
      'Move "Ship the thing" earlier (position 2 of 5)',
    );
  });

  it('reads "later" for the down direction', () => {
    expect(taskMoveTip('down', 'Ship the thing', 2, 5)).toBe(
      'Move "Ship the thing" later (position 2 of 5)',
    );
  });
});

describe('taskFocusTip', () => {
  it('reads "Focus the autopilot on ..." when not yet focused', () => {
    expect(taskFocusTip('Ship the thing', false)).toBe('Focus the autopilot on "Ship the thing"');
  });

  it('reads "Release focus from ..." when already focused', () => {
    expect(taskFocusTip('Ship the thing', true)).toBe('Release focus from "Ship the thing"');
  });
});

describe('taskActionTip', () => {
  it('reads "Approve proposed task ..." for approve', () => {
    expect(taskActionTip('approve', 'Investigate the flaky test')).toBe(
      'Approve proposed task "Investigate the flaky test"',
    );
  });

  it('reads "Reject proposed task ..." for reject', () => {
    expect(taskActionTip('reject', 'Investigate the flaky test')).toBe(
      'Reject proposed task "Investigate the flaky test"',
    );
  });

  it('reads "Mark ... done" for done', () => {
    expect(taskActionTip('done', 'Ship the thing')).toBe('Mark "Ship the thing" done');
  });

  it('reads "Delete task ..." for delete', () => {
    expect(taskActionTip('delete', 'Ship the thing')).toBe('Delete task "Ship the thing"');
  });
});

describe('taskDimensionChip', () => {
  it('turns underscores into spaces for the display label', () => {
    expect(taskDimensionChip('human_interaction')).toEqual([
      'human interaction',
      'Dimension: the area this task lives in',
      'Dimension: human interaction',
    ]);
  });

  it('passes a single-word dimension through unchanged', () => {
    expect(taskDimensionChip('data')).toEqual([
      'data',
      'Dimension: the area this task lives in',
      'Dimension: data',
    ]);
  });

  it('turns EVERY underscore into a space, not just the first', () => {
    expect(taskDimensionChip('foo_bar_baz')).toEqual([
      'foo bar baz',
      'Dimension: the area this task lives in',
      'Dimension: foo bar baz',
    ]);
  });
});

describe('taskSeverityChip', () => {
  it('carries the raw severity as text/extraClass, prefixed in the aria-label', () => {
    expect(taskSeverityChip('critical')).toEqual([
      'critical',
      'Severity: how urgent this finding is — critical clears first, low last',
      'Severity: critical',
      'sev-critical',
    ]);
  });
});
