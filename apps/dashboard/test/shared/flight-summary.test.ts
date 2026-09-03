// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for `flightHeadlineOf`/`finishedFlightSummaries` —
 * previously only exercised indirectly through `read/fleet.test.ts`'s full
 * aggregate pipeline, or via `flight-summary-parity.test.ts`'s
 * toString()-splice reconstruction against the rendered client bundle. This
 * pins down each headline-resolution branch and the finished-flight
 * filtering/closed-badge rules in isolation.
 */

import { describe, it, expect } from 'vitest';
import { flightHeadlineOf, finishedFlightSummaries } from '../../src/shared/flight-summary.js';
import type {
  FlightHeadlineEntry,
  FlightSummaryEntry,
  TaskLike,
} from '../../src/shared/flight-summary.js';

function entry(overrides: Partial<FlightHeadlineEntry>): FlightHeadlineEntry {
  return {
    item: null,
    kind: null,
    gateResult: null,
    died: null,
    completion: null,
    commitSubject: null,
    ...overrides,
  };
}

const TASKS: Readonly<Record<string, TaskLike>> = {
  t1: { id: 't1', title: 'Fix the login', status: 'done' },
  t2: { id: 't2', title: 'Refactor the poller', status: 'in_progress' },
};

describe('flightHeadlineOf', () => {
  it('leads with its own commit subject on a slice completion even when the task has a title', () => {
    const f = entry({
      item: 't1',
      completion: 'slice',
      commitSubject: 'wip: partial poller refactor',
    });
    expect(flightHeadlineOf(f, TASKS)).toBe('wip: partial poller refactor');
  });

  it('falls back to the task title when a slice completion has no commit subject', () => {
    const f = entry({ item: 't1', completion: 'slice', commitSubject: null });
    expect(flightHeadlineOf(f, TASKS)).toBe('Fix the login');
  });

  it('prefers the task title over the commit subject on a non-slice completion', () => {
    const f = entry({ item: 't1', completion: 'complete', commitSubject: 'fix: login redirect' });
    expect(flightHeadlineOf(f, TASKS)).toBe('Fix the login');
  });

  it('falls back to the commit subject when there is no matching task', () => {
    const f = entry({ item: 'unknown-task', commitSubject: 'chore: tidy imports' });
    expect(flightHeadlineOf(f, TASKS)).toBe('chore: tidy imports');
  });

  it('falls back to the commit subject when taskById is null', () => {
    const f = entry({ item: 't1', commitSubject: 'chore: tidy imports' });
    expect(flightHeadlineOf(f, null)).toBe('chore: tidy imports');
  });

  it('falls back to the item id when there is no task or commit subject', () => {
    const f = entry({ item: 'web-abc123' });
    expect(flightHeadlineOf(f, TASKS)).toBe('web-abc123');
  });

  it('reports a checkpointed death as died mid-unit', () => {
    const f = entry({ gateResult: 'checkpointed' });
    expect(flightHeadlineOf(f, TASKS)).toBe('died mid-unit — WIP packed into a checkpoint commit');
  });

  it('reports a turn-cap death distinctly from checkpointed', () => {
    const f = entry({ died: 'turn-cap' });
    expect(flightHeadlineOf(f, TASKS)).toBe('died at the turn cap — nothing committed');
  });

  it('lets a checkpointed gateResult take priority over a died reason', () => {
    const f = entry({ gateResult: 'checkpointed', died: 'turn-cap' });
    expect(flightHeadlineOf(f, TASKS)).toBe('died mid-unit — WIP packed into a checkpoint commit');
  });

  it('reports a timeout death', () => {
    const f = entry({ died: 'timeout' });
    expect(flightHeadlineOf(f, TASKS)).toBe(
      'timed out at the CLI wall-clock cap — nothing committed',
    );
  });

  it('reports an error death', () => {
    const f = entry({ died: 'error' });
    expect(flightHeadlineOf(f, TASKS)).toBe('errored mid-firing — nothing committed');
  });

  it('falls back to a plain kind-labeled firing when nothing else resolves', () => {
    const f = entry({ kind: 'refactor' });
    expect(flightHeadlineOf(f, TASKS)).toBe('refactor firing');
  });

  it('falls back to "a firing" when kind is also missing', () => {
    const f = entry({});
    expect(flightHeadlineOf(f, TASKS)).toBe('a firing');
  });
});

function summaryEntry(overrides: Partial<FlightSummaryEntry>): FlightSummaryEntry {
  return {
    id: 'flight-1',
    item: null,
    kind: null,
    gateResult: null,
    died: null,
    completion: null,
    commitSubject: null,
    shipped: true,
    cost: 0,
    sha: null,
    at: 0,
    ...overrides,
  };
}

describe('finishedFlightSummaries', () => {
  it('skips flights that did not ship', () => {
    const flightLog = [
      summaryEntry({ id: 'a', shipped: false }),
      summaryEntry({ id: 'b', shipped: true }),
    ];
    const result = finishedFlightSummaries({ tasks: Object.values(TASKS), flightLog });
    expect(result.map((s) => s.id)).toEqual(['b']);
  });

  it('sets closedTaskTitle only when the matching task status is done', () => {
    const flightLog = [
      summaryEntry({ id: 'done-task', item: 't1' }),
      summaryEntry({ id: 'in-progress-task', item: 't2' }),
      summaryEntry({ id: 'no-task', item: null }),
    ];
    const result = finishedFlightSummaries({ tasks: Object.values(TASKS), flightLog });
    expect(result.find((s) => s.id === 'done-task')?.closedTaskTitle).toBe('Fix the login');
    expect(result.find((s) => s.id === 'in-progress-task')?.closedTaskTitle).toBeNull();
    expect(result.find((s) => s.id === 'no-task')?.closedTaskTitle).toBeNull();
  });

  it('carries through cost, sha, and at alongside the resolved headline', () => {
    const flightLog = [
      summaryEntry({ id: 'flight-9', item: 't1', cost: 1.23, sha: 'abc1234', at: 42 }),
    ];
    const result = finishedFlightSummaries({ tasks: Object.values(TASKS), flightLog });
    expect(result).toEqual([
      {
        id: 'flight-9',
        headline: 'Fix the login',
        cost: 1.23,
        // Cost semantics v3 (epic 0013): summaries now always carry the
        // real-spend field; null when no firing recorded an apportioned cost.
        realCostUsd: null,
        sha: 'abc1234',
        closedTaskTitle: 'Fix the login',
        at: 42,
      },
    ]);
  });

  it('returns an empty array when the flight log is empty', () => {
    expect(finishedFlightSummaries({ tasks: Object.values(TASKS), flightLog: [] })).toEqual([]);
  });

  it('treats a missing flightLog the same as an empty one', () => {
    const result = finishedFlightSummaries({
      tasks: Object.values(TASKS),
      flightLog: undefined as unknown as readonly FlightSummaryEntry[],
    });
    expect(result).toEqual([]);
  });

  it('treats a missing tasks list the same as an empty one', () => {
    const flightLog = [summaryEntry({ id: 'a', item: 't1', commitSubject: 'fix: thing' })];
    const result = finishedFlightSummaries({
      tasks: undefined as unknown as readonly TaskLike[],
      flightLog,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.headline).toBe('fix: thing');
    expect(result[0]?.closedTaskTitle).toBeNull();
  });
});
