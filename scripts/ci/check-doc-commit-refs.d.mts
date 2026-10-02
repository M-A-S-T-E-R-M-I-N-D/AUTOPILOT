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

/** One `git merge-base --is-ancestor` run, as spawnSync reports it. */
export interface GitRun {
  status: number | null;
  signal: string | null;
  stderr: string;
  spawnError: string | null;
}

export function describeGitFailure(run: GitRun): string;

export type AncestryResult =
  | { verdict: 'reachable' | 'unreachable' }
  | { verdict: 'failed'; attempts: number; detail: string };

export function checkAncestry(
  sha: string,
  deps: {
    runOnce: (sha: string) => GitRun;
    sleep: (ms: number) => void;
    warn?: (line: string) => void;
    maxAttempts?: number;
    baseDelayMs?: number;
  },
): AncestryResult;
