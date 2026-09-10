// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure contributor-issue-list panel formatting — client-only (mirrors
 * `pool-client-panel.ts`'s reasoning: `server/contributor-issue-list.ts`
 * returns raw list entries, and turning a tier into display text is a
 * client presentation concern). CONTRIBUTOR JOURNEY (board
 * web-mtt3hery-l8v0lf) slice 1 of 4's UX expression — a visitor's live
 * good-first-issue/help-wanted pick list.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `web/features/
 * contributor-issue-list.ts` — instead of hand-retyping it, so the two
 * copies can no longer drift apart. Each exported function stays
 * self-contained (no shared module-scope constants) since `.toString()`
 * serializes only the function body, never its surrounding closure.
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
