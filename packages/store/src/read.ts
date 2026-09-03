// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Read-only query helpers over the store — the aggregation surface the dashboard
 * reads (the engine writes; these never mutate). Kept as small, focused SELECTs
 * so the dashboard's view-model layer stays pure and testable.
 */

import type Database from 'better-sqlite3';
import type { ProjectRow, ProjectIndexMetaRow, Severity, VersionTier, FleetRow } from './types.js';

type Db = Database.Database;

/** All registered projects, oldest first (stable secondary sort by slug). */
export function listProjects(db: Db): ProjectRow[] {
  return db
    .prepare('SELECT * FROM projects ORDER BY created_at ASC, slug ASC')
    .all() as ProjectRow[];
}

/** The single fleet-wide wisdom row (schema v20) — never null on a migrated
 *  store (the v20 migration seeds exactly one `id = 'fleet'` row for the
 *  database's lifetime); throws on a pre-v20 store, same as any other query
 *  here against a table that doesn't exist yet — callers that need the
 *  "no DB yet" degrade-to-empty behavior get it from the outer
 *  open/query/close wrapper (`read/source.ts`'s `readFleetFromStore`), not
 *  from this function. The read-side counterpart to `mutate.ts`'s
 *  propose/ratify/dismiss trio. */
export function getFleetWisdom(db: Db): FleetRow | null {
  const row = db.prepare(`SELECT * FROM fleet WHERE id = 'fleet'`).get() as FleetRow | undefined;
  return row ?? null;
}

/** The index summary row for a project, or null if it has not been indexed. */
export function getIndexMeta(db: Db, projectId: string): ProjectIndexMetaRow | null {
  const row = db.prepare('SELECT * FROM project_index_meta WHERE project_id = ?').get(projectId) as
    ProjectIndexMetaRow | undefined;
  return row ?? null;
}

export interface FiringStats {
  readonly firings: number;
  readonly shipped: number;
  readonly cost: number;
  /** Cost semantics v3 (epic 0013) — summed `real_cost_usd` across the same
   *  window, ignoring rows where it is unset. `null` (never `0`) when NOT ONE
   *  firing in the window carries a real-cost figure, so an unconfigured
   *  deployment reads as "no data" rather than a fabricated zero spend — the
   *  same null-vs-zero distinction `FlightEntry.realCostUsd` documents. */
  readonly realCost: number | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly turns: number;
}

/**
 * Firing count + gate-verified ships + summed cost/tokens/turns (the real spend).
 * `sinceAt` (epoch ms), when given, restricts the sum to firings at/after that
 * point — the CURRENT ROUND view's aggregate (web-msntc6cx-yios2n): the same
 * shape as the all-time totals, just window-filtered, so callers don't need a
 * second query shape to show "this round" next to "all-time".
 */
export function firingStats(db: Db, projectId: string, sinceAt?: number): FiringStats {
  const cutoff = typeof sinceAt === 'number' ? 'AND created_at >= @sinceAt' : '';
  return db
    .prepare(
      `SELECT COUNT(*) AS firings,
              COALESCE(SUM(shipped), 0) AS shipped,
              COALESCE(SUM(cost_usd), 0) AS cost,
              SUM(real_cost_usd) AS realCost,
              COALESCE(SUM(input_tokens), 0) AS tokensIn,
              COALESCE(SUM(output_tokens), 0) AS tokensOut,
              COALESCE(SUM(cache_read_tokens), 0) AS cacheReadTokens,
              COALESCE(SUM(cache_write_tokens), 0) AS cacheWriteTokens,
              COALESCE(SUM(turns), 0) AS turns
         FROM metrics WHERE project_id = @projectId ${cutoff}`,
    )
    .get({ projectId, sinceAt: sinceAt ?? 0 }) as FiringStats;
}

export type SeverityGauge = Record<Severity, number>;

/** Open findings by severity — the progression gauge (MASTER-PLAN §16.1), cleared reds-first. */
export function openSeverityGauge(db: Db, projectId: string): SeverityGauge {
  const rows = db
    .prepare(
      `SELECT severity, COUNT(*) AS n FROM tasks
         WHERE project_id = ?
           AND severity IS NOT NULL
           AND status IN ('queued', 'in_progress', 'needs_approval')
         GROUP BY severity`,
    )
    .all(projectId) as { severity: Severity; n: number }[];

  const gauge: SeverityGauge = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const row of rows) gauge[row.severity] = row.n;
  return gauge;
}

