// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure per-flight/per-task classification
 * helpers (`web/flight-metrics.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2. `task-burn-chip.test.ts`/`spark-tooltip.test.ts`/
 * `fleet-stat-tiles.test.ts` already regression-test this logic indirectly
 * through the rendered DOM in `clientJs()`; these tests exercise the real
 * functions directly instead.
 */

import { describe, it, expect } from 'vitest';
import {
  flightVerdictOf,
  taskMap,
  taskBurnOf,
  taskBudgetSignalOf,
  taskDimensionBudgetSignalOf,
  fleetCacheShareOf,
  flightBarMeta,
  trajectorySignalOf,
  firingTimelineRowMeta,
  type FlightBarEntry,
} from '../../src/web/flight-metrics.js';

describe('flightVerdictOf', () => {
  it('reports "shipped" whenever the firing shipped, regardless of other fields', () => {
    expect(flightVerdictOf({ shipped: true, gateResult: 'reverted', died: 'error' })).toBe(
      'shipped',
    );
  });

  it('reports "reverted" for a failed gate that rolled back', () => {
    expect(flightVerdictOf({ shipped: false, gateResult: 'reverted', died: null })).toBe(
      'reverted',
    );
  });

  it('reports "unverified" for a gate result the harness could not verify', () => {
    expect(flightVerdictOf({ shipped: false, gateResult: 'unverifiable', died: null })).toBe(
      'unverified',
    );
  });

  it('reports "checkpointed" as distinct from turn-capped — WIP was packed into a real commit', () => {
    expect(flightVerdictOf({ shipped: false, gateResult: 'checkpointed', died: 'turn-cap' })).toBe(
      'checkpointed',
    );
  });

  it('reports "turn-capped" when the firing died hitting the turn cap with no checkpoint', () => {
    expect(flightVerdictOf({ shipped: false, gateResult: null, died: 'turn-cap' })).toBe(
      'turn-capped',
    );
  });

  it('reports "errored" when the firing died to an error with no checkpoint', () => {
    expect(flightVerdictOf({ shipped: false, gateResult: null, died: 'error' })).toBe('errored');
  });

  it('falls back to "no commit" when nothing shipped, failed, or died', () => {
    expect(flightVerdictOf({ shipped: false, gateResult: null, died: null })).toBe('no commit');
  });

  it('reports "verdict-carrying" for a true no-commit firing that named a verdict (NOOP→VERDICT, lever 6)', () => {
    expect(
      flightVerdictOf({
        shipped: false,
        gateResult: null,
        died: null,
        noopClass: 'verdict-carrying',
      }),
    ).toBe('verdict-carrying');
  });

  it('keeps the bare "no commit" label for a silent no-commit firing', () => {
    expect(
      flightVerdictOf({ shipped: false, gateResult: null, died: null, noopClass: 'silent' }),
    ).toBe('no commit');
  });

  it('never reports "verdict-carrying" when the firing died mid-unit, even with proposals', () => {
    expect(
      flightVerdictOf({
        shipped: false,
        gateResult: null,
        died: 'turn-cap',
        noopClass: 'verdict-carrying',
      }),
    ).toBe('turn-capped');
  });
});

describe('taskMap', () => {
  it('indexes tasks by id', () => {
    const tasks = [
      { id: 't1', title: 'One' },
      { id: 't2', title: 'Two' },
    ];
    const byId = taskMap(tasks);
    expect(byId['t1']?.title).toBe('One');
    expect(byId['t2']?.title).toBe('Two');
  });

  it('returns an empty map for null/undefined/empty input', () => {
    expect(taskMap(null)).toEqual({});
    expect(taskMap(undefined)).toEqual({});
    expect(taskMap([])).toEqual({});
  });
});

describe('taskBurnOf', () => {
  it('sums cost and wall time only across firings that claimed the task', () => {
    const log = [
      { item: 't1', cost: 1.5, durationMs: 60000 },
      { item: 't1', cost: 2.34, durationMs: 120000 },
      { item: 'other', cost: 99, durationMs: 999999 },
    ];
    expect(taskBurnOf('t1', log)).toEqual({ slices: 2, cost: 3.84, wallMs: 180000 });
  });

  it('returns all-zero burn for a task with no claiming firings', () => {
    expect(taskBurnOf('t2', [{ item: 'other', cost: 5, durationMs: 1000 }])).toEqual({
      slices: 0,
      cost: 0,
      wallMs: 0,
    });
  });

  it('treats missing cost/durationMs as zero instead of propagating NaN', () => {
    expect(taskBurnOf('t3', [{ item: 't3', cost: null, durationMs: null }])).toEqual({
      slices: 1,
      cost: 0,
      wallMs: 0,
    });
  });

  it('returns all-zero burn for null/undefined log', () => {
    expect(taskBurnOf('t4', null)).toEqual({ slices: 0, cost: 0, wallMs: 0 });
    expect(taskBurnOf('t4', undefined)).toEqual({ slices: 0, cost: 0, wallMs: 0 });
  });
});

describe('taskBudgetSignalOf', () => {
  it('counts only turn-cap deaths claimed by the given task', () => {
    const log = [
      { item: 't1', died: 'turn-cap' },
      { item: 't1', died: 'error' },
      { item: 't1', died: null },
      { item: 'other', died: 'turn-cap' },
    ];
    expect(taskBudgetSignalOf('t1', log)).toEqual({ turnCapped: 1 });
  });

  it('counts every turn-cap death across multiple firings on the same task', () => {
    const log = [
      { item: 't1', died: 'turn-cap' },
      { item: 't1', died: 'turn-cap' },
    ];
    expect(taskBudgetSignalOf('t1', log)).toEqual({ turnCapped: 2 });
  });

  it('returns zero for a task that never turn-capped', () => {
    expect(taskBudgetSignalOf('t2', [{ item: 't2', died: null }])).toEqual({ turnCapped: 0 });
  });

  it('returns zero for null/undefined log', () => {
    expect(taskBudgetSignalOf('t3', null)).toEqual({ turnCapped: 0 });
    expect(taskBudgetSignalOf('t3', undefined)).toEqual({ turnCapped: 0 });
  });
});

describe('taskDimensionBudgetSignalOf', () => {
  it('sums turn-cap deaths from OTHER tasks sharing the same dimension', () => {
    const t1 = { id: 't1', dimension: 'security' };
    const tasks = [t1, { id: 't2', dimension: 'security' }, { id: 't3', dimension: 'perf' }];
    const log = [
      { item: 't2', died: 'turn-cap' },
      { item: 't3', died: 'turn-cap' },
    ];
    expect(taskDimensionBudgetSignalOf(t1, tasks, log)).toEqual({ turnCapped: 1 });
  });

  it('excludes the task itself from its own dimension aggregate', () => {
    const t1 = { id: 't1', dimension: 'security' };
    const log = [{ item: 't1', died: 'turn-cap' }];
    expect(taskDimensionBudgetSignalOf(t1, [t1], log)).toEqual({ turnCapped: 0 });
  });

  it('returns zero for a task with no dimension — nothing to compare against', () => {
    const t1 = { id: 't1', dimension: null };
    const tasks = [t1, { id: 't2', dimension: null }];
    const log = [{ item: 't2', died: 'turn-cap' }];
    expect(taskDimensionBudgetSignalOf(t1, tasks, log)).toEqual({ turnCapped: 0 });
  });

  it('returns zero when no dimension peer ever turn-capped', () => {
    const t1 = { id: 't1', dimension: 'security' };
    const tasks = [t1, { id: 't2', dimension: 'security' }];
    const log = [{ item: 't2', died: 'error' }];
    expect(taskDimensionBudgetSignalOf(t1, tasks, log)).toEqual({ turnCapped: 0 });
  });

  it('returns zero for null/undefined tasks or log', () => {
    const task = { id: 't1', dimension: 'security' };
    expect(taskDimensionBudgetSignalOf(task, null, [])).toEqual({ turnCapped: 0 });
    expect(taskDimensionBudgetSignalOf(task, [], null)).toEqual({ turnCapped: 0 });
  });
});

describe('fleetCacheShareOf', () => {
  it('computes the cache-read share of processed context tokens', () => {
    expect(fleetCacheShareOf({ tokensIn: 100, cacheReadTokens: 300, cacheWriteTokens: 100 })).toBe(
      0.6,
    );
  });

  it('returns 0 rather than dividing by zero when no tokens are recorded', () => {
    expect(fleetCacheShareOf({ tokensIn: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(0);
  });

  it('treats missing tokensIn/cacheReadTokens/cacheWriteTokens as zero', () => {
    expect(fleetCacheShareOf({ tokensIn: null, cacheReadTokens: 50, cacheWriteTokens: null })).toBe(
      1,
    );
  });
});

describe('flightBarMeta', () => {
  const headlineOf = (
    f: FlightBarEntry & { readonly item?: string | null },
    taskById: Readonly<Record<string, unknown>>,
  ): string => {
    const task = f.item ? (taskById[f.item] as { title?: string } | undefined) : undefined;
    return (task && task.title) || 'untitled';
  };

  it('truncates the sha to 7 characters', () => {
    const meta = flightBarMeta(
      {
        shipped: true,
        gateResult: null,
        died: null,
        sha: 'abcdef1234567',
        turns: 3,
        failedCheck: null,
      },
      {},
      '$1.00',
      headlineOf,
    );
    expect(meta.sha).toBe('abcdef1');
  });

  it('falls back to an em dash when there is no sha', () => {
    const meta = flightBarMeta(
      { shipped: true, gateResult: null, died: null, sha: null, turns: 3, failedCheck: null },
      {},
      '$1.00',
      headlineOf,
    );
    expect(meta.sha).toBe('—');
  });

  it('derives the bar class from only the first word of a multi-word verdict', () => {
    const meta = flightBarMeta(
      {
        shipped: false,
        gateResult: 'checkpointed',
        died: 'turn-cap',
        sha: 'abc1234',
        turns: 1,
        failedCheck: null,
      },
      {},
      '$1.00',
      headlineOf,
    );
    expect(meta.barClass).toBe('spark-checkpointed spark-bar');
  });

  it('appends the failed check to a reverted verdict label', () => {
    const meta = flightBarMeta(
      {
        shipped: false,
        gateResult: 'reverted',
        died: null,
        sha: 'abc1234',
        turns: 2,
        failedCheck: 'typecheck',
      },
      {},
      '$1.00',
      headlineOf,
    );
    expect(meta.verdictLabel).toBe('reverted — typecheck');
    expect(meta.barClass).toBe('spark-reverted spark-bar');
  });

  it('does not append a failed-check caveat to a non-reverted verdict', () => {
    const meta = flightBarMeta(
      {
        shipped: false,
        gateResult: 'unverifiable',
        died: null,
        sha: 'abc1234',
        turns: 1,
        failedCheck: 'typecheck',
      },
      {},
      '$1.00',
      headlineOf,
    );
    expect(meta.verdictLabel).toBe('unverified');
  });

  it('pluralizes the turns label for anything other than exactly 1', () => {
    const zero = flightBarMeta(
      { shipped: true, gateResult: null, died: null, sha: 'abc1234', turns: 0, failedCheck: null },
      {},
      '$1.00',
      headlineOf,
    );
    const one = flightBarMeta(
      { shipped: true, gateResult: null, died: null, sha: 'abc1234', turns: 1, failedCheck: null },
      {},
      '$1.00',
      headlineOf,
    );
    const many = flightBarMeta(
      { shipped: true, gateResult: null, died: null, sha: 'abc1234', turns: 5, failedCheck: null },
      {},
      '$1.00',
      headlineOf,
    );
    expect(zero.turnsLabel).toBe('0 turns');
    expect(one.turnsLabel).toBe('1 turn');
    expect(many.turnsLabel).toBe('5 turns');
  });

  it('composes the aria-label from title, verdict, value, turns, and sha in order', () => {
    const meta = flightBarMeta(
      {
        item: 't1',
        shipped: true,
        gateResult: null,
        died: null,
        sha: 'abc1234',
        turns: 2,
        failedCheck: null,
      },
      { t1: { title: 'Ship the thing' } },
      '$2.50',
      headlineOf,
    );
    expect(meta.title).toBe('Ship the thing');
    expect(meta.ariaLabel).toBe('Ship the thing — shipped, $2.50, 2 turns, abc1234');
  });
});

describe('trajectorySignalOf', () => {
  it('counts zero repeats for a firing whose every (tool, target) pair is unique', () => {
    const signal = trajectorySignalOf([
      { tool: 'Read', target: 'a.ts' },
      { tool: 'Read', target: 'b.ts' },
      { tool: 'Edit', target: 'a.ts' },
    ]);
    expect(signal).toEqual({ repeatedActions: 0, totalActions: 3 });
  });

  it('counts every repeat past the first occurrence, not just whether any exist', () => {
    const signal = trajectorySignalOf([
      { tool: 'Read', target: 'a.ts' },
      { tool: 'Read', target: 'a.ts' },
      { tool: 'Read', target: 'a.ts' },
    ]);
    expect(signal).toEqual({ repeatedActions: 2, totalActions: 3 });
  });

  it('treats the same tool on a different target as distinct, not a repeat', () => {
    const signal = trajectorySignalOf([
      { tool: 'Bash', target: 'pnpm test' },
      { tool: 'Bash', target: 'pnpm build' },
    ]);
    expect(signal.repeatedActions).toBe(0);
  });

  it('treats the same target under a different tool as distinct, not a repeat', () => {
    const signal = trajectorySignalOf([
      { tool: 'Read', target: 'a.ts' },
      { tool: 'Edit', target: 'a.ts' },
    ]);
    expect(signal.repeatedActions).toBe(0);
  });

  it('excludes entries missing tool/target from both counts instead of matching them to each other', () => {
    const signal = trajectorySignalOf([{ target: 'a.ts' }, { tool: 'Read' }, {}]);
    expect(signal).toEqual({ repeatedActions: 0, totalActions: 0 });
  });

  it('returns all-zero for an empty firing', () => {
    expect(trajectorySignalOf([])).toEqual({ repeatedActions: 0, totalActions: 0 });
  });
});

describe('firingTimelineRowMeta', () => {
  const headlineOf = (f: FlightBarEntry): string => (f ? 'resolved headline' : 'unused');
  const fmtAgo = (at: number): string => `${at}ms ago`;
  const FIRING = {
    shipped: true,
    gateResult: null,
    died: null,
    sha: 'abc1234',
    turns: 2,
    failedCheck: null,
  };

  it('resolves the headline via headlineOf when a flight-log entry exists', () => {
    const meta = firingTimelineRowMeta(
      { firingId: 'p1:firing-1', entries: [{ at: 1 }] },
      FIRING,
      {},
      headlineOf,
      fmtAgo,
    );
    expect(meta.headline).toBe('resolved headline');
  });

  it('falls back to "unattributed activity" for the sentinel firingId with no flight-log entry', () => {
    const meta = firingTimelineRowMeta(
      { firingId: 'unattributed', entries: [{ at: 1 }] },
      null,
      {},
      headlineOf,
      fmtAgo,
    );
    expect(meta.headline).toBe('unattributed activity');
  });

  it('falls back to the raw firingId when there is no flight-log entry and it is not the sentinel', () => {
    const meta = firingTimelineRowMeta(
      { firingId: 'p1:firing-9', entries: [{ at: 1 }] },
      null,
      {},
      headlineOf,
      fmtAgo,
    );
    expect(meta.headline).toBe('p1:firing-9');
  });

  it('keeps a 64-char headline untruncated for display', () => {
    const headline64 = 'x'.repeat(64);
    const meta = firingTimelineRowMeta(
      { firingId: 'p1:firing-1', entries: [{ at: 1 }] },
      FIRING,
      {},
      () => headline64,
      fmtAgo,
    );
    expect(meta.headline).toBe(headline64);
    expect(meta.headlineDisplay).toBe(headline64);
  });

  it('truncates a 65-char headline to 64 chars plus an ellipsis for display, keeping the tip/aria full', () => {
    const headline65 = 'y'.repeat(65);
    const meta = firingTimelineRowMeta(
      { firingId: 'p1:firing-1', entries: [{ at: 1 }] },
      FIRING,
      {},
      () => headline65,
      fmtAgo,
    );
    expect(meta.headlineDisplay).toBe('y'.repeat(64) + '…');
    expect(meta.headline).toBe(headline65);
  });

  it('shows the callsign chip for a real firingId but not for the "unattributed" sentinel', () => {
    const real = firingTimelineRowMeta(
      { firingId: 'p1:firing-1', entries: [{ at: 1 }] },
      FIRING,
      {},
      headlineOf,
      fmtAgo,
    );
    const sentinel = firingTimelineRowMeta(
      { firingId: 'unattributed', entries: [{ at: 1 }] },
      null,
      {},
      headlineOf,
      fmtAgo,
    );
    expect(real.showCallsign).toBe(true);
    expect(real.callsignTip).toBe('Radio callsign for p1:firing-1');
    expect(real.callsignAriaLabel).toBe('firing: p1:firing-1');
    expect(sentinel.showCallsign).toBe(false);
  });

  it('carries no verdict metadata when there is no matching flight-log entry', () => {
    const meta = firingTimelineRowMeta(
      { firingId: 'unattributed', entries: [{ at: 1 }] },
      null,
      {},
      headlineOf,
      fmtAgo,
    );
    expect(meta.verdict).toBeNull();
    expect(meta.verdictClass).toBeNull();
    expect(meta.verdictTip).toBeNull();
    expect(meta.verdictAriaLabel).toBeNull();
  });

  it('derives the verdict class/tip/aria-label from the flight-log entry when one matches', () => {
    const meta = firingTimelineRowMeta(
      { firingId: 'p1:firing-1', entries: [{ at: 1 }] },
      {
        shipped: false,
        gateResult: 'checkpointed',
        died: 'turn-cap',
        sha: 'abc1234',
        turns: 1,
        failedCheck: null,
      },
      {},
      headlineOf,
      fmtAgo,
    );
    expect(meta.verdict).toBe('checkpointed');
    expect(meta.verdictClass).toBe('flight-verdict flight-checkpointed');
    expect(meta.verdictTip).toBe('How this firing ended: checkpointed');
    expect(meta.verdictAriaLabel).toBe('verdict: checkpointed');
  });

  it('pluralizes the event count for anything other than exactly 1', () => {
    const one = firingTimelineRowMeta(
      { firingId: 'p1:firing-1', entries: [{ at: 1 }] },
      FIRING,
      {},
      headlineOf,
      fmtAgo,
    );
    const many = firingTimelineRowMeta(
      { firingId: 'p1:firing-1', entries: [{ at: 1 }, { at: 2 }, { at: 3 }] },
      FIRING,
      {},
      headlineOf,
      fmtAgo,
    );
    expect(one.countLabel).toBe('1 event');
    expect(many.countLabel).toBe('3 events');
  });

  it('formats the started-ago tip/aria-label from the first entry via the injected fmtAgo', () => {
    const meta = firingTimelineRowMeta(
      { firingId: 'p1:firing-1', entries: [{ at: 555 }, { at: 999 }] },
      FIRING,
      {},
      headlineOf,
      fmtAgo,
    );
    expect(meta.startedAgo).toBe('555ms ago');
    expect(meta.startedAgoAriaLabel).toBe('started 555ms ago');
  });

  it('carries no redundancy chip metadata for a firing with no repeated tool+target calls', () => {
    const meta = firingTimelineRowMeta(
      {
        firingId: 'p1:firing-1',
        entries: [
          { at: 1, tool: 'Read', target: 'a.ts' },
          { at: 2, tool: 'Edit', target: 'a.ts' },
        ],
      },
      FIRING,
      {},
      headlineOf,
      fmtAgo,
    );
    expect(meta.redundancyLabel).toBeNull();
    expect(meta.redundancyTip).toBeNull();
    expect(meta.redundancyAriaLabel).toBeNull();
  });

  it('surfaces a redundancy chip when the same (tool, target) call repeats within the firing', () => {
    const meta = firingTimelineRowMeta(
      {
        firingId: 'p1:firing-1',
        entries: [
          { at: 1, tool: 'Read', target: 'a.ts' },
          { at: 2, tool: 'Read', target: 'a.ts' },
          { at: 3, tool: 'Read', target: 'a.ts' },
        ],
      },
      FIRING,
      {},
      headlineOf,
      fmtAgo,
    );
    expect(meta.redundancyLabel).toBe('⟲ 2 repeated');
    expect(meta.redundancyTip).toBe(
      '2 of 3 actions repeated an identical tool+target call already made this firing — a trajectory-quality signal outcome-only scoring misses',
    );
    expect(meta.redundancyAriaLabel).toBe('trajectory: ⟲ 2 repeated');
  });
});
