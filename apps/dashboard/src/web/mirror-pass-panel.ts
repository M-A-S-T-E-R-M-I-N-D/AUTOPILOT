// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure MIRROR PASS panel formatting — client-only, same reasoning
 * `issue-triage-panel.ts`/`landing-panel.ts` already use: the server's four
 * preview endpoints (`GET /api/mirror-pass`, `/mirror-pass/landing-note`,
 * `/mirror-pass/drift`, `/mirror-pass/stale-claims` — `flight/mirror-pass.ts`
 * + `flight/mirror-pass-execute.ts`) return raw plan/finding facts; turning
 * those into one human-readable line per finding is a client presentation
 * concern. Closes the UX-expression gap VERDICT `ap-mtsg3nc0-3` flagged as
 * slice (c) — four real read-only APIs existed with zero dashboard consumer.
 *
 * {@link mirrorPassCanExecute} and {@link mirrorPassExecuteResultMessage}
 * close a second UX-expression gap the same VERDICT's slice (b) left behind:
 * `POST /api/mirror-pass/execute` (derivation 1/4, reconcile) has been live
 * since commit `3d3a6aaf` with zero dashboard trigger — a real, working
 * "close the issue with the landing SHA" mutation an operator had no way to
 * fire short of `curl`. This gives the panel ONE execute button for that
 * derivation only; the other two wired execute paths (landing-note,
 * stale-claim) remain their own follow-up slices, same per-derivation split
 * already used throughout this epic.
 * Role-gated the same way `pr-review.ts`'s Apply button is (epic 0019 law 1
 * extended to the UI, board web-mtt3f7j6-3bj899): a confirmed non-maintainer
 * never sees it, an unresolved identity is not a known guest so it still
 * does.
 *
 * {@link mirrorPassCanExecuteDrift} and {@link mirrorPassDriftExecuteResultMessage}
 * close derivation 3/4's own UX-expression gap the same way: `POST
 * /api/mirror-pass/drift/execute` (`flight/mirror-pass-execute.ts`'s
 * `createMirrorPassDriftExecuteApi`) shipped with zero dashboard trigger.
 * Same role gate, but gated on at least one drift finding rather than a
 * reconcile one. Unlike the reconcile report this one can also report
 * `duplicates` — a near-identical issue already open, so nothing was filed
 * for that finding — {@link mirrorPassDriftExecuteResultMessage} surfaces
 * that count rather than folding it silently into "nothing to apply".
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart. Each
 * exported function stays self-contained (no shared module-scope constants)
 * since `.toString()` serializes only the function body, never its
 * surrounding closure.
 */

/** The reconcile/landing-note/stale-claim findings all narrow to this same
 *  "which issue, what to say about it" shape once a finding actually fires —
 *  duck-typed rather than importing `flight/mirror-pass.ts`'s real union so
 *  this panel carries no server-side type dependency, the same convention
 *  `issue-triage-panel.ts`'s `*Like` types already establish. */
export interface MirrorPassIssueFindingLike {
  readonly issueNumber: number;
  readonly comment: string;
}

/** One `GET /api/mirror-pass` (reconcile) or `/mirror-pass/stale-claims`
 *  entry — `finding` is `null` when that task/issue is already in sync. */
export interface MirrorPassFindingPlanLike {
  readonly finding: MirrorPassIssueFindingLike | null;
}

/** One `GET /api/mirror-pass/landing-note` entry — same shape, distinct
 *  export so a caller can pass either preview's array without a cast. */
export type MirrorPassLandingNotePlanLike = MirrorPassFindingPlanLike;

/** One `GET /api/mirror-pass/stale-claims` entry — same shape as {@link
 *  MirrorPassFindingPlanLike}. */
export type MirrorPassStaleClaimPlanLike = MirrorPassFindingPlanLike;

/** `GET /api/mirror-pass/drift`'s response — the three independent doc-vs-
 *  tree checks (version/counts/broken links), each `null` when that check
 *  found no drift. See `flight/mirror-pass-execute.ts`'s `MirrorPassDriftPlan`. */
export interface MirrorPassDriftLike {
  readonly versionDrift: {
    readonly source: string;
    readonly claimedVersion: string;
    readonly actualVersion: string;
  } | null;
  readonly countsDrift: {
    readonly source: string;
    readonly claimedCount: number;
    readonly actualCount: number;
  } | null;
  readonly linkDrift: {
    readonly source: string;
    readonly brokenLinks: readonly string[];
  } | null;
}

/** One rendered MIRROR PASS finding line, plain text — no markup, no i18n
 *  (every finding is built from live GitHub/tree facts, never static
 *  chrome, so it is never a translation target — same stance
 *  `issue-triage.ts`'s `plan.issue.title` render takes on dynamic text). */
export interface MirrorPassItem {
  readonly text: string;
}

/** Every actionable reconcile finding ("board says done, issue still open" /
 *  "board says not-done, issue already closed"), `#<n> — <comment>`. Plans
 *  with no finding (already in sync) are dropped. */
