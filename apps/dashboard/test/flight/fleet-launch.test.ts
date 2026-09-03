// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLEET LAUNCH PLAN (EVAL 08-27, board web-mtb8i2lo-j7qcg9 "SHARDING HAS NO
 * CALLER"). `partitionBoardScopes` was written, tested, and never called by
 * anything in production — its only importer was its own test — so every lane
 * pulled from the whole board. The 3-lane ramp on 2026-08-27 proved the cost:
 * the base lane and fleet-2 claimed two DIFFERENT tasks (leases work) that
 * both needed `packages/engine/src/firing.ts`, the pre-commit sibling scan
 * correctly refused the second commit, and a whole paid round shipped nothing.
 *
 * This is the missing coordinator: it partitions the open board across the
 * roster BEFORE launch so same-area tasks — which the partitioner's HUB RULE
 * defines as exactly the ones that touch the same files — can never be in
 * flight on two lanes at once.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildFleetLaunchPlan,
  fleetLaneNames,
  parseFleetCliArgs,
  runFleetLaunch,
  type FleetLaunchPostBody,
  type FleetLaunchPostResult,
} from '../../src/flight/fleet-launch.js';

const task = (id: string, title: string) => ({ id, title });

describe('fleetLaneNames', () => {
  it('names the first lane base (no instanceId) and the rest fleet-N, matching the worktree layout', () => {
    // Worktrees on disk are fly-autopilot, fly-autopilot--fleet-2, ... so the
    // second lane must be fleet-2, not fleet-1.
    expect(fleetLaneNames(3)).toEqual([undefined, 'fleet-2', 'fleet-3']);
  });

  it('gives a single lane no instanceId at all — a solo flight behaves exactly as before', () => {
    expect(fleetLaneNames(1)).toEqual([undefined]);
  });

  it('refuses a non-positive lane count rather than launching nothing silently', () => {
    expect(() => fleetLaneNames(0)).toThrow(/at least one lane/i);
  });
});

describe('buildFleetLaunchPlan', () => {
  it('keeps same-area tasks on ONE lane — the collision the 3-lane ramp actually hit', () => {
    // Both of these name firing.ts and key to area "GATE"; on 2026-08-27 they
    // went to two lanes and cost a round.
    const tasks = [
      task('t1', 'GATE HOLE 2 (EVAL 08-27): the gate judges the WORKING TREE not the commit'),
      task('t2', 'GATE HOLE 4 (EVAL 08-27): checkpoint commits are NEVER gated'),
      task('t3', 'SYNC-BACK REFUSAL IS SILENT (EVAL 08-27): a refused merge is one log line'),
    ];
    const plan = buildFleetLaunchPlan(tasks, 3);

    const laneOf = (id: string) => plan.findIndex((p) => p.taskScope.includes(id));
    expect(laneOf('t1')).toBe(laneOf('t2'));
    expect(laneOf('t3')).not.toBe(laneOf('t1'));
  });

  it('partitions disjointly — no task id is handed to two lanes', () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      task(`t${i}`, `AREA${i % 4} slice ${i}: do the thing`),
    );
    const plan = buildFleetLaunchPlan(tasks, 3);

    const all = plan.flatMap((p) => p.taskScope);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(tasks.map((t) => t.id)));
  });

  it('carries the lane roster onto the plan so each lane launches under its own identity', () => {
    const plan = buildFleetLaunchPlan([task('t1', 'ALPHA one')], 2);
    expect(plan.map((p) => p.instanceId)).toEqual([undefined, 'fleet-2']);
  });

  it('still returns every lane when there are fewer groups than lanes — an empty scope falls back to pull', () => {
    // partition-then-pull: an empty scope means "no reservation", not "idle".
    const plan = buildFleetLaunchPlan([task('t1', 'ALPHA one')], 3);
    expect(plan).toHaveLength(3);
    expect(plan.filter((p) => p.taskScope.length === 0)).toHaveLength(2);
  });

  it('returns one empty-scope lane for an empty board rather than throwing', () => {
    expect(buildFleetLaunchPlan([], 1)).toEqual([{ instanceId: undefined, taskScope: [] }]);
  });
});

