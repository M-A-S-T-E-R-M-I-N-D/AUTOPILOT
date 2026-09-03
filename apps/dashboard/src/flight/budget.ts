// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Per-firing TURN ceiling for dashboard-launched flights — the cap that killed
 * firing 47 mid-tool-use at 60 with only $3.84 of its $35 budget spent, nothing
 * committed. The operator's BUDGET is the spend guard; turns exist only to stop
 * a runaway loop, so they must not strangle honest work (successful firings run
 * 26–68 turns, p90 63t at the 80-turn cap). Raised 60 → 80 → 120: telemetry showed
 * every cap-death at 80 was an epic task mid-work, not a runaway loop, and turns
 * now clear the ~$7 a firing naturally costs by 120 turns — the $10/firing
 * default (flight/runner.ts) sits above that ceiling with headroom so budget
 * stays a net, not the everyday killer. A firing
 * that still dies here left work the RESUME CHECK + checkpoint mechanics pick up
 * next firing. Lives here (not in fly.ts) so the server can SHOW the cap in the
 * fly bar instead of hiding it.
 */
export const FLY_MAX_TURNS = 120;

/**
 * TOTAL-SPEND mode's stop decision (the fly-bar budget toggle,
 * apps/dashboard/src/flight/runner.ts): once what's left of the operator's
 * target can no longer fund another per-firing budget, the flight is done.
 * Fixed-firings mode (no target set) never stops on this check — `loop.ts`'s
 * `maxIterations` owns that instead.
 */
export function totalBudgetExhausted(
  spentSoFar: number,
  totalBudgetUsd: number | undefined,
  perFiringBudgetUsd: number,
): boolean {
  // Stryker disable next-line ConditionalExpression: replacing the `!==
  // undefined` guard with `true` is unobservable — when totalBudgetUsd is
  // undefined, `undefined - spentSoFar` is NaN and every `NaN < x`
  // comparison is false, so the right side alone already yields `false`,
  // matching this guard's intent (fixed-firings mode never stops here).
  return totalBudgetUsd !== undefined && totalBudgetUsd - spentSoFar < perFiringBudgetUsd;
}

/**
 * THIRD CAP, made explicit (RESEARCH-LIBRARY "7→10 ramp" + the failed round
 * of 2026-08-21): `DEFAULT_CLI_TIMEOUT_MS` (30 min) silently became the
 * binding cap under 10-way contention — firings died envelope-less (cost
 * unknown, no METRICS) before turns or budget ever stopped them. The
 * consensus pattern is layered budgets with EXPLICIT, tunable gates; this
 * lets the launcher widen the per-invocation wall clock for a heavy round
 * via `AUTOPILOT_CLI_TIMEOUT_MS` (milliseconds). Anything but a positive
 * integer returns undefined — the driver's own default stays in charge, so
 * a typo can never accidentally disable the wall clock entirely.
 */
export function cliTimeoutMsFromEnv(env: Record<string, string | undefined>): number | undefined {
  const raw = Number(env['AUTOPILOT_CLI_TIMEOUT_MS']);
  return Number.isInteger(raw) && raw > 0 ? raw : undefined;
}
