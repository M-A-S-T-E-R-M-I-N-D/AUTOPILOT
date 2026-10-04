// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0019 "GitHub Steward" slice 4 (docs/epics/0019-github-steward.md,
 * board web-mtrh1hn3-8x9f0z): the operator routing console's model. Law 2
 * makes labels, milestones and assignment STEERING inputs, so the dashboard
 * has to show "what the page says" — milestone progress, the priority and
 * status label queues, who claims what — next to the board.
 *
 * This module is the pure derivation ({@link planRoutingConsole}) plus the
 * one read no other module makes: the OPEN milestones with their issue
 * counts ({@link fetchOpenMilestones}; `taxonomy-seed.ts` reads every
 * milestone's title, `issue-triage.ts` titles only). The open issues come
 * from `contributor-issue-list.ts`'s `fetchContributorFacingIssues`, every
 * open issue with its claims ledger, whose rows {@link RoutingIssue} accepts
 * as they are; {@link fetchRoutingConsole} makes both reads behind
 * the one call `server/routing-console.ts` serves as `GET
 * /api/routing-console`. Read-only throughout: nothing here labels, assigns
 * or closes anything.
 */

import type { CliExec } from '../connection/cli-probe.js';
import type { PoolClaim } from './claim-ledger.js';
import { fetchContributorFacingIssues } from './contributor-issue-list.js';
import { ghExec } from './gh-exec.js';
import { normalizeLabel } from './pool-client.js';
import {
  HOUSE_TAXONOMY_LABELS,
  MAX_MILESTONE_PAGES,
  MILESTONE_PAGE_SIZE,
  fetchMilestonePage,
} from './taxonomy-seed.js';

/** One open milestone as the page shows it. The counts are GitHub's own
 *  (`open_issues`/`closed_issues`, which include pull requests), so the
 *  console reads the same progress the milestone page does. */
export interface RoutingMilestone {
  readonly title: string;
  readonly openIssues: number;
  readonly closedIssues: number;
  /** ISO due date, or `null` for a milestone with none. */
  readonly dueOn: string | null;
  /** The milestone's own page (`html_url`), which the panel links its title
   *  to (test/flight/link-census.test.ts); `null` when the row carries no
   *  https link, so the milestone still shows, unlinked. */
  readonly url: string | null;
}

/** The fields of an open issue the console reads — `issue-triage.ts`'s
 *  `IncomingIssue` and `contributor-issue-list.ts`'s `ContributorFacingIssue`
 *  both fit as they are. */
export interface RoutingIssue {
  readonly number: number;
  readonly labels?: readonly string[];
  readonly assignees?: readonly string[];
  /** THE CLAIMS LEDGER (claim-ledger.ts) read off the issue's comments and
   *  assignees, the way the pool reads it. Absent reads as no claim beyond
   *  the assignees. */
  readonly claims?: readonly PoolClaim[];
}

export interface MilestoneProgress extends RoutingMilestone {
  /** Closed share of the milestone's issues as a whole percent, rounded
   *  down so an open issue never reads as 100%; `null` for a milestone with
   *  no issues at all, which is neither done nor not started. */
  readonly percentDone: number | null;
}

/** The open issues one steering label routes, numbers ascending. */
export interface LabelQueue {
  readonly label: string;
  readonly issues: readonly number[];
}

/** The open issues one login holds, numbers ascending. */
export interface IssueClaim {
  readonly login: string;
  readonly issues: readonly number[];
}

export interface RoutingConsole {
  /** Soonest due first, undated last, ties by title. */
  readonly milestones: readonly MilestoneProgress[];
  /** One queue per {@link ROUTING_QUEUE_LABELS} entry, empty ones included,
   *  so an empty `priority: critical` reads as zero rather than missing. */
  readonly labelQueues: readonly LabelQueue[];
  /** Open issues carrying none of the priority labels — what triage has
   *  not routed yet. */
  readonly unprioritized: readonly number[];
  /** Busiest holder first, then by login. */
  readonly claims: readonly IssueClaim[];
  readonly unclaimed: readonly number[];
}

const PRIORITY_PREFIX = 'priority: ';
const STATUS_PREFIX = 'status: ';

/** The house labels a maintainer steers with (epic law 2): the priority
 *  group, then the status group, in `HOUSE_TAXONOMY_LABELS`' own order. */
export const ROUTING_QUEUE_LABELS: readonly string[] = [
  ...HOUSE_TAXONOMY_LABELS.filter((label) => label.name.startsWith(PRIORITY_PREFIX)),
  ...HOUSE_TAXONOMY_LABELS.filter((label) => label.name.startsWith(STATUS_PREFIX)),
].map((label) => label.name);

const PRIORITY_LABELS = new Set(
  ROUTING_QUEUE_LABELS.filter((label) => label.startsWith(PRIORITY_PREFIX)).map(normalizeLabel),
);

function ascending(numbers: readonly number[]): readonly number[] {
  return [...numbers].sort((a, b) => a - b);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function byDueThenTitle(a: RoutingMilestone, b: RoutingMilestone): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return compareText(a.dueOn, b.dueOn);
  }
  return compareText(a.title, b.title);
}

