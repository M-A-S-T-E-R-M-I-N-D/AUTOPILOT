// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure per-candidate copy for the DETECTED BACKLOG panel — client-only (no
 * server counterpart reads the tooltip sentences; `shared/backlog-match.ts`'s
 * `backlogMatchText` already covers the `≈ <sha> "<subject>"` fragment both
 * `fly.ts`'s console line and this panel render, injected here rather than
 * imported — the same `heatmapDays(..., verdictOf)` pattern used elsewhere in
 * this epic, since a real cross-module import breaks once Vitest's SSR
 * transform rewrites it and the function is lifted out via `.toString()`).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The `findReconciliationCandidates` (`read/reconcile.ts`) fields {@link backlogCandidateMeta} reads. */
export interface BacklogCandidate {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly commitSha: string;
  readonly commitSubject: string;
  readonly matchedVia: 'subject' | 'path';
}

/** The DETECTED BACKLOG panel's per-candidate rendered copy. */
export interface BacklogCandidateMeta {
  /** The chip's visible text — `backlogMatchText(cand)`. */
  readonly matchText: string;
  /** The chip's `data-tip` sentence — differs by how weak the match signal is. */
  readonly tip: string;
  /** The chip's concise `aria-label` — just the essential fact (match + sha,
   *  with the weak-signal caveat for a path match), never the tip's full
   *  guidance sentence duplicated verbatim (D1 ATTRIBUTE PAYLOAD, epic 0015,
   *  web-mtd1wmqc-v7h6cq — same split 189137e0 gave the task-row chips). */
  readonly ariaLabel: string;
  /** The confirm button's `data-tip`/`aria-label` sentence, or `null` when `matchedVia === 'path'` — file overlap alone is too weak a signal to drive a one-click action, so a path match is annotation-only (web-mssrob7o-yhkgbt). */
  readonly confirmTip: string | null;
  /** The row's task-title span's own `data-tip` sentence (app-wide interactivity audit v2, web-msm66jlc-gm4oom) — surfaces the board task id, the one piece of identifying info nothing else on the row shows. */
  readonly titleTip: string;
}

export function backlogCandidateMeta(
  cand: BacklogCandidate,
  matchTextOf: (c: BacklogCandidate) => string,
): BacklogCandidateMeta {
  const isPathMatch = cand.matchedVia === 'path';
  const via = isPathMatch ? ' [matched via changed files, not subject text]' : '';
  const matchText = matchTextOf(cand);
  const titleTip = 'Board task ' + cand.taskId;
  if (isPathMatch) {
    return {
      matchText,
      tip:
        'Possible match: commit ' +
        cand.commitSha +
        ' "' +
        cand.commitSubject +
        '"' +
        via +
        ' — file overlap alone is too weak a signal to confirm from here; check the commit before marking this done on the task board.',
      ariaLabel: 'Possible match (files only): commit ' + cand.commitSha,
      confirmTip: null,
      titleTip,
    };
  }
  return {
    matchText,
    tip:
      'Possible match: commit ' +
      cand.commitSha +
      ' "' +
      cand.commitSubject +
      '"' +
      via +
      ' — never applied automatically, confirm below to mark the task done.',
    ariaLabel: 'Possible match: commit ' + cand.commitSha,
    confirmTip: 'Mark "' + cand.taskTitle + '" done — this commit appears to have shipped it',
    titleTip,
  };
}
