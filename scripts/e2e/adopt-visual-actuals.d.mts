// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `adopt-visual-actuals.mjs`, so
 * `apps/dashboard/test/tooling/adopt-visual-actuals.test.ts` typechecks —
 * the same sibling-`.d.mts` pattern `scripts/ci/check-conflict-markers.d.mts`
 * uses. Keep in step with the JSDoc types in the `.mjs`.
 */

export function attemptOf(artifactDir: string): number;
