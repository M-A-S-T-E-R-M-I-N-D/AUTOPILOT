// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure pool-client panel formatting — client-only (mirrors
 * `pr-review-panel.ts`'s reasoning: `server.ts`/`flight/pool-client.ts`
 * return raw decision facts, and turning those into display text is a
 * client presentation concern). Ships the operator-facing browse/claim
 * panel `docs/epics/0007-platform-maintainer-and-pool.md` slice 6 flagged as
 * open — `GET /api/pool-client`'s preview and `POST /api/pool-client/
 * execute`'s confirm-guarded claim now have an operator-facing surface.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart. Each
 * exported function stays self-contained (no shared module-scope constants)
 * since `.toString()` serializes only the function body, never its
 * surrounding closure.
 */

/** One pool issue's browse-relevant facts, the same shape `GET
 *  /api/pool-client`'s `entries[].issue` carries — see
 *  `flight/pool-client.ts`'s `PoolIssue`. */
export interface PoolIssueLike {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly assignees: readonly string[];
}

/** The decision `GET /api/pool-client`'s `entries[].decision` carries — see
 *  `flight/pool-client.ts`'s `PoolClaimDecision`. */
export interface PoolClaimDecisionLike {
  readonly decision: string;
  readonly reasoning: string;
}

/** Maps a pool claim decision kind to its badge text. `claim`/`skip` are the
 *  only values `flight/pool-client.ts`'s `planClaimPoolIssue` emits; anything
 *  else (should never happen) echoes back verbatim rather than throwing, the
 *  same unrecognized-value stance `prReviewDecisionLabel` takes. */
export function poolClaimDecisionLabel(decision: string): string {
  if (decision === 'claim') return '✓ claimable';
  if (decision === 'skip') return '— already claimed';
  return decision;
}

/** The pool client CLAIM button's `window.confirm()` message for one issue —
 *  states what claiming does before the operator triggers a real `gh`
 *  assign + comment, same "state what happens before confirming" shape
 *  `prReviewConfirmMessage` uses. `projectName` is the label of the project
 *  picker's current selection (falsy — no project picked, or none
 *  registered — omits the queuing line entirely, since nothing extra will
 *  happen beyond the GitHub claim). */
export function poolClaimConfirmMessage(
  issue: PoolIssueLike,
  decision: PoolClaimDecisionLike,
  projectName?: string,
): string {
  return (
    'Claim pool issue #' +
    issue.number +
    ' "' +
    issue.title +
    '"?\n\n' +
    decision.reasoning +
    '\n\n' +
    'This assigns the issue to you and posts a claim comment on GitHub — reversible there. ' +
    'The decision is re-derived fresh from gh at execute time, so a race with another co-pilot ' +
    'claiming it first will not silently succeed.' +
    (projectName
      ? '\n\nA local board task will also be queued on "' +
        projectName +
        '" so you can fly it from there.'
      : '')
  );
}

/** One planned `gh` command's result, the same shape `POST /api/pool-client/
 *  execute`'s `commandResults[]` entries carry — see `flight/pool-client.ts`'s
 *  `PoolClaimCommandResult`. */
export interface PoolClaimCommandResultLike {
  readonly command: { readonly details: string };
  readonly code: number;
}

/** The shape `poolClaimExecuteResult` reads off `POST /api/pool-client/
 *  execute`'s JSON response — `flight/pool-client.ts`'s
 *  `ClaimAndQueuePoolIssueResult`. `taskQueued` is absent/`false` when no
 *  project was picked (or the claim itself failed) and `true` only when a
 *  local board task actually landed. */
export interface PoolClaimExecuteResponse {
  readonly decision?: PoolClaimDecisionLike;
  readonly commandResults?: readonly PoolClaimCommandResultLike[];
  readonly taskQueued?: boolean;
  readonly error?: string;
}

/** The `.pool-client-result` element's class + message text for one `POST
 *  /api/pool-client/execute` (or `/api/fly`) response. `offerFly` is `true`
 *  only for a successful claim that also queued a local board task — the
 *  signal `web/shell.ts`'s click handler uses to show the "fly locally"
 *  affordance (epic 0007 slice 6's last-noted open item: `POST /api/fly`
 *  already exists and needs no new work, just an operator affordance to
 *  invoke it from here) instead of silently reloading the panel. Absent
 *  (not just false) on a fail result and on {@link poolClaimFlyResult}'s
 *  output, neither of which ever offers a further fly action. */
export interface PoolClaimExecuteResult {
  readonly className: string;
  readonly text: string;
  readonly offerFly?: boolean;
}

/** Formats the pool client CLAIM result: a `'skip'` decision (already
 *  claimed, or no longer in the open pool by execute time — e.g. another
 *  co-pilot won the race) reports its own reasoning as the outcome rather
 *  than a fake success, since {@link claimPoolIssue} always resolves and
 *  never 404s; the FIRST non-zero exit among the planned commands — {@link
 *  executeClaimPoolIssueCommands} stops there — reports as the failure,
 *  same "the exact step that broke" convention `prReviewExecuteResult` uses.
 */
export function poolClaimExecuteResult(
  data: PoolClaimExecuteResponse | null | undefined,
): PoolClaimExecuteResult {
  const decision = data && data.decision;
  if (!decision) {
    return {
      className: 'pool-client-result pool-client-result-fail',
      text: '✗ ' + ((data && data.error) || 'Pool claim execute failed.'),
    };
  }
  if (decision.decision === 'skip') {
    return {
      className: 'pool-client-result pool-client-result-fail',
      text: '✗ ' + decision.reasoning,
    };
  }
  const results = data && data.commandResults ? data.commandResults : [];
  const failed = results.find((r) => r.code !== 0);
  if (failed) {
    return {
      className: 'pool-client-result pool-client-result-fail',
      text: '✗ ' + failed.command.details + ' failed (exit ' + failed.code + ').',
    };
  }
  const taskQueued = Boolean(data && data.taskQueued);
  const taskNote = taskQueued ? ' A local board task was queued too.' : '';
  return {
    className: 'pool-client-result pool-client-result-ok',
    text: '✓ ' + results.map((r) => r.command.details).join('; ') + '.' + taskNote,
    ...(taskQueued ? { offerFly: true } : {}),
  };
}

/** The pool client "Claim" button's `[data-tip]`/`aria-label` — names the
 *  issue and decision so hover/focus previews match what the confirm dialog
 *  is about to say, same shape `prReviewExecuteTip` uses. */
export function poolClaimExecuteTip(issue: PoolIssueLike, decision: PoolClaimDecisionLike): string {
  return (
    'Claim pool issue #' +
    issue.number +
    ': ' +
    poolClaimDecisionLabel(decision.decision) +
    '. This assigns it to you and posts a claim comment — reversible on GitHub.'
  );
}

/** The "fly locally" affordance's `[data-tip]`/`aria-label` — shown after a
 *  claim queued a local board task on `projectName`, letting the operator
 *  start that flight without leaving the pool panel (epic 0007 slice 6). */
export function poolClaimFlyTip(projectName: string): string {
  return 'Fly "' + projectName + '" now — starts a real flight so it can pick up the queued task.';
}

/** The subset of `POST /api/fly`'s response {@link poolClaimFlyResult} reads
 *  — see `flight/runner.ts`'s `StartFlightResult`. */
export interface FlyStartResponseLike {
  readonly started?: boolean;
  readonly queued?: boolean;
  readonly message?: string;
  readonly error?: string;
}

/** Formats the "fly locally" button's result — a started OR queued flight
 *  (the concurrency cap was full, so the registry queued it instead of
 *  refusing) both count as success, matching {@link StartFlightResult}'s own
 *  "queued is accepted, not refused" contract; anything else surfaces the
 *  server's own message/error rather than a generic failure, same "state
 *  what actually broke" convention {@link poolClaimExecuteResult} uses. */
export function poolClaimFlyResult(
  data: FlyStartResponseLike | null | undefined,
): PoolClaimExecuteResult {
  if (!data) {
    return {
      className: 'pool-client-result pool-client-result-fail',
      text: '✗ Fly request failed — try again shortly.',
    };
  }
  if (data.started || data.queued) {
    return {
      className: 'pool-client-result pool-client-result-ok',
      text: '✓ ' + (data.message || (data.queued ? 'Flight queued.' : 'Flight started.')),
    };
  }
  return {
    className: 'pool-client-result pool-client-result-fail',
    text: '✗ ' + (data.message || data.error || 'Could not start the flight.'),
  };
}
