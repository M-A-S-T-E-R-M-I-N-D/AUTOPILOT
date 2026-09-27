// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Versions panel's rows (board ap-mui2h3s1-1, slice 4): the timeline that
 * `GET /api/versions` serves (`read/versions.ts`), flattened newest first —
 * the flight log, then LEGACY, then MYTH — with the older version each row is
 * compared against when the operator asks what it changed.
 *
 * `web/features/versions.ts` embeds this function's compiled source into
 * `/project.js` via `.toString()`, so it stays self-contained: no module-scope
 * helpers, and the timeline's shape is restated here rather than imported
 * from the server's read layer.
 */

export type VersionRowKind = 'myth' | 'legacy' | 'flight';

export interface VersionRowSource {
  readonly kind: VersionRowKind;
  readonly sha: string;
  readonly committedAt: string;
  readonly subject: string;
}

export interface VersionRowTimeline {
  readonly myth: VersionRowSource | null;
  readonly legacy: VersionRowSource | null;
  readonly flight: readonly VersionRowSource[];
  readonly truncated: boolean;
}

export interface VersionRow extends VersionRowSource {
  /** The version this one is compared against, or null when there is none. */
  readonly diffFrom: string | null;
}

/**
 * Each row's `diffFrom` is the next older row. The flight log follows first
 * parents, so that pair is exactly what the version changed. Three cases get
 * no comparison: the oldest row, a row on the same commit as the one below it
 * (a lock-on that changed nothing leaves MYTH and LEGACY on one commit), and
 * the oldest listed flight row of a truncated log, whose older neighbour
 * would be LEGACY with the unlisted versions in between.
 */
export function versionRows(timeline: VersionRowTimeline): VersionRow[] {
  const ordered: VersionRowSource[] = timeline.flight.slice();
  if (timeline.legacy) ordered.push(timeline.legacy);
  if (timeline.myth) ordered.push(timeline.myth);
  return ordered.map((version, i) => {
    const older = ordered[i + 1];
    const skipsUnlisted =
      timeline.truncated && version.kind === 'flight' && older?.kind !== 'flight';
    const diffFrom = older && !skipsUnlisted && older.sha !== version.sha ? older.sha : null;
    return { ...version, diffFrom };
  });
}

/** The bundle's `tr(key, subs)`, injected into the two message-composing
 *  helpers below the same way `pr-review-panel.ts`'s `PrReviewPanelTranslator`
 *  is — see this file's own module note for why the row model stays pure. */
export type VersionsPanelTranslator = (
  key: string,
  subs?: Readonly<Record<string, string | number>>,
) => string;

/** `POST /api/versions/restore`'s outcome, `flight/version-restore.ts`'s
 *  `RestoreOutcome` as `server/versions-route.ts` answers it: `restore` on a
 *  200/409, `error` on every other status (400/404/413/415/429/503). */
export interface VersionRestoreResponse {
  readonly restore?: {
    readonly ok: boolean;
    readonly branch: string | null;
    readonly sha: string | null;
    readonly reason: string | null;
  };
  readonly error?: string;
}

/** The restore button's snack text for one `POST /api/versions/restore`
 *  response — `ok` picks the snack's kind ('ok' vs 'err'), the same split
 *  `prReviewExecuteResult`'s className does for its own result line. */
export interface VersionRestoreResult {
  readonly ok: boolean;
  readonly text: string;
}

/** The one-click restore's confirm dialog (board ap-mui2h3s1-1, slice 6):
 *  names the short sha so the operator confirms which version, not just that
 *  something will happen — the same "name what will run" rule
 *  `prReviewConfirmMessage`/`landingExecuteConfirmMessage` already follow. */
export function versionRestoreConfirmMessage(
  row: Pick<VersionRow, 'sha'>,
  tr: VersionsPanelTranslator,
): string {
  return tr('versionsRestoreConfirm', { sha: row.sha.slice(0, 7) });
}

/** Formats the restore snack: a clean restore names the new branch (the
 *  operator's own next step is checking it out), a refused one relays
 *  `restoreVersion`'s own `reason` — already operator-facing prose
 *  ("not a full commit id", "no such version in this repository") — or the
 *  route's `error` for a request the restore endpoint never even reached.
 *  Never both `restore` and `error`, but a missing/malformed body (an
 *  upstream proxy's own error page, say) still gets a sentence instead of
 *  a blank snack. */
export function versionRestoreResultMessage(
  data: VersionRestoreResponse | null | undefined,
  tr: VersionsPanelTranslator,
): VersionRestoreResult {
  if (data?.restore?.ok) {
    return { ok: true, text: tr('versionsRestoreSuccess', { branch: data.restore.branch ?? '' }) };
  }
  const reason = data?.restore?.reason || data?.error || tr('versionsRestoreFailed');
  return { ok: false, text: reason };
}
