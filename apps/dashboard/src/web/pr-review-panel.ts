// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure KEEPER PR REVIEW panel formatting — client-only (mirrors
 * `release-panel.ts`'s reasoning: `server.ts`/`flight/pr-review.ts` return
 * raw decision facts, and turning those into display text is a client
 * presentation concern). Ships the dashboard UI panel/button
 * `flight/pr-review.ts`'s header comment flagged as a deferred follow-up
 * slice (BOARD web-mss50ia0-s6vtbd, "PLATFORM 4/7") — `GET /api/pr-review`'s
 * preview and `POST /api/pr-review/execute`'s confirm-guarded apply now have
 * an operator-facing surface.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart. Each
 * exported function stays self-contained (no shared module-scope constants)
 * since `.toString()` serializes only the function body, never its
 * surrounding closure.
 *
 * i18n (board web-msnsndki-dz3vn1): every helper below that composes a
 * sentence takes the bundle's `tr()` as its last parameter — the injection
 * route `flightProgressOf`/the `connect-panel.ts` family took — because a
 * `.toString()`-spliced function can no more import a translator than a
 * formatter: only its own scope survives the splice. The ✓/✗/🟣 marks are
 * glyphs, not prose, so they stay literal in the code around each `tr()`
 * call (the same shape `githubIssueExecuteResult` already takes) rather than
 * living inside a STRINGS entry.
 */

/** The STRINGS keys this module's helpers read (board web-msnsndki-dz3vn1).
 *  Named here, not imported from `@autopilot/tokens`, so the module stays
 *  import-free like every other spliced `web/` helper. */
export type PrReviewPanelKey =
  | 'prReviewMergeLabel'
  | 'prReviewRequestChangesLabel'
  | 'prReviewQueueForHumanLabel'
  | 'prReviewConfirmMessage'
  | 'prReviewConfirmUndoMerge'
  | 'prReviewExecuteTip'
  | 'prReviewExecuteTipUndoOther'
  | 'prReviewUnknownDecision'
  | 'prReviewStaleDecision'
  | 'prReviewExecuteFailedGeneric'
  | 'prReviewCommandFailedSuffix';

/** The bundle's `tr(key, subs)` (`web/features/locale.ts`), injected into
 *  each sentence-composing helper below — see the module note. */
export type PrReviewPanelTranslator = (
  key: PrReviewPanelKey,
  subs?: Readonly<Record<string, string | number>>,
) => string;

/** One open PR's KEEPER-relevant facts, the same shape `GET /api/pr-review`'s
 *  `plans[].pr` entry carries — see `flight/pr-review.ts`'s
 *  `PrReviewCandidate`. */
export interface PrReviewCandidateLike {
  readonly number: number;
  readonly title: string;
}

/** The decision `GET /api/pr-review`'s `plans[].decision` carries — see
 *  `flight/pr-review.ts`'s `PrReviewDecision`. */
export interface PrReviewDecisionLike {
  readonly decision: string;
  readonly reasoning: string;
}

/** Maps a KEEPER decision kind to its badge text. `merge`/`request-changes`/
 *  `queue-for-human` are the only values `flight/pr-review.ts`'s
 *  `planPrReview` emits; anything else (should never happen) echoes back
 *  verbatim rather than throwing, so an unrecognized future decision kind
 *  degrades to a plain label instead of breaking the panel. */
export function prReviewDecisionLabel(decision: string, tr: PrReviewPanelTranslator): string {
  if (decision === 'merge') return '✓ ' + tr('prReviewMergeLabel');
  if (decision === 'request-changes') return '✗ ' + tr('prReviewRequestChangesLabel');
  if (decision === 'queue-for-human') return '🟣 ' + tr('prReviewQueueForHumanLabel');
  return decision;
}

/** The KEEPER REVIEW EXECUTE button's `window.confirm()` message for one
 *  PR — states the decision in plain language before the operator triggers a
 *  real `gh` review/merge, same "state what happens before confirming" shape
 *  `releaseConfirmMessage` uses. A `merge` decision gets an extra
 *  "cannot be undone" clause; the other two decisions only post a
 *  comment/review, reversible on GitHub itself. */
export function prReviewConfirmMessage(
  pr: PrReviewCandidateLike,
  decision: PrReviewDecisionLike,
  tr: PrReviewPanelTranslator,
): string {
  const undoNote = decision.decision === 'merge' ? tr('prReviewConfirmUndoMerge') : '';
  return (
    tr('prReviewConfirmMessage', {
      number: pr.number,
      title: pr.title,
      decision: prReviewDecisionLabel(decision.decision, tr),
      reasoning: decision.reasoning,
    }) + undoNote
  );
}

