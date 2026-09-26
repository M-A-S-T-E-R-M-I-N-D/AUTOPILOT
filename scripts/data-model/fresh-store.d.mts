// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `fresh-store.mjs`, so
 * `apps/dashboard/test/tooling/data-model-fresh-store.test.ts` typechecks —
 * the same sibling-`.d.mts` pattern `scripts/docs/check-links.d.mts` uses.
 * Keep in step with the `.mjs`.
 */

export function storeBuildArgv(repoRoot: string): {
  readonly file: string;
  readonly args: readonly string[];
};

export function buildStore(repoRoot: string): void;

export function importFreshStore(
  repoRoot: string,
  seams?: {
    readonly build?: (repoRoot: string) => void;
    readonly load?: (href: string) => Promise<unknown>;
  },
): Promise<unknown>;
