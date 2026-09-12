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
 * formatter: only its own scope survives the splice. The ✓/✗/🟣/🔒 marks are
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
  | 'prReviewAwaitingApprovalLabel'
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
  readonly url?: string;
  readonly checkRuns?: readonly PrCheckRunLike[];
  readonly mergeable?: boolean;
  readonly behindBase?: boolean;
  readonly mergeStateUnknown?: boolean;
}

/** One check run as the panel shows it — `flight/pr-review.ts`'s
 *  `PrCheckRun`, client-side. */
export interface PrCheckRunLike {
  readonly name: string;
  readonly state: string;
  readonly url?: string;
  readonly elapsedMs?: number;
  readonly workflow?: string;
  readonly optional?: boolean;
}

/** The glyph one check's state renders as. A dedicated symbol per state
 *  (not a color alone) is what keeps the strip readable for a colorblind
 *  reader and in a screenshot — the same reasoning the decision badges
 *  already carry glyphs. */
export function prCheckStateGlyph(state: string): string {
  if (state === 'pass') return '✓';
  if (state === 'fail') return '✗';
  if (state === 'running') return '◐';
  if (state === 'queued') return '◌';
  if (state === 'skipped') return '⊘';
  return '?';
}

/** Human-sized duration for a check's elapsed time: `14s`, `4m44s`,
 *  `17m31s` — the form GitHub's own checks list uses, because a reader
 *  comparing our strip to that page should not have to translate. */
