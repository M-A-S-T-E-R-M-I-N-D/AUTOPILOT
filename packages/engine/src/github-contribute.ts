// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * GitHub "contribute upstream" policy primitive (epic 0006 "GitHub
 * connected mode", slice 5 "contribute upstream"). Pure decision of WHICH
 * `gh` command reports a bug/requests a feature against the upstream
 * AUTOPILOT repo (a single `gh issue create`) — mirroring how
 * `github-sync.ts`'s `planGithubSync` is a pure policy step ahead of its own
 * I/O wiring (`dashboard`'s `github/issue-execute.ts`). The landed-fix half
 * (fork → push → `gh pr create`) lives in `github-pr-contribute.ts`'s
 * `planGithubPr`, wired via `dashboard`'s `github/pr-execute.ts`.
 */

/** Thrown by {@link planGithubIssue} when `title` is empty (after trimming)
 *  — refused up front, before any command is planned. Same fail-loud-on-
 *  malformed-input stance as `github-sync.ts`'s `InvalidRepoNameError`. */
export class InvalidIssueInputError extends Error {
  constructor() {
    super('planGithubIssue: a non-empty title is required');
    this.name = 'InvalidIssueInputError';
  }
}

/** One planned `gh issue create` command — the exact argv a caller should
 *  hand to `execFile`, never a shell string. */
export interface GithubIssuePlan {
  readonly command: 'gh';
  readonly args: readonly string[];
  readonly details: string;
}

/**
 * Decides the one command a CONNECT popover "report to upstream" action
 * should run: `gh issue create --repo <upstreamRepo> --title <title> --body
 * <body>`. `title` is trimmed and must be non-empty (throws
 * {@link InvalidIssueInputError} otherwise, touching nothing); `body` is
 * passed through as-is (an empty body is a valid `gh issue create` body).
 */
export function planGithubIssue(
  upstreamRepo: string,
  title: string,
  body: string,
): GithubIssuePlan {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    throw new InvalidIssueInputError();
  }
  return {
    command: 'gh',
    args: ['issue', 'create', '--repo', upstreamRepo, '--title', trimmedTitle, '--body', body],
    details: `opening an issue against ${upstreamRepo}: "${trimmedTitle}"`,
  };
}
