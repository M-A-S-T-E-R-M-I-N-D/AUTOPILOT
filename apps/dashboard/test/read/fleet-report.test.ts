// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE FLEET REPORT (2026-09-25): every round is judged the same way — what
 * the firings worked on, how they ended, what a ship cost, and what the
 * convergence gate really said.
 */
import { describe, it, expect } from 'vitest';
import {
  taskClass,
  firingOutcome,
  laneOf,
  summarizeFirings,
  summarizeConvergence,
  renderFleetReport,
  type ReportFiring,
} from '../../src/read/fleet-report.js';

const base: ReportFiring = {
  firingId: 'fly-autopilot:firing-1',
  title: 'a task',
  subject: 'feat(x): a thing',
  shipped: true,
  died: null,
  noopClass: null,
  gateResult: 'passed',
  costUsd: 2,
  durationMs: 10 * 60_000,
  model: 'claude-sonnet-5',
};

describe('taskClass', () => {
  it('reads product work, tests, docs and chores off the commit subject', () => {
    expect(taskClass('t', 'feat(pool): x')).toBe('product');
    expect(taskClass('t', 'fix: x')).toBe('product');
    expect(taskClass('t', 'perf(ci): x')).toBe('product');
    expect(taskClass('t', 'refactor!: x')).toBe('product');
    expect(taskClass('t', 'test(e2e): x')).toBe('test');
    expect(taskClass('t', 'docs: x')).toBe('docs');
    expect(taskClass('t', 'chore(deps): x')).toBe('chore');
  });

  it('reads the board title first for verdicts, meta checks and convergence reds', () => {
    expect(taskClass('VERDICT blocked web-a-1: x', null)).toBe('verdict');
    expect(taskClass('t', 'docs: reconfirm x (VERDICT ap-1-2)')).toBe('verdict');
    expect(taskClass('VERIFY-BY 2026-10-01: x', 'docs: x')).toBe('meta-check');
    expect(taskClass('DOC-FRESHNESS: x', 'docs: x')).toBe('meta-check');
    expect(taskClass('CONVERGENCE RED: pnpm run test fails', 'fix: x')).toBe('convergence-red');
  });

  it('says so when nothing was committed', () => {
    expect(taskClass('t', null)).toBe('no commit');
    expect(taskClass(null, '')).toBe('no commit');
  });
});

describe('firingOutcome and laneOf', () => {
  it('names the ending, death first', () => {
    expect(firingOutcome(base)).toBe('shipped');
    expect(firingOutcome({ ...base, shipped: false, died: 'timeout' })).toBe('died (timeout)');
    expect(firingOutcome({ ...base, shipped: false, noopClass: 'silent' })).toBe(
      'no commit (silent)',
    );
    expect(firingOutcome({ ...base, shipped: false, gateResult: 'reverted' })).toBe(
      'not shipped (reverted)',
    );
    expect(firingOutcome({ ...base, shipped: false, gateResult: null })).toBe(
      'not shipped (unknown)',
    );
  });

  it('reads the lane off the firing id', () => {
    expect(laneOf('fly-autopilot:firing-9')).toBe('base');
    expect(laneOf('fly-autopilot--fleet-3:firing-9')).toBe('fleet-3');
  });
});

describe('summarizeFirings', () => {
  it('counts, costs and takes the median duration', () => {
    const s = summarizeFirings([
      base,
      { ...base, shipped: false, costUsd: 1, durationMs: 2 * 60_000 },
      { ...base, costUsd: 3, durationMs: 30 * 60_000 },
    ]);
    expect(s).toEqual({
      firings: 3,
      shipped: 2,
      died: 0,
      costUsd: 6,
      costPerShipUsd: 3,
      medianMinutes: 10,
    });
  });

  it('has no cost per ship when nothing shipped, and a median of an even count', () => {
    const s = summarizeFirings([
      { ...base, shipped: false, died: 'error', durationMs: 60_000 },
      { ...base, shipped: false, durationMs: 3 * 60_000 },
    ]);
    expect(s.costPerShipUsd).toBeNull();
    expect(s.died).toBe(1);
    expect(s.medianMinutes).toBe(2);
    expect(summarizeFirings([]).medianMinutes).toBe(0);
  });
});

describe('summarizeConvergence', () => {
  it("tells a lane's own red, a merge red and no verdict apart", () => {
    const c = summarizeConvergence([
      { verdict: 'green', check: null, merge: 'fast-forwarded x', queuedMs: 10_000 },
      { verdict: 'red', check: 'pnpm run ci:doc-commit-refs', merge: 'fast-forwarded x' },
      { verdict: 'red', check: 'pnpm run ci:doc-commit-refs', merge: 'fast-forwarded y' },
      { verdict: 'red', check: 'pnpm run test', merge: 'chore: sync lane', queuedMs: 30_000 },
      { verdict: 'red', check: 'pnpm run test (crashed, no verdict)', merge: 'fast-forwarded z' },
      { verdict: 'red', check: 'lane fast-forward (merged head not gated)', merge: 'x' },
      { verdict: 'red', check: null, merge: null },
    ]);
    expect(c).toEqual({
      green: 1,
      redOwnCommit: 2,
      redMerge: 1,
      unjudged: 3,
      failingChecks: [
        ['pnpm run ci:doc-commit-refs', 2],
        ['pnpm run test', 1],
      ],
      medianQueuedSeconds: 20,
    });
  });

  it('has no queue figure when no verdict recorded one', () => {
    expect(summarizeConvergence([]).medianQueuedSeconds).toBeNull();
  });
});

describe('renderFleetReport', () => {
  it('prints every section, with the convergence split and the queue wait', () => {
    const lines = renderFleetReport(
      [base, { ...base, firingId: 'fly-autopilot--fleet-2:firing-2', subject: 'docs: x' }],
      [
        { verdict: 'red', check: 'pnpm run ci:x', merge: 'fast-forwarded a', queuedMs: 4_000 },
        { verdict: 'green', check: null, merge: 'fast-forwarded b' },
      ],
      'last 7 days',
    );
    const text = lines.join('\n');
    expect(lines[0]).toBe('fleet report — last 7 days');
    expect(text).toContain('by what it worked on');
    expect(text).toContain('by outcome');
    expect(text).toContain('by lane');
    expect(text).toContain('by model');
    expect(text).toContain('by model and work');
    expect(text).toContain('claude-sonnet-5 · product');
    expect(text).toContain('fleet-2');
    expect(text).toContain("green 1  red on a lane's own commit 1  red on a merge 0  no verdict 0");
    expect(text).toContain('  1× pnpm run ci:x');
    expect(text).toContain('median wait for a gate slot: 4s');
    expect(lines[1]).toContain('shipped 100%');
    expect(lines[1]).toContain('per ship   $2.00');
  });
});

describe('renderFleetReport parked lanes (2026-09-25)', () => {
  it('lists lanes whose commits never reached the flight branch, and says none otherwise', () => {
    const parked = renderFleetReport([], [], 'w', [
      { branch: 'autopilot/flight-worktree-p--fleet-4', commits: 3 },
      { branch: 'autopilot/flight-worktree-p--fleet-2', commits: 0 },
    ]).join('\n');
    expect(parked).toContain('commits parked on a lane, not on the flight branch');
    expect(parked).toContain('  3 on autopilot/flight-worktree-p--fleet-4');
    expect(parked).not.toContain('fleet-2');
    expect(renderFleetReport([], [], 'w').join('\n')).toContain(
      'commits parked on a lane, not on the flight branch\n  none',
    );
  });
});
