// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure contributor-issue-list panel formatting — client-only (mirrors
 * `pool-client-panel.ts`'s reasoning: `server/contributor-issue-list.ts`
 * returns raw list entries, and turning a tier into display text is a
 * client presentation concern). CONTRIBUTOR JOURNEY (board
 * web-mtt3hery-l8v0lf) slice 1 of 4's UX expression — a visitor's live
 * good-first-issue/help-wanted pick list — plus slice 2 of 4's
 * `CLAIM_WALKTHROUGH_STEPS` below, the "/claim walkthrough (fork-first
 * etiquette)" the board task names.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `web/features/
 * contributor-issue-list.ts` — instead of hand-retyping it, so the two
 * copies can no longer drift apart. Each exported function stays
 * self-contained (no shared module-scope constants) since `.toString()`
 * serializes only the function body, never its surrounding closure;
 * `CLAIM_WALKTHROUGH_STEPS` is a plain data constant, spliced via
 * `JSON.stringify()` instead, so that constraint does not apply to it.
 */

/** The two tiers `flight/contributor-issue-list.ts`'s `planContributorIssueList`
 *  ever emits — anything else (should never happen) echoes back verbatim
 *  rather than throwing, the same unrecognized-value stance
 *  `poolClaimDecisionLabel` takes. */
export function contributorIssueTierBadge(tier: string): string {
  if (tier === 'good first issue') return '🌱 good first issue';
  if (tier === 'help wanted') return '🙋 help wanted';
  return tier;
}

/**
 * CONTRIBUTOR JOURNEY (board web-mtt3hery-l8v0lf) slice 2 of 4 — the
 * "/claim walkthrough (fork-first etiquette)" the board task names.
 * Condensed from `.github/CONTRIBUTING.md`'s "Setup (fork-first)" and
 * "Claiming work" sections — that file, not this one, is the source of
 * truth, the same verbatim-porting relationship `contributor-standing-
 * panel.ts`'s `CONTRIBUTOR_STANDING_TIERS` has with `.github/CONTRIBUTOR-
 * STANDING.md`. Flat strings, not `{title, detail}` objects — the panels
 * chunk's gzip budget has no headroom for per-step JSON key overhead (board
 * web-mtqumz0u-j39av4's guard-precision doctrine sibling: `client-bundle-
 * size-budget.test.ts`'s own chronicle of squeezes). A plain data constant
 * (not a function), so `web/features/contributor-issue-list.ts` splices it
 * via `JSON.stringify()` rather than `.toString()`.
 */
export const CLAIM_WALKTHROUGH_STEPS: readonly string[] = [
  "Fork it — you can't push here directly.",
  'Claim it — comment /claim to get assigned.',
  'Build it — branch from upstream/main, add tests.',
  'Ship it — push your fork, open a PR.',
];
