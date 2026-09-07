// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `check-doc-commit-refs.mjs`, so
 * `apps/dashboard/test/tooling/check-doc-commit-refs.test.ts` typechecks —
 * the same sibling-`.d.mts` pattern `scripts/ci/secret-scan.d.mts` already
 * uses. Keep in step with the JSDoc types in the `.mjs`.
 */

export interface ShaCitation {
  line: number;
  sha: string;
}

export function findShaCitations(text: string): ShaCitation[];
