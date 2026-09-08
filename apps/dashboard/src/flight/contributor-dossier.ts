// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * KEEPER contributor dossier (board web-mtq07kgf-2h6trk, "STANDING 2/5";
 * docs/epics/0019-github-steward.md S2: "`partner-application` routes to
 * dossier+human, never auto-verdicts"; `.github/ISSUE_TEMPLATE/partner-
 * application.yml`: "the KEEPER assembles your evidence dossier, the
 * maintainer decides"). A `partner-application`-labeled issue must NEVER
 * flow through `issue-triage.ts`'s ordinary accept/duplicate/skip
 * classification — that path ends in an autonomous verdict (a pool label,
 * or silent rejection as a duplicate), exactly what `CONTRIBUTOR-
 * STANDING.md` promises never happens for a standing application.
 *
 * Split the same pure-decision/injectable-I/O way every other ritual in
 * this directory is: {@link formatContributorDossier} is a pure formatter
 * over already-fetched facts (trivially unit-testable), {@link
 * fetchContributorFacts} is the real `gh` I/O behind the same `CliExec`
 * shape `issue-triage.ts` already uses, and {@link
 * planContributorDossierCommands} composes both into the `gh` commands
 * `issue-triage.ts`'s ritual runs for a `'dossier'`-decided issue instead of
 * the ordinary label+comment pair. `issue-triage.ts` owns detecting WHEN a
 * dossier applies ({@link isPartnerApplicationIssue}) since that's a
 * decision about the issue itself, not about the applicant.
 */

import type { CliExec } from '../connection/cli-probe.js';
import type { IssueTriageCommand } from './issue-triage.js';

/** The issue template's own label (`.github/ISSUE_TEMPLATE/partner-application.yml`). */
export const PARTNER_APPLICATION_LABEL = 'partner-application';

/** Applied once a dossier comment has been posted — later KEEPER passes see
 *  it and skip, the same idempotency convention `POOL_LABEL_PREFIX`/
 *  `duplicate` labels give the ordinary triage path in `issue-triage.ts`. */
export const DOSSIER_POSTED_LABEL = 'dossier-posted';

/** Whether `labels` mark this issue as a standing application — the ONE
 *  signal that routes an issue to the dossier path instead of ordinary
 *  triage, regardless of its title/body content. */
export function isPartnerApplicationIssue(labels: readonly string[]): boolean {
  return labels.includes(PARTNER_APPLICATION_LABEL);
}

/** The verifiable facts a dossier reports — every field is either a real
 *  value read off the GitHub API/CLI or an explicit "unknown"/zero, never a
 *  guess. Counts, not judgments: `formatContributorDossier` renders them,
 *  the maintainer decides what they mean. */
export interface ContributorFacts {
  readonly login: string;
  /** ISO 8601, or `null` when the `gh api users/<login>` lookup failed. */
  readonly accountCreatedAt: string | null;
  readonly publicRepos: number | null;
  readonly followers: number | null;
  /** Count of this login's merged PRs against OUR repo — "merged-with-us
   *  history" per `CONTRIBUTOR-STANDING.md`'s Contributor tier. */
  readonly mergedPrCount: number;
  readonly mergedPrTitles: readonly string[];
  /** Of every commit across those merged PRs, how many carry a
   *  `Signed-off-by:` trailer — "DCO cleanliness" per the same doc. */
  readonly dcoCleanCount: number;
  readonly dcoTotalChecked: number;
}

const SIGNED_OFF_BY_MARKER = 'Signed-off-by:';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function accountAgeLine(accountCreatedAt: string | null, nowMs: number): string {
  if (accountCreatedAt === null) return 'account age: unknown (gh api lookup failed)';
  const createdMs = Date.parse(accountCreatedAt);
  if (Number.isNaN(createdMs)) return 'account age: unknown (unparseable created_at)';
  const days = Math.max(0, Math.floor((nowMs - createdMs) / MS_PER_DAY));
  const years = (days / 365).toFixed(1);
  return `account age: ${days}d (~${years}y), created ${accountCreatedAt}`;
}

function reposLine(publicRepos: number | null, followers: number | null): string {
  if (publicRepos === null) return 'public repos: unknown (gh api lookup failed)';
  return `public repos: ${publicRepos} · followers: ${followers ?? 'unknown'}`;
}

function mergedLine(mergedPrCount: number, mergedPrTitles: readonly string[]): string {
  if (mergedPrCount === 0) return 'merged with us: none yet';
  return `merged with us: ${mergedPrCount} PR(s) — ${mergedPrTitles.map((t) => `"${t}"`).join(', ')}`;
}

function dcoLine(dcoCleanCount: number, dcoTotalChecked: number): string {
  if (dcoTotalChecked === 0) return 'DCO cleanliness: no merged commits to check yet';
  return `DCO cleanliness: ${dcoCleanCount}/${dcoTotalChecked} merged commit(s) carry Signed-off-by`;
}

/**
 * Renders `facts` as the markdown comment `planContributorDossierCommands`
 * posts on the application issue — facts only, no accept/decline verdict:
 * that call stays the maintainer's, per `CONTRIBUTOR-STANDING.md`'s "nothing
 * is auto-approved". Pure and total: every field degrades to an explicit
 * "unknown"/"none yet" line rather than throwing or omitting a section.
 */
export function formatContributorDossier(facts: ContributorFacts, nowMs: number = Date.now()): string {
  return [
    `### KEEPER evidence dossier — @${facts.login}`,
    '',
    `- ${accountAgeLine(facts.accountCreatedAt, nowMs)}`,
    `- ${reposLine(facts.publicRepos, facts.followers)}`,
    `- ${mergedLine(facts.mergedPrCount, facts.mergedPrTitles)}`,
    `- ${dcoLine(facts.dcoCleanCount, facts.dcoTotalChecked)}`,
    '',
    '_Facts only, gathered via the GitHub API — never a promise. The maintainer ' +
      'decides; approvals and declines both get documented reasoning on this issue ' +
      '(see .github/CONTRIBUTOR-STANDING.md)._',
  ].join('\n');
}

