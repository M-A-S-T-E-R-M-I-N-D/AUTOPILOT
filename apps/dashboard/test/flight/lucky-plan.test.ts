// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The "I'm feeling lucky" flight-plan calibrator (`flight/lucky-plan.ts`):
 * one pure function that turns a machine + board probe into a launch plan
 * sized so the fleet delivers WITHOUT freezing the operator's machine — the
 * 2026-09-03 lesson (8 blind lanes pegged a 12-core box at 99% CPU, froze
 * the operator's foreground work, and starved the dashboard server into its
 * own BE-RIGHT-BACK overlay) turned into arithmetic.
 */

import { describe, it, expect } from 'vitest';
import {
  luckyPlan,
  LUCKY_MAX_LANES,
  LUCKY_BUDGET_USD,
  type LuckyProbe,
} from '../../src/flight/lucky-plan.js';

/** A roomy 12-core box with a drained CPU and a stocked board — every bound
 *  slack except the caller's override. */
function probe(overrides: Partial<LuckyProbe> = {}): LuckyProbe {
  return {
    cpuLoadPct: 10,
    logicalCores: 12,
    freeRamGb: 16,
    queuedTasks: 20,
    runningFlights: 0,
    ...overrides,
  };
}

describe('luckyPlan refusals — when now is simply not the time', () => {
  it('refuses while a flight is already running', () => {
    const plan = luckyPlan(probe({ runningFlights: 3 }));
    expect(plan.ok).toBe(false);
    expect(plan.refusal).toContain('already');
  });

  it('refuses an empty board — nothing queued means nothing to fly', () => {
    const plan = luckyPlan(probe({ queuedTasks: 0 }));
    expect(plan.ok).toBe(false);
    expect(plan.refusal).toContain('queued');
  });

  it('refuses when free RAM is below the 4 GB floor', () => {
    const plan = luckyPlan(probe({ freeRamGb: 3.5 }));
    expect(plan.ok).toBe(false);
    expect(plan.refusal).toContain('RAM');
  });

  it('refuses a machine already busy above 85% CPU — the operator is using it', () => {
    const plan = luckyPlan(probe({ cpuLoadPct: 90 }));
    expect(plan.ok).toBe(false);
    expect(plan.refusal).toContain('CPU');
  });

  it('a refused plan still reports zeroed launch numbers, never garbage', () => {
    const plan = luckyPlan(probe({ queuedTasks: 0 }));
    expect(plan.lanes).toBe(0);
    expect(plan.firings).toBe(0);
  });
});

describe('luckyPlan calibration — each bound can be the binding one', () => {
  it('CPU-bound: a half-loaded 12-core box gets ~2 cores per lane', () => {
    // (100-50)% of 12 cores = 6 usable → 3 lanes at 2 cores each.
    const plan = luckyPlan(probe({ cpuLoadPct: 50 }));
    expect(plan.ok).toBe(true);
    expect(plan.lanes).toBe(3);
    expect(plan.reasoning.join('\n')).toContain('CPU');
  });

  it('RAM-bound: 7 GB free minus the 4 GB floor funds exactly 2 lanes at 1.5 GB each', () => {
    const plan = luckyPlan(probe({ freeRamGb: 7 }));
    expect(plan.ok).toBe(true);
    expect(plan.lanes).toBe(2);
  });

  it('board-bound: 5 queued tasks fund 2 lanes — a lane needs at least 2 tasks to be worth its worktree', () => {
    const plan = luckyPlan(probe({ queuedTasks: 5 }));
    expect(plan.ok).toBe(true);
    expect(plan.lanes).toBe(2);
  });

  it('never exceeds the fleet-wide lane cap even on an idle monster box', () => {
    const plan = luckyPlan(
      probe({ cpuLoadPct: 0, logicalCores: 64, freeRamGb: 128, queuedTasks: 100 }),
    );
    expect(plan.lanes).toBe(LUCKY_MAX_LANES);
  });

  it('never drops below one lane when every bound is tight but no refusal fires', () => {
    // 1 queued task → laneByTasks floors to 0, yet the plan still flies one lane.
    const plan = luckyPlan(probe({ queuedTasks: 1 }));
    expect(plan.ok).toBe(true);
    expect(plan.lanes).toBe(1);
  });
});

describe('luckyPlan firings and budget', () => {
  it('sizes firings so the round roughly drains each lane’s shard, clamped to [2, 4]', () => {
    // 20 tasks / 4 lanes = 5 → clamps to 4.
    const wide = luckyPlan(probe({ queuedTasks: 20, freeRamGb: 10 }));
    expect(wide.firings).toBe(4);
    // 5 tasks / 2 lanes = 2.5 → ceil 3.
    const narrow = luckyPlan(probe({ queuedTasks: 5 }));
    expect(narrow.firings).toBe(3);
    // 1 task / 1 lane = 1 → clamps up to 2 (a second firing collects/repairs).
    const tiny = luckyPlan(probe({ queuedTasks: 1 }));
    expect(tiny.firings).toBe(2);
  });

  it('keeps the per-firing budget at the fleet default', () => {
    expect(luckyPlan(probe()).budgetUsd).toBe(LUCKY_BUDGET_USD);
  });
});

describe('luckyPlan reasoning — the operator can audit the dice', () => {
  it('names every bound with its computed lane allowance', () => {
    const text = luckyPlan(probe()).reasoning.join('\n');
    expect(text).toContain('CPU');
    expect(text).toContain('RAM');
    expect(text).toContain('task');
  });

  it('is deterministic — the same probe always rolls the same plan', () => {
    const a = luckyPlan(probe({ cpuLoadPct: 33, freeRamGb: 9.7, queuedTasks: 7 }));
    const b = luckyPlan(probe({ cpuLoadPct: 33, freeRamGb: 9.7, queuedTasks: 7 }));
    expect(a).toEqual(b);
  });
});