/** One planned `gh` command's result, the same shape `POST
 *  /api/pr-review/execute`'s `results[]` entries carry — see
 *  `flight/pr-review.ts`'s `PrReviewCommandResult`. */
export interface PrReviewCommandResultLike {
  readonly command: { readonly details: string };
  readonly code: number;
}

/** The shape `prReviewExecuteResult` reads off `POST
 *  /api/pr-review/execute`'s JSON response — `error` covers the non-success
 *  shapes (404 PR no longer open, 429 rate limited, 400/415 bad request, 500)
 *  return instead. `staleDecision` + `decision` carry the stale-decision
 *  guard's refusal: the fresh re-derive disagreed with the kind the operator
 *  confirmed, so nothing was executed (see `flight/pr-review-execute.ts`). */
export interface PrReviewExecuteResponse {
  readonly results?: readonly PrReviewCommandResultLike[];
  readonly error?: string;
  readonly staleDecision?: boolean;
  readonly decision?: PrReviewDecisionLike;
}

/** The `.pr-review-result` element's class + message text for one `POST
 *  /api/pr-review/execute` response. */
export interface PrReviewExecuteResult {
  readonly className: string;
  readonly text: string;
}

/** Formats the KEEPER REVIEW EXECUTE result: on success, every planned `gh`
 *  command's own `details` joined in order (a merge decision's approve-then-
 *  merge pair reads as one sentence); the FIRST non-zero exit —
 *  `executePrReviewCommands` stops there — reports as the failure, the exact
 *  step that actually broke rather than a generic message. */
export function prReviewExecuteResult(
  data: PrReviewExecuteResponse | null | undefined,
  tr: PrReviewPanelTranslator,
): PrReviewExecuteResult {
  // The stale-decision guard's refusal reads first — it also returns an
  // empty results list, but "nothing ran because the PR changed" must never
  // render as a generic failure: naming the fresh verdict is what tells the
  // operator to re-review before applying again (the panel's own poll
  // refreshes the shown plan shortly).
  if (data && data.staleDecision) {
    const fresh = data.decision
      ? prReviewDecisionLabel(data.decision.decision, tr)
      : tr('prReviewUnknownDecision');
    return {
      className: 'pr-review-result pr-review-result-fail',
      text: '✗ ' + tr('prReviewStaleDecision', { fresh }),
    };
  }
  const results = data && data.results;
  if (!results || results.length === 0) {
    return {
      className: 'pr-review-result pr-review-result-fail',
      text: '✗ ' + ((data && data.error) || tr('prReviewExecuteFailedGeneric')),
    };
  }
  const failed = results.find((r) => r.code !== 0);
  if (failed) {
    return {
      className: 'pr-review-result pr-review-result-fail',
      text:
        '✗ ' + failed.command.details + tr('prReviewCommandFailedSuffix', { code: failed.code }),
    };
  }
  return {
    className: 'pr-review-result pr-review-result-ok',
    text: '✓ ' + results.map((r) => r.command.details).join('; ') + '.',
  };
}

/** The KEEPER PR review "Apply" button's `[data-tip]`/`aria-label` (app-wide
 *  interactivity audit v2, web-msm66jlc-gm4oom) — the button carried no
 *  explanation of what applying the KEEPER decision does before the
 *  operator's click triggered {@link prReviewConfirmMessage}'s confirm
 *  dialog, the same gap `releaseExecuteTip` closed for the RELEASE panel's
 *  EXECUTE button. Names the PR and decision so hover/focus previews match
 *  what the confirm dialog is about to say; a `merge` decision gets the same
 *  "cannot be undone" clause `prReviewConfirmMessage` uses. */
export function prReviewExecuteTip(
  pr: PrReviewCandidateLike,
  decision: PrReviewDecisionLike,
  tr: PrReviewPanelTranslator,
): string {
  const undoNote =
    decision.decision === 'merge'
      ? tr('prReviewConfirmUndoMerge')
      : tr('prReviewExecuteTipUndoOther');
  return (
    tr('prReviewExecuteTip', {
      number: pr.number,
      decision: prReviewDecisionLabel(decision.decision, tr),
    }) + undoNote
  );
}
