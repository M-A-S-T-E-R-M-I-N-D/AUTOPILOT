// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Lane freshness at launch: the forward fast-forward never yields to a
 * sibling's lock (it writes only the lane), the catch-up always does (it
 * writes the shared primary checkout). Pinned because both halves once sat
 * behind one guard and every lane after the first in a fleet round launched
 * stale — 51 skips against 33 forwards in the flight logs.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { planLaunchSync } from '../../src/flight/lane-freshness.js';

describe('planLaunchSync', () => {
  it('with no sibling live, both halves run and nothing is reported skipped', () => {
    expect(planLaunchSync(false)).toEqual({ catchUp: true, forward: true });
  });

  it('under a live sibling lock the catch-up yields, the forward-ff still runs, and the line says both', () => {
    const plan = planLaunchSync(true);
    expect(plan.catchUp).toBe(false);
    expect(plan.forward).toBe(true);
    expect(plan.skipped).toContain(
      'catch-up sync skipped: another flight already holds a live lock',
    );
    expect(plan.skipped).toContain("the lane's own fast-forward still runs");
  });
});

describe('fly.ts wiring', () => {
  const flySource = readFileSync(
    fileURLToPath(new URL('../../src/fly.ts', import.meta.url)),
    'utf8',
  );

  it('decides the launch sync through planLaunchSync and gates each half on its own flag', () => {
    expect(flySource).toContain(
      'const sync = planLaunchSync(isAnyFlightLockLive(dirname(dbPath), target, process.pid));',
    );
    // Each half sits behind its own flag; comment lines may precede the call.
    expect(flySource).toMatch(
      /if \(sync\.catchUp\) \{\n(?:\s*\/\/[^\n]*\n)*\s*const catchUp = await syncWorktreeBranch\(target, targetBranch, worktreePlan\.branch\);/,
    );
    expect(flySource).toMatch(
      /if \(sync\.forward\) \{\n(?:\s*\/\/[^\n]*\n)*\s*const forward = await fastForwardWorktree\(worktreePlan\.path, targetBranch\);/,
    );
    // The old single guard that skipped both halves is gone.
    expect(flySource).not.toContain('sync-back skipped: another flight already holds a live lock');
  });
});
