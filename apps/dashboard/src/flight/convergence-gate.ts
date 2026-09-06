// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { GatePort } from '@autopilot/engine';
import { median } from '@autopilot/store';

/**
 * CONVERGENCE GATE — verify the MERGED branch after a sync-back.
 *
 * Each lane gates its own worktree, then `syncWorktreeBranch` merges into
 * `targetBranch` and only checks that git succeeded. A clean auto-merge of
 * two individually-green lanes can still be red, and it has been twice:
 * `eab78a89` (auto-merge kept both sides of four test fixtures → duplicate
 * object keys) and `f13ba9ee` (two lanes re-exported different symbols →
 * dangling re-export). Both were tsc-red while vitest stayed GREEN, because
 * esbuild's transform tolerates duplicate keys (last wins).
 *
 * Two call sites, two gate weights (board web-mtbeu5d3-n09acx "CONVERGENCE
 * FULL GATE"):
 *  - Per-firing sync-back: typecheck only (~17s) — the ~109s median gap
 *    between two lanes advancing the branch can't absorb a full gate
 *    (~160s), and typecheck alone caught both recorded incidents.
 *  - Flight-end final sync-back: the FULL detected gate (typecheck + lint +
 *    format + test + build) — this runs once, after the last lane for the
 *    flight has landed, so the cadence pressure above doesn't apply. It is
 *    the one point that can still catch an ADDITIVE invariant two
 *    individually-green lanes each respect alone but jointly bust (a lint
 *    rule, a test count, a build-time budget) before the next landing
 *    ritual runs — `docs/DOCTRINE-COORDINATION.md` documents that ritual as
 *    the only OTHER full-suite gate on this branch, and it only fires on an
 *    explicit land, so a flight that never lands never sees it.
 *
 * Alarm, not a blocker either way: refusing the merge here would strand
 * work that is already committed and safe. A red convergence is surfaced
 * loudly and persisted, same contract as `sync-back-refusal`.
 *
 * GATE HONESTY (board web-mtq6zxl0-178q9e): the duration-is-the-tell comment
 * above used to be just that — a comment. Nothing actually compared a green
 * run's duration against anything, so an implausibly fast "pass" (the exact
 * shape that let `test:impacted` execute zero tests across 15 firings while
 * still reporting `passed`, docs/EVALUATION-2026-08-27-silent-gate.md §1)
 * would sail through this gate looking identical to a real one. A green run
 * is now judged against a plausibility floor derived from the ROLLING MEDIAN
 * of this exact check signature's own past green durations (see
 * {@link convergencePlausibilityFloorMs}) — a run that finishes far faster
 * than its own history is demoted to UNVERIFIABLE instead of silently
 * trusted. Scoped per check SIGNATURE (the sorted, joined check labels), not
 * globally: the two call sites above have wildly different expected
 * durations, and mixing their histories would make the fast one impossible
 * to flag and the slow one impossible to under-run.
 */
export interface ConvergenceGateDeps {
  readonly gate: GatePort;
  readonly out: (line: string) => void;
  readonly recordRed: (check: string, mergeDetails: string) => void;
  /** Past durations (ms) of GREEN convergence runs sharing this exact check
   *  SIGNATURE — the population {@link convergencePlausibilityFloorMs} judges
   *  a new green against. Empty or short (cold start) falls back to a fixed
   *  floor instead of trusting a population of 0-2 samples. */
  readonly pastGreenDurationsMs: (signature: string) => readonly number[];
  /** Persist a genuinely plausible green's duration so future runs' rolling
   *  median includes it. Never called for a run demoted to UNVERIFIABLE —
   *  folding a suspected zero-work run into the population would drag the
   *  floor down and make the next one even harder to catch. */
  readonly recordGreen: (signature: string, ms: number) => void;
  /** A green result whose duration fell below the plausibility floor — the
   *  gate reported success, but too fast to trust the checks actually ran.
   *  Alarm only, same non-blocking contract as `recordRed`: the merge already
   *  landed and stays landed either way — only the confidence in it changes. */
  readonly recordUnverifiable: (signature: string, ms: number, floorMs: number) => void;
}

/** How many past green runs (same signature) count as "enough history" to
 *  trust a rolling median over the fixed cold-start floor. */
export const MIN_GREEN_HISTORY_SAMPLES = 3;

