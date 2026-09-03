// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure logic shared by the server (`fly.ts`'s end-of-flight reconciliation
 * console line) and the hand-authored client bundle (`web/shell.ts`'s
 * DETECTED BACKLOG panel, no bundler, CSP `self`-only — epic 0002 "shell
 * decomposition"). Both sides used to hand-retype the same `matchedVia ===
 * 'path' ? ' [matched via changed files, not subject text]' : ''` suffix and
 * `≈ <sha> "<subject>"<via>` template independently. `web/shell.ts` embeds
 * this module's real compiled source into the generated `/app.js` text via
 * `.toString()` — see `fleetJs()` — instead of hand-retyping it, so the two
 * copies can no longer drift apart.
 */

/** The `findReconciliationCandidates` (`read/reconcile.ts`) fields {@link backlogMatchText} reads. */
export interface BacklogMatchInfo {
  readonly matchedVia: 'subject' | 'path';
  readonly commitSha: string;
  readonly commitSubject: string;
}

/**
 * The `≈ <sha> "<subject>"[ matched via changed files, not subject text]`
 * fragment both the flight console's reconciliation line and the DETECTED
 * BACKLOG panel render for one candidate — a `matchedVia: 'path'` candidate
 * gets the bracketed caveat since file overlap alone is the weaker signal.
 */
export function backlogMatchText(cand: BacklogMatchInfo): string {
  const via = cand.matchedVia === 'path' ? ' [matched via changed files, not subject text]' : '';
  return '≈ ' + cand.commitSha + ' "' + cand.commitSubject + '"' + via;
}
