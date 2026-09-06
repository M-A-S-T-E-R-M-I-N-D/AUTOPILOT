// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `history-guard.mjs`, so
 * `apps/dashboard/test/tooling/self-study-history-guard.test.ts` typechecks —
 * the same sibling-`.d.mts` pattern `scripts/docs/check-links.d.mts` already
 * uses. Keep in step with the JSDoc types in the `.mjs`.
 */

/** The cumulative totals a committed `DATA:SERIES` snapshot reports, as
 *  `generate-data.mjs`'s `summarizeSnapshot()` reduces them. */
export interface SnapshotTotals {
  firings?: number;
  shipped?: number;
  costUsd?: number;
}

export const ALLOW_HISTORY_LOSS_ENV: string;

export function allowHistoryLoss(env?: Record<string, string | undefined>): boolean;

export function historyRegressionReason(
  prevTotals: SnapshotTotals | null | undefined,
  stats: SnapshotTotals | null | undefined,
): string | null;
