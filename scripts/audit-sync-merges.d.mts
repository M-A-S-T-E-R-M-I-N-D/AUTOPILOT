// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `audit-sync-merges.mjs`, so
 * `apps/dashboard/test/tooling/audit-sync-merges.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/ci/secret-scan.d.mts` already uses.
 * Keep in step with the JSDoc types in the `.mjs`.
 */

export type OverlapVerdict = 'LANE-WON' | 'TARGET-WON' | 'COMBINED';

export function classifyOverlap(
  mergedBlob: string | null,
  targetBlob: string | null,
  laneBlob: string | null,
): OverlapVerdict;
