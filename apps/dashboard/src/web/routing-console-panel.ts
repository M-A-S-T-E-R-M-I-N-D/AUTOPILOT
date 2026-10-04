// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure ROUTING CONSOLE panel formatting — client-only (epic 0019 S4, board
 * web-mtrh1hn3-8x9f0z). `GET /api/routing-console` returns the console as
 * `flight/routing-console.ts` derives it (milestone progress, the priority
 * and status label queues, claims); turning a milestone's counts into a
 * progress line, or a list of issue numbers into one short line, is a
 * client presentation concern, the same split `collaboration-panel.ts`
 * makes for its claim-state line.
 *
 * `web/features/routing-console.ts` embeds this module's real compiled
 * source via `.toString()`, so each exported function stays self-contained
 * (no shared module-scope constants): `.toString()` serializes only the
 * function body, never its surrounding closure.
 */

/** The subset of one `milestones[]` entry this module reads — see
 *  `flight/routing-console.ts`'s `MilestoneProgress`. */
export interface RoutingMilestoneLike {
  readonly openIssues: number;
  readonly closedIssues: number;
  readonly dueOn: string | null;
  readonly percentDone: number | null;
}

/** The progress line beside a milestone's title: "3 of 10 closed (30%)",
 *  or "No issues yet" for a milestone with none (the model's `null`
 *  percent, which is neither done nor not started), then its due date when
 *  it has one. The date is the ISO value's day part, the same day the
 *  milestone page shows. */
export function routingMilestoneProgressText(milestone: RoutingMilestoneLike): string {
  const total = milestone.openIssues + milestone.closedIssues;
  const progress =
    milestone.percentDone === null
      ? 'No issues yet'
      : milestone.closedIssues + ' of ' + total + ' closed (' + milestone.percentDone + '%)';
  return milestone.dueOn ? progress + ' · due ' + milestone.dueOn.slice(0, 10) : progress;
}

/** A queue's or a claim's issue numbers as one line: "#3, #7, #12", the
 *  first twelve only, then "+N more"; "None" for an empty one, so an empty
 *  `priority: critical` queue reads as nothing waiting rather than a blank. */
export function routingIssueListText(issues: readonly number[]): string {
  const maxShown = 12;
  if (!issues || issues.length === 0) return 'None';
  const shown = issues
    .slice(0, maxShown)
    .map((issue) => '#' + issue)
    .join(', ');
  return issues.length > maxShown ? shown + ' +' + (issues.length - maxShown) + ' more' : shown;
}
