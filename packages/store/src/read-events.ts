// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Read-only queries over the `events` table — the per-event-type raw-row
 * readers (activity traces, post-flight sweep telemetry, operator verdicts)
 * split out of `read.ts`, which keeps the metrics/tasks aggregation surface.
 * Same contract as the rest of the read layer: the engine writes, these never
 * mutate, and callers parse `payload` themselves.
 */

import type Database from 'better-sqlite3';

type Db = Database.Database;

const DEFAULT_EVENTS_LIMIT = 200;
const MAX_EVENTS_LIMIT = 1000;

/** Clamp a caller-supplied `limit` to `[1, MAX_EVENTS_LIMIT]` before it reaches
 *  SQLite — a negative limit makes `LIMIT` return every row (SQLite's "no
 *  limit at all"), the opposite of the bounded recent window every reader in
 *  this file documents. Shared across all of them since they follow the same
 *  contract; mirrors `orient.ts`'s `clampOrientLengthsLimit` and
 *  `search.ts`'s `clampLimit` for the same failure class, including the
 *  `Number.isFinite` guard: Math.max/min/floor all propagate NaN, and a NaN
 *  `LIMIT` bind throws "datatype mismatch" in better-sqlite3. */
function clampEventsLimit(limit: number): number {
  const safeLimit = Number.isFinite(limit) ? limit : DEFAULT_EVENTS_LIMIT;
  return Math.min(Math.max(1, Math.floor(safeLimit)), MAX_EVENTS_LIMIT);
}

export interface ActivityEventRow {
  readonly firing_id: string | null;
  readonly payload: string | null;
  readonly created_at: number;
}

