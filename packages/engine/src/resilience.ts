// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Model resilience + quota safety — the faithful pure-logic port of the proven
 * v2.4 loop's resistance to per-model and global quota exhaustion
 * (ENGINE-RESEARCH G6/G7; `docs/M1-ENGINE-PLAN.md`).
 *
 * Everything here is a pure function over an immutable {@link ResilienceState}
 * so the engine's hardest-to-reason-about behavior (promote-on-exhaustion,
 * time-based re-probe, escalating hibernation) is fully unit-testable without a
 * process, a clock, or a network. The impure orchestrator (firing/loop) feeds it
 * observed outcomes and persists the returned state across restarts.
 */

export interface ResilienceConfig {
  /** Primary model tried first (e.g. the cheaper/faster tier). */
  readonly primaryModel: string;
  /** Fallback model refired on a primary quota failure (e.g. the top tier). */
  readonly fallbackModel: string;
  /** After this many consecutive primary quota-fallbacks, start on the fallback directly. */
  readonly promoteAfter: number;
  /** Once the primary is exhausted, wait this long before re-probing it (tracks the reset window). */
  readonly reprobeCooldownSec: number;
  /** Base hibernation on global (both-model) exhaustion. */
  readonly hibernateBaseMin: number;
  /** Hibernation cap — escalation never exceeds this. */
  readonly hibernateMaxMin: number;
}

export interface ResilienceState {
  /** Consecutive primary quota-fallbacks (drives promotion + re-probe). */
  readonly consecQuota: number;
  /** Unix epoch (seconds) before which the primary is not re-probed. */
  readonly reprobeAfterEpoch: number;
  /** Consecutive global exhaustions (both models blocked) — drives hibernation backoff. */
  readonly consecGlobalExhaust: number;
}

export const INITIAL_RESILIENCE_STATE: ResilienceState = {
  consecQuota: 0,
  reprobeAfterEpoch: 0,
  consecGlobalExhaust: 0,
};

/** Which model a firing starts on, and why (feeds telemetry `startedOn`). */
export type StartedOn = 'primary' | 'reprobe' | 'fallback';

export interface ModelSelection {
  readonly modelToTry: string;
  /** Started on the fallback directly (primary is exhausted, cooldown not elapsed). */
  readonly promoted: boolean;
  /** Re-probing the primary (exhausted, but the cooldown has elapsed). */
  readonly reprobe: boolean;
  readonly startedOn: StartedOn;
}

/**
 * Quota/limit failure signal — a per-turn billing/rate-limit/usage error, which
 * the CLI's own `--fallback-model` does NOT handle (that covers only
 * overloaded/server errors). Kept a single conservative pattern, matching v2.4.
 */
const QUOTA_PATTERN =
  /usage limit|usage.?credit|rate.?limit|limit reached|reached your|you.?ve reached|switch models|quota|exceeded|insufficient|\b429\b|payment|billing/i;

/** The observable outcome of one CLI attempt, distilled for pure detection. */
export interface AttemptOutcome {
  /** The JSON envelope parsed (a well-formed CLI response was returned). */
  readonly parsed: boolean;
  /** The envelope's `is_error` flag. */
  readonly isError: boolean;
  /** Process exit code. */
  readonly exitCode: number;
  /** Text to probe for a quota signal (envelope result + api_error_status, or raw stdout). */
  readonly probeText: string;
}

/** True when an attempt failed specifically for a quota/limit reason. */
export function detectQuotaFail(outcome: AttemptOutcome): boolean {
  const failed = !outcome.parsed || outcome.isError || outcome.exitCode !== 0;
  return failed && QUOTA_PATTERN.test(outcome.probeText);
}

/** Any failure (used to decide whether a clean primary run should clear the streak). */
export function isFailure(outcome: AttemptOutcome): boolean {
  return !outcome.parsed || outcome.isError || outcome.exitCode !== 0;
}

/**
 * Choose the model for this firing. After `promoteAfter` consecutive primary
 * quota-fallbacks we skip the wasted primary attempt and start on the fallback;
 * once the re-probe cooldown elapses we try the primary again exactly once.
 */
export function selectModel(
  state: ResilienceState,
  config: ResilienceConfig,
  nowEpoch: number,
): ModelSelection {
  const exhausted = state.consecQuota >= config.promoteAfter;
  const reprobe = exhausted && nowEpoch >= state.reprobeAfterEpoch;
  const promoted = exhausted && !reprobe;
  const modelToTry = promoted ? config.fallbackModel : config.primaryModel;
  const startedOn: StartedOn = promoted ? 'fallback' : reprobe ? 'reprobe' : 'primary';
  return { modelToTry, promoted, reprobe, startedOn };
}

/**
 * Fold the primary attempt's outcome into the quota streak. Only applies when the
 * firing actually attempted the primary (a promoted fallback start cannot
 * "quota-fallback"). A quota hit extends the streak + sets the cooldown; a clean
 * primary run clears it; a non-quota primary failure leaves the streak unchanged.
 */
export function applyPrimaryOutcome(
  state: ResilienceState,
  config: ResilienceConfig,
  nowEpoch: number,
  event: {
    readonly attemptedPrimary: boolean;
    readonly quotaHit: boolean;
    readonly primaryFailed: boolean;
  },
): ResilienceState {
  if (!event.attemptedPrimary) return state;
  if (event.quotaHit) {
    return {
      ...state,
      consecQuota: state.consecQuota + 1,
      reprobeAfterEpoch: nowEpoch + config.reprobeCooldownSec,
    };
  }
  if (!event.primaryFailed) {
    return { ...state, consecQuota: 0, reprobeAfterEpoch: 0 };
  }
  return state;
}

/** Track the global-exhaustion streak: both models quota-blocked → increment, else reset. */
export function applyGlobalExhaustion(
  state: ResilienceState,
  globalExhaust: boolean,
): ResilienceState {
  return { ...state, consecGlobalExhaust: globalExhaust ? state.consecGlobalExhaust + 1 : 0 };
}

/**
 * Hibernation length on global exhaustion: `base · 2^(streak−1)`, capped at max.
 * Called after {@link applyGlobalExhaustion}, so the streak is ≥ 1 when hibernating.
 */
export function hibernateMinutes(state: ResilienceState, config: ResilienceConfig): number {
  const exponent = Math.max(0, state.consecGlobalExhaust - 1);
  const escalated = config.hibernateBaseMin * 2 ** exponent;
  return Math.min(config.hibernateMaxMin, Math.trunc(escalated));
}