/** Timestamp of the most recent event for a project, or null if it has none yet. */
export function lastActivityAt(db: Db, projectId: string): number | null {
  const row = db
    .prepare('SELECT MAX(created_at) AS t FROM events WHERE project_id = ?')
    .get(projectId) as { t: number | null };
  return row.t ?? null;
}

/** The distinct backup tiers recorded for a project (myth / legacy / flight). */
export function backupTiers(db: Db, projectId: string): VersionTier[] {
  const rows = db
    .prepare('SELECT DISTINCT tier FROM versions WHERE project_id = ? ORDER BY tier')
    .all(projectId) as { tier: VersionTier }[];
  return rows.map((r) => r.tier);
}

export interface FiringLogRow {
  readonly firing_id: string;
  readonly item: string | null;
  readonly kind: string | null;
  readonly sha: string | null;
  readonly shipped: 0 | 1;
  readonly gate_result: string | null;
  readonly cost_usd: number;
  /** Cost semantics v3 (epic 0013) — `null` when unconfigured or predating v19;
   *  never coerced to 0 (see `M19_METRICS_REAL_COST`). */
  readonly real_cost_usd: number | null;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_write_tokens: number;
  readonly turns: number;
  readonly duration_ms: number;
  readonly commit_subject: string | null;
  /** The agent's self-reported `"slice"` (task only advanced) vs `"complete"`
   *  (task finished) — null for firings recorded before this was tracked, or
   *  ones that named no board task at all. */
  readonly completion: string | null;
  /** The model that ran this firing (e.g. `"claude-sonnet-5"`) — null for
   *  firings recorded before this was tracked. */
  readonly model: string | null;
  readonly created_at: number;
  /**
   * The full FiringRecord JSON (events.payload, type='firing') for this firing,
   * or null when no such event was recorded — the source of per-check gate
   * results (gateChecks), which never got a `metrics` column of their own.
   */
  readonly payload: string | null;
}

/** A firing's commit identity — see {@link firingCommitRef}. `null` sha means
 *  the firing recorded no shipped commit (never shipped, or reverted). */
export interface FiringCommitRef {
  readonly sha: string | null;
}

/**
 * A firing's recorded commit sha, or `null` if no such firing was ever
 * recorded for this project — the data plane behind `/api/firing-diff` (the
 * Firing Replay viewer's diff-capture slice): distinguishes "unknown firing"
 * (no row at all) from "known firing, nothing shipped" (a row with a null
 * `sha`), so the caller can 404 the former and honestly show "no diff" for
 * the latter instead of conflating the two.
 */
export function firingCommitRef(
  db: Db,
  projectId: string,
  firingId: string,
): FiringCommitRef | null {
  const row = db
    .prepare('SELECT sha FROM metrics WHERE project_id = ? AND firing_id = ?')
    .get(projectId, firingId) as FiringCommitRef | undefined;
  return row ?? null;
}

const MAX_RECENT_FIRINGS_LIMIT = 1000;

/** Clamp a caller-supplied `LIMIT`/`OFFSET` pair before it reaches SQLite —
 *  a negative `LIMIT` makes better-sqlite3 return every row (unbounded, not
 *  capped) and a non-integer/NaN one throws "datatype mismatch" instead of
 *  degrading. `offset`'s own HTTP path (`readFiringsPage`, `read/source.ts`)
 *  forwards a query param with no validation of its own, so this is the last
 *  line of defense. Mirrors `search.ts`'s `clampLimit` for the same failure
 *  class. */
function clampFiringsPage(limit: number, offset: number): { limit: number; offset: number } {
  const safeLimit = Number.isFinite(limit) ? Math.floor(limit) : 20;
  const safeOffset = Number.isFinite(offset) ? Math.floor(offset) : 0;
  return {
    limit: Math.min(Math.max(1, safeLimit), MAX_RECENT_FIRINGS_LIMIT),
    offset: Math.max(0, safeOffset),
  };
}

