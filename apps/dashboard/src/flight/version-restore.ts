// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE VERSIONS SCREEN'S RESTORE (board ap-mui2h3s1-1, slice 5).
 *
 * PATTERNS-AND-STANDARDS.md §9: "a restore is a new branch, never a history
 * rewrite; never force-push/`reset --hard`/touch `main` without approval."
 * Restoring a version never touches an existing ref — it creates exactly one
 * new local branch, in the project's own repository, pointing at the chosen
 * historical commit, and reports that branch's name back so the operator can
 * check it out themselves. MYTH, LEGACY and FLIGHT all stay exactly where
 * they were.
 *
 * Deliberately a separate module from `read/versions.ts`, which documents
 * itself as read-only by construction — this is the one write the Versions
 * screen's whole surface makes, so it does not share that file's contract.
 *
 * `restoreVersion` takes a `GitRunner` rather than shelling out itself, the
 * same injection shape `read/versions.ts`'s `readVersions` takes a `GitRead`
 * — `gitRunnerFor` is its real (synchronous, bounded) implementation, and
 * tests hand it a fake instead of touching a real repository.
 */
import { execFileSync } from 'node:child_process';
import { isCommitSha } from '../read/versions.js';

/** Runs one git command against the bound repository; `ok:false` on any git
 *  failure (missing ref, dirty state git itself refuses, not a repo at all)
 *  with `output` carrying whatever git printed to explain why. */
export type GitRunner = (args: readonly string[]) => {
  readonly ok: boolean;
  readonly output: string;
};

/** Either a new branch was created (`ok:true`, `branch`/`sha` set,
 *  `reason:null`), or it was not (`ok:false`, `branch:null`, `reason` says
 *  why) — never both, so a caller can trust `ok` alone. */
export interface RestoreOutcome {
  readonly ok: boolean;
  readonly branch: string | null;
  readonly sha: string | null;
  readonly reason: string | null;
}

const GIT_TIMEOUT_MS = 5000;

/** A {@link GitRunner} bound to one folder: bounded, windowless, stdout+stderr
 *  captured (unlike `read/versions.ts`'s `gitReaderFor`, a write needs to
 *  explain its own failures). */
export function gitRunnerFor(rootPath: string): GitRunner {
  return (args) => {
    try {
      const output = execFileSync('git', ['-C', rootPath, ...args], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: GIT_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { ok: true, output };
    } catch (error) {
      const stderr =
        error !== null && typeof error === 'object' && 'stderr' in error
          ? String((error as { stderr?: unknown }).stderr ?? '')
          : '';
      return { ok: false, output: stderr.trim() };
    }
  };
}

/** `autopilot/restore/<sha7>-<epoch-ms>` — unique enough in practice that the
 *  only realistic collision is restoring the exact same version twice inside
 *  one millisecond, which `restoreVersion`'s own `git branch` call below would
 *  refuse anyway (an existing branch name is a git error, not a silent
 *  overwrite — additive-only holds either way). */
export function restoreBranchName(sha: string, nowMs: number): string {
  return `autopilot/restore/${sha.slice(0, 7)}-${nowMs}`;
}

/**
 * Creates a new branch at `sha`, in the repository `git` is bound to, never
 * touching any existing ref. `ok:false` (never a thrown error) when `sha` is
 * not a well-formed commit id, does not name a real commit in this
 * repository, or branch creation itself fails — `reason` carries which.
 */
export function restoreVersion(
  git: GitRunner,
  sha: string,
  nowMs: number = Date.now(),
): RestoreOutcome {
  if (!isCommitSha(sha)) {
    return { ok: false, branch: null, sha: null, reason: 'not a full commit id' };
  }
  const verify = git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`]);
  if (!verify.ok) {
    return { ok: false, branch: null, sha: null, reason: 'no such version in this repository' };
  }
  const branch = restoreBranchName(sha, nowMs);
  const created = git(['branch', branch, sha]);
  if (!created.ok) {
    return { ok: false, branch: null, sha: null, reason: created.output || 'git branch failed' };
  }
  return { ok: true, branch, sha, reason: null };
}