function percentDone(milestone: RoutingMilestone): number | null {
  const total = milestone.openIssues + milestone.closedIssues;
  return total === 0 ? null : Math.floor((milestone.closedIssues * 100) / total);
}

function carries(issue: RoutingIssue, normalized: string): boolean {
  return (issue.labels ?? []).some((label) => normalizeLabel(label) === normalized);
}

/** Who holds the issue: every assignee, and every login with a live claim in
 *  its {@link RoutingIssue.claims} ledger. An outside contributor's pool claim
 *  is often its comment alone, because the assign after it needs triage rights
 *  on the repo (claim-ledger.ts, #27); the pool reads that comment as a claim
 *  (pool-client.ts isClaimedPoolIssue), so the console does too. An assignee
 *  the ledger reads as released still shows: GitHub still lists them. */
function holdersOf(issue: RoutingIssue): ReadonlySet<string> {
  return new Set([...(issue.assignees ?? []), ...(issue.claims ?? []).map((claim) => claim.login)]);
}

function claimsOf(issues: readonly RoutingIssue[]): readonly IssueClaim[] {
  const held = new Map<string, readonly number[]>();
  for (const issue of issues) {
    for (const login of holdersOf(issue)) {
      held.set(login, [...(held.get(login) ?? []), issue.number]);
    }
  }
  return [...held]
    .map(([login, numbers]) => ({ login, issues: ascending(numbers) }))
    .sort((a, b) => b.issues.length - a.issues.length || compareText(a.login, b.login));
}

/**
 * Derives the console from one read of the open milestones and one of the
 * open issues. Pure and deterministic: labels match the way the
 * maintainer's other marks do (`pool-client.ts`'s `normalizeLabel`, so
 * `Priority: High` and `status: needs format` still count), and labels
 * outside the steering groups are not queued.
 */
export function planRoutingConsole(
  milestones: readonly RoutingMilestone[],
  issues: readonly RoutingIssue[],
): RoutingConsole {
  const numbersWhere = (keep: (issue: RoutingIssue) => boolean): readonly number[] =>
    ascending(issues.filter(keep).map((issue) => issue.number));
  return {
    milestones: [...milestones]
      .sort(byDueThenTitle)
      .map((milestone) => ({ ...milestone, percentDone: percentDone(milestone) })),
    labelQueues: ROUTING_QUEUE_LABELS.map((label) => ({
      label,
      issues: numbersWhere((issue) => carries(issue, normalizeLabel(label))),
    })),
    unprioritized: numbersWhere(
      (issue) => !(issue.labels ?? []).some((label) => PRIORITY_LABELS.has(normalizeLabel(label))),
    ),
    claims: claimsOf(issues),
    unclaimed: numbersWhere((issue) => holdersOf(issue).size === 0),
  };
}

/** One milestone row as the REST endpoint emits it — untrusted process
 *  output, read field by field. */
