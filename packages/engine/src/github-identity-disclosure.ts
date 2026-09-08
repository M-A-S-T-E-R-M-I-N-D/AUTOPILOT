// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The identity-law disclosure footer (`.github/CONTRIBUTOR-STANDING.md`'s
 * "the identity law", board `web-mtq07kf7-lylkor` "STANDING 1/5") every
 * public artifact this instance opens on a non-owned repo must carry: the
 * human-visible "Flown by" line naming the operator, plus a machine-readable
 * `Autopilot-Agent:` marker. Shared by `github-pr-contribute.ts`'s
 * `planGithubPr` (slice 1, the PR-body path) and `github-contribute.ts`'s
 * `planGithubIssue` (this slice, the issue-body path) so both artifact types
 * emit byte-identical disclosure text rather than two hand-maintained
 * copies drifting apart.
 */
export function identityDisclosure(operatorHandle: string): string {
  return `🛩️ Flown by AUTOPILOT on behalf of @${operatorHandle}\n\nAutopilot-Agent: true`;
}
