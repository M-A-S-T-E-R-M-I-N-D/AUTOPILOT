// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { CliExec } from '../connection/cli-probe.js';
import { MAX_ISSUE_LIST, parseIssueLabels, parseAssignees } from './issue-triage.js';
import { isMaintainerMarked, normalizeLabel, parsePoolComments } from './pool-client.js';
import { claimLedger, type PoolClaim } from './claim-ledger.js';
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
 * its backend. Slice 2's `/claim` walkthrough (fork-first etiquette) now
 * renders alongside this same list — see `web/contributor-issue-list-
 * panel.ts`'s `CLAIM_WALKTHROUGH_STEPS` — but stays a guide, never an
 * action: no write lands here or anywhere in this module.
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
  /** THE CLAIMS LEDGER (claim-ledger.ts) read off the issue's comments and
   *  assignees, the way the pool reads it. Optional so a bare fixture still
   *  types; absent reads as no claim beyond the assignees. */
  readonly claims?: readonly PoolClaim[];
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

/** The higher tier wins when an issue carries both labels — a visitor
 *  should see the more approachable framing, not a duplicate entry. */
function tierForLabels(labels: readonly string[]): ContributorIssueTier | null {
  const normalized = labels.map(normalizeLabel);
  if (normalized.includes('good first issue')) return 'good first issue';
  if (normalized.includes('help wanted')) return 'help wanted';
  return null;
}

/** The maintainer's own marks on an issue (`declined`, `status:
 *  awaiting-human`, `status: blocked`), matched in any casing or hyphenation.
 *  Such an issue stays open, tier label and all, for its reporter to reply to
 *  (CONTRIBUTING.md). The predicate lives in pool-client.ts so the claim and
 *  the stale-claim reaper read the same check as this list; re-exported here
 *  for the Collaboration panel's help-wanted and roadmap reads
 *  (help-wanted-items.ts, roadmap-items.ts) and the mirror pass. */
export { isMaintainerMarked };

/** True when someone holds the issue: an assignee, or a live claim in its
 *  {@link ContributorFacingIssue.claims} ledger. An outside contributor's pool
 *  claim is often its comment alone, because the assign after it needs triage
 *  rights on the repo (claim-ledger.ts, #27); the pool reads that comment as a
 *  claim (pool-client.ts isClaimedPoolIssue), so this list does too. */
function isHeld(issue: ContributorFacingIssue): boolean {
  return issue.assignees.length > 0 || (issue.claims ?? []).length > 0;
}

/**
 * Filters open issues down to the CONTRIBUTOR JOURNEY's pick list: only
 * `good first issue`/`help wanted`-labeled issues, held ones excluded
 * outright (a visitor should never be steered at something someone already
 * owns — an assignee, or a claim comment the pool's claims ledger reads, see
 * {@link isHeld}), and so are ones the maintainer has declined or put on hold
 * ({@link isMaintainerMarked}). Good-first-issue entries rank before
 * help-wanted, ties broken by issue number so the order is stable across
 * calls with identical input.
 */
export function planContributorIssueList(
  issues: readonly ContributorFacingIssue[],
): readonly ContributorListEntry[] {
  const entries: ContributorListEntry[] = [];
  for (const issue of issues) {
    if (isHeld(issue)) continue;
    if (isMaintainerMarked(issue.labels)) continue;
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
  readonly comments?: unknown;
}

/**
 * Lists every open issue (up to `MAX_ISSUE_LIST`) via `gh issue list
 * --state open --json number,title,url,labels,assignees,comments`, run
 * through the injectable `exec` — the same `CliExec` shape and the same
 * fields `pool-client.ts`'s `fetchPoolIssues` already reads, reusing its
 * `parsePoolComments` and `issue-triage.ts`'s
 * `parseIssueLabels`/`parseAssignees` reductions rather than duplicating
 * them; each issue's `claims` is the claims ledger over its assignees and
 * comments. `gh issue list --label` ANDs multiple `--label` flags together
 * rather than ORing them (`pool-client.ts`'s own doc comment), so filtering
 * for `good first issue` OR `help wanted` at the `gh` layer would need two
 * separate calls; every open issue is fetched unfiltered instead and
 * {@link planContributorIssueList} classifies client-side, the same
 * fetch-then-classify split `fetchPoolIssues` already uses. Read-only.
 * Returns `[]` on a non-zero exit or unparseable/non-array stdout rather
 * than throwing. A non-object row (a `null`) and entries missing a numeric
 * `number`, string `title`, or string `url` are dropped rather than passed
 * through malformed. `repo` (`owner/repo`) lists that repository's issues
 * with `--repo`, the routing console's read for a project page; without it
 * the list is the repository `gh` acts on.
 */
export async function fetchContributorFacingIssues(
  exec: CliExec,
  repo?: string,
): Promise<ContributorFacingIssue[]> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'list',
    ...(repo === undefined ? [] : ['--repo', repo]),
    '--state',
    'open',
    '--limit',
    String(MAX_ISSUE_LIST),
    '--json',
    'number,title,url,labels,assignees,comments',
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as unknown[])
    .filter((raw): raw is RawContributorFacingIssue => typeof raw === 'object' && raw !== null)
    .filter(
      (raw) =>
        typeof raw.number === 'number' &&
        typeof raw.title === 'string' &&
        typeof raw.url === 'string',
    )
    .map((raw) => {
      const assignees = parseAssignees(raw.assignees);
      return {
        number: raw.number as number,
        title: raw.title as string,
        url: raw.url as string,
        labels: parseIssueLabels(raw.labels),
        assignees,
        claims: claimLedger(assignees, parsePoolComments(raw.comments)),
      };
    });
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
