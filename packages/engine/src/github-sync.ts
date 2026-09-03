// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * GitHub sync policy primitives (BOARD web-mss4lpwi-p0w1d0, "GITHUB 2/5 - sync
 * any project"). Pure decision of WHICH `gh`/`git` command a project-page
 * "sync to GitHub" action should run — `gh repo create --source=. --push`
 * when the project has no remote yet, or a plain `git push` re-sync when it
 * already does — mirroring how `release.ts`'s `planRelease` is a pure policy
 * step ahead of its own I/O wiring (`dashboard`'s `release/execute.ts`). The
 * real remote-detection (`GitVcs`), the CSRF-guarded HTTP endpoint, and the
 * project-page button with its public-repo confirm guard are follow-up
 * slices that call this once the real inputs are gathered — same staged
 * shape release automation shipped in.
 */

/** GitHub repo visibility a sync can create. `--private` is the safe
 *  default the board task calls for; `'public'` is the operator's explicit,
 *  confirm-guarded second choice at the UI layer — this module only encodes
 *  which flag a chosen visibility maps to, never which one is "safe". */
export type RepoVisibility = 'private' | 'public';

/** GitHub repo names allow letters, digits, `.`, `-`, and `_` — anything
 *  else (a path separator, whitespace, a shell metacharacter) is rejected
 *  up front rather than handed to `args` unchecked. `args` is always an
 *  array passed straight to `execFile` (never a shell string), so this
 *  guards against a malformed name reaching GitHub's API with a typo'd repo
 *  slug, not command injection — the array form already closes that off. */
const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Thrown by {@link planGithubSync} when `repoName` doesn't match
 *  {@link REPO_NAME_PATTERN} — refused up front, before any command is
 *  planned. Callers are expected to derive `repoName` from a project's own
 *  slug (already constrained to `[a-z0-9-]+`, see `onboarding`'s
 *  `slugify`), so reaching here malformed is an integration bug, not a
 *  normal refusal — same stance as `release.ts`'s `InvalidMilestoneTagError`. */
export class InvalidRepoNameError extends Error {
  constructor(repoName: string) {
    super(
      `planGithubSync: repo name "${repoName}" contains characters GitHub does not allow ` +
        '(letters, digits, ".", "-", "_" only)',
    );
    this.name = 'InvalidRepoNameError';
  }
}

/** One planned sync command — the exact argv a caller should hand to
 *  `execFile`, never a shell string. */
export interface GithubSyncPlan {
  /** `'create'` when no remote exists yet; `'push'` for a re-sync. */
  readonly action: 'create' | 'push';
  readonly command: 'gh' | 'git';
  readonly args: readonly string[];
  readonly details: string;
}

/**
 * Decides the one command a project-page "sync to GitHub" action should run,
 * given whether the project already has a remote configured. `hasRemote:
 * false` plans `gh repo create <repoName> --private|--public --source=.
 * --push` (first sync: create the repo and push in one step, per the board
 * task's spec). `hasRemote: true` plans a plain `git push` (the board task's
 * "re-sync = push" — an existing remote is never recreated or force-pushed).
 * Throws {@link InvalidRepoNameError} up front when `repoName` is malformed,
 * touching nothing, same fail-loud-on-malformed-input stance as
 * `release.ts`'s `bumpVersion`.
 */
export function planGithubSync(
  repoName: string,
  visibility: RepoVisibility,
  hasRemote: boolean,
): GithubSyncPlan {
  if (!REPO_NAME_PATTERN.test(repoName)) {
    throw new InvalidRepoNameError(repoName);
  }
  if (!hasRemote) {
    return {
      action: 'create',
      command: 'gh',
      args: ['repo', 'create', repoName, `--${visibility}`, '--source=.', '--push'],
      details: `no remote configured — creating a new ${visibility} GitHub repo "${repoName}" and pushing`,
    };
  }
  return {
    action: 'push',
    command: 'git',
    args: ['push'],
    details: 're-sync: remote already configured — pushing to it',
  };
}