interface RawMilestone {
  readonly title?: unknown;
  readonly open_issues?: unknown;
  readonly closed_issues?: unknown;
  readonly due_on?: unknown;
  readonly html_url?: unknown;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** An https link or `null` — the only scheme an href from this read may
 *  carry, the guard `pr-review.ts` puts on a check's link. */
function httpsUrl(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('https://') ? value : null;
}

function milestoneOf(raw: unknown): RoutingMilestone | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const row = raw as RawMilestone;
  if (typeof row.title !== 'string') return undefined;
  if (!isCount(row.open_issues) || !isCount(row.closed_issues)) return undefined;
  return {
    title: row.title,
    openIssues: row.open_issues,
    closedIssues: row.closed_issues,
    dueOn: typeof row.due_on === 'string' ? row.due_on : null,
    url: httpsUrl(row.html_url),
  };
}

/** `gh api .../milestones` rows reduced to {@link RoutingMilestone}s. A row
 *  missing its title or a whole, non-negative count is dropped rather than
 *  shown with a guessed progress; one missing only its link is kept,
 *  unlinked. A non-array payload is no rows. */
export function parseMilestoneRows(raw: unknown): readonly RoutingMilestone[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row: unknown) => {
    const milestone = milestoneOf(row);
    return milestone === undefined ? [] : [milestone];
  });
}

/**
 * The repo's open milestones with their issue counts, paged the way
 * `taxonomy-seed.ts` pages its milestone read (until a short page, at most
 * {@link MAX_MILESTONE_PAGES}). `undefined` when any page fails: a console
 * that cannot read the page says so, never "no milestones".
 */
export async function fetchOpenMilestones(
  exec: CliExec,
): Promise<readonly RoutingMilestone[] | undefined> {
  const rows: unknown[] = [];
  for (let page = 1; page <= MAX_MILESTONE_PAGES; page += 1) {
    const pageRows = await fetchMilestonePage(exec, page, 'open');
    if (pageRows === undefined) return undefined;
    rows.push(...pageRows);
    if (pageRows.length < MILESTONE_PAGE_SIZE) break;
  }
  return parseMilestoneRows(rows);
}

/** What `GET /api/routing-console` answers: the console, except that its
 *  milestones are `null` when the open milestones could not be read — the
 *  panel then says "unknown" rather than "no milestones". The issue side
 *  carries no such mark: `fetchContributorFacingIssues` reads a failed list
 *  as no open issues, the same degradation the triage sweep and the pool
 *  live with. */
export interface RoutingConsoleSnapshot extends Omit<RoutingConsole, 'milestones'> {
  readonly milestones: readonly MilestoneProgress[] | null;
}

/** The routing console's read (injected) — see {@link createRoutingConsoleApi}. */
export type RoutingConsoleApi = () => Promise<RoutingConsoleSnapshot>;

/** The answer when nothing could be read: milestones unknown, and every
 *  queue present but empty, the shape {@link planRoutingConsole} gives an
 *  empty issue list. */
export const UNREADABLE_ROUTING_CONSOLE: RoutingConsoleSnapshot = {
  ...planRoutingConsole([], []),
  milestones: null,
};

/** One open-milestone read and one open-issue read, in parallel, derived
 *  into the console. Read-only: a milestone GET and an issue list. The issue
 *  list carries comments, the fields the pool's own read asks for, so a claim
 *  that landed only as its comment shows under Claims. */
export async function fetchRoutingConsole(exec: CliExec): Promise<RoutingConsoleSnapshot> {
  const [milestones, issues] = await Promise.all([
    fetchOpenMilestones(exec),
    fetchContributorFacingIssues(exec),
  ]);
  const plan = planRoutingConsole(milestones ?? [], issues);
  return { ...plan, milestones: milestones === undefined ? null : plan.milestones };
}

/**
 * Builds the routing console's read, defaulting to the fleet's guarded `gh`
 * like every other on-demand panel read here (`collaboration.ts`'s
 * `createCollaborationApi`). Never rejects: a thrown `exec` answers
 * {@link UNREADABLE_ROUTING_CONSOLE}, so the route never 500s on a missing
 * or failing `gh`.
 */
export function createRoutingConsoleApi(exec: CliExec = ghExec): RoutingConsoleApi {
  return async () => {
    try {
      return await fetchRoutingConsole(exec);
    } catch {
      return UNREADABLE_ROUTING_CONSOLE;
    }
  };
}
