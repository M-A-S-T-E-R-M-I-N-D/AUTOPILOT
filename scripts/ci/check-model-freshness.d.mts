// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `check-model-freshness.mjs`, so
 * `apps/dashboard/test/tooling/check-model-freshness.test.ts` typechecks —
 * the same sibling-`.d.mts` pattern `scripts/ci/secret-scan.d.mts` already
 * uses. Keep in step with the JSDoc types in the `.mjs`.
 */

export function extractAdvertisedAliases(helpText: string): string[];

export function findUnknownFamilyAliases(helpText: string, families: readonly string[]): string[];
