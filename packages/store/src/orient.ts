// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ORIENT-length signal (COGNITIVE DEFENSES, board web-mssn107s-qh8d95): how
 * many recorded agent actions a firing spent before its FIRST edit-class tool
 * use (Write/Edit/NotebookEdit — the same classification `narrator.ts` uses).
 * A firing that suddenly reads/searches far longer than its neighbours before
 * touching anything is the RESEARCH-LIBRARY audit's "ORIENT-length anomaly" —
 * this is the data plane; the detection rule lives with the other anomaly
 * rules in `apps/dashboard/src/read/anomalies.ts`. Store-layer half only,
 * same split as `warm-sessions.ts`.
 */

import type Database from 'better-sqlite3';

type Db = Database.Database;

/** Tools whose first use marks the end of a firing's ORIENT phase — kept in
 *  lockstep with `narrator.ts`'s edit-class tools. */
const EDIT_TOOLS = ['Write', 'Edit', 'NotebookEdit'] as const;

const DEFAULT_ORIENT_LENGTHS_LIMIT = 20;
const MAX_ORIENT_LENGTHS_LIMIT = 100;

/** Clamp a caller-supplied limit to `[1, MAX_ORIENT_LENGTHS_LIMIT]` — SQLite's
 *  `LIMIT` treats a negative bound as "no limit at all," so an unclamped
 *  negative or fractional `limit` would return the project's entire activity
 *  history instead of a bounded recent window. Mirrors `search.ts`'s
 *  `clampLimit` and `read.ts`'s `clampFiringsPage` for the same failure class,
 *  including the `Number.isFinite` guard: Math.max/min/floor all propagate
 *  NaN, and a NaN `LIMIT` bind throws "datatype mismatch" in better-sqlite3. */
function clampOrientLengthsLimit(limit: number): number {
  const safeLimit = Number.isFinite(limit) ? limit : DEFAULT_ORIENT_LENGTHS_LIMIT;
  return Math.min(Math.max(1, Math.floor(safeLimit)), MAX_ORIENT_LENGTHS_LIMIT);
}

export interface OrientLength {
  readonly firingId: string;
  /** Activity events recorded BEFORE this firing's first edit-class tool use
   *  (0 = it edited immediately). */
  readonly actionsBeforeFirstEdit: number;
}

/**
 * Per-firing ORIENT length over a project's recorded activity events, newest
 * firing first. Firings that never used an edit-class tool at all are
 * EXCLUDED, not reported as 0 or infinity — a noop/docs-read firing
 * legitimately never edits, and counting it either way would poison the
 * baseline the anomaly rule averages over.
 */
export function orientLengths(
  db: Db,
  projectId: string,
  limit = DEFAULT_ORIENT_LENGTHS_LIMIT,
): OrientLength[] {
  const safeLimit = clampOrientLengthsLimit(limit);
  const editToolList = EDIT_TOOLS.map((t) => `'${t}'`).join(',');
  return db
    .prepare(
      `SELECT fe.firing_id AS firingId,
              COUNT(e.id) AS actionsBeforeFirstEdit
         FROM (SELECT firing_id, MIN(id) AS firstEditId
                 FROM events
                WHERE project_id = @projectId AND type = 'activity'
                  AND firing_id IS NOT NULL
                  AND payload IS NOT NULL AND json_valid(payload)
                  AND json_extract(payload, '$.tool') IN (${editToolList})
                GROUP BY firing_id) fe
         LEFT JOIN events e
           ON e.project_id = @projectId AND e.type = 'activity'
          AND e.firing_id = fe.firing_id AND e.id < fe.firstEditId
        GROUP BY fe.firing_id
        ORDER BY fe.firstEditId DESC
        LIMIT @limit`,
    )
    .all({ projectId, limit: safeLimit }) as OrientLength[];
}