interface RawGhUser {
  readonly created_at?: unknown;
  readonly public_repos?: unknown;
  readonly followers?: unknown;
}

interface RawPrCommit {
  readonly messageBody?: unknown;
}

interface RawMergedPr {
  readonly title?: unknown;
  readonly commits?: unknown;
}

function countSignedOffCommits(commits: unknown): { readonly clean: number; readonly total: number } {
  if (!Array.isArray(commits)) return { clean: 0, total: 0 };
  let clean = 0;
  let total = 0;
  for (const raw of commits as readonly RawPrCommit[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    total += 1;
    const body = typeof raw.messageBody === 'string' ? raw.messageBody : '';
    if (body.includes(SIGNED_OFF_BY_MARKER)) clean += 1;
  }
  return { clean, total };
}

/** Bounds how many of a prolific applicant's merged PRs get DCO-checked —
 *  the dossier is evidence for a human, not an exhaustive audit. */
const MAX_MERGED_PRS_CHECKED = 50;

/**
 * Gathers {@link ContributorFacts} for `login` through the injectable `exec`
 * (same `CliExec` shape `issue-triage.ts` already threads through): one
 * `gh api users/<login>` call for account age/repos/followers, one
 * `gh pr list --state merged --author <login>` call (against whichever repo
 * `exec`'s `gh` is scoped to — the same cwd-resolves-the-repo convention
 * `ci-status.ts`'s `createGhRun` documents) for merged-with-us history and
 * DCO cleanliness. Never throws: either call failing (network, auth, rate
 * limit, malformed JSON) degrades that call's facts to their explicit
 * "unknown"/zero values rather than losing the whole dossier — a partial
 * dossier is still more evidence than none.
 */
export async function fetchContributorFacts(login: string, exec: CliExec): Promise<ContributorFacts> {
  let accountCreatedAt: string | null = null;
  let publicRepos: number | null = null;
  let followers: number | null = null;
  try {
    const { code, stdout } = await exec('gh', ['api', `users/${login}`]);
    if (code === 0) {
      const parsed = JSON.parse(stdout) as RawGhUser;
      accountCreatedAt = typeof parsed.created_at === 'string' ? parsed.created_at : null;
      publicRepos = typeof parsed.public_repos === 'number' ? parsed.public_repos : null;
      followers = typeof parsed.followers === 'number' ? parsed.followers : null;
    }
  } catch {
    // best-effort — a dossier with partial facts beats no dossier at all
  }

  let mergedPrCount = 0;
  const mergedPrTitles: string[] = [];
  let dcoCleanCount = 0;
  let dcoTotalChecked = 0;
  try {
    const { code, stdout } = await exec('gh', [
      'pr',
      'list',
      '--state',
      'merged',
      '--author',
      login,
      '--json',
      'title,commits',
      '--limit',
      String(MAX_MERGED_PRS_CHECKED),
    ]);
    if (code === 0) {
      const parsed = JSON.parse(stdout) as unknown;
      if (Array.isArray(parsed)) {
        for (const raw of parsed as readonly RawMergedPr[]) {
          if (typeof raw.title !== 'string') continue;
          mergedPrCount += 1;
          mergedPrTitles.push(raw.title);
          const { clean, total } = countSignedOffCommits(raw.commits);
          dcoCleanCount += clean;
          dcoTotalChecked += total;
        }
      }
    }
  } catch {
    // best-effort, same stance as the account lookup above
  }

  return {
    login,
    accountCreatedAt,
    publicRepos,
    followers,
    mergedPrCount,
    mergedPrTitles,
    dcoCleanCount,
    dcoTotalChecked,
  };
}

/**
 * The `gh` commands a `'dossier'`-decided issue's own I/O step runs:
 * {@link DOSSIER_POSTED_LABEL} first (so a re-run — or a crash between the
 * two calls — never posts the dossier twice; a stray label with no comment
 * is a harmless miss, not a duplicate), then the dossier comment itself.
 * Returns `[]` when `login` is empty — a caller with no applicant identity
 * to look up has nothing safe to post. Composes {@link fetchContributorFacts}
 * with {@link formatContributorDossier}; the async fetch is why this can't
 * live in `issue-triage.ts`'s own synchronous `planIssueTriageCommands` —
 * see that file's `'dossier'` handling for how the two meet.
 */
export async function planContributorDossierCommands(
  issueNumber: number,
  login: string,
  exec: CliExec,
  nowMs: number = Date.now(),
): Promise<readonly IssueTriageCommand[]> {
  if (login.length === 0) return [];
  const facts = await fetchContributorFacts(login, exec);
  const dossier = formatContributorDossier(facts, nowMs);
  const issueRef = String(issueNumber);
  return [
    {
      command: 'gh',
      args: ['issue', 'edit', issueRef, '--add-label', DOSSIER_POSTED_LABEL],
      details: `labeling #${issueNumber} "${DOSSIER_POSTED_LABEL}" so later KEEPER passes skip it`,
    },
    {
      command: 'gh',
      args: ['issue', 'comment', issueRef, '--body', dossier],
      details: `posting KEEPER's contributor evidence dossier on #${issueNumber}`,
    },
  ];
}
