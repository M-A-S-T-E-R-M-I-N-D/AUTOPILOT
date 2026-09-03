// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * GitHub "contribute upstream" policy primitives (epic 0006 "GitHub
 * connected mode", slice 5 "contribute upstream" — the fork + branch-push +
 * `gh pr create` half, contributing a landed code fix, as opposed to
 * `github-contribute.ts`'s `planGithubIssue` which reports a bug). Pure
 * decision of WHICH ordered `gh`/`git` commands a "contribute this fix
 * upstream" action should run: fork the upstream repo, push the local
 * branch to that fork, then open a PR from the fork's branch against the
 * upstream — mirroring how `github-sync.ts`'s `planGithubSync` and
 * `github-contribute.ts`'s `planGithubIssue` are pure policy steps ahead of
 * their own I/O wiring. The CSRF-guarded HTTP endpoint, the injectable
 * `CommandRunner` execution, and the CONNECT popover's UI are follow-up
 * slices that call this once the real inputs (upstream repo, the
 * operator's own fork owner from `gh auth status`, and the branch to
 * contribute) are gathered — same staged shape those modules shipped in.
 */

/** The fixed git remote name the fork step adds and the push step targets
 *  — a plan-internal constant, not operator-configurable, so `steps[0]`'s
 *  `--remote-name` and `steps[1]`'s push target always agree. */
export const FORK_REMOTE = 'autopilot-fork';

/** Thrown by {@link planGithubPr} when `title`, `branch`, or `forkOwner` is
 *  empty (after trimming), or when a provided `issueNumber` is not a
 *  positive integer — refused up front, before any command is planned. Same
 *  fail-loud-on-malformed-input stance as `github-contribute.ts`'s
 *  `InvalidIssueInputError`. */
export class InvalidPrInputError extends Error {
  constructor(field: 'title' | 'branch' | 'forkOwner' | 'issueNumber') {
    super(
      field === 'issueNumber'
        ? 'planGithubPr: issueNumber must be a positive integer'
        : `planGithubPr: a non-empty ${field} is required`,
    );
    this.name = 'InvalidPrInputError';
  }
}

/** One planned command in the sequence — the exact argv a caller should
 *  hand to `execFile`, never a shell string. */
export interface GithubPrStep {
  readonly command: 'gh' | 'git';
  readonly args: readonly string[];
}

/** The full ordered plan: fork, then push, then PR-create. Callers run
 *  `steps` in order and stop at the first non-zero exit — a failed fork
 *  should never attempt a push against a fork that doesn't exist. */
export interface GithubPrPlan {
  readonly steps: readonly [GithubPrStep, GithubPrStep, GithubPrStep];
  readonly details: string;
}

/**
 * Decides the three commands a "contribute this fix upstream" action should
 * run in order: (1) `gh repo fork <upstreamRepo> --remote --remote-name
 * <FORK_REMOTE>` to fork the upstream repo and register it as a local
 * remote; (2) `git push <FORK_REMOTE> <branch>` to push the landed branch
 * to that fork; (3) `gh pr create --repo <upstreamRepo> --head
 * <forkOwner>:<branch> --title <title> --body <body>` to open the PR from
 * the fork's branch against upstream. `title`, `branch`, and `forkOwner` are
 * all trimmed before use — including in the emitted argv — and must be
 * non-empty after trimming (throws {@link InvalidPrInputError} otherwise,
 * touching nothing); `body` is passed through as-is (an empty body is a
 * valid `gh pr create` body).
 *
 * `issueNumber` is the epic 0007 "PLATFORM 6/7" pool-client round trip's
 * delivery leg: when a co-pilot flew a claimed pool issue locally and is now
 * contributing the fix upstream, an optional issue number here appends a
 * `Closes #<n>` trailer to `body` (on its own line when `body` is
 * non-empty), so the delivered PR actually references — and auto-closes on
 * merge — the issue it was flown for, rather than relying on the operator to
 * type the exact GitHub closing syntax by hand into a free-text box. Omitted
 * entirely, `body` passes through unchanged (the pre-existing behavior).
 * When provided it must be a positive integer (throws {@link
 * InvalidPrInputError} otherwise, touching nothing) — a zero, negative, or
 * fractional issue number can never be a valid GitHub issue reference.
 */
export function planGithubPr(
  upstreamRepo: string,
  forkOwner: string,
  branch: string,
  title: string,
  body: string,
  issueNumber?: number,
): GithubPrPlan {
  const trimmedForkOwner = forkOwner.trim();
  if (trimmedForkOwner.length === 0) {
    throw new InvalidPrInputError('forkOwner');
  }
  const trimmedBranch = branch.trim();
  if (trimmedBranch.length === 0) {
    throw new InvalidPrInputError('branch');
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    throw new InvalidPrInputError('title');
  }
  if (issueNumber !== undefined && (!Number.isInteger(issueNumber) || issueNumber <= 0)) {
    throw new InvalidPrInputError('issueNumber');
  }
  const finalBody =
    issueNumber === undefined
      ? body
      : body.length === 0
        ? `Closes #${issueNumber}`
        : `${body}\n\nCloses #${issueNumber}`;
  return {
    steps: [
      {
        command: 'gh',
        args: ['repo', 'fork', upstreamRepo, '--remote', '--remote-name', FORK_REMOTE],
      },
      { command: 'git', args: ['push', FORK_REMOTE, trimmedBranch] },
      {
        command: 'gh',
        args: [
          'pr',
          'create',
          '--repo',
          upstreamRepo,
          '--head',
          `${trimmedForkOwner}:${trimmedBranch}`,
          '--title',
          trimmedTitle,
          '--body',
          finalBody,
        ],
      },
    ],
    details:
      `forking ${upstreamRepo}, pushing "${trimmedBranch}", and opening a PR against ${upstreamRepo}: "${trimmedTitle}"` +
      (issueNumber === undefined ? '' : `, closing #${issueNumber}`),
  };
}
