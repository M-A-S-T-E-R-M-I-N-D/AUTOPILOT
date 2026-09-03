// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `validate-no-personal-paths.mjs`, so
 * `apps/dashboard/test/tooling/validate-no-personal-paths.test.ts` typechecks
 * — the same sibling-`.d.mts` pattern `scripts/ci/secret-scan.d.mts` already
 * uses. Keep in step with the JSDoc types in the `.mjs`.
 */

export interface PersonalPathFinding {
  line: number;
  rule: string;
  match: string;
}

export function findPersonalPaths(text: string): PersonalPathFinding[];
