// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure KEEPER ISSUE TRIAGE panel formatting — client-only (mirrors
 * `pr-review-panel.ts`'s reasoning: `server.ts`/`flight/issue-triage.ts`
 * return raw decision facts, and turning those into display text is a client
 * presentation concern). Ships the dashboard UI panel/button
 * `flight/issue-triage-execute.ts`'s header comment flagged as a deferred
 * follow-up slice (BOARD web-mss50i9u-ldv513, "PLATFORM 3/7") —
 * `GET /api/issue-triage`'s preview and `POST /api/issue-triage/execute`'s
 * confirm-guarded batch apply now have an operator-facing surface. Unlike
 * `pr-review-panel.ts`, execute here has no per-item target — it re-runs the
 * whole ritual for one project — so there is one confirm message covering
 * the batch, not one per issue.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart. Each
 * exported function stays self-contained (no shared module-scope constants)
 * since `.toString()` serializes only the function body, never its
 * surrounding closure.
 */

/** One incoming issue's KEEPER-relevant facts, the same shape `GET
 *  /api/issue-triage`'s `triage[].issue` entry carries — see
 *  `flight/issue-triage.ts`'s `IncomingIssue`. */
export interface IssueTriageIssueLike {
  readonly number: number;
  readonly title: string;
}

/** The decision `GET /api/issue-triage`'s `triage[].decision` carries — see
 *  `flight/issue-triage.ts`'s `IssueTriageDecision`. */
export interface IssueTriageDecisionLike {
  readonly decision: string;
  readonly reasoning: string;
}

/** One issue's full triage plan, the same shape `GET /api/issue-triage`'s
 *  `triage[]` entries carry — see `flight/issue-triage.ts`'s
 *  `IssueTriagePlan`. */
export interface IssueTriagePlanLike {
  readonly issue: IssueTriageIssueLike;
  readonly decision: IssueTriageDecisionLike;
}

/** Maps a KEEPER triage decision kind to its badge text. `accept`/
 *  `duplicate`/`skip` are the only values `flight/issue-triage.ts`'s
 *  `planIssueTriage` emits; anything else (should never happen) echoes back
 *  verbatim rather than throwing, so an unrecognized future decision kind
 *  degrades to a plain label instead of breaking the panel. */
export function issueTriageDecisionLabel(decision: string): string {
  if (decision === 'accept') return '✓ accept';
  if (decision === 'duplicate') return '⧉ duplicate';
  if (decision === 'skip') return '⏭ skip';
  return decision;
}

/** The KEEPER ISSUE TRIAGE EXECUTE button's `window.confirm()` message —
 *  covers the whole batch (execute has no single-issue target, unlike KEEPER
 *  PR review), same "state what happens before confirming" shape
 *  `prReviewConfirmMessage` uses. States how many issues get labeled +
 *  commented as newly accepted, labeled duplicate + commented, or skipped as
 *  already triaged by a previous pass, so the operator knows the blast
 *  radius before real `gh` calls fire. */
export function issueTriageConfirmMessage(plans: readonly IssueTriagePlanLike[]): string {
  const acceptCount = plans.filter((p) => p.decision.decision === 'accept').length;
  const duplicateCount = plans.filter((p) => p.decision.decision === 'duplicate').length;
  const skipCount = plans.length - acceptCount - duplicateCount;
  return (
    'Run KEEPER triage on ' +
    plans.length +
    (plans.length === 1 ? ' open issue' : ' open issues') +
    '?\n\n' +
    acceptCount +
    (acceptCount === 1 ? ' issue' : ' issues') +
    ' will be labeled, commented, and turned into a new board task; ' +
    duplicateCount +
    (duplicateCount === 1 ? ' issue' : ' issues') +
    ' already matching open work will be labeled duplicate and commented; ' +
    skipCount +
    (skipCount === 1 ? ' issue' : ' issues') +
    ' already triaged in a previous pass will be skipped.\n\n' +
    'Issues are re-fetched fresh from gh at execute time — this will not blindly ' +
    'trust the preview shown here if issues changed.'
  );
}

