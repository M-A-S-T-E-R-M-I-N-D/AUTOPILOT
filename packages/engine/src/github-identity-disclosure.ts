// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import {
  provenanceFooter,
  type ProvenanceModel,
  type ProvenanceProfile,
  type ReviewState,
} from './provenance.js';

/**
 * What a caller knows about how the artifact was made. Optional everywhere:
 * omit it and the footer is byte-identical to what this function has always
 * returned, so no existing filing path changes shape until it opts in.
 */
export interface DisclosureProvenance {
  readonly review: ReviewState;
  readonly models: readonly ProvenanceModel[];
  readonly promptVersion?: string;
  /** ISO-8601, supplied by the caller — this module reads no clock. */
  readonly generatedAt: string;
  /** Read from the target repository's own policy; `minimal` when unread. */
  readonly profile: ProvenanceProfile;
}

/** AUTOPILOT's own canonical repo — never the repo a PR/issue is filed
 *  against (`upstreamRepo`, the caller's own parameter, can be any target);
 *  this is always the "what flew this" link the spread-line points readers
 *  at, per `docs/ATTRIBUTION.md`'s four channels. Exported so `prompt.ts`
 *  (channel 1's commit trailer, same package) shares this exact string
 *  rather than hand-copying a third repo-local literal. */
export const AUTOPILOT_REPO_URL = 'https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT';

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
export function identityDisclosure(
  operatorHandle: string,
  version: string,
  provenance?: DisclosureProvenance,
): string {
  if (provenance === undefined) {
    return (
      `🛩️ Flown by [AUTOPILOT](${AUTOPILOT_REPO_URL}) v${version}, on behalf of ` +
      `@${operatorHandle}\n\nAutopilot-Agent: true`
    );
  }
  // The richer form (2026-09-14): same identity line, plus the review state
  // in words and a machine-readable block, under the profile the TARGET
  // repository's own policy asks for. `Autopilot-Agent: true` survives as
  // the block's `agent` field, so nothing that parsed the old marker loses
  // its answer — it just reads it from JSON now.
  return provenanceFooter(
    {
      toolVersion: version,
      toolUrl: AUTOPILOT_REPO_URL,
      operatorHandle,
      review: provenance.review,
      models: provenance.models,
      ...(provenance.promptVersion === undefined
        ? {}
        : { promptVersion: provenance.promptVersion }),
      generatedAt: provenance.generatedAt,
    },
    provenance.profile,
  );
}