export function formatCheckDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m${seconds}s`;
}

/** One check chip's hover/focus text: what it is, where it stands, how
 *  long it took, and whether it gates the merge at all. */
export function prCheckRunTip(check: PrCheckRunLike): string {
  const words: Record<string, string> = {
    pass: 'passed',
    fail: 'FAILED',
    running: 'still running',
    queued: 'queued, not started',
    skipped: 'skipped',
  };
  const parts = [check.name + ' — ' + (words[check.state] || 'no readable state')];
  if (check.elapsedMs !== undefined) parts.push(formatCheckDuration(check.elapsedMs) + ' elapsed');
  if (check.workflow) parts.push('workflow: ' + check.workflow);
  if (check.optional) parts.push('optional — does not gate the merge');
  // No "opens its log" clause: a linked chip is an <a> with its own hover
  // and focus treatment, so saying so in the tip was words the styling
  // already spends — and words are bundle bytes on a budgeted chunk.
  return parts.join(' · ') + '.';
}

/** The one-line summary above the strip: how many checks passed out of how
 *  many gating ones, and what is still moving. Answers "where is this PR"
 *  without counting chips. */
export function prCheckSummary(checks: readonly PrCheckRunLike[]): string {
  const gating = checks.filter((c) => !c.optional);
  if (gating.length === 0) return 'No gating checks reported on this head yet.';
  const passed = gating.filter((c) => c.state === 'pass').length;
  const failed = gating.filter((c) => c.state === 'fail').length;
  const running = gating.filter((c) => c.state === 'running').length;
  const queued = gating.filter((c) => c.state === 'queued').length;
  const head = passed + '/' + gating.length + ' checks passed';
  if (failed > 0) return head + ' · ' + failed + ' failed';
  // Running and queued are counted apart: "2 still running" when one has
  // not started is the kind of small lie that makes a reader stop trusting
  // the panel and go read GitHub instead.
  const moving: string[] = [];
  if (running > 0) moving.push(running + ' running');
  if (queued > 0) moving.push(queued + ' queued');
  // Concatenation, not a template literal, on purpose: a top-level
  // template-literal return is the shape `discoverFeatureModules` treats as
  // a bundle-composing assembler, and this display helper is not one — it
  // would land in the splice manifest as a phantom module.
  return moving.length > 0 ? head + ' · ' + moving.join(', ') : head;
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
 *  degrades to a plain label instead of breaking the panel. A
 *  `queue-for-human` PR whose head is stuck in GitHub's `action_required`
 *  status (`awaitingApprovalRunIds` on the candidate, board
 *  web-mto1tya3-57v8ig) gets its own distinct badge — "needs eyes" and
 *  "needs your approval to even run CI" read the same otherwise, and a
 *  maintainer scanning the panel can't tell them apart without opening each
 *  tooltip. Deliberately display-only: the human still runs the `gh api
 *  .../approve` command by hand (named in the reasoning text), or clicks
 *  {@link awaitingApprovalChecksUrl}'s link to GitHub's own "Approve and
 *  run" button — wiring this to an auto-execute button would defeat the
 *  point of gating an untrusted fork's CI run behind manual approval. */
export function prReviewDecisionLabel(
  decision: string,
  tr: PrReviewPanelTranslator,
  awaitingApproval?: boolean,
): string {
  if (decision === 'merge') return '✓ ' + tr('prReviewMergeLabel');
  if (decision === 'request-changes') return '✗ ' + tr('prReviewRequestChangesLabel');
  if (decision === 'queue-for-human') {
    return awaitingApproval
      ? '🔒 ' + tr('prReviewAwaitingApprovalLabel')
      : '🟣 ' + tr('prReviewQueueForHumanLabel');
  }
  return decision;
}

/** The GitHub "Checks" tab URL for a PR whose head is awaiting an
 *  `action_required` approval (board web-mto1tya3-57v8ig) — the native page
 *  where GitHub's own "Approve and run" button lives, no `gh` CLI needed.
 *  Derived from the PR's own `url` (`.../pull/{number}`) rather than a
 *  fresh API field: GitHub's PR page and its Checks tab share the same base
 *  path, so `{prUrl}/checks` is exact — one fewer round trip than resolving
 *  each blocked run's own `html_url`. A link, not an auto-execute button:
 *  the maintainer still clicks GitHub's own approve control, same stance as
 *  the reasoning text's `gh api .../approve` command. Absent when the
 *  candidate carries no `url` at all (a malformed `gh pr list` row) — no
 *  link is safer than a guessed one. */
export function awaitingApprovalChecksUrl(prUrl: string | undefined): string | undefined {
  return prUrl ? prUrl + '/checks' : undefined;
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

/** Whether the human-merge button can act on this card, and the reason
 *  either way — the disabled-with-reason law applied to the one verb the
 *  ritual deliberately refuses to perform itself. Mirrors
 *  `flight/human-merge.ts`'s `judgeHumanMerge` so the button never invites
 *  a click the server will refuse, but the SERVER's copy is the one that
 *  decides: this is a courtesy, not a gate. */
export function humanMergeReadiness(pr: PrReviewCandidateLike): {
  ready: boolean;
  reason: string;
  /** Set when a gating check is RED — the panel offers the re-run beside
   *  the disabled merge button, because a red check with no way to act on
   *  it was the last dead end the panel had. */
  hasFailedChecks?: boolean;
  /** Set when the ONLY thing standing between this PR and a merge is a
   *  stale branch — the panel offers the update as its own button rather
   *  than leaving the operator with an instruction and no way to follow
   *  it (operator, 2026-09-09: the refusal read "update the branch first"
   *  and there was nothing in the app that could). */
  behindBase?: boolean;
} {
  const checks = (pr.checkRuns ?? []).filter((c) => !c.optional);
  if (checks.length === 0) {
    return { ready: false, reason: 'No gating check has reported on this head yet.' };
  }
  const notPassed = checks.filter((c) => c.state !== 'pass');
  if (notPassed.length > 0) {
    const running = notPassed.filter((c) => c.state === 'running' || c.state === 'queued').length;
    const failed = notPassed.filter((c) => c.state === 'fail').length;
    if (failed > 0) {
      return {
        ready: false,
        hasFailedChecks: true,
        reason:
          failed +
          (failed === 1 ? ' check failed' : ' checks failed') +
          ' — fix it, or re-run the failed jobs with the button beside this.',
      };
    }
    return { ready: false, reason: 'Not mergeable yet — ' + running + ' still running.' };
  }
  // Checked BEFORE mergeable: a behind-base branch is the one blocked
  // state with a one-click way out, and saying "conflicting" about it
  // would send the operator looking for a conflict that isn't there.
  if (pr.behindBase) {
    return {
      ready: false,
      behindBase: true,
      reason: 'All green, but the branch is behind base — update it first (button beside this).',
    };
  }
  if (pr.mergeable === false) {
    return {
      ready: false,
      reason: pr.mergeStateUnknown
        ? 'GitHub has not computed mergeability yet — try again shortly.'
        : 'GitHub reports this PR as conflicting — it cannot merge as-is.',
    };
  }
  return {
    ready: true,
    reason: 'Squash-merge #' + pr.number + ' and delete its branch. Re-verified against gh first.',
  };
}

/** The re-run button's confirm — says what it will and will not spend:
 *  only the failed jobs restart, so a 17-minute Windows job is not
 *  re-spent to retry a macOS flake. */
export function rerunChecksConfirmMessage(pr: PrReviewCandidateLike): string {
  return (
    'Re-run the failed jobs on #' +
    pr.number +
    '?\n\nRestarts only the jobs that failed, not the whole matrix. Use this when the red ' +
    'is a flake; a real failure will just fail again.'
  );
}

/** The `.pr-review-result` line for one re-run response. */
export function rerunChecksResult(data: { rerun?: boolean; reason?: string } | null | undefined): {
  className: string;
  text: string;
} {
  const ok = !!(data && data.rerun);
  return {
    className: 'pr-review-result pr-review-result-' + (ok ? 'ok' : 'fail'),
    text: (ok ? '✓ ' : '✗ ') + ((data && data.reason) || 'The re-run did not start.'),
  };
}

/** The update-branch button's confirm — names both things a maintainer
 *  should mean to do: a real commit on someone else's branch, and a
 *  restart of their whole check run. */
export function updateBranchConfirmMessage(pr: PrReviewCandidateLike): string {
  return (
    'Update #' +
    pr.number +
    "'s branch from base?\n\n" +
    'Merges base into the contributor’s branch (a real commit on it) and restarts every ' +
    'check. The green you see now is replaced by a fresh run.'
  );
}

/** The `.pr-review-result` line for one update-branch response. */
export function updateBranchResult(
  data: { updated?: boolean; reason?: string } | null | undefined,
): { className: string; text: string } {
  const ok = !!(data && data.updated);
  return {
    className: 'pr-review-result pr-review-result-' + (ok ? 'ok' : 'fail'),
    text: (ok ? '✓ ' : '✗ ') + ((data && data.reason) || 'The branch update did not run.'),
  };
}

/** The human-merge confirm dialog. Names the PR, the method, and that it
 *  is irreversible — the same state-what-happens shape every other
 *  confirm here uses. */
export function humanMergeConfirmMessage(pr: PrReviewCandidateLike): string {
  return (
    'Merge #' +
    pr.number +
    ' — "' +
    pr.title +
    '"?\n\nSquash-merges into the default branch and deletes the source branch. Cannot be ' +
    'undone from here.\n\nEvery check is re-read from gh first — if anything went red or the ' +
    'head moved since this card was drawn, nothing merges.'
  );
}

/** The `.pr-review-result` line for one human-merge response. */
export function humanMergeResult(data: { merged?: boolean; reason?: string } | null | undefined): {
  className: string;
  text: string;
} {
  const ok = !!(data && data.merged);
  return {
    className: 'pr-review-result pr-review-result-' + (ok ? 'ok' : 'fail'),
    text: (ok ? '✓ ' : '✗ ') + ((data && data.reason) || 'The merge did not run.'),
  };
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

/** The shape `GET /api/pr-review/diagnose?number=` returns — see
 *  `flight/check-diagnosis.ts`'s `CheckDiagnosisApiOutcome`. Only `verdict`
 *  and `reasoning` reach the panel; the classifier's other evidence fields
 *  (`failingTestPaths`/`touchedFailingPaths`/`matchedQuarantineEntries`) are
 *  already folded into `reasoning`'s own sentences. */
export interface CheckDiagnosisResponse {
  readonly diagnosis?: {
    readonly verdict: string;
    readonly reasoning: readonly string[];
  };
  readonly reason?: string;
}

/** The `.pr-review-result` line for one `🔧 Diagnose` response (epic 0020
 *  slice 8, board web-mtvpuoj4-tv1z09) — "the reasoning is the product; the
 *  button is just where it lives," so this always renders the classifier's
 *  own sentences, never a bare verdict word. `defect` reads as a failure (a
 *  real problem the PR itself may need to fix) and `flake` as ok (safe to
 *  re-run); `unknown` and a bare refusal (`reason` with no `diagnosis` at
 *  all — nothing was failing, or gh could not produce a log) share a third,
 *  neutral styling — an honest "not enough evidence" is not the same as a
 *  failure. Read-only: this call never mutates anything, so there is no
 *  confirm dialog and no `expectedHeadRefOid` pin to carry. */
export function checkDiagnosisResult(data: CheckDiagnosisResponse | null | undefined): {
  className: string;
  text: string;
} {
  const diagnosis = data && data.diagnosis;
  if (!diagnosis) {
    return {
      className: 'pr-review-result pr-review-result-warn',
      text: '? ' + ((data && data.reason) || 'Nothing to diagnose.'),
    };
  }
  const evidence = diagnosis.reasoning.join(' ');
  if (diagnosis.verdict === 'defect') {
    return { className: 'pr-review-result pr-review-result-fail', text: '✗ Defect — ' + evidence };
  }
  if (diagnosis.verdict === 'flake') {
    return { className: 'pr-review-result pr-review-result-ok', text: '✓ Flake — ' + evidence };
  }
  return { className: 'pr-review-result pr-review-result-warn', text: '? Unknown — ' + evidence };
}

/** Structural subset of `flight/social-pass.ts`'s `SocialIdentity` this
 *  panel needs — kept local rather than imported, same "no cross-module
 *  reference in a `.toString()` splice" reasoning `release-panel.ts`'s
 *  `ReleaseViewerIdentity` already follows. */
export interface PrReviewViewerIdentity {
  readonly login: string;
  readonly nameWithOwner: string;
  readonly role: 'maintainer' | 'user';
}

/** The KEEPER PR review panel's guest note (epic 0019 law 1 extended to the
 *  UI, board web-mtt3f7j6-3bj899): replaces every maintainer-write button on
 *  a card — Apply, merge-as-maintainer, re-run, update-branch — when the
 *  resolved identity is a confirmed non-owner of this repo, the same
 *  "steward is a guest and proposes instead of writes" rule
 *  `release-panel.ts`'s `releaseGuestNote` already applies to the RELEASE
 *  panel. Never called for an unresolved identity (no `gh`, no GitHub
 *  remote at all — the common fully-local project): only a
 *  positively-resolved `'user'` role counts as a known guest, so every
 *  button stays visible whenever ownership cannot be determined. Plain
 *  English rather than `tr()`-routed, the same gap `releaseGuestNote` has
 *  against this module's own i18n law (board web-msnsndki-dz3vn1) — a
 *  follow-up slice, not this one. */
export function prReviewGuestNote(identity: PrReviewViewerIdentity): string {
  const owner = identity.nameWithOwner.split('/')[0];
  return (
    'PR review actions on this repo are taken by its maintainer (' +
    owner +
    ') — you are signed in as ' +
    identity.login +
    '.'
  );
}
