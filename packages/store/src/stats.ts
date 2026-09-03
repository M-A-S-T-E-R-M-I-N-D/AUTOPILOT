// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Small numeric aggregates shared by `dora.ts` (DORA-for-agents) and
 * `eval-gate.ts` (SOTA-MAP H3 eval regression) — both compute a median over
 * an ad hoc sample of numbers and previously carried byte-identical private
 * copies of this function.
 */

/** Median of `values`, or `null` for an empty sample. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
}
