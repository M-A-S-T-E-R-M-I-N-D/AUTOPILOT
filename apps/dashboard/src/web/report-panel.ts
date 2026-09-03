// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure REPORT-FROM-HERE panel formatting — client-only (mirrors
 * `pr-review-panel.ts`/`release-panel.ts`'s reasoning: `server.ts`'s
 * `POST /api/report-from-here` preview and `POST
 * /api/report-from-here/execute` return raw plan/result facts, and turning
 * those into display text is a client presentation concern). This is the
 * operator-panel formatting core `flight/report-from-here.ts`'s header
 * comment deferred (BOARD web-mss50ia8-nthtf3, "PLATFORM 5/7") —
 * `web/features/report-menu.ts` imports it and inlines each function's real
 * compiled source into the generated `/panels.js` via `.toString()`, so the
 * single right-click "📮 Report from here" dialog (REPORT UNIFICATION 1/2,
 * epic 0015 — superseding the eight always-open per-region panels this
 * module originally shipped for) is reachable from the live dashboard.
 * Every exported function stays self-contained (no shared module-scope
 * constants): `.toString()` serializes only the function body, never its
 * surrounding closure.
 */

/** A rejected plan, the shape `flight/report-from-here.ts`'s
 *  `ReportRejected` carries over both endpoints — nothing was (or will be)
 *  applied, and `reasoning` says why. */
export interface ReportRejectedLike {
  readonly ok: false;
  readonly reasoning: string;
}

/** A resolved plan — the discriminants the panel needs from
 *  `ReportIssuePlan`/`ReportTaskPlan`: which of the four actions it is and
 *  the one-line summary of exactly what executing it does. */
export interface ReportResolvedLike {
  readonly ok: true;
  readonly action: string;
  readonly summary: string;
}

export type ReportPlanLike = ReportRejectedLike | ReportResolvedLike;

/** Maps a report action to its button/badge text. `issue`/`quick-fix-pr`/
 *  `local-task`/`pool-offer` are the only values `REPORT_ACTIONS` admits;
 *  anything else (should never happen) echoes back verbatim rather than
 *  throwing, the same degrade-to-plain-label stance
 *  `prReviewDecisionLabel` takes. */
export function reportActionLabel(action: string): string {
  if (action === 'issue') return '🐛 bug issue';
  if (action === 'quick-fix-pr') return '🔧 quick-fix PR';
  if (action === 'local-task') return '📋 local task';
  if (action === 'pool-offer') return '🤝 pool offer';
  return action;
}

/** The REPORT EXECUTE button's `window.confirm()` message for one resolved
 *  plan — states exactly what applying it does before the operator triggers
 *  a real `gh issue create` or board write, same "state what happens before
 *  confirming" shape `releaseConfirmMessage`/`prReviewConfirmMessage` use.
 *  An upstream plan (issue/pool offer) notes the issue is real and lives on
 *  GitHub afterward; a task-shaped plan notes the content-addressed id
 *  makes a retry harmless. */
export function reportConfirmMessage(plan: ReportResolvedLike): string {
  const isTask = plan.action === 'local-task' || plan.action === 'quick-fix-pr';
  const effectNote = isTask
    ? 'This creates a queued board task — its id is content-addressed, so retrying the same capture never mints a second one.'
    : 'This files a REAL GitHub issue via gh — this dashboard cannot recall it; close it on GitHub if it was a mistake.';
  return (
    'Execute this report?\n\n' +
    plan.summary +
    '\n\n' +
    effectNote +
    '\n\n' +
    'The plan is re-derived fresh from the capture at execute time — this ' +
    'will not blindly trust what is shown here.'
  );
}

/** One planned `gh` command's result, the shape `POST
 *  /api/report-from-here/execute`'s `commandResults[]` entries carry — see
 *  `flight/report-from-here.ts`'s `ReportCommandResult`. */
export interface ReportCommandResultLike {
  readonly command: { readonly details: string };
  readonly code: number;
}

/** The shape `reportExecuteResult` reads off `POST
 *  /api/report-from-here/execute`'s JSON response — `error` covers the
 *  non-success shapes (404 unavailable, 429 rate limited, 400/415 bad
 *  request, 500) return instead. */
export interface ReportExecuteResponse {
  readonly plan?: ReportPlanLike;
  readonly commandResults?: readonly ReportCommandResultLike[];
  readonly taskCreated?: boolean;
  readonly error?: string;
}

/** The `.report-result` element's class + message text for one `POST
 *  /api/report-from-here/execute` response. */
export interface ReportExecuteResult {
  readonly className: string;
  readonly text: string;
}

/** Formats the REPORT EXECUTE result. A rejected plan reports its reasoning
 *  (the server returns 200 with nothing applied — "always previewed" holds
 *  even for a bad capture). A task-shaped plan distinguishes a fresh task
 *  from the content-addressed retry no-op instead of pretending the retry
 *  created one. An upstream plan reports the FIRST failing `gh` command
 *  with its exit code — the exact step that broke, same stance
 *  `prReviewExecuteResult` takes — or every command's `details` on
 *  success. */
export function reportExecuteResult(
  data: ReportExecuteResponse | null | undefined,
): ReportExecuteResult {
  const plan = data && data.plan;
  if (!plan) {
    return {
      className: 'report-result report-result-fail',
      text: '✗ ' + ((data && data.error) || 'report execute failed.'),
    };
  }
  if (!plan.ok) {
    return {
      className: 'report-result report-result-fail',
      text: '✗ nothing applied — ' + plan.reasoning,
    };
  }
  if (plan.action === 'local-task' || plan.action === 'quick-fix-pr') {
    if (data && data.taskCreated) {
      return { className: 'report-result report-result-ok', text: '✓ ' + plan.summary + '.' };
    }
    return {
      className: 'report-result report-result-ok',
      text: '✓ already on the board — this capture was reported before, and a retry mints nothing twice.',
    };
  }
  const results = (data && data.commandResults) || [];
  if (results.length === 0) {
    return {
      className: 'report-result report-result-fail',
      text: '✗ the plan resolved but no gh command ran.',
    };
  }
  const failed = results.find((r) => r.code !== 0);
  if (failed) {
    return {
      className: 'report-result report-result-fail',
      text: '✗ ' + failed.command.details + ' failed (exit ' + failed.code + ').',
    };
  }
  return {
    className: 'report-result report-result-ok',
    text: '✓ ' + results.map((r) => r.command.details).join('; ') + '.',
  };
}

/** The REPORT EXECUTE button's `[data-tip]`/`aria-label` (app-wide
 *  interactivity audit v2, web-msm66jlc-gm4oom convention) — hover/focus
 *  previews what the confirm dialog is about to say: the plan's summary
 *  plus the same real-issue / retry-safe clause
 *  {@link reportConfirmMessage} uses. */
export function reportExecuteTip(plan: ReportResolvedLike): string {
  const isTask = plan.action === 'local-task' || plan.action === 'quick-fix-pr';
  const effectNote = isTask
    ? ' Creates a queued board task — content-addressed, so a retry is harmless.'
    : ' Files a real GitHub issue via gh — reversible only on GitHub.';
  return 'Execute this report: ' + plan.summary + '.' + effectNote;
}