/** A new green must clear at least this fraction of its signature's historical
 *  median duration to be trusted — below it, the run is "too fast to be real"
 *  rather than merely fast. 10%: real runs vary with machine load and file
 *  count, but a check suite that actually executed does not finish 10x faster
 *  than its own history. */
export const CONVERGENCE_FLOOR_RATIO = 0.1;

/** Fixed floor used before {@link MIN_GREEN_HISTORY_SAMPLES} real samples
 *  exist for a signature (cold start — a brand-new project, or a check
 *  combination never seen before). Deliberately low (real gate runs are
 *  "seconds to low minutes" per the module doc above) so a first-ever green
 *  is judged only against an implausibly-near-zero result, not against a
 *  median it has no data for yet. */
export const CONVERGENCE_COLD_START_FLOOR_MS = 250;

/** The plausibility floor a green convergence run's total duration must clear
 *  to be trusted rather than demoted to UNVERIFIABLE — see the module doc's
 *  "GATE HONESTY" section for why. */
export function convergencePlausibilityFloorMs(pastGreenDurationsMs: readonly number[]): number {
  if (pastGreenDurationsMs.length < MIN_GREEN_HISTORY_SAMPLES) {
    return CONVERGENCE_COLD_START_FLOOR_MS;
  }
  const typical = median(pastGreenDurationsMs) ?? CONVERGENCE_COLD_START_FLOOR_MS;
  return typical * CONVERGENCE_FLOOR_RATIO;
}

/** Identifies a gate's "shape" (which checks ran) independent of run order —
 *  the key {@link convergencePlausibilityFloorMs}'s history is scoped by, so
 *  the ~17s per-firing typecheck-only gate and the ~160s flight-end full gate
 *  never pollute each other's rolling median. */
function convergenceCheckSignature(checks: readonly { label: string }[]): string {
  return [...checks]
    .map((c) => c.label)
    .sort()
    .join('+');
}

export async function gateConvergedBranch(
  targetBranch: string,
  mergeDetails: string,
  deps: ConvergenceGateDeps,
): Promise<void> {
  const result = await deps.gate.run();
  const checks = result.checks ?? [];
  // Nothing detected for this repo (e.g. no typecheck command) — silent
  // no-op, not a false "convergence passes" green.
  if (checks.length === 0) return;

  if (result.ok) {
    const ms = checks.reduce((sum, c) => sum + c.durationMs, 0);
    const signature = convergenceCheckSignature(checks);
    const history = deps.pastGreenDurationsMs(signature);
    const floorMs = convergencePlausibilityFloorMs(history);
    if (ms < floorMs) {
      // Demoted, not blocked — same alarm-only contract as CONVERGENCE RED
      // below: the merge already landed and stays landed, but this result
      // must not be trusted as a real verification.
      deps.out(
        `  ⚠ convergence UNVERIFIABLE: '${targetBranch}' reported ${checks.length} check(s) ` +
          `passing in ${Math.round(ms)}ms — below the ${Math.round(floorMs)}ms plausibility floor ` +
          `(${
            history.length >= MIN_GREEN_HISTORY_SAMPLES
              ? `${(CONVERGENCE_FLOOR_RATIO * 100).toFixed(0)}% of the ${Math.round(median(history) ?? 0)}ms median over ${history.length} past green runs`
              : 'cold-start default, not enough history yet'
          }) — too fast to trust the checks actually ran.`,
      );
      deps.recordUnverifiable(signature, ms, floorMs);
      return;
    }
    // Say so on SUCCESS too. A gate whose green is invisible is a gate
    // nobody can prove ran — which is precisely how `test:impacted` sat
    // executing zero tests across 15 firings while reporting `passed`
    // (docs/EVALUATION-2026-08-27-silent-gate.md §1). The duration is the
    // tell: a real gate run is seconds to low minutes, a silently-skipped
    // one is not.
    deps.out(
      `  ✓ convergence: '${targetBranch}' passes ${checks.length} check(s) after sync-back ` +
        `(${Math.round(ms)}ms)`,
    );
    deps.recordGreen(signature, ms);
    return;
  }

  const reason = checks.find((c) => !c.pass)?.label ?? 'gate';
  deps.out(
    `  ⛔ CONVERGENCE RED: '${targetBranch}' fails ${reason} AFTER this sync-back — ` +
      `both sides were green alone, so this is a merge interaction. ${mergeDetails}`,
  );
  deps.recordRed(reason, mergeDetails);
}
