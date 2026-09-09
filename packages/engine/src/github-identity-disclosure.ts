// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/** AUTOPILOT's own canonical repo — never the repo a PR/issue is filed
 *  against (`upstreamRepo`, the caller's own parameter, can be any target);
 *  this is always the "what flew this" link the spread-line points readers
 *  at, per `docs/ATTRIBUTION.md`'s four channels. */
const AUTOPILOT_REPO_URL = 'https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT';

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
 *
 * Also carries `docs/ATTRIBUTION.md` §2's filing-channel spread-line (board
 * `web-mtt056ng-zt77x5`, "ATTRIBUTION 2/3"): the "Flown by" mention links to
 * {@link AUTOPILOT_REPO_URL} and names the flying `version`, folded into the
 * same line as the identity law's "on behalf of @operator" clause rather
 * than stacked as a second line — one disclosure satisfying both doctrines.
 */
export function identityDisclosure(operatorHandle: string, version: string): string {
  return (
    `🛩️ Flown by [AUTOPILOT](${AUTOPILOT_REPO_URL}) v${version}, on behalf of ` +
    `@${operatorHandle}\n\nAutopilot-Agent: true`
  );
}
