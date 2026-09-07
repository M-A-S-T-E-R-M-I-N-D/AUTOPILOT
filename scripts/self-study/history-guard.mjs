// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * self-study/history-guard — refuses a self-study regeneration that would
 * republish LESS history than the tree already has committed.
 *
 * `generate-data.mjs` rewrites the DATA blocks wholesale from the local
 * telemetry store. That store (`.autopilot/autopilot.db`) is git-ignored
 * per-machine runtime state (FLIGHT-CONTAINMENT.md); the DATA blocks are a
 * COMMITTED cumulative record of every firing the project ever flew. On the
 * machine that flew them the two agree. On any other machine — a fresh clone,
 * a reset store, a partial restore — the store starts empty, and a wholesale
 * regen silently overwrites the committed record with a near-empty one.
 *
 * Caught live on 2026-09-06: a flight flown from a clone made that same day
 * republished 1 firing over the 136 already recorded, deleting four days of
 * telemetry and whole §4 analysis sections. The generator already parses the
 * previous snapshot to render §8's delta chips, so it HAD the number it needed
 * to notice — it just never compared. This module is that comparison.
 *
 * Kept dependency-free and separate from `generate-data.mjs` on purpose: that
 * script imports `packages/store/dist`, which does not exist when the gate
 * runs tests before build, so importing it from a test is not safe.
 */

/** Env var an operator sets to `'1'` to overwrite a larger committed snapshot
 *  on purpose — a genuine store rebuild, or a deliberate history reset. */
export const ALLOW_HISTORY_LOSS_ENV = 'SELF_STUDY_ALLOW_HISTORY_LOSS';

/** Whether `env` opts out of the guard. Exact `'1'` only: an override that
 *  destroys committed research data should take a deliberate value, not any
 *  truthy string a shell happened to export. */
export function allowHistoryLoss(env = process.env) {
  return env?.[ALLOW_HISTORY_LOSS_ENV] === '1';
}

/**
 * Why this run must NOT overwrite the committed snapshot, or `null` when the
 * write is safe.
 *
 * Firings are append-only, so the only illegitimate direction is DOWN: a regen
 * may hold the count steady (a no-op refresh) or grow it (the ordinary
 * flight-end case), but a shrink always means the local store is missing
 * history the write is about to erase.
 *
 * @param prevTotals `summarizeSnapshot()` of the committed DATA:SERIES block,
 *   or `null` when there is no parseable previous snapshot (first run, or a
 *   tree predating the rollup) — degrades to "allowed", matching the
 *   generator's existing no-delta convention.
 * @param stats `firingStats()` for this run.
 * @returns a human-readable reason, or `null` when the write is safe.
 */
export function historyRegressionReason(prevTotals, stats) {
  if (!prevTotals) return null;
  const committed = prevTotals.firings ?? 0;
  const local = stats?.firings ?? 0;
  if (local >= committed) return null;
  return (
    `the local store reports ${local} firing(s), but the committed snapshot already records ` +
    `${committed}. Firings are append-only, so a shrink means this machine is missing history ` +
    'it would overwrite — regenerate on the machine holding the full store, or restore that ' +
    'store here first.'
  );
}