/** The KEEPER ISSUE TRIAGE EXECUTE button's `[data-tip]`/`aria-label`
 *  (app-wide interactivity audit v2, web-msm66jlc-gm4oom) — the button
 *  carried no explanation of the batch blast radius before the operator's
 *  click triggered {@link issueTriageConfirmMessage}'s confirm dialog, the
 *  same gap `prReviewExecuteTip` closed for the PR-review Apply button.
 *  Compresses the confirm message's accept/duplicate/skip counts into one
 *  hover-sized sentence so the preview matches what the dialog is about to
 *  say, and notes real `gh` calls fire only after that confirm. */
export function issueTriageExecuteTip(plans: readonly IssueTriagePlanLike[]): string {
  const acceptCount = plans.filter((p) => p.decision.decision === 'accept').length;
  const duplicateCount = plans.filter((p) => p.decision.decision === 'duplicate').length;
  const skipCount = plans.length - acceptCount - duplicateCount;
  return (
    'Run KEEPER triage on ' +
    plans.length +
    (plans.length === 1 ? ' open issue' : ' open issues') +
    ': ' +
    acceptCount +
    ' to accept (label + comment + new board task), ' +
    duplicateCount +
    ' to mark duplicate, ' +
    skipCount +
    ' already triaged. Real gh calls fire only after a confirm.'
  );
}

/** One planned `gh` command's result, the same shape `POST
 *  /api/issue-triage/execute`'s `commandResults[]` entries carry — see
 *  `flight/issue-triage.ts`'s `IssueTriageCommandResult`. */
export interface IssueTriageCommandResultLike {
  readonly command: { readonly details: string };
  readonly code: number;
}

/** The shape `issueTriageExecuteResult` reads off `POST
 *  /api/issue-triage/execute`'s JSON response — `error` covers the
 *  non-success shapes (404 unknown project, 429 rate limited, 400/415 bad
 *  request, 500) return instead. */
export interface IssueTriageExecuteResponse {
  readonly commandResults?: readonly IssueTriageCommandResultLike[];
  readonly tasksCreated?: number;
  readonly error?: string;
}

/** The `.issue-triage-result` element's class + message text for one `POST
 *  /api/issue-triage/execute` response. */
export interface IssueTriageExecuteResult {
  readonly className: string;
  readonly text: string;
}

/** Formats the KEEPER ISSUE TRIAGE EXECUTE result. Unlike
 *  `prReviewExecuteResult`, `executeIssueTriageCommands` never stops at the
 *  first failure — it runs every planned command across every issue in the
 *  batch — so a failure reports how many of the total failed alongside the
 *  first one's own detail, rather than treating that first failure as the
 *  end of the run. A clean run reports how many board tasks the batch
 *  created (may be zero when every issue was a duplicate). */
export function issueTriageExecuteResult(
  data: IssueTriageExecuteResponse | null | undefined,
): IssueTriageExecuteResult {
  const results = data && data.commandResults;
  if (!results) {
    return {
      className: 'issue-triage-result issue-triage-result-fail',
      text: '✗ ' + ((data && data.error) || 'Issue triage execute failed.'),
    };
  }
  const tasksCreated = (data && data.tasksCreated) || 0;
  const tasksNote =
    tasksCreated > 0
      ? ' ' +
        tasksCreated +
        (tasksCreated === 1 ? ' new board task created.' : ' new board tasks created.')
      : '';
  const failedCount = results.filter((r) => r.code !== 0).length;
  const firstFailed = results.find((r) => r.code !== 0);
  if (firstFailed) {
    return {
      className: 'issue-triage-result issue-triage-result-fail',
      text:
        '✗ ' +
        failedCount +
        ' of ' +
        results.length +
        ' gh command(s) failed — first: ' +
        firstFailed.command.details +
        ' (exit ' +
        firstFailed.code +
        ').' +
        tasksNote,
    };
  }
  return {
    className: 'issue-triage-result issue-triage-result-ok',
    text:
      '✓ Ran ' +
      results.length +
      (results.length === 1 ? ' gh command.' : ' gh commands.') +
      tasksNote,
  };
}
