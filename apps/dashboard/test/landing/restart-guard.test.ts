// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A FLEET LAUNCH AND A SELF-RESTART NEVER OVERLAP (2026-09-30): a launch sent
 * right after a landing started one lane of five before the restart closed
 * the server.
 */
import { describe, it, expect } from 'vitest';
import {
  createRestartGuard,
  guardFleetLaunch,
  waitForLaunches,
  RESTART_PENDING_LINE,
} from '../../src/landing/restart-guard.js';

const args = { folder: 'Z:/repo', laneCount: 5, firings: 2, budgetUsd: 30 };

describe('guardFleetLaunch', () => {
  it('refuses a launch while a restart is pending, without calling the launcher', async () => {
    const guard = createRestartGuard();
    guard.pending = true;
    let called = 0;
    const launch = guardFleetLaunch(async () => {
      called += 1;
      return { ok: true, lines: [] };
    }, guard);
    expect(await launch(args)).toEqual({ ok: false, lines: [RESTART_PENDING_LINE] });
    expect(called).toBe(0);
  });

  it('counts a launch while it runs, even one that throws', async () => {
    const guard = createRestartGuard();
    let seen = -1;
    const ok = guardFleetLaunch(async () => {
      seen = guard.launches;
      return { ok: true, lines: ['fleet: 5 lane(s)'] };
    }, guard);
    expect(await ok(args)).toEqual({ ok: true, lines: ['fleet: 5 lane(s)'] });
    expect(seen).toBe(1);
    expect(guard.launches).toBe(0);
    const failing = guardFleetLaunch(async () => {
      throw new Error('store locked');
    }, guard);
    await expect(failing(args)).rejects.toThrow('store locked');
    expect(guard.launches).toBe(0);
  });
});

describe('waitForLaunches', () => {
  it('returns at once when no launch is under way', async () => {
    let slept = 0;
    await waitForLaunches(createRestartGuard(), async () => {
      slept += 1;
    });
    expect(slept).toBe(0);
  });

  it('waits until the launch under way finishes', async () => {
    const guard = createRestartGuard();
    guard.launches = 1;
    let polls = 0;
    await waitForLaunches(guard, async () => {
      polls += 1;
      if (polls === 3) guard.launches = 0;
    });
    expect(polls).toBe(3);
  });

  it('gives up after its limit, so a hung launch cannot hold a landed rebuild back', async () => {
    const guard = createRestartGuard();
    guard.launches = 1;
    let t = 0;
    await waitForLaunches(
      guard,
      async () => {
        t += 1_000;
      },
      () => t,
      5_000,
    );
    expect(t).toBe(5_000);
    expect(guard.launches).toBe(1);
  });
});