export function mirrorPassReconcileItems(
  plans: readonly MirrorPassFindingPlanLike[],
): readonly MirrorPassItem[] {
  return plans
    .filter((p): p is { finding: MirrorPassIssueFindingLike } => p.finding !== null)
    .map((p) => ({ text: `#${p.finding.issueNumber} — ${p.finding.comment}` }));
}

/** Every actionable landing-note finding (a landed, already-closed issue
 *  with no comment recording the SHA yet). Same rendering as {@link
 *  mirrorPassReconcileItems} — the finding's own `comment` is already the
 *  full sentence. */
export function mirrorPassLandingNoteItems(
  plans: readonly MirrorPassLandingNotePlanLike[],
): readonly MirrorPassItem[] {
  return mirrorPassReconcileItems(plans);
}

/** Every actionable stale-claim finding (an assignee quiet past the reap
 *  threshold). Same rendering as {@link mirrorPassReconcileItems}. */
export function mirrorPassStaleClaimItems(
  plans: readonly MirrorPassStaleClaimPlanLike[],
): readonly MirrorPassItem[] {
  return mirrorPassReconcileItems(plans);
}

/** The drift preview's up-to-three findings, each built into its own
 *  sentence since (unlike the other three previews) none of them carries a
 *  pre-written `comment` — `null` (drift-free, or the preview itself
 *  unavailable) yields no items. */
export function mirrorPassDriftItems(drift: MirrorPassDriftLike | null): readonly MirrorPassItem[] {
  if (!drift) return [];
  const items: MirrorPassItem[] = [];
  if (drift.versionDrift) {
    const d = drift.versionDrift;
    items.push({
      text: `${d.source} claims v${d.claimedVersion}, but the tree is actually at v${d.actualVersion}`,
    });
  }
  if (drift.countsDrift) {
    const d = drift.countsDrift;
    items.push({
      text: `${d.source} claims ${d.claimedCount} third-party packages, but the tree has ${d.actualCount}`,
    });
  }
  if (drift.linkDrift) {
    const d = drift.linkDrift;
    items.push({
      text: `${d.source} links to ${d.brokenLinks.length} path(s) that no longer resolve: ${d.brokenLinks.join(', ')}`,
    });
  }
  return items;
}

/** The whole panel's combined finding list — every derivation's items, in a
 *  fixed reconcile → landing-note → drift → stale-claim order, so the panel
 *  never needs to know about four separate lists. Any preview that failed
 *  to load (`null`) contributes nothing rather than throwing. */
export function mirrorPassItems(previews: {
  readonly reconcile: readonly MirrorPassFindingPlanLike[] | null;
  readonly landingNote: readonly MirrorPassLandingNotePlanLike[] | null;
  readonly drift: MirrorPassDriftLike | null;
  readonly staleClaims: readonly MirrorPassStaleClaimPlanLike[] | null;
}): readonly MirrorPassItem[] {
  return [
    ...mirrorPassReconcileItems(previews.reconcile ?? []),
    ...mirrorPassLandingNoteItems(previews.landingNote ?? []),
    ...mirrorPassDriftItems(previews.drift),
    ...mirrorPassStaleClaimItems(previews.staleClaims ?? []),
  ];
}

/** Duck-typed subset of `flight/social-pass.ts`'s `SocialIdentity` this
 *  panel's role gate needs — no server-side type import, same stance the
 *  rest of this file already takes. */
export interface MirrorPassIdentityLike {
  readonly role: string;
}

/** Whether the panel may show its "Run mirror pass" execute button — a
 *  confirmed non-maintainer never gets it (epic 0019 law 1 extended to the
 *  UI, board web-mtt3f7j6-3bj899), an unresolved identity is not a known
 *  guest so it still does, same convention `pr-review.ts`'s Apply button
 *  already follows. Also requires at least one actionable reconcile
 *  finding — an execute button with nothing to execute is a dead control. */
export function mirrorPassCanExecute(
  identity: MirrorPassIdentityLike | null | undefined,
  reconcile: readonly MirrorPassFindingPlanLike[] | null,
): boolean {
  if (identity && identity.role !== 'maintainer') return false;
  return mirrorPassReconcileItems(reconcile ?? []).length > 0;
}