/**
 * The most recent firings for a project, newest first — the flight log + graph
 * series. `offset` pages further back in history (a slice-heavy day can push
 * a project past the default window; without it, everything before `limit`
 * is simply unreachable, not just unshown).
 */
export function recentFirings(db: Db, projectId: string, limit = 20, offset = 0): FiringLogRow[] {
  const safe = clampFiringsPage(limit, offset);
  return db
    .prepare(
      `SELECT m.firing_id, m.item, m.kind, m.sha, m.shipped, m.gate_result,
              m.cost_usd, m.real_cost_usd, m.input_tokens, m.output_tokens,
              m.cache_read_tokens, m.cache_write_tokens, m.turns, m.duration_ms,
              m.commit_subject, m.completion, m.model, m.created_at, e.payload
         FROM metrics m
         LEFT JOIN events e ON e.firing_id = m.firing_id AND e.type = 'firing'
        WHERE m.project_id = ?
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(projectId, safe.limit, safe.offset) as FiringLogRow[];
}

/** One calendar day's firing tallies — the contribution heatmap's data plane. */
export interface FiringDayCount {
  /** UTC calendar day, `YYYY-MM-DD`. */
  readonly day: string;
  readonly ships: number;
  readonly deaths: number;
  readonly other: number;
}

/**
 * Per-day firing tallies across a project's FULL history (the heatmap was
 * caught lying — it bucketed only the served 20-row flight-log window, so the
 * busiest days rendered as "no firings"). Day boundaries are UTC, matching the
 * client's grid math. `deaths` approximates the client's verdict logic in SQL:
 * an unshipped firing whose gate result was reverted/checkpointed; the
 * payload-only `errored` distinction stays client-side and lands in `other`.
 */
export function firingDayCounts(db: Db, projectId: string): FiringDayCount[] {
  return db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') AS day,
              COALESCE(SUM(CASE WHEN shipped = 1 THEN 1 ELSE 0 END), 0) AS ships,
              COALESCE(SUM(CASE WHEN shipped = 0 AND gate_result IN ('reverted', 'checkpointed') THEN 1 ELSE 0 END), 0) AS deaths,
              COALESCE(SUM(CASE WHEN shipped = 0 AND (gate_result IS NULL OR gate_result NOT IN ('reverted', 'checkpointed')) THEN 1 ELSE 0 END), 0) AS other
         FROM metrics
        WHERE project_id = ?
        GROUP BY day
        ORDER BY day`,
    )
    .all(projectId) as FiringDayCount[];
}

/** One firing's chart-ready data point — the per-firing granularity behind
 *  `docs/SELF-STUDY/PAPER.md`'s `DATA:SERIES` block (backlog web-msnsgcvf-zgmo7i,
 *  "the chart data plane"). Unlike {@link recentFirings} this is unpaginated —
 *  full history, oldest first, matching the series a time-axis chart needs. */
export interface FiringSeriesPoint {
  readonly firingId: string;
  /** UTC calendar day, `YYYY-MM-DD` — matches {@link firingDayCounts}. */
  readonly day: string;
  readonly sha: string | null;
  readonly kind: string | null;
  readonly shipped: 0 | 1;
  readonly completion: string | null;
  /** Self-reported `METRICS.outcome` (e.g. `"shipped"`/`"noop"`) from
   *  `events.payload.outcome` — null when no firing event was recorded, or
   *  the payload carried no resolvable outcome. */
  readonly outcome: string | null;
  /** From `events.payload.promptVersion` — null when unresolvable, same
   *  tolerance as {@link evalRegressionByPromptVersion}. */
  readonly promptVersion: string | null;
  readonly costUsd: number;
  readonly turns: number;
  readonly createdAt: number;
}

interface FiringSeriesRow {
  readonly firingId: string;
  readonly day: string;
  readonly sha: string | null;
  readonly kind: string | null;
  readonly shipped: 0 | 1;
  readonly completion: string | null;
  readonly costUsd: number;
  readonly turns: number;
  readonly createdAt: number;
  readonly payload: string | null;
}

/**
 * Every recorded firing for a project, oldest first, with its per-firing
 * telemetry (`metrics`) joined to the promptVersion/outcome recorded in that
 * firing's own `events` row (type='firing') — the same payload source
 * {@link evalRegressionByPromptVersion} reads, so the two never disagree
 * about what a firing's prompt version was. A malformed or missing payload
 * degrades to `null` fields rather than dropping the firing: unlike the
 * eval-regression aggregates, a chart series must not silently lose points.
 */
