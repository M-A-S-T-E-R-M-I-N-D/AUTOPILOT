// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `validate-configs.mjs`, so
 * `apps/dashboard/test/tooling/validate-configs.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/ci/validate-spdx-headers.d.mts`
 * already uses. Keep in step with the JSDoc types in the `.mjs`.
 */

export interface UnpinnedActionFinding {
  ref: string;
  reason: string;
}

export function findUnpinnedActions(text: string): UnpinnedActionFinding[];