/** Whether the panel may show its drift-fix EXECUTE button — same role gate
 *  as {@link mirrorPassCanExecute} (a confirmed non-maintainer never gets
 *  it, an unresolved identity is not a known guest so it still does), gated
 *  on at least one drift finding rather than a reconcile one. */
export function mirrorPassCanExecuteDrift(
  identity: MirrorPassIdentityLike | null | undefined,
  drift: MirrorPassDriftLike | null,
): boolean {
  if (identity && identity.role !== 'maintainer') return false;
  return mirrorPassDriftItems(drift).length > 0;
}

/** One reconciled task's real outcome, as {@link createMirrorPassExecuteApi}
 *  (`flight/mirror-pass-execute.ts`) reports it over HTTP — duck-typed, same
 *  "no server-side type import" stance as the rest of this file. */
export interface MirrorPassExecuteReportLike {
  readonly outcomes?: readonly unknown[];
  readonly skippedReason?: string;
}

/** Formats `POST /api/mirror-pass/execute`'s response into the panel's
 *  result line — same shape as `pr-review-panel.ts`'s
 *  `prReviewExecuteResult`: an "ok" and a "fail" variant are both always
 *  produced (fully specified, unit-testable), even though the caller only
 *  ever renders the "fail" one — a clean run instead reloads the panel so
 *  the applied finding(s) simply vanish from the refreshed list, the same
 *  "success re-fetches, no separate message" convention `pr-review.ts`'s
 *  Apply button uses. A non-200 response or a role-gate skip are the only
 *  outcomes the panel actually shows. */
export function mirrorPassExecuteResultMessage(
  status: number,
  data: MirrorPassExecuteReportLike | null,
): { readonly className: string; readonly text: string } {
  if (status !== 200 || !data) {
    return {
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: 'Mirror pass failed to run.',
    };
  }
  if (data.skippedReason === 'guest') {
    return {
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: "Not run — you are not this repo's maintainer.",
    };
  }
  if (data.skippedReason === 'identity-unresolved') {
    return {
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: 'Not run — could not resolve your GitHub identity.',
    };
  }
  const applied = data.outcomes?.length ?? 0;
  return {
    className: 'mirror-pass-result mirror-pass-result-ok',
    text: applied === 0 ? 'Nothing to apply — already in sync.' : `Applied ${applied} finding(s).`,
  };
}

/** One drift EXECUTE run's real outcome, as {@link createMirrorPassDriftExecuteApi}
 *  (`flight/mirror-pass-execute.ts`) reports it over HTTP — duck-typed, same
 *  "no server-side type import" stance as the rest of this file. Unlike
 *  {@link MirrorPassExecuteReportLike} this also carries `duplicates`: a
 *  finding whose issue already exists gets reported, not silently dropped. */
export interface MirrorPassDriftExecuteReportLike {
  readonly outcomes?: readonly unknown[];
  readonly duplicates?: readonly string[];
  readonly skippedReason?: string;
}

/** Formats `POST /api/mirror-pass/drift/execute`'s response into the panel's
 *  result line — same shape as {@link mirrorPassExecuteResultMessage}, plus a
 *  third case: real drift found but every candidate title already matched an
 *  open issue, so nothing new was filed. */
export function mirrorPassDriftExecuteResultMessage(
  status: number,
  data: MirrorPassDriftExecuteReportLike | null,
): { readonly className: string; readonly text: string } {
  if (status !== 200 || !data) {
    return {
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: 'Mirror pass drift fix failed to run.',
    };
  }
  if (data.skippedReason === 'guest') {
    return {
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: "Not run — you are not this repo's maintainer.",
    };
  }
  if (data.skippedReason === 'identity-unresolved') {
    return {
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: 'Not run — could not resolve your GitHub identity.',
    };
  }
  const filed = data.outcomes?.length ?? 0;
  const duplicates = data.duplicates?.length ?? 0;
  if (filed === 0 && duplicates === 0) {
    return {
      className: 'mirror-pass-result mirror-pass-result-ok',
      text: 'Nothing to file — already in sync.',
    };
  }
  if (filed === 0) {
    return {
      className: 'mirror-pass-result mirror-pass-result-ok',
      text: `Nothing new to file — ${duplicates} already tracked as duplicate(s).`,
    };
  }
  const duplicateSuffix = duplicates > 0 ? ` (${duplicates} duplicate(s) skipped)` : '';
  return {
    className: 'mirror-pass-result mirror-pass-result-ok',
    text: `Filed ${filed} issue(s).${duplicateSuffix}`,
  };
}