export function firingSeries(db: Db, projectId: string): FiringSeriesPoint[] {
  const rows = db
    .prepare(
      `SELECT m.firing_id AS firingId,
              date(m.created_at / 1000, 'unixepoch') AS day,
              m.sha, m.kind, m.shipped, m.completion,
              m.cost_usd AS costUsd, m.turns, m.created_at AS createdAt,
              e.payload
         FROM metrics m
         LEFT JOIN events e ON e.firing_id = m.firing_id AND e.type = 'firing'
        WHERE m.project_id = ?
        ORDER BY m.created_at ASC, m.id ASC`,
    )
    .all(projectId) as FiringSeriesRow[];

  return rows.map((r) => {
    let promptVersion: string | null = null;
    let outcome: string | null = null;
    if (r.payload) {
      try {
        const parsed = JSON.parse(r.payload) as Record<string, unknown>;
        const v = parsed['promptVersion'];
        if (typeof v === 'string' && v.length > 0) promptVersion = v;
        const o = parsed['outcome'];
        if (typeof o === 'string' && o.length > 0) outcome = o;
      } catch {
        // malformed payload — leave promptVersion/outcome null rather than throw.
      }
    }
    return {
      firingId: r.firingId,
      day: r.day,
      sha: r.sha,
      kind: r.kind,
      shipped: r.shipped,
      completion: r.completion,
      outcome,
      promptVersion,
      costUsd: r.costUsd,
      turns: r.turns,
      createdAt: r.createdAt,
    };
  });
}

export interface TaskSummaryRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly severity: string | null;
  readonly dimension: string | null;
  readonly focus: number;
  readonly priority: number | null;
  /** Set by an operator reorder (`mutate.ts`'s `reorderTasks(..., pin: true)`)
   *  — tells `fly.ts`'s `runBoardTriage` this task's position was chosen
   *  deliberately and must survive the next triage re-sort untouched
   *  (web-mt1bwkrf-v5pnx2). Never set by triage's own writes. */
  readonly priority_pinned: number;
  /** 'dashboard' = human-created; 'self' = autopilot-PROPOSED (awaiting the operator). */
  readonly source: string;
  readonly created_at: number;
  /**
   * PARALLEL UNLOCK C (board task-CLAIMING): which flight INSTANCE (see
   * `mutate.ts`'s `claimTask`) currently holds this task, or null when it's
   * unclaimed — free for any instance to claim. Lets a same-folder N-way
   * fleet's board read (`fly.ts`'s `buildPrompt`) exclude a task a SIBLING
   * instance already claimed, so two concurrent firings never pick the same
   * one.
   */
  readonly assignee: string | null;
}

const MAX_TASKS_LIMIT = 500;

/** Clamp a caller-supplied task-list `limit` before it reaches SQLite — the same
 *  failure class {@link clampFiringsPage} guards: a negative `LIMIT` makes
 *  better-sqlite3 return every row unbounded, and a non-integer/NaN one throws
 *  "datatype mismatch" instead of degrading. Shared by {@link recentTasks} and
 *  {@link doneTasks} — the MCP `tasks_list` tool already blocks bad values with
 *  its own Zod schema, but both functions are exported and directly callable
 *  with no floor of their own. */
function clampTasksLimit(limit: number, fallback: number): number {
  const safe = Number.isFinite(limit) ? Math.floor(limit) : fallback;
  return Math.min(Math.max(1, safe), MAX_TASKS_LIMIT);
}

/**
 * A project's tasks in the ONE true work order (the operator's law: what you
 * see IS what runs next) — open first, then FOCUS, then severity band
 * (critical > high > medium > low > untagged; HIGH is always above), then the
 * operator/triage priority within a band, then recency. The dashboard, the
 * flight's pick order, and the post-flight triage all read THIS. DONE tasks
 * are history, not a queue — they sort by recency alone (severity banding a
 * finished task would bury the freshest work below the limit; observed live).
 */
