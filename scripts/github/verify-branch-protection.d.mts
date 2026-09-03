// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `verify-branch-protection.mjs`, so
 * `apps/dashboard/test/tooling/verify-branch-protection.test.ts` typechecks —
 * the same sibling-`.d.mts` pattern `scripts/ci/secret-scan.d.mts` already
 * uses. Keep in step with the JSDoc types in the `.mjs`.
 */

export function normalize(value: unknown): unknown;
export function matches(desired: unknown, live: unknown): boolean;
