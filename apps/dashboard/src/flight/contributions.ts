// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHAT THIS OPERATOR HAS ACTUALLY CONTRIBUTED (operator, 2026-09-15: "it
 * looks like the system never really checked GitHub — there are a sea of
 * issues there and fixes I already submitted").
 *
 * They were right, and it was the same mistake twice. The onboarding
 * ladder's two contribution steps were ticked from marks this browser wrote
 * when someone pressed the dashboard's own buttons. So an operator who had
 * filed dozens of issues and merged pull requests — through the GitHub web
 * UI, from another machine, or before the ladder existed — still read as
 * having contributed nothing.
 *
 * A checklist that only counts what it personally witnessed is not tracking
 * contribution, it is tracking its own usage. This module asks GitHub.
 *
 * Two searches, both cheap and both scoped to the signed-in account:
 *
 *   gh search issues --author=@me --limit 1
 *   gh search prs    --author=@me --limit 1
 *
 * Pure parsing here; the caller runs `gh` and hands the stdout over, so this
 * stays testable without a network or an authenticated machine. Every
 * malformed or empty answer degrades to "nothing found" rather than
 * throwing — a checklist must never be able to fail a page render.
 */

/** What the ladder needs to know, and nothing more. */
export interface ContributionCounts {
  /** At least one issue authored by this account, anywhere. */
  readonly hasIssue: boolean;
  /** At least one pull request authored by this account, anywhere. */
  readonly hasPr: boolean;
  /** At least one of those pull requests was MERGED — the only one of the
   *  three a third party had to agree to, and therefore the one worth
   *  showing in public later (see docs/epics/0032, slice 2). */
  readonly hasMergedPr: boolean;
}

export const NO_CONTRIBUTIONS: ContributionCounts = {
  hasIssue: false,
  hasPr: false,
  hasMergedPr: false,
};

/** The two searches, as argv. Exported so the census in the server test can
 *  pin that nothing here ever writes — these are both read-only verbs. */
export const ISSUE_SEARCH_ARGS: readonly string[] = [
  'search',
  'issues',
  '--author=@me',
  '--limit',
  '1',
  '--json',
  'number',
];
export const PR_SEARCH_ARGS: readonly string[] = [
  'search',
  'prs',
  '--author=@me',
  '--limit',
  '100',
  '--json',
  'number,state',
];

/** How many rows a `gh search … --json` answer holds, or 0 for anything
 *  that is not a JSON array of objects. */
function rows(stdout: string | undefined): readonly { state?: string }[] {
  if (stdout === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(stdout);
    return Array.isArray(parsed) ? (parsed as { state?: string }[]) : [];
  } catch {
    return [];
  }
}

/**
 * Reads both answers into the three facts the ladder ticks from.
 *
 * `undefined` means the search could not run at all (no `gh`, not signed
 * in, offline). That is reported as "nothing found", which is honest: we do
 * not know of a contribution. It is never reported as an error, because the
 * only consequence is a checklist row staying unticked.
 */
export function readContributions(
  issuesStdout: string | undefined,
  prsStdout: string | undefined,
): ContributionCounts {
  const prRows = rows(prsStdout);
  return {
    hasIssue: rows(issuesStdout).length > 0,
    hasPr: prRows.length > 0,
    hasMergedPr: prRows.some((row) => String(row.state ?? '').toLowerCase() === 'merged'),
  };
}