/** The most recent agent activity events (tool uses), newest first — the activity map. */
export function recentActivityEvents(db: Db, projectId: string, limit = 12): ActivityEventRow[] {
  return db
    .prepare(
      `SELECT firing_id, payload, created_at FROM events
         WHERE project_id = ? AND type = 'activity'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as ActivityEventRow[];
}

/**
 * Every activity event captured for ONE firing, newest first — unlike
 * {@link recentActivityEvents}, which caps at the newest N events across the
 * whole project. A project with more than that cap's worth of activity since
 * an older firing means that firing's own trace never fits in the window, so
 * its per-firing drill-down renders empty or truncated even though the full
 * trace is sitting in `events` — the data plane behind `/api/firing-activity`
 * (the Firing Replay viewer's first slice: a complete trace for ANY past
 * firing, not just the most recent one).
 */
export function activityEventsForFiring(
  db: Db,
  projectId: string,
  firingId: string,
): ActivityEventRow[] {
  return db
    .prepare(
      `SELECT firing_id, payload, created_at FROM events
         WHERE project_id = ? AND type = 'activity' AND firing_id = ?
         ORDER BY id DESC`,
    )
    .all(projectId, firingId) as ActivityEventRow[];
}

/** One `type = 'near-miss-debrief'` event's raw row — see {@link nearMissDebriefEvents}. */
export interface NearMissDebriefEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent SAFETY-II near-miss debriefs (fly.ts's post-flight sweep,
 * `flight/near-miss.ts`), newest first — one row per FLIGHT (not per
 * firing), read back by fly.ts itself to rebuild the history
 * `detectRecurringNearMissClass` needs across flights.
 */
export function nearMissDebriefEvents(
  db: Db,
  projectId: string,
  limit = 200,
): NearMissDebriefEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'near-miss-debrief'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as NearMissDebriefEventRow[];
}

/** One `type = 'near-miss-recurring'` event's raw row — see {@link nearMissRecurringEvents}. */
export interface NearMissRecurringEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent SAFETY-II recurring-class verdicts (fly.ts's post-flight
 * sweep, `detectRecurringNearMissClass`), newest first — the read path for
 * the dashboard's near-miss-recurring chip. A still-active pattern gets
 * re-flagged every flight, so the same class can repeat across many rows —
 * callers dedupe by the class field inside `payload`, keeping the newest.
 */
export function nearMissRecurringEvents(
  db: Db,
  projectId: string,
  limit = 200,
): NearMissRecurringEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'near-miss-recurring'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as NearMissRecurringEventRow[];
}

/** One `type = 'family-runaway'` event's raw row — see {@link familyRunawayEvents}. */
export interface FamilyRunawayEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent TASK ECONOMICS family-runaway proposals (fly.ts's
 * post-flight sweep, `familyEconomicsFromRows`), newest first. A still-active
 * pattern gets re-flagged every flight, so the same family can repeat across
 * many rows — callers dedupe by the family field inside `payload`, keeping
 * the newest.
 */
export function familyRunawayEvents(
  db: Db,
  projectId: string,
  limit = 200,
): FamilyRunawayEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'family-runaway'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as FamilyRunawayEventRow[];
}

/** One `type = 'intent-collision'` event's raw row — see {@link intentCollisionEvents}. */
export interface IntentCollisionEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent FLEET INTENT CLAIMS breaches (fly.ts's shipped-commit
 * verification against sibling `.autopilot-intent` claims), newest first —
 * the read path for the dashboard's intent-collision chips. Callers dedupe
 * by the file+sibling pair inside `payload`, keeping the newest.
 */
export function intentCollisionEvents(
  db: Db,
  projectId: string,
  limit = 200,
): IntentCollisionEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'intent-collision'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as IntentCollisionEventRow[];
}

/** One `type = 'guard-denial'` event's raw row — see {@link guardDenialEvents}. */
export interface GuardDenialEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent PreToolUse guard denials (fly.ts's `onFiringComplete`
 * persists each `{kind, target}` detail as its own row — GUARD-DENIAL
 * telemetry, board web-msr0ug27-hj1w27), newest first — the read path for
 * the dashboard's guard-denial anomaly chip. Same convention as
 * {@link intentCollisionEvents}: callers parse `payload` themselves.
 */
export function guardDenialEvents(db: Db, projectId: string, limit = 200): GuardDenialEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'guard-denial'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as GuardDenialEventRow[];
}

/** One `type = 'sync-back-refusal'` event's raw row — see {@link syncBackRefusalEvents}. */
export interface SyncBackRefusalEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent worktree-branch sync-back refusals (fly.ts persists one row
 * per refusal — both the per-firing sync-back attempt and the flight-end
 * retry — CONVERGENCE MADE LOUD, board web-mtb8i2mj-i0n1c7), newest first —
 * the read path for the dashboard's sync-back-refusal anomaly chip. A refusal
 * used to be nothing but a `⚠` console line that could recur 10+ firings in a
 * row with nothing durable to show for it
 * (docs/EVALUATION-2026-08-27-silent-gate.md §3.3); this event makes the
 * FIRST occurrence visible instead of waiting on a 3-flight recurring streak.
 * Same convention as {@link guardDenialEvents}: callers parse `payload`
 * themselves.
 */
export function syncBackRefusalEvents(
  db: Db,
  projectId: string,
  limit = 200,
): SyncBackRefusalEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'sync-back-refusal'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as SyncBackRefusalEventRow[];
}

/** One `type = 'land-gate-alarm'` event's raw row — see {@link landGateAlarmEvents}. */
export interface LandGateAlarmEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent out-of-band LANDING gate failures (`landing/execute.ts`'s
 * `createOutOfBandLandGateCheck` persists one row per red result, board
 * web-mtbeu5ga-22baso "LANDING GATE OFF WHILE FLYING") — newest first, the
 * read path for the dashboard's land-gate-alarm anomaly chip. Green
 * out-of-band checks write nothing (silent-on-trouble-only, same convention
 * as {@link guardDenialEvents}), so any row here is real news. Same
 * convention as {@link syncBackRefusalEvents}: callers parse `payload`
 * themselves.
 */
export function landGateAlarmEvents(
  db: Db,
  projectId: string,
  limit = 200,
): LandGateAlarmEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'land-gate-alarm'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as LandGateAlarmEventRow[];
}

/** One `type = 'convergence-red'` event's raw row — see {@link convergenceRedEvents}. */
export interface ConvergenceRedEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent CONVERGENCE GATE alarms (`flight/convergence-gate.ts`'s
 * `gateConvergedBranch` persists one row per red result via fly.ts's
 * `recordConvergenceRed` — board web-mtbeu5d3-n09acx "CONVERGENCE FULL
 * GATE") — newest first, the read path for the dashboard's convergence-red
 * anomaly chip. A convergence gate is an alarm, not a blocker (the merge
 * already landed) — this is the one place a red result becomes visible
 * instead of scrolling off the console. Same convention as
 * {@link landGateAlarmEvents}: callers parse `payload` themselves.
 */
export function convergenceRedEvents(
  db: Db,
  projectId: string,
  limit = 200,
): ConvergenceRedEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'convergence-red'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as ConvergenceRedEventRow[];
}

/** One `type = 'e2e-land-block'` event's raw row — see {@link e2eLandBlockEvents}. */
export interface E2eLandBlockEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent pre-land e2e guard refusals (`landing/execute.ts`'s
 * `createLandingExecuteApi` persists one row per landing refused because the
 * converged branch's own e2e is red, epic 0010 slice 4 / ADR 0008 "option A")
 * — newest first, the read path for the dashboard's e2e-land-block anomaly
 * chip. A guard that lets the landing through writes nothing (same
 * silent-on-trouble-only convention as {@link landGateAlarmEvents}), so any
 * row here is real news. Same convention as {@link convergenceRedEvents}:
 * callers parse `payload` themselves.
 */
export function e2eLandBlockEvents(db: Db, projectId: string, limit = 200): E2eLandBlockEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'e2e-land-block'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as E2eLandBlockEventRow[];
}

/** One `type = 'landed'` event's raw row — see {@link landedEvents}. */
export interface LandedEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent successful LANDING EXECUTE merges (`landing/execute.ts`
 * persists one row per green gate-then-merge, both the manual EXECUTE button
 * and the automatic land-watchdog go through this same code path), newest
 * first — the read path for the Notifications channel's flight-landed event
 * (board web-msnsndlk-exw3t9). Same convention as {@link guardDenialEvents}:
 * callers parse `payload` themselves.
 */
export function landedEvents(db: Db, projectId: string, limit = 200): LandedEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'landed'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as LandedEventRow[];
}

/** One `type = 'evaluation-label'` event's raw row — see {@link evaluationLabelEvents}. */
export interface EvaluationLabelEventRow {
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * The most recent operator approve/reject VERDICTS on self-proposed tasks,
 * newest first — `mutate.ts`'s `setTaskStatus`/`deleteTask` write these (the
 * human-vs-agent self-study slice's capture half, MASTER-PLAN.md §17.3).
 * `payload` is `{taskId, title, verdict}` JSON; callers parse it, same
 * convention as {@link intentCollisionEvents}.
 */
export function evaluationLabelEvents(
  db: Db,
  projectId: string,
  limit = 200,
): EvaluationLabelEventRow[] {
  return db
    .prepare(
      `SELECT payload, created_at FROM events
         WHERE project_id = ? AND type = 'evaluation-label'
         ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, clampEventsLimit(limit)) as EvaluationLabelEventRow[];
}

