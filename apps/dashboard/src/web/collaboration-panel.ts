// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure COLLABORATION panel formatting — client-only (mirrors
 * `contributor-issue-list-panel.ts`'s reasoning: `server/collaboration.ts`
 * returns raw roadmap/help-wanted entries, and turning an assignee list into
 * a claim-state line, or deciding whether the viewer holds a claim, is a
 * client presentation concern). BOARD web-mtpzqrxl-z7jgbu's UX expression —
 * `flight/collaboration.ts`'s doc comment flagged this panel as "a further
 * slice of the same board task"; this ships it.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/panels.js` text via `.toString()` — see `web/features/
 * collaboration.ts` — instead of hand-retyping it, so the two copies can no
 * longer drift apart. Each exported function stays self-contained (no shared
 * module-scope constants) since `.toString()` serializes only the function
 * body, never its surrounding closure.
 */

/** One collaboration-relevant issue's assignee list — the subset `GET
 *  /api/collaboration`'s `roadmap[]`/`helpWanted[]` entries carry that this
 *  module needs; see `flight/collaboration.ts`'s `CollaborationSnapshot`. */
export interface CollaborationEntryLike {
  readonly assignees: readonly string[];
}

/** The claim-state line under a collaboration item's title — unclaimed, or
 *  who (one or more) already holds it. Never empty: an unassigned issue
 *  reads "Unclaimed" rather than a blank line, the same "state what's true"
 *  stance `poolClaimLedgerText` takes for a held pool issue. */
export function collaborationClaimStateLabel(entry: CollaborationEntryLike): string {
  if (!entry.assignees || entry.assignees.length === 0) return 'Unclaimed';
  return 'Claimed by ' + entry.assignees.map((login) => '@' + login).join(', ');
}

/** True when `login` (the viewer's own GitHub login, from `GET
 *  /api/social-identity`) is one of `entry`'s assignees — the "my-claims"
 *  filter BOARD web-mtpzqrxl-z7jgbu names. A missing/unresolved `login`
 *  (identity not yet loaded, or the viewer isn't signed in) never matches —
 *  the same "no viewer, no claim" default `standingPanelOffer` uses for an
 *  unresolved role. */
export function isMyCollaborationClaim(
  entry: CollaborationEntryLike,
  login: string | null | undefined,
): boolean {
  if (!login) return false;
  return entry.assignees.includes(login);
}
