// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CONTRIBUTOR JOURNEY (board web-mtt3hery-l8v0lf), slice 1 of 4 — "live
 * good-first/help-wanted list". The epic's four slices are independently
 * shippable (docs/debriefs/2026-09-10-verdict-ap-mttxbufs-0-contributor-
 * journey-split-reconfirmed.md); slices 3-4 (partner-application deep-link,
 * STANDING explainer) already shipped as static content, but this one needs
 * a real `gh issue list` read plus a UI surface, which the debrief judged
 * too large for one firing combined. This ships only the pure decision core
 * — {@link planContributorIssueList} — mirroring the pool-client/pr-review
 * seam style (`flight/pool-client.ts`'s `fetchPoolIssues` vs. its pure
 * `planClaimPoolIssue`): the live `gh` read and the dashboard panel that
 * renders this list are separate, later slices.
 */

/** The subset of a GitHub issue this planner needs — the same fields
 *  `gh issue list --json number,title,url,labels,assignees` already emits
 *  for `flight/pool-client.ts`'s `PoolIssue`, reused here for a different
 *  label family (`good first issue` / `help wanted`, not `pool: *`). */
export interface ContributorFacingIssue {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
}

export type ContributorIssueTier = 'good first issue' | 'help wanted';

/** One issue as this list will show it to a visiting contributor. */
export interface ContributorListEntry {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly tier: ContributorIssueTier;
}

const TIER_RANK: Record<ContributorIssueTier, number> = {
  'good first issue': 0,
  'help wanted': 1,
};

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/-/g, ' ').trim();
}

/** The higher tier wins when an issue carries both labels — a visitor
 *  should see the more approachable framing, not a duplicate entry. */
function tierForLabels(labels: readonly string[]): ContributorIssueTier | null {
  const normalized = labels.map(normalizeLabel);
  if (normalized.includes('good first issue')) return 'good first issue';
  if (normalized.includes('help wanted')) return 'help wanted';
  return null;
}

/**
 * Filters open issues down to the CONTRIBUTOR JOURNEY's pick list: only
 * `good first issue`/`help wanted`-labeled issues, already-assigned ones
 * excluded outright (a visitor should never be steered at something someone
 * already owns — the same claim signal `flight/pool-client.ts`'s
 * `isClaimedPoolIssue` reads). Good-first-issue entries rank before
 * help-wanted, ties broken by issue number so the order is stable across
 * calls with identical input.
 */
export function planContributorIssueList(
  issues: readonly ContributorFacingIssue[],
): readonly ContributorListEntry[] {
  const entries: ContributorListEntry[] = [];
  for (const issue of issues) {
    if (issue.assignees.length > 0) continue;
    const tier = tierForLabels(issue.labels);
    if (!tier) continue;
    entries.push({ number: issue.number, title: issue.title, url: issue.url, tier });
  }
  return entries.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.number - b.number);
}
