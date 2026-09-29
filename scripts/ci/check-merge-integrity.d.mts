// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `check-merge-integrity.mjs`, so
 * `apps/dashboard/test/tooling/merge-integrity.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/ci/check-conflict-markers.d.mts`
 * already uses. Keep in step with the `.mjs`.
 */

/** The distinct content lines a diff adds, ignoring blanks and file headers. */
export function addedLines(diff: string): Set<string>;

/** The distinct content lines a diff removes, ignoring blanks and file headers. */
export function removedLines(diff: string): Set<string>;

/** The merge reverts a range carries, and each commit's first parent. */
export interface RevertIndex {
  readonly reverts: ReadonlySet<string>;
  readonly firstParent: ReadonlyMap<string, string | undefined>;
}

export function firstParentLineHasRevert(start: string, index: RevertIndex): boolean;

export interface MergeIntegrityOptions {
  /** Defaults to `HEAD~50..HEAD`. */
  readonly range?: string | undefined;
  /** The repository to check; defaults to the process's working directory. */
  readonly cwd?: string | undefined;
  /** Merges whose loss was repaired by hand, each with how; defaults to the
   *  script's own ledger. */
  readonly repaired?: ReadonlyMap<string, string>;
}

export interface MergeIntegrityResult {
  readonly code: 0 | 1;
  /** Lines the CLI prints to stdout. */
  readonly out: readonly string[];
  /** Lines the CLI prints to stderr. */
  readonly err: readonly string[];
}

export function checkMergeIntegrity(options?: MergeIntegrityOptions): MergeIntegrityResult;
