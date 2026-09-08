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
 * `planGithubPr`, wired via `dashboard`'s `github/pr-execute.ts`. The
 * identity-law disclosure footer every issue carries is
 * {@link identityDisclosure}, shared with `github-pr-contribute.ts`'s
 * `planGithubPr` via `github-identity-disclosure.ts` so both artifact types
 * emit byte-identical disclosure text.
 */

import { identityDisclosure } from './github-identity-disclosure.js';

/** Thrown by {@link planGithubIssue} when `title` or `operatorHandle` is
 *  empty (after trimming) — refused up front, before any command is
 *  planned. Same fail-loud-on-malformed-input stance as `github-sync.ts`'s
 *  `InvalidRepoNameError`. */
export class InvalidIssueInputError extends Error {
  constructor(field: 'title' | 'operatorHandle') {
    super(`planGithubIssue: a non-empty ${field} is required`);
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
 * <body>`. `title` and `operatorHandle` are trimmed and must be non-empty
 * (throws {@link InvalidIssueInputError} otherwise, touching nothing);
 * `body` is the operator-typed text, always followed by
 * {@link identityDisclosure} on its own paragraph — the identity law
 * applies to every issue this plans, so there is no path through this
 * function that produces an undisclosed body (an empty `body` yields the
 * disclosure footer alone, never a truly empty `--body`).
 */
export function planGithubIssue(
  upstreamRepo: string,
  operatorHandle: string,
  title: string,
  body: string,
): GithubIssuePlan {
  const trimmedOperatorHandle = operatorHandle.trim();
  if (trimmedOperatorHandle.length === 0) {
    throw new InvalidIssueInputError('operatorHandle');
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    throw new InvalidIssueInputError('title');
  }
  const finalBody =
    body.length === 0
      ? identityDisclosure(trimmedOperatorHandle)
      : `${body}\n\n${identityDisclosure(trimmedOperatorHandle)}`;
  return {
    command: 'gh',
    args: ['issue', 'create', '--repo', upstreamRepo, '--title', trimmedTitle, '--body', finalBody],
    details: `opening an issue against ${upstreamRepo}: "${trimmedTitle}"`,
  };
}
