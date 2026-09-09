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
 * Preview-only: the mutating execute path is VERDICT slice (b), still
 * unwired, so this panel has no action button, same "read the findings,
 * nothing to click yet" stance `process-health.ts`'s stat tiles take.
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
export function mirrorPassDriftItems(
  drift: MirrorPassDriftLike | null,
): readonly MirrorPassItem[] {
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
