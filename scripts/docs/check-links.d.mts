// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `check-links.mjs`, so
 * `apps/dashboard/test/tooling/check-links.test.ts` typechecks — the same
 * sibling-`.d.mts` pattern `scripts/ci/validate-no-personal-paths.d.mts`
 * already uses. Keep in step with the JSDoc types in the `.mjs`.
 */

export function isLocalTarget(target: string): boolean;
