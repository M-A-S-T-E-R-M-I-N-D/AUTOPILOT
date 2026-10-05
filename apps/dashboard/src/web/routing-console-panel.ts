// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure ROUTING CONSOLE panel formatting — client-only (epic 0019 S4, board
 * web-mtrh1hn3-8x9f0z). `GET /api/routing-console` returns the console as
 * `flight/routing-console.ts` derives it (milestone progress, the priority
 * and status label queues, claims); turning a milestone's counts into a
 * progress line, or a list of issue numbers into one short line, is a
 * client presentation concern, the same split `collaboration-panel.ts`
 * makes for its claim-state line. So is the route's side: which labels a
 * "No priority yet" issue's picker offers, the confirm before
 * `POST /api/routing-console/route`, and the line its answer leaves.
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

/** One `labelQueues[]` entry — see `flight/routing-console.ts`'s
 *  `LabelQueue`. */
export interface RoutingLabelQueueLike {
  readonly label: string;
  readonly issues: readonly number[];
}

/** The labels a "No priority yet" issue's picker offers: the console's own
 *  priority queues, in the order it lists them, spelled as the house
 *  taxonomy spells them. Never a status label, which routes nothing. */
export function routingPriorityLabels(queues: readonly RoutingLabelQueueLike[]): string[] {
  return (queues || [])
    .map((queue) => queue.label)
    .filter((label) => String(label).toLowerCase().indexOf('priority: ') === 0);
}

/** The confirm dialog before a route: it names the issue, the label, and
 *  that the label is added on GitHub itself. */
export function routingRouteConfirmMessage(issue: number, label: string): string {
  return (
    'Route #' +
    issue +
    ' as "' +
    label +
    '"?\n\nThis adds the label to the issue on GitHub, so the page and the board steer by the same label.'
  );
}

/** The subset of a `POST /api/routing-console/route` answer this module
 *  reads — `flight/routing-console-execute.ts`'s `RouteIssueResult`, or a
 *  server error's `{error}`. */
export interface RoutingRouteAnswerLike {
  readonly issue?: number;
  readonly label?: string;
  readonly routed?: boolean;
  readonly refusedReason?: string;
  readonly error?: string;
}

/** The line a route leaves under the picker: "Routed #12 as priority: high."
 *  or why it sent no label. A refusal names its reason, a failed edit carries
 *  `gh`'s own words, and an answer that is neither (a server error, no
 *  answer at all) reads as not routed, never as routed. */
export function routingRouteResultText(answer: RoutingRouteAnswerLike | null | undefined): {
  text: string;
  failed: boolean;
} {
  const notRouted = 'Not routed — ';
  if (!answer) return { text: notRouted + "the dashboard didn't answer.", failed: true };
  const issue = '#' + answer.issue;
  if (answer.routed === true) {
    return { text: 'Routed ' + issue + ' as ' + answer.label + '.', failed: false };
  }
  const reasons: Record<string, string> = {
    guest: "only the repository's maintainer routes issues",
    'identity-unresolved': "couldn't tell who gh is signed in as",
    'issue-unreadable': "couldn't read " + issue + ' on GitHub',
    'issue-closed': issue + ' is closed',
    'already-prioritized': issue + ' already carries a priority label',
    'not-a-priority-label': '"' + answer.label + '" is not a priority label',
  };
  const refused = answer.refusedReason;
  if (refused) {
    const known = Object.prototype.hasOwnProperty.call(reasons, refused);
    return {
      text: notRouted + (known ? reasons[refused] : 'refused: ' + refused) + '.',
      failed: true,
    };
  }
  if (answer.error) {
    const said = typeof answer.routed === 'boolean' ? 'gh said: ' : '';
    return { text: notRouted + said + answer.error, failed: true };
  }
  return { text: notRouted + "the dashboard didn't answer.", failed: true };
}
