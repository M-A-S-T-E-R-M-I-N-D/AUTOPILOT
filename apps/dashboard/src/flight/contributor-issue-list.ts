// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { CliExec } from '../connection/cli-probe.js';
import { parseIssueLabels, parseAssignees } from './issue-triage.js';
import { ghExec } from './gh-exec.js';

/**
 * CONTRIBUTOR JOURNEY (board web-mtt3hery-l8v0lf), slice 1 of 4 — "live
 * good-first/help-wanted list". The epic's four slices are independently
 * shippable (docs/debriefs/2026-09-10-verdict-ap-mttxbufs-0-contributor-
 * journey-split-reconfirmed.md); slices 3-4 (partner-application deep-link,
 * STANDING explainer) already shipped as static content. This adds the
 * second half of this slice — {@link fetchContributorFacingIssues}, the
 * live `gh issue list` read — alongside the pure decision core already
 * shipped, {@link planContributorIssueList}; mirroring the pool-client/
 * pr-review seam style (`flight/pool-client.ts`'s `fetchPoolIssues` vs. its
 * pure `planClaimPoolIssue`). {@link createContributorIssueListPreviewApi}
 * composes the two behind `GET /api/contributor-issues` (`server/
 * contributor-issue-list.ts`), and `web/features/contributor-issue-list.ts`
 * is that endpoint's dashboard panel — this slice's UX expression, not just
 * its backend. Claiming an issue from this list is slice 2's `/claim`
 * walkthrough, a separate later slice.
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

/** One issue entry as `gh issue list --json number,title,url,labels,
 *  assignees` emits it — untrusted process output, parsed defensively
 *  rather than trusted as already shaped like {@link ContributorFacingIssue}. */
interface RawContributorFacingIssue {
  readonly number?: unknown;
  readonly title?: unknown;
  readonly url?: unknown;
  readonly labels?: unknown;
  readonly assignees?: unknown;
}

/**
 * Lists every open issue via `gh issue list --state open --json
 * number,title,url,labels,assignees`, run through the injectable `exec` —
 * the same `CliExec` shape `issue-triage.ts`'s `fetchOpenIssues` and
 * `pool-client.ts`'s `fetchPoolIssues` already use, reusing their
 * `parseIssueLabels`/`parseAssignees` reductions rather than duplicating
 * them. `gh issue list --label` ANDs multiple `--label` flags together
 * rather than ORing them (`pool-client.ts`'s own doc comment), so filtering
 * for `good first issue` OR `help wanted` at the `gh` layer would need two
 * separate calls; every open issue is fetched unfiltered instead and
 * {@link planContributorIssueList} classifies client-side, the same
 * fetch-then-classify split `fetchPoolIssues` already uses. Read-only.
 * Returns `[]` on a non-zero exit or unparseable/non-array stdout rather
 * than throwing. Entries missing a numeric `number`, string `title`, or
 * string `url` are dropped rather than passed through malformed.
 */
export async function fetchContributorFacingIssues(
  exec: CliExec,
): Promise<ContributorFacingIssue[]> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,url,labels,assignees',
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as RawContributorFacingIssue[])
    .filter(
      (raw) =>
        typeof raw.number === 'number' &&
        typeof raw.title === 'string' &&
        typeof raw.url === 'string',
    )
    .map((raw) => ({
      number: raw.number as number,
      title: raw.title as string,
      url: raw.url as string,
      labels: parseIssueLabels(raw.labels),
      assignees: parseAssignees(raw.assignees),
    }));
}

/** The contributor issue list preview read `GET /api/contributor-issues`
 *  wires — composes {@link fetchContributorFacingIssues} and {@link
 *  planContributorIssueList} behind one call, the same "fetch + pure plan"
 *  composition shape `flight/publicity.ts`'s `PublicityPreviewApi` uses. */
export type ContributorIssueListPreviewApi = () => Promise<readonly ContributorListEntry[]>;

/**
 * Builds the contributor issue list preview read, defaulting to the real
 * `gh` CLI like `publicity.ts`'s `createPublicityPreviewApi` does. Never
 * rejects: a thrown `exec` failure ({@link fetchContributorFacingIssues}
 * already degrades a non-zero exit or unparseable stdout to `[]`) still
 * resolves to an empty list rather than crashing the route, the same
 * fail-closed stance every other preview API in this codebase takes.
 */
export function createContributorIssueListPreviewApi(
  exec: CliExec = ghExec,
): ContributorIssueListPreviewApi {
  return async () => {
    try {
      return planContributorIssueList(await fetchContributorFacingIssues(exec));
    } catch {
      return [];
    }
  };
}
