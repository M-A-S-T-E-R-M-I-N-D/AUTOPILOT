// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Impacted-tests-first gate scheduling (BACKLOG web-msnt26tn-jvyihy "PARALLEL
 * GATE + test-impact"). Most firings only touch a handful of files — running
 * the full suite every firing re-verifies code nothing this firing changed.
 * When the project's gate detected a `testImpacted` command (e.g. a
 * `test:impacted` script wrapping `vitest run --changed HEAD~1`, which scopes
 * the run to the commit the gate is judging), most firings run that fast path
 * instead of the full `test` command. A scheduled full run every
 * {@link FULL_TEST_EVERY_N_FIRINGS} firings still catches whatever the
 * changed-file graph misses (a stale mock, an untracked runtime dependency)
 * without paying the full suite's cost on every single firing.
 */

import type { GateCommand, GateCommands, GateSpec } from '@autopilot/onboarding';

/** Every Nth firing (including the very first, prior count 0) runs the full
 *  suite instead of the impacted-only fast path. */
export const FULL_TEST_EVERY_N_FIRINGS = 5;

/** True when `priorFiringCount` (this project's completed firings before the
 *  one about to start) is due for a full-suite run rather than impacted-only. */
export function isFullTestRunDue(priorFiringCount: number): boolean {
  return priorFiringCount % FULL_TEST_EVERY_N_FIRINGS === 0;
}

/**
 * Picks the gate's `test` command for the firing about to run: `testImpacted`
 * on the fast path when the project's detector found one, `test` itself when
 * it didn't or a scheduled full run is due. Returns whatever `test` is
 * (including `undefined`) when there is no `testImpacted` to schedule around.
 */
export function selectTestCommand(
  spec: Pick<GateCommands, 'test' | 'testImpacted'>,
  priorFiringCount: number,
): GateCommand | undefined {
  if (!spec.testImpacted || isFullTestRunDue(priorFiringCount)) return spec.test;
  return spec.testImpacted;
}

/**
 * The gate spec for a PER-FIRING gate run: the detected spec with `test`
 * resolved through {@link selectTestCommand}'s impacted-tests-first
 * schedule. This is the ONLY place that schedule should apply — see
 * {@link fullGateSpec} for the other of the "two call sites, two gate
 * weights" (board web-mtbeu5d3-n09acx "CONVERGENCE FULL GATE",
 * `convergence-gate.ts`'s doc comment).
 */
export function perFiringGateSpec(detected: GateSpec, priorFiringCount: number): GateSpec {
  const scheduledTest = selectTestCommand(detected, priorFiringCount);
  return { ...detected, ...(scheduledTest ? { test: scheduledTest } : {}) };
}

/**
 * The gate spec for the flight-end FULL convergence check: the detected
 * spec verbatim, never run through {@link perFiringGateSpec}'s schedule.
 * That schedule amortizes cost under PER-FIRING cadence pressure; the
 * flight-end sync-back is the one gate run explicitly because that
 * pressure doesn't apply, so scheduling it back down would silently
 * regress the "FULL" gate to a diff-scoped test run on
 * `FULL_TEST_EVERY_N_FIRINGS - 1` of every `FULL_TEST_EVERY_N_FIRINGS`
 * flights — exactly the additive-invariant blind spot this gate exists
 * to close.
 */
export function fullGateSpec(detected: GateSpec): GateSpec {
  return detected;
}