describe('parseFleetCliArgs', () => {
  // `dashboard fleet` previously read `firings`/`budgetUsd` with a bare
  // `Number(...)` and never checked the result — garbage CLI input became
  // NaN and rode silently all the way into the spawned flight's budget.
  // `laneCount` was the only argument actually validated.
  it('parses a fully-specified command line', () => {
    expect(parseFleetCliArgs(['./repo', '3', '5', '2.5'], 10)).toEqual({
      ok: true,
      args: { folder: './repo', laneCount: 3, firings: 5, budgetUsd: 2.5 },
    });
  });

  it('defaults lanes to 3, firings to 1, and budget to the caller-supplied default', () => {
    expect(parseFleetCliArgs(['./repo', undefined, undefined, undefined], 10)).toEqual({
      ok: true,
      args: { folder: './repo', laneCount: 3, firings: 1, budgetUsd: 10 },
    });
  });

  it('rejects a missing folder', () => {
    expect(parseFleetCliArgs([undefined, '3'], 10)).toEqual({
      ok: false,
      usage: expect.stringContaining('usage: dashboard fleet'),
    });
  });

  it('rejects a blank folder', () => {
    expect(parseFleetCliArgs(['  ', '3'], 10).ok).toBe(false);
  });

  it('rejects a non-integer or non-positive lane count', () => {
    expect(parseFleetCliArgs(['./repo', '1.5'], 10).ok).toBe(false);
    expect(parseFleetCliArgs(['./repo', '0'], 10).ok).toBe(false);
    expect(parseFleetCliArgs(['./repo', 'nope'], 10).ok).toBe(false);
  });

  it('rejects a non-integer or non-positive firings count instead of letting NaN through', () => {
    expect(parseFleetCliArgs(['./repo', '3', 'garbage'], 10).ok).toBe(false);
    expect(parseFleetCliArgs(['./repo', '3', '0'], 10).ok).toBe(false);
    expect(parseFleetCliArgs(['./repo', '3', '-1'], 10).ok).toBe(false);
  });

  it('rejects a non-finite or non-positive budget instead of letting NaN through', () => {
    expect(parseFleetCliArgs(['./repo', '3', '1', 'garbage'], 10).ok).toBe(false);
    expect(parseFleetCliArgs(['./repo', '3', '1', '0'], 10).ok).toBe(false);
    expect(parseFleetCliArgs(['./repo', '3', '1', '-5'], 10).ok).toBe(false);
  });
});

describe('runFleetLaunch', () => {
  // Pulled out of `control/cli.ts`'s `case 'fleet':` (FLEET LANE LAUNCHER,
  // board web-mtb8i2kx-1wfguc) — the POST/stagger loop that actually spawns
  // lanes had zero test coverage of its own; only its two building blocks
  // (parseFleetCliArgs, buildFleetLaunchPlan) were unit-tested.

  const baseArgs = { folder: '/repo', laneCount: 2, firings: 1, budgetUsd: 5 };

  it('POSTs one lane per plan entry, staggered — no sleep before the first lane', async () => {
    const sleep = vi.fn(async () => {});
    const postFly = vi
      .fn<(body: FleetLaunchPostBody) => Promise<FleetLaunchPostResult>>()
      .mockResolvedValue({ status: 200, started: true });

    const result = await runFleetLaunch(baseArgs, 20_000, {
      loadOpenTasks: () => [],
      postFly,
      sleep,
    });

    expect(postFly).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(20_000);
    // Base lane omits instanceId; the second lane carries fleet-2.
    expect(postFly.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ folder: '/repo', firings: 1, budgetUsd: 5, taskScope: [] }),
    );
    expect(postFly.mock.calls[0]?.[0]).not.toHaveProperty('instanceId');
    expect(postFly.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ instanceId: 'fleet-2', taskScope: [] }),
    );
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual([
      expect.stringContaining('fleet: 2 lane(s) over 0 open task(s)'),
      expect.stringContaining('base: 200 started — 0 task(s) reserved'),
      expect.stringContaining('fleet-2: 200 started — 0 task(s) reserved'),
    ]);
  });

  it('partitions loadOpenTasks() output across lanes before posting', async () => {
    const postFly = vi
      .fn<(body: FleetLaunchPostBody) => Promise<FleetLaunchPostResult>>()
      .mockResolvedValue({ status: 200, started: true });
    const tasks = [
      { id: 't1', title: 'ALPHA one' },
      { id: 't2', title: 'BETA two' },
    ];

    await runFleetLaunch(baseArgs, 0, {
      loadOpenTasks: () => tasks,
      postFly,
      sleep: async () => {},
    });

    const scopes = postFly.mock.calls.map((c) => c[0].taskScope);
    expect(new Set(scopes.flat())).toEqual(new Set(['t1', 't2']));
  });

  it('reports a rejected POST per-lane, keeps going, and flips ok to false', async () => {
    const postFly = vi
      .fn<(body: FleetLaunchPostBody) => Promise<FleetLaunchPostResult>>()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ status: 200, started: true });

    const result = await runFleetLaunch(baseArgs, 0, {
      loadOpenTasks: () => [],
      postFly,
      sleep: async () => {},
    });

    expect(postFly).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(result.lines[1]).toContain('base: could not reach the dashboard — Error: ECONNREFUSED');
    expect(result.lines[2]).toContain('fleet-2: 200 started');
  });

  it('reports a non-2xx dashboard response as an honest per-lane refusal, not a launcher failure', async () => {
    const postFly = vi
      .fn<(body: FleetLaunchPostBody) => Promise<FleetLaunchPostResult>>()
      .mockResolvedValue({ status: 409, started: false });

    const result = await runFleetLaunch({ ...baseArgs, laneCount: 1 }, 0, {
      loadOpenTasks: () => [],
      postFly,
      sleep: async () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.lines[1]).toContain('base: 409 not started — 0 task(s) reserved');
  });
});