export function recentTasks(db: Db, projectId: string, limit = 30): TaskSummaryRow[] {
  return db
    .prepare(
      `SELECT id, title, status, severity, dimension, focus, priority, priority_pinned, source, created_at, assignee FROM tasks
        WHERE project_id = ?
        ORDER BY CASE WHEN status IN ('queued','in_progress','needs_approval') THEN 0 ELSE 1 END,
                 focus DESC,
                 CASE WHEN status NOT IN ('queued','in_progress','needs_approval') THEN 0
                      ELSE CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                                         WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END
                 END,
                 CASE WHEN status IN ('queued','in_progress','needs_approval') AND priority IS NULL THEN 1 ELSE 0 END,
                 CASE WHEN status IN ('queued','in_progress','needs_approval') THEN priority END ASC,
                 created_at DESC
        LIMIT ?`,
    )
    .all(projectId, clampTasksLimit(limit, 30)) as TaskSummaryRow[];
}

/**
 * A project's DONE tasks, most-recently-closed first — the CLOSED-TASK AUDIT
 * ritual's (`apps/dashboard/src/flight/closed-task-audit.ts`) candidate pool
 * for re-verification. Separate from {@link recentTasks}: that query's
 * default `limit` sorts open work first and can push done tasks off the page
 * entirely on a busy board, exactly the tasks this audit needs.
 */
export function doneTasks(db: Db, projectId: string, limit = 50): TaskSummaryRow[] {
  return db
    .prepare(
      `SELECT id, title, status, severity, dimension, focus, priority, priority_pinned, source, created_at, assignee FROM tasks
        WHERE project_id = ? AND status = 'done'
        ORDER BY updated_at DESC
        LIMIT ?`,
    )
    .all(projectId, clampTasksLimit(limit, 50)) as TaskSummaryRow[];
}

/** Lifetime cumulative cost {@link taskEconomics} must clear to flag a task a "runaway". */
export const RUNAWAY_COST_USD = 50;
/** Lifetime firing count {@link taskEconomics} must clear to flag a task a "runaway". */
export const RUNAWAY_FIRING_COUNT = 10;

/** One task's lifetime economics, derived from `metrics.item` — see {@link taskEconomics}. */
export interface TaskEconomics {
  readonly taskId: string;
  /** Sum of `cost_usd` across every firing that self-reported working this task. */
  readonly cumulativeCostUsd: number;
  /** Count of firings that self-reported working this task. */
  readonly firingCount: number;
  /** True when the TRAILING run of firings since this task's most recent
   *  `completion: 'complete'` (or since the beginning, if it never
   *  completed) covers its entire firing history — i.e. it isn't currently
   *  mid a post-completion regrind. */
  readonly allSlices: boolean;
  /** Flagged once the TRAILING streak since the last completion — not the
   *  lifetime total — clears cost over {@link RUNAWAY_COST_USD} or firings
   *  over {@link RUNAWAY_FIRING_COUNT}. Deliberately trailing, not lifetime:
   *  an old `'complete'` report must not buy permanent immunity for a task
   *  that gets reopened and keeps burning firings past the thresholds again
   *  (the "attribution to a CLOSED task" evasion — TASK ECONOMICS v2).
   */
  readonly isRunaway: boolean;
}

/**
 * Lifetime per-task spend, grouped by `metrics.item` (the board task id a
 * firing's METRICS line self-reported working) — TRUE totals across the
 * whole project history, not the paginated `flightLog` window the dashboard's
 * per-task "burn" chip already renders client-side (`taskBurnOf`,
 * apps/dashboard/src/web/shell.ts) — a task worked before the visible page
 * cannot hide from the runaway check this feeds (post-flight TRIAGE,
 * `apps/dashboard/src/fly.ts`). Rows are folded in insertion order (`id ASC`,
 * not `created_at` — test fixtures and same-millisecond firings can share a
 * timestamp) so the runaway check can track a TRAILING streak since the last
 * completion, not just a lifetime total.
 */
