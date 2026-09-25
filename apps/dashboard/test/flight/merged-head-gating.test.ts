// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * THE MERGED HEAD IS GATED IN THE LANE'S PRIVATE WORKTREE, never in the
 * shared live checkout (four-lane rung, 2026-09-19). Both convergence gates
 * used to run in `target` — the one tree every lane's sync-back rewrites.
 * Two flight-end gates went red on `pnpm run test` while a sibling's merge
 * and full gate rewrote that checkout under them, and the same head passed
 * the whole suite alone. This census pins the wiring in fly.ts: the lane is
 * fast-forwarded to the merged head first, the gate runs there, and the one
 * gate that legitimately stays in `target` — the merge-escalation agent's
 * validation of an in-progress merge — is still rooted there.
 */
const flySource = readFileSync(fileURLToPath(new URL('../../src/fly.ts', import.meta.url)), 'utf8');

describe('merged-head gating (fly.ts census)', () => {
  it('the per-firing typecheck convergence gate runs in the lane worktree', () => {
    expect(flySource).toMatch(
      /const typecheckConvergedGate: GatePort = \{[\s\S]*?new GateRunner\(\{\n(?:\s*\/\/[^\n]*\n)*\s*cwd: flightRoot,/,
    );
  });

  it('the full gate has a lane-rooted twin for convergence and keeps its target-rooted one for merge escalation', () => {
    expect(flySource).toContain('const fullConvergedGate = fullConvergedGateAt(target);');
    expect(flySource).toContain('const fullConvergedGateInLane = fullConvergedGateAt(flightRoot);');
    expect(flySource).toContain(
      'createGitMergeEscalationDeps(target, fullConvergedGate, invokeAgent)',
    );
  });

  it('every convergence gate goes through gateMergedHead, after the lane is fast-forwarded to the merged head', () => {
    // One real call — inside the helper — plus the import line (no paren).
    expect(flySource.match(/gateConvergedBranch\(/g)).toHaveLength(1);
    expect(flySource).toMatch(
      /const forwardLaneToMergedHead = async \(mergeDetails: string\): Promise<boolean> => \{\n\s*const forward = await fastForwardWorktree\(worktreePlan\.path, targetBranch\);/,
    );
    // Per-firing: forward, re-snapshot the guard baseline, then the typecheck gate.
    expect(flySource).toMatch(
      /const gated = await forwardLaneToMergedHead\(sync\.details\);\n\s*guarded = snapshotGuardedHeads\([\s\S]*?\);\n\s*if \(gated\) await gateMergedHead\(sync\.details, typecheckConvergedGate\);/,
    );
    // Flight-end: forward, re-snapshot, announce, then the gate in the lane —
    // the light one while a sibling still flies, the FULL one for the last
    // lane (2026-09-25: one full gate per fleet).
    expect(flySource).toMatch(
      /const gated = await forwardLaneToMergedHead\(finalSync\.details\);\n\s*guarded = snapshotGuardedHeads\([\s\S]*?\);\n\s*out\(` {2}🔁 flight-end sync-back: \$\{finalSync\.details\}`\);[\s\S]*?if \(gated && siblingsStillFlying\) \{[\s\S]*?await gateMergedHead\(finalSync\.details, typecheckConvergedGate\);\n\s*\} else if \(gated\) \{\n\s*await gateMergedHead\(finalSync\.details, fullConvergedGateInLane\);/,
    );
    expect(flySource).toContain(
      'inFleet && isAnyFlightLockLive(dirname(dbPath), target, process.pid);',
    );
  });

  it('a firing on an unverified lane head runs the full test suite, so its green covers every commit it publishes (2026-09-26)', () => {
    expect(flySource).toMatch(
      /return !laneHead\.verified && result\.gate\.spec\.test\s*\?\s*\{ \.\.\.scheduled, test: result\.gate\.spec\.test \}\s*:\s*scheduled;/,
    );
  });

  it('every flight gate step — the firing gate and both convergence gates — carries the thirty-minute ceiling', () => {
    expect(flySource).toContain('const FLIGHT_GATE_STEP_TIMEOUT_MS = 30 * 60_000;');
    expect(flySource.match(/timeoutMs: FLIGHT_GATE_STEP_TIMEOUT_MS,/g)).toHaveLength(3);
  });

  it('a lane that cannot be fast-forwarded says so and persists the gap as a convergence alarm', () => {
    expect(flySource).toContain('⚠ convergence UNGATED:');
    expect(flySource).toMatch(
      /recordConvergenceRed\(\s*'lane fast-forward \(merged head not gated\)',\s*mergeDetails,\s*0,\s*forward\.details,?\s*\);/,
    );
  });
});