/** Approve/reject counts distilled from every `evaluation-label` event — the
 *  "capture operator approvals/rejections... as evaluation labels" half of the
 *  human-vs-agent self-study slice (backlog web-msniol15-foo6oi): capture has
 *  written these since {@link evaluationLabelEvents} landed, but nothing
 *  aggregated them for the self-study paper until now. */
export interface EvaluationLabelSummary {
  readonly total: number;
  readonly approved: number;
  readonly rejected: number;
  /** `approved / total`, or `null` when nothing has been recorded yet — never
   *  coerced to 0, which would misread "no data" as "no approvals". */
  readonly approvalRate: number | null;
}

/**
 * Aggregate {@link EvaluationLabelSummary} over every `evaluation-label` event
 * recorded for a project. Reads every such row directly (not through
 * {@link evaluationLabelEvents}, whose `limit` is meant for a bounded recent
 * list, not a total count) and parses `payload` defensively — only
 * `recordEvaluationLabel` (`mutate.ts`) writes this event type, but the store
 * makes no promise nothing else ever will, so a malformed payload is skipped,
 * not thrown, same convention as `apps/dashboard/src/read/source.ts`'s
 * `parseIntentCollisions`.
 */
export function evaluationLabelSummary(db: Db, projectId: string): EvaluationLabelSummary {
  const rows = db
    .prepare(`SELECT payload FROM events WHERE project_id = ? AND type = 'evaluation-label'`)
    .all(projectId) as { payload: string | null }[];
  let approved = 0;
  let rejected = 0;
  for (const row of rows) {
    if (row.payload === null) continue;
    try {
      const parsed = JSON.parse(row.payload) as { verdict?: unknown };
      if (parsed.verdict === 'approved') approved += 1;
      else if (parsed.verdict === 'rejected') rejected += 1;
    } catch {
      /* skip a malformed evaluation-label payload */
    }
  }
  const total = approved + rejected;
  return {
    total,
    approved,
    rejected,
    approvalRate: total > 0 ? approved / total : null,
  };
}

/** One calendar day's approve/reject tallies — the evolution-over-time backend
 *  slice of the human-vs-agent self-study (backlog web-msniol15-foo6oi item J
 *  checkbox 5): {@link evaluationLabelSummary} only ever reports a lifetime
 *  total, so "is the agent improving?" (approval-rate rising over time) has
 *  had no data plane to answer from until now. No dashboard panel reads this
 *  yet — this is the query layer only. */
export interface EvaluationLabelDayCount {
  /** UTC calendar day, `YYYY-MM-DD` — matches `read.ts`'s `firingDayCounts`. */
  readonly day: string;
  readonly approved: number;
  readonly rejected: number;
}

/**
 * Per-day approve/reject tallies across a project's full `evaluation-label`
 * history, oldest first. Day boundaries are UTC, matching
 * `read.ts`'s `firingDayCounts`. Uses `json_extract`/`json_valid` (SQLite JSON1,
 * `json_extract` already relied on by `orient.ts`) for the same malformed- or
 * verdict-less-payload tolerance {@link evaluationLabelSummary} gets from a
 * JS-side try/catch — `json_extract` on invalid JSON throws rather than
 * returning NULL, so `json_valid` must gate it in the WHERE clause first.
 */
