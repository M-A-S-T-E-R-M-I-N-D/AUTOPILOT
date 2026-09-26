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

/** Every line-leading catalogue id, read from the source text (the real
 *  catalogue when `src` is omitted). */
export function catalogueIds(src?: string): string[];

/** The declared `MODEL_FAMILIES` list, read from the source text (the real
 *  catalogue when `src` is omitted); empty when the declaration is missing. */
export function catalogueFamilies(src?: string): string[];

/** The catalogue's pinned id per family, read from the source text (the real
 *  catalogue when `src` is omitted). */
export function cataloguePinnedIds(src?: string): Record<string, string>;

/** The concrete id of `family` inside a reply's `modelUsage`, or null. */
export function resolveAliasFromUsage(modelUsage: unknown, family: string): string | null;

/** Case 1's findings: each pinned id that differs from what its alias
 *  resolved to, and each family the probe could not resolve at all. */
export function findStalePins(
  pinned: Record<string, string>,
  resolved: Record<string, string | null | undefined>,
): string[];
