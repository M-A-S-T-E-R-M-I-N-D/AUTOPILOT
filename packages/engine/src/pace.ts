// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Adaptive cadence — the pure-logic port of the proven v2.4 loop's
 * `usage_advisor.py` (ENGINE-RESEARCH G7; `docs/BACKLOG-999.md`). Global
 * quota EXHAUSTION already hibernates ({@link resilience.hibernateMinutes});
 * this is the softer, earlier signal — spend trending toward the hourly or
 * weekly soft cap — that slows the loop down BEFORE a hard exhaustion ever
 * happens. Below half of either cap the loop paces at its base cadence; from
 * there to the cap it ramps linearly up to a bounded multiplier so a busy
 * hour still makes forward progress instead of stalling.
 */

export interface PaceConfig {
  /** Cadence between firings when spend is comfortably under both caps. */
  readonly baseSleepMin: number;
  /** Soft hourly spend cap in USD — the faster-moving of the two signals. */
  readonly hourlyCapUsd: number;
  /** Soft weekly spend cap in USD — the slower-moving budget signal. */
  readonly weeklyCapUsd: number;
}

/** Observed spend over the two trailing windows the pacer watches. */
export interface SpendSnapshot {
  readonly lastHourUsd: number;
  readonly lastWeekUsd: number;
}

/** Ratio of either cap at/under which the loop paces at the base cadence. */
const SLOWDOWN_THRESHOLD = 0.5;

/** Never pace slower than this multiple of the base cadence — hibernation
 *  (a separate, harder signal) is what handles true exhaustion. */
const MAX_PACE_MULTIPLIER = 6;

/**
 * The next inter-firing sleep, in whole minutes, given recent spend. Scales
 * on whichever of the hourly/weekly ratios is closer to its cap (the tighter
 * constraint wins). A non-positive cap disables that signal (never divides
 * by zero, never contributes to slowdown).
 */
export function nextAdaptivePaceMin(spend: SpendSnapshot, config: PaceConfig): number {
  const hourlyRatio = config.hourlyCapUsd > 0 ? spend.lastHourUsd / config.hourlyCapUsd : 0;
  const weeklyRatio = config.weeklyCapUsd > 0 ? spend.lastWeekUsd / config.weeklyCapUsd : 0;
  const ratio = Math.min(Math.max(hourlyRatio, weeklyRatio), 1);

  if (ratio <= SLOWDOWN_THRESHOLD) return config.baseSleepMin;

  const overshoot = (ratio - SLOWDOWN_THRESHOLD) / (1 - SLOWDOWN_THRESHOLD); // 0..1
  const multiplier = 1 + overshoot * (MAX_PACE_MULTIPLIER - 1);
  return Math.round(config.baseSleepMin * multiplier);
}