export function taskEconomics(db: Db, projectId: string): readonly TaskEconomics[] {
  const rows = db
    .prepare(
      `SELECT item AS taskId, cost_usd AS costUsd, completion
         FROM metrics
        WHERE project_id = ? AND item IS NOT NULL
        ORDER BY id ASC`,
    )
    .all(projectId) as { taskId: string; costUsd: number; completion: string | null }[];

  interface Acc {
    cumulativeCostUsd: number;
    firingCount: number;
    streakFirings: number;
    streakCostUsd: number;
  }
  const byTask = new Map<string, Acc>();
  for (const r of rows) {
    const prev = byTask.get(r.taskId) ?? {
      cumulativeCostUsd: 0,
      firingCount: 0,
      streakFirings: 0,
      streakCostUsd: 0,
    };
    // Inclusive-null by design: an untagged (`null`) completion still counts
    // as continuing the streak here, unlike the CONSERVATIVE sibling
    // predicate `foldEconomics` (apps/dashboard/src/flight/triage-factors.ts)
    // where only an explicit 'slice' continues it and anything else (incl.
    // null) resets to 0. Both cite the same TASK ECONOMICS v2 doctrine but
    // serve different consumers on purpose: this one feeds an EAGER,
    // informational dashboard chip (better a false-positive nudge than a
    // silent miss), while the sibling gates an autonomous board-triage
    // demotion (false positives there wrongly bury a real task, so it
    // requires an explicit 'slice' AND both thresholds). Do not "fix" one to
    // match the other — see packages/store/test/read.test.ts's "flags a
    // runaway ... with no completion" case, which locks this reading in.
    const isSlice = r.completion !== 'complete';
    byTask.set(r.taskId, {
      cumulativeCostUsd: prev.cumulativeCostUsd + r.costUsd,
      firingCount: prev.firingCount + 1,
      streakFirings: isSlice ? prev.streakFirings + 1 : 0,
      streakCostUsd: isSlice ? prev.streakCostUsd + r.costUsd : 0,
    });
  }
  return Array.from(byTask, ([taskId, acc]) => ({
    taskId,
    cumulativeCostUsd: acc.cumulativeCostUsd,
    firingCount: acc.firingCount,
    allSlices: acc.streakFirings === acc.firingCount,
    isRunaway: acc.streakCostUsd > RUNAWAY_COST_USD || acc.streakFirings > RUNAWAY_FIRING_COUNT,
  }));
}

/** Bound how many prior commit subjects {@link shippedSlicesByTask} keeps per
 *  task — enough for the next firing to see real progress without letting a
 *  long-running multi-slice task's ledger grow the prompt unboundedly. */
export const SHIPPED_SLICES_LIMIT = 8;

/**
 * SLICE-RELAY (board web-mt14o4nh-bfpr9c): the commit subject of every PRIOR
 * firing that shipped a `completion: 'slice'` partial claim on a task, oldest
 * first, grouped by `metrics.item` — so the firing prompt's BOARD/FOCUS
 * section (`packages/engine/src/prompt.ts`'s `taskLine`) can show the NEXT
 * pick what already shipped instead of re-discovering a multi-slice task
 * cold. Reads straight off the existing un-fakeable ship record (M6
 * `commit_subject` / M7 `completion`) rather than a new mutable column on
 * `tasks` — one source of truth, nothing to drift out of sync. Same `id ASC`
 * insertion-order rule as {@link taskEconomics}: same-millisecond firings can
 * share a `created_at`. Capped per task at {@link SHIPPED_SLICES_LIMIT},
 * keeping the MOST RECENT entries — a long-running task's earliest slices
 * matter less than its latest.
 */
export function shippedSlicesByTask(db: Db, projectId: string): Map<string, string[]> {
  const rows = db
    .prepare(
      `SELECT item AS taskId, commit_subject AS commitSubject FROM metrics
        WHERE project_id = ? AND item IS NOT NULL AND shipped = 1
          AND completion = 'slice' AND commit_subject IS NOT NULL
        ORDER BY id ASC`,
    )
    .all(projectId) as { taskId: string; commitSubject: string }[];
  const byTask = new Map<string, string[]>();
  for (const r of rows) {
    const list = byTask.get(r.taskId) ?? [];
    list.push(r.commitSubject);
    byTask.set(r.taskId, list);
  }
  for (const [taskId, list] of byTask) {
    if (list.length > SHIPPED_SLICES_LIMIT) byTask.set(taskId, list.slice(-SHIPPED_SLICES_LIMIT));
  }
  return byTask;
}