export function evaluationLabelDayCounts(db: Db, projectId: string): EvaluationLabelDayCount[] {
  return db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') AS day,
              COALESCE(SUM(CASE WHEN json_extract(payload, '$.verdict') = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
              COALESCE(SUM(CASE WHEN json_extract(payload, '$.verdict') = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected
         FROM events
        WHERE project_id = ? AND type = 'evaluation-label'
          AND json_valid(payload)
          AND json_extract(payload, '$.verdict') IN ('approved', 'rejected')
        GROUP BY day
        ORDER BY day`,
    )
    .all(projectId) as EvaluationLabelDayCount[];
}

/**
 * The four `gateResult: 'unverifiable'` cause buckets (verdict-quality, board
 * web-mtq6zn6x-3khfkb: "~47.9% of the 96-attempt public sample gate results
 * were UNVERIFIABLE — classify each by cause"):
 *
 * - `no-checks`: the gate never ran at all — `firing.ts`'s GATE HOLE 2, a
 *   dirty working tree after the firing's own commit (an uncommitted stray
 *   edit riding along, most often another live process writing into a
 *   shared checkout — docs/debriefs/2026-09-06-primary-checkout-*.md).
 * - `timeout`: a gate command was killed by its own wall-clock budget before
 *   finishing (`adapters/gate.ts`'s `crashReason: 'timeout'`).
 * - `crash`: a gate command crashed for a reason OTHER than a timeout (spawn
 *   failure, OOM, tool error).
 * - `revert-failed`: the gate ran and failed, but the additive revert of the
 *   agent's commit itself failed too — the commit is neither certified nor
 *   undone.
 * - `unparsable`: `gateResult` is `'unverifiable'` but none of the above
 *   patterns match the recorded `gateError` (or none was recorded at all) —
 *   a legacy row predating this classifier, or a genuinely new cause.
 */
export type UnverifiableCause = 'no-checks' | 'timeout' | 'crash' | 'revert-failed' | 'unparsable';

export const UNVERIFIABLE_CAUSES: readonly UnverifiableCause[] = [
  'no-checks',
  'timeout',
  'crash',
  'revert-failed',
  'unparsable',
];

export interface UnverifiableCauseBreakdown {
  readonly total: number;
  readonly byCause: Readonly<Record<UnverifiableCause, number>>;
}

/**
 * Classify one `'firing'` event's parsed payload into an {@link
 * UnverifiableCause} — exported standalone so a caller with the record
 * already in hand (no second DB round-trip) can classify it too. `gateChecks`
 * empty means the gate itself never ran (the dirty-tree-after-commit refusal
 * in `firing.ts` short-circuits before `deps.gate.run()`), which is checked
 * BEFORE the error-text patterns below since that branch's own `gateError`
 * message also happens to be static (never mentions timeout/crash/revert).
 */
export function classifyUnverifiableCause(record: {
  readonly gateChecks?: unknown;
  readonly gateError?: unknown;
}): UnverifiableCause {
  const checks = Array.isArray(record.gateChecks) ? record.gateChecks : [];
  if (checks.length === 0) return 'no-checks';
  const error = typeof record.gateError === 'string' ? record.gateError : null;
  if (error === null) return 'unparsable';
  if (/timeout|timed out/i.test(error)) return 'timeout';
  if (/revert failed/i.test(error)) return 'revert-failed';
  if (/crash/i.test(error)) return 'crash';
  return 'unparsable';
}

/**
 * Aggregate {@link UnverifiableCauseBreakdown} over every `'firing'` event
 * recorded for a project whose `gateResult` is `'unverifiable'`. Reads the
 * `events` table (not the `metrics` columns) because `gateError`/`gateChecks`
 * are only ever persisted in the full JSON record — same
 * defensive-parse-and-skip convention as {@link evaluationLabelSummary}.
 */
export function unverifiableCauseBreakdown(db: Db, projectId: string): UnverifiableCauseBreakdown {
  const rows = db
    .prepare(`SELECT payload FROM events WHERE project_id = ? AND type = 'firing'`)
    .all(projectId) as { payload: string | null }[];
  const byCause: Record<UnverifiableCause, number> = {
    'no-checks': 0,
    timeout: 0,
    crash: 0,
    'revert-failed': 0,
    unparsable: 0,
  };
  let total = 0;
  for (const row of rows) {
    if (row.payload === null) continue;
    let parsed: { gateResult?: unknown; gateChecks?: unknown; gateError?: unknown };
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      continue; // skip a malformed firing payload, same convention as evaluationLabelSummary
    }
    if (parsed.gateResult !== 'unverifiable') continue;
    total += 1;
    byCause[classifyUnverifiableCause(parsed)] += 1;
  }
  return { total, byCause };
}
