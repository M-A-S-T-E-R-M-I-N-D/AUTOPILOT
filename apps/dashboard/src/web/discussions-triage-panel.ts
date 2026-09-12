// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure KEEPER DISCUSSIONS panel formatting — client-only, same reasoning
 * `issue-triage-panel.ts`/`mirror-pass-panel.ts` already use: `server.ts`'s
 * `GET /api/discussions-triage` and `POST /api/discussions-triage/execute`
 * (`flight/discussions-triage.ts` + `flight/discussions-triage-execute.ts`)
 * return raw decision/outcome facts, and turning those into human-readable
 * lines is a client presentation concern. Closes the UX-expression gap epic
 * 0007 S8 (board web-mtlsiac0-v8rksh) left open after the decision core, the
 * GraphQL read/write wiring, and the identity-gated preview/execute API pair
 * all shipped with zero dashboard consumer.
 *
 * Identity-gated like `mirror-pass-panel.ts`: {@link discussionsTriageCanExecute}
 * hides the execute button for a confirmed non-maintainer (epic 0019 law 1
 * extended to the UI) but shows it for an unresolved identity (not a known
 * guest) — same convention `pr-review.ts`'s Apply button and
 * `mirrorPassCanExecute` already follow. Unlike `issue-triage-panel.ts`'s
 * disabled-with-reason button, an execute with nothing to do is simply
 * omitted (`mirrorPassCanExecute`'s own shape) rather than shown disabled —
 * discussions triage decides only `'accept'`/`'skip'`, so "nothing to
 * accept" is exactly mirror pass's own "nothing to reconcile" case.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart. Each
 * exported function stays self-contained (no shared module-scope constants)
 * since `.toString()` serializes only the function body, never its
 * surrounding closure.
 */

/** The subset of `GET /api/discussions-triage`'s `triage.plans[].discussion`
 *  this panel needs — see `flight/discussions-triage.ts`'s
 *  `IncomingDiscussion`. No `url` field: the read-only `OPEN_DISCUSSIONS_QUERY`
 *  never fetches one, so a discussion number here stays plain text rather
 *  than a synthesized link (epic 0020's "every GitHub noun is a link"
 *  principle forbids fabricating a URL the API never reported). */
export interface DiscussionsTriageDiscussionLike {
  readonly number: number;
  readonly title: string;
}

/** The decision `GET /api/discussions-triage`'s `triage.plans[].decision`
 *  carries — see `flight/discussions-triage.ts`'s `DiscussionTriageDecision`. */
export interface DiscussionsTriageDecisionLike {
  readonly decision: string;
  readonly reasoning: string;
}

/** One discussion's full triage plan — see `flight/discussions-triage.ts`'s
 *  `DiscussionTriagePlan`. */
export interface DiscussionsTriagePlanLike {
  readonly discussion: DiscussionsTriageDiscussionLike;
  readonly decision: DiscussionsTriageDecisionLike;
}

/** Maps a KEEPER Discussions decision kind to its badge text. `'accept'`/
 *  `'skip'` are the only values `flight/discussions-triage.ts`'s
 *  `planDiscussionTriage` emits — narrower than `issue-triage-panel.ts`'s
 *  four-way `issueTriageDecisionLabel` since Discussions has no
 *  duplicate/dossier concept yet. Anything else (should never happen) echoes
 *  back verbatim rather than throwing, the same defensive stance
 *  `issueTriageDecisionLabel` takes. */
export function discussionsTriageDecisionLabel(decision: string): string {
  if (decision === 'accept') return '✓ accept — reply + label';
  if (decision === 'skip') return '⏭ skip';
  return decision;
}

/** One rendered KEEPER DISCUSSIONS preview line — the decision's own
 *  `reasoning` already reads as a full sentence naming the discussion
 *  (`#<n> "<title>" ...`, `flight/discussions-triage.ts`'s convention), so
 *  this just prefixes it with the decision badge rather than re-deriving the
 *  discussion's number/title separately — the same
 *  decision-doubles-as-message reuse `mirror-pass-panel.ts`'s finding
 *  `comment` already relies on. */
export interface DiscussionsTriageItem {
  readonly text: string;
}

/** Every open discussion's plan as one preview line, `accept` and `skip`
 *  both included (unlike `mirror-pass-panel.ts`'s finding-only filtering) —
 *  an operator reviewing a triage preview needs to see what will be SKIPPED
 *  too (already answered, locked, already labeled), the same full-list shape
 *  `issue-triage.ts`'s own per-item panel renders. */
export function discussionsTriageItems(
  plans: readonly DiscussionsTriagePlanLike[],
): readonly DiscussionsTriageItem[] {
  return plans.map((p) => ({
    text: `${discussionsTriageDecisionLabel(p.decision.decision)} — ${p.decision.reasoning}`,
  }));
}

/** Duck-typed subset of `flight/social-pass.ts`'s `SocialIdentity` this
 *  panel's role gate needs — no server-side type import, same stance
 *  `mirror-pass-panel.ts`'s `MirrorPassIdentityLike` already takes. */
export interface DiscussionsTriageIdentityLike {
  readonly role: string;
}

/** Whether the panel may show its "Run KEEPER Discussions triage" execute
 *  button — a confirmed non-maintainer never gets it (epic 0019 law 1
 *  extended to the UI), an unresolved identity is not a known guest so it
 *  still does, same convention {@link mirrorPassCanExecute} in
 *  `mirror-pass-panel.ts` already follows. Also requires at least one
 *  `'accept'`ed plan — an execute button with nothing to post is a dead
 *  control. */
export function discussionsTriageCanExecute(
  identity: DiscussionsTriageIdentityLike | null | undefined,
  plans: readonly DiscussionsTriagePlanLike[] | null,
): boolean {
  if (identity && identity.role !== 'maintainer') return false;
  return (plans ?? []).some((p) => p.decision.decision === 'accept');
}

/** The KEEPER DISCUSSIONS EXECUTE button's `window.confirm()` message —
 *  covers the whole batch (execute has no single-discussion target), same
 *  "state what happens before confirming" shape `issueTriageConfirmMessage`
 *  uses. */
export function discussionsTriageConfirmMessage(
  plans: readonly DiscussionsTriagePlanLike[],
): string {
  const acceptCount = plans.filter((p) => p.decision.decision === 'accept').length;
  const skipCount = plans.length - acceptCount;
  return (
    'Run KEEPER Discussions triage on ' +
    plans.length +
    (plans.length === 1 ? ' open discussion' : ' open discussions') +
    '?\n\n' +
    acceptCount +
    (acceptCount === 1 ? ' discussion' : ' discussions') +
    ' will get a signed reply posted and a pool label applied; ' +
    skipCount +
    (skipCount === 1 ? ' discussion' : ' discussions') +
    ' (already answered, locked, or already labeled) will be skipped.\n\n' +
    'Discussions are re-fetched fresh from gh at execute time — this will not blindly ' +
    'trust the preview shown here if discussions changed.'
  );
}

/** One {@link discussionsTriageCanExecute}`-gated {@link
 *  discussionsTriageConfirmMessage} report — `POST
 *  /api/discussions-triage/execute`'s outcome shape, see
 *  `flight/discussions-triage-execute.ts`'s `DiscussionsTriageExecuteReport`.
 *  `replyResult`/`labelResult` carry only the `code` field this panel reads —
 *  duck-typed, same "no server-side type import" stance the rest of this
 *  file takes. */
export interface DiscussionsTriageOutcomeLike {
  readonly replyResult: { readonly code: number };
  readonly labelResult: { readonly code: number } | null;
}

/** `POST /api/discussions-triage/execute`'s JSON response, as this panel
 *  reads it — `skippedReason` covers the two role-honesty refusals (epic
 *  0019 law 1), never a 403. */
export interface DiscussionsTriageExecuteReportLike {
  readonly outcomes?: readonly DiscussionsTriageOutcomeLike[];
  readonly skippedReason?: string;
}

/** The `.discussions-triage-result` element's class + message text for one
 *  `POST /api/discussions-triage/execute` response — same shape
 *  `mirrorPassExecuteResultMessage` gives its own result line. A reply that
 *  fails to post is reported by count (mirroring
 *  `issueTriageExecuteResult`'s "N of M gh command(s) failed" shape) since
 *  `runDiscussionTriageRitual` never stops the batch at the first failure. */
export function discussionsTriageExecuteResultMessage(
  status: number,
  data: DiscussionsTriageExecuteReportLike | null,
): { readonly className: string; readonly text: string } {
  if (status !== 200 || !data) {
    return {
      className: 'discussions-triage-result discussions-triage-result-fail',
      text: 'Discussions triage failed to run.',
    };
  }
  if (data.skippedReason === 'guest') {
    return {
      className: 'discussions-triage-result discussions-triage-result-fail',
      text: "Not run — you are not this repo's maintainer.",
    };
  }
  if (data.skippedReason === 'identity-unresolved') {
    return {
      className: 'discussions-triage-result discussions-triage-result-fail',
      text: 'Not run — could not resolve your GitHub identity.',
    };
  }
  const outcomes = data.outcomes ?? [];
  const failedReplies = outcomes.filter((o) => o.replyResult.code !== 0).length;
  if (failedReplies > 0) {
    return {
      className: 'discussions-triage-result discussions-triage-result-fail',
      text:
        '✗ ' +
        failedReplies +
        ' of ' +
        outcomes.length +
        ' repl' +
        (outcomes.length === 1 ? 'y' : 'ies') +
        ' failed to post.',
    };
  }
  return {
    className: 'discussions-triage-result discussions-triage-result-ok',
    text:
      outcomes.length === 0
        ? 'Nothing to run — every open discussion is already triaged.'
        : '✓ Replied to ' +
          outcomes.length +
          (outcomes.length === 1 ? ' discussion.' : ' discussions.'),
  };
}
