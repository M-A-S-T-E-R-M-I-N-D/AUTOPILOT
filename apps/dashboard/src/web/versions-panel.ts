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
