// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * DORA-for-agents (backlog web-msnsxudt-sfw78a): four telemetry-derived process
 * metrics, adapted from the DORA four keys to a single-agent-flying-a-repo
 * setting. This is the store-layer half only — computing the numbers from the
 * `metrics`/`tasks` tables the engine already writes; the dashboard tiles that
 * render them (the board item's stated DELIVERABLE) are a follow-up slice —
 * per the UX-EXPRESSION DOCTRINE, a metric with no visible tile is not "complete".
 *
 * - Landing frequency  → deployment-frequency analog: shipped, gate-verified
 *   firings per day over a trailing window (same ground-truth bar
 *   {@link verifiedKnownGoodFirings} uses — self-report alone doesn't count).
 * - Task lead time      → time from a board task's creation to the firing that
 *   actually closed it (`completion = 'complete'`, not a partial `'slice'`).
 * - Change failure rate → the fraction of shipped commits that were reverts
 *   (`kind = 'revert'`) — the closest un-fakeable proxy this store has for "a
 *   change required remediation" without an external incident tracker.
 * - MTTR                → checkpoint-to-resume: the mean time between a
 *   `wip(autopilot): checkpoint` firing (SOUL's own turn-budget escape hatch,
 *   see the firing prompt's TURN BUDGET section) and the next recorded firing
 *   that resumes the flight — this repo's closest analog to "time to restore
 *   service".
 */

import type Database from 'better-sqlite3';
import { median } from './stats.js';

type Db = Database.Database;

const DAY_MS = 24 * 60 * 60 * 1000;

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Deployment-frequency analog over a trailing window. */
export interface LandingFrequency {
  readonly windowDays: number;
  readonly landings: number;
  readonly perDay: number;
}

/**
 * How often work actually lands — shipped AND `head_advanced` (mechanically
 * confirmed on HEAD, not just self-reported) — over the trailing `windowMs`.
 */
export function landingFrequency(
  db: Db,
  projectId: string,
  windowMs = 7 * DAY_MS,
  nowMs = Date.now(),
): LandingFrequency {
  const sinceMs = nowMs - windowMs;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS landings FROM metrics
        WHERE project_id = ? AND shipped = 1 AND head_advanced = 1 AND created_at >= ?`,
    )
    .get(projectId, sinceMs) as { landings: number };
  const windowDays = windowMs / DAY_MS;
  return {
    windowDays,
    landings: row.landings,
    perDay: windowDays > 0 ? row.landings / windowDays : 0,
  };
}

/** Board-task cycle time. */
export interface TaskLeadTime {
  readonly tasksCompleted: number;
  readonly medianLeadTimeMs: number | null;
  readonly meanLeadTimeMs: number | null;
}

/**
 * Time from a board task's creation to the firing that finished it:
 * `metrics.created_at` (the earliest firing that closed the task) minus
 * `tasks.created_at`, restricted to firings that self-reported
 * `completion = 'complete'` — a `'slice'` firing only advanced the task, so
 * it is not the task's lead time (see the firing prompt's completion rule).
 */
export function taskLeadTime(db: Db, projectId: string): TaskLeadTime {
  const rows = db
    .prepare(
      `SELECT MIN(m.created_at) AS completedAt, t.created_at AS createdAt
         FROM metrics m
         JOIN tasks t ON t.id = m.item AND t.project_id = m.project_id
        WHERE m.project_id = ? AND m.completion = 'complete' AND m.shipped = 1
        GROUP BY t.id`,
    )
    .all(projectId) as { completedAt: number; createdAt: number }[];
  // A negative duration means bad data (clock skew, backfilled telemetry),
  // not that the task wasn't completed — exclude it from the duration
  // stats, but the task still counts toward tasksCompleted.
  const durations = rows.map((r) => r.completedAt - r.createdAt);
  const leadTimes = durations.filter((ms) => ms >= 0);
  return {
    tasksCompleted: rows.length,
    medianLeadTimeMs: median(leadTimes),
    meanLeadTimeMs: mean(leadTimes),
  };
}

/** Fraction of shipped commits that were reverts. */
export interface ChangeFailureRate {
  readonly shipped: number;
  readonly reverts: number;
  readonly rate: number | null;
}

/**
 * The closest un-fakeable proxy this store has for "a change required
 * remediation": `kind = 'revert'` shipped commits ÷ all shipped commits over
 * the trailing `windowMs`. `rate` is `null` (never coerced to 0) when nothing
 * shipped in the window — "no data" must not read as "no failures".
 */
export function changeFailureRate(
  db: Db,
  projectId: string,
  windowMs = 30 * DAY_MS,
  nowMs = Date.now(),
): ChangeFailureRate {
  const sinceMs = nowMs - windowMs;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS shipped,
              COALESCE(SUM(CASE WHEN kind = 'revert' THEN 1 ELSE 0 END), 0) AS reverts
         FROM metrics
        WHERE project_id = ? AND shipped = 1 AND created_at >= ?`,
    )
    .get(projectId, sinceMs) as { shipped: number; reverts: number };
  return {
    shipped: row.shipped,
    reverts: row.reverts,
    rate: row.shipped > 0 ? row.reverts / row.shipped : null,
  };
}

/** Checkpoint-to-resume recovery time. */
export interface Mttr {
  readonly checkpoints: number;
  readonly resolved: number;
  readonly medianRecoveryMs: number | null;
  readonly meanRecoveryMs: number | null;
}

const CHECKPOINT_PREFIX = 'wip(autopilot): checkpoint';

/**
 * This repo's closest analog to "time to restore service": a
 * `wip(autopilot): checkpoint` commit means a firing died mid-unit (the SOUL
 * prompt's own turn-budget escape hatch); recovery time is the gap until the
 * NEXT recorded firing for the project. The most recent checkpoint, if no
 * later firing has landed yet, is still an open incident and is excluded
 * from `resolved`/the averages — there is no recovery time to report until
 * it actually resolves.
 */
export function mttr(db: Db, projectId: string): Mttr {
  const rows = db
    .prepare(
      `SELECT created_at AS createdAt, commit_subject AS commitSubject FROM metrics
        WHERE project_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(projectId) as { createdAt: number; commitSubject: string | null }[];

  const recoveries: number[] = [];
  let checkpoints = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] as { createdAt: number; commitSubject: string | null };
    if (!row.commitSubject?.startsWith(CHECKPOINT_PREFIX)) continue;
    checkpoints += 1;
    // A run of consecutive checkpoints is still ONE ongoing incident — the
    // service isn't restored until a firing that ISN'T itself another
    // checkpoint lands, so recovery time skips past any dying resumes.
    let j = i + 1;
    while (rows[j]?.commitSubject?.startsWith(CHECKPOINT_PREFIX)) j += 1;
    const resolvedBy = rows[j];
    if (resolvedBy) recoveries.push(resolvedBy.createdAt - row.createdAt);
  }

  return {
    checkpoints,
    resolved: recoveries.length,
    medianRecoveryMs: median(recoveries),
    meanRecoveryMs: mean(recoveries),
  };
}

/** All four DORA-for-agents numbers in one call — the shape a future
 *  dashboard's four tiles (backlog web-msnsxudt-sfw78a) render side by side. */
export interface DoraSnapshot {
  readonly landingFrequency: LandingFrequency;
  readonly taskLeadTime: TaskLeadTime;
  readonly changeFailureRate: ChangeFailureRate;
  readonly mttr: Mttr;
}

export function doraSnapshot(db: Db, projectId: string, nowMs = Date.now()): DoraSnapshot {
  return {
    landingFrequency: landingFrequency(db, projectId, 7 * DAY_MS, nowMs),
    taskLeadTime: taskLeadTime(db, projectId),
    changeFailureRate: changeFailureRate(db, projectId, 30 * DAY_MS, nowMs),
    mttr: mttr(db, projectId),
  };
}
