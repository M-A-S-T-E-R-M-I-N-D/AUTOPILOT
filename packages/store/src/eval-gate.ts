// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * SOTA-MAP H3 eval-regression aggregates and the prompt-version gate built on
 * them — split out of read.ts's general query surface because this is one
 * cohesive domain (group firings, compute pass-rate/cost/turns, judge a
 * candidate against a baseline) with its own private helpers that nothing
 * outside it calls.
 */

import type Database from 'better-sqlite3';
import { median } from './stats.js';

type Db = Database.Database;

export interface PromptVersionEval {
  readonly promptVersion: string;
  /** Every firing recorded under this version (attempts), not only shipped ones. */
  readonly firings: number;
  readonly shipped: number;
  readonly passRate: number;
  /** Median `numTurns` across all firings in this version (null with no turn data). */
  readonly medianTurns: number | null;
  /** Population variance of `costUsd` across all firings — a consistency signal
   *  distinct from the median (SOTA-MAP H3's "variance across runs"). */
  readonly costVariance: number | null;
  /** Total cost across all firings in this version ÷ shipped count — what a
   *  solved task actually costs, including failed attempts. Null when nothing shipped. */
  readonly costPerSolved: number | null;
}

function variance(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

interface PromptVersionAccumulator {
  firings: number;
  shipped: number;
  turns: number[];
  costs: number[];
  totalCost: number;
}

/** Shared aggregation for both {@link evalRegressionByPromptVersion} and
 *  {@link evalRegressionOverPinnedSuite} — group `events.payload` rows by
 *  `promptVersion` and reduce each group to the four SOTA-MAP H3 numbers. */
function aggregateEvalRows(rows: readonly { payload: string | null }[]): PromptVersionEval[] {
  const groups = new Map<string, PromptVersionAccumulator>();
  for (const row of rows) {
    if (!row.payload) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      continue;
    }
    const version = parsed['promptVersion'];
    if (typeof version !== 'string' || version.length === 0) continue;

    const group = groups.get(version) ?? {
      firings: 0,
      shipped: 0,
      turns: [],
      costs: [],
      totalCost: 0,
    };
    group.firings += 1;
    if (parsed['shipped'] === true) group.shipped += 1;
    const turns = parsed['numTurns'];
    if (typeof turns === 'number' && Number.isFinite(turns)) group.turns.push(turns);
    const cost = parsed['costUsd'];
    if (typeof cost === 'number' && Number.isFinite(cost)) {
      group.costs.push(cost);
      group.totalCost += cost;
    }
    groups.set(version, group);
  }

  return [...groups.entries()]
    .map(([promptVersion, g]) => ({
      promptVersion,
      firings: g.firings,
      shipped: g.shipped,
      passRate: g.firings > 0 ? g.shipped / g.firings : 0,
      medianTurns: median(g.turns),
      costVariance: variance(g.costs),
      costPerSolved: g.shipped > 0 ? g.totalCost / g.shipped : null,
    }))
    .sort((a, b) => b.firings - a.firings);
}

/**
 * Firings grouped by the `Firing-Prompt-Version` recorded in the engine's own
 * telemetry (`events.payload.promptVersion`, written for every firing — not the
 * git-trailer approach in `scripts/self-study/generate-data.mjs`, which only
 * resolves a version for shipped commits). This is what lets a prompt-version
 * bump be gated on real numbers (SOTA-MAP H3): pass rate, cost variance, median
 * steps, and cost per solved task, reported together, per version.
 *
 * This reads EVERY firing ever recorded under a version — an ad hoc pool that
 * grows on every subsequent firing, so re-running this later never reproduces
 * today's numbers. {@link evalRegressionOverPinnedSuite} is the fixed
 * alternative.
 */
export function evalRegressionByPromptVersion(db: Db, projectId: string): PromptVersionEval[] {
  const rows = db
    .prepare(`SELECT payload FROM events WHERE project_id = ? AND type = 'firing'`)
    .all(projectId) as { payload: string | null }[];
  return aggregateEvalRows(rows);
}

const DEFAULT_VERIFIED_KNOWN_GOOD_FIRINGS_LIMIT = 50;
const MAX_VERIFIED_KNOWN_GOOD_FIRINGS_LIMIT = 200;

/** Clamp a caller-supplied limit to `[1, MAX_VERIFIED_KNOWN_GOOD_FIRINGS_LIMIT]` —
 *  SQLite's `LIMIT` treats a negative bound as "no limit at all," so an
 *  unclamped negative or fractional `limit` would return every verified-good
 *  firing ever recorded instead of the bounded pool this function documents.
 *  Same failure class `orient.ts`'s `clampOrientLengthsLimit`, `search.ts`'s
 *  `clampLimit`, and `read.ts`'s `clampFiringsPage` already guard, including
 *  the `Number.isFinite` check: Math.max/min/floor all propagate NaN, and a
 *  NaN `LIMIT` bind throws "datatype mismatch" in better-sqlite3. */
function clampVerifiedKnownGoodFiringsLimit(limit: number): number {
  const safeLimit = Number.isFinite(limit) ? limit : DEFAULT_VERIFIED_KNOWN_GOOD_FIRINGS_LIMIT;
  return Math.min(Math.max(1, Math.floor(safeLimit)), MAX_VERIFIED_KNOWN_GOOD_FIRINGS_LIMIT);
}

/** One real, mechanically-verified-good historical firing — the unit a
 *  pre-registered eval suite pins (see {@link verifiedKnownGoodFirings}). */
export interface KnownGoodFiring {
  readonly firingId: string;
  readonly item: string | null;
  readonly kind: string | null;
  readonly sha: string | null;
  readonly costUsd: number;
  readonly turns: number;
  readonly createdAt: number;
}

/**
 * Firings whose outcome is independently, mechanically verified rather than
 * self-reported: the gate ran green (`gate_result = 'passed'`), the harness
 * confirmed the named commit SHA exists (`sha_verified`), and confirmed it
 * actually reached HEAD (`head_advanced`). This is the eligible pool SOTA-MAP's
 * "20-50 real tasks from your own repository with known-good outcomes" rule
 * draws from — `scripts/self-study/pin-eval-suite.mjs` freezes a slice of it
 * into `docs/SELF-STUDY/eval-suite.json` so the pool stops drifting once pinned.
 */
export function verifiedKnownGoodFirings(db: Db, projectId: string, limit = 50): KnownGoodFiring[] {
  const safeLimit = clampVerifiedKnownGoodFiringsLimit(limit);
  const rows = db
    .prepare(
      `SELECT firing_id, item, kind, sha, cost_usd, turns, created_at FROM metrics
        WHERE project_id = ? AND gate_result = 'passed' AND sha_verified = 1 AND head_advanced = 1
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .all(projectId, safeLimit) as {
    firing_id: string;
    item: string | null;
    kind: string | null;
    sha: string | null;
    cost_usd: number;
    turns: number;
    created_at: number;
  }[];
  return rows.map((r) => ({
    firingId: r.firing_id,
    item: r.item,
    kind: r.kind,
    sha: r.sha,
    costUsd: r.cost_usd,
    turns: r.turns,
    createdAt: r.created_at,
  }));
}

/**
 * The SOTA-MAP H3 four numbers, computed only over a fixed, pre-registered
 * set of firing ids (the pinned suite) instead of every firing ever recorded.
 * Reproducible over time: unlike {@link evalRegressionByPromptVersion}, running
 * this again next month against the same `firingIds` returns the same numbers,
 * because the population it draws from cannot grow. Empty `firingIds` (no
 * pinned suite yet) returns `[]` rather than falling back to the whole table —
 * silently widening the population would defeat the point of pinning.
 */
export function evalRegressionOverPinnedSuite(
  db: Db,
  projectId: string,
  firingIds: readonly string[],
): PromptVersionEval[] {
  if (firingIds.length === 0) return [];
  const placeholders = firingIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT payload FROM events WHERE project_id = ? AND type = 'firing' AND firing_id IN (${placeholders})`,
    )
    .all(projectId, ...firingIds) as { payload: string | null }[];
  return aggregateEvalRows(rows);
}

/** Who picked the task a firing worked — the grouping key for {@link evalRegressionByPickSource}. */
export type PickSource = 'operator-assigned' | 'self-proposed' | 'free-pick' | 'untracked-item';

/** The same four SOTA-MAP H3 numbers as {@link PromptVersionEval}, grouped by {@link PickSource} instead of prompt version. */
export interface PickSourceEval {
  readonly pickSource: PickSource;
  readonly firings: number;
  readonly shipped: number;
  readonly passRate: number;
  readonly medianTurns: number | null;
  readonly costVariance: number | null;
  readonly costPerSolved: number | null;
}

/** `tasks.source` values that mean an autopilot-mined proposal (the operator still
 *  approved it into 'queued' before any firing could work it — see mutate.ts's
 *  createTask docs — but the TITLE and framing were not human-authored).
 *  `'repo'` (FEATURE-COVERAGE's REACTIVITY §2 "self-generated" assignment
 *  path) belongs here alongside `'backlog'`: both are autopilot-detected from
 *  the repo's own state, not typed by a human. */
function isSelfProposedSource(source: string): boolean {
  return source === 'self' || source === 'backlog' || source === 'repo';
}

/** `tasks.source` values that mean a human authored the task directly —
 *  `'dashboard'` (typed in by the operator), `'inbox'` (dropped a note, see
 *  `inbox-triage.ts`: "the operator already authored it"), `'github'`
 *  (a KEEPER-accepted upstream issue, `issue-triage.ts`: "already
 *  human-authored upstream ... the same way inbox-triage.ts's 'inbox' tasks
 *  do"), and `'chat'` (FEATURE-COVERAGE's REACTIVITY §2 "chat NL→draft" path
 *  — a human's own request, just drafted through a different UI) all skip
 *  the self-proposed approval gate for the same reason. */
function isOperatorAssignedSource(source: string): boolean {
  return source === 'dashboard' || source === 'inbox' || source === 'github' || source === 'chat';
}

function pickSourceOf(item: string | null, taskSource: string | null): PickSource {
  if (item === null) return 'free-pick';
  if (taskSource !== null && isOperatorAssignedSource(taskSource)) return 'operator-assigned';
  if (taskSource !== null && isSelfProposedSource(taskSource)) return 'self-proposed';
  return 'untracked-item';
}

/**
 * Firings grouped by WHO picked the task they worked, not which prompt ran
 * them — the "compare operator-assigned vs self-picked task outcomes" half of
 * the human-vs-agent evaluation slice (backlog web-msniol15-foo6oi).
 * `metrics.item` names the task a firing worked (`NULL` for a pure free pick
 * with no linked task at all); joining to `tasks.source` distinguishes a
 * human-authored board task (`'dashboard'`) from an autopilot-mined proposal
 * the operator still had to approve into 'queued' before it was workable
 * (`'self'`/`'backlog'`) from an item that names no tracked task row at all
 * (`'untracked-item'` — pre-board-era firings, or a since-deleted task).
 *
 * This is NOT the harder half of that backlog item: it says nothing about
 * operator approvals, rejections, edits, or corrections — none of that is
 * captured anywhere in this store yet (see the self-study paper's threats
 * section this feeds, docs/SELF-STUDY/PAPER.md §6).
 */
export function evalRegressionByPickSource(db: Db, projectId: string): PickSourceEval[] {
  const rows = db
    .prepare(
      `SELECT m.item AS item, m.shipped AS shipped, m.cost_usd AS costUsd, m.turns AS turns,
              t.source AS taskSource
         FROM metrics m
         LEFT JOIN tasks t ON t.id = m.item AND t.project_id = m.project_id
        WHERE m.project_id = ?`,
    )
    .all(projectId) as {
    item: string | null;
    shipped: number;
    costUsd: number;
    turns: number;
    taskSource: string | null;
  }[];

  const groups = new Map<PickSource, PromptVersionAccumulator>();
  for (const row of rows) {
    const key = pickSourceOf(row.item, row.taskSource);
    const group = groups.get(key) ?? { firings: 0, shipped: 0, turns: [], costs: [], totalCost: 0 };
    group.firings += 1;
    if (row.shipped === 1) group.shipped += 1;
    if (typeof row.turns === 'number' && Number.isFinite(row.turns)) group.turns.push(row.turns);
    if (typeof row.costUsd === 'number' && Number.isFinite(row.costUsd)) {
      group.costs.push(row.costUsd);
      group.totalCost += row.costUsd;
    }
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([pickSource, g]) => ({
      pickSource,
      firings: g.firings,
      shipped: g.shipped,
      passRate: g.firings > 0 ? g.shipped / g.firings : 0,
      medianTurns: median(g.turns),
      costVariance: variance(g.costs),
      costPerSolved: g.shipped > 0 ? g.totalCost / g.shipped : null,
    }))
    .sort((a, b) => b.firings - a.firings);
}

/** TDD-first compliance on `kind:"fix"` firings (backlog web-msnsxuep-ytwucr) —
 *  whether the firing prompt's "write a FAILING test reproducing the bug
 *  BEFORE the fix" rule was actually followed, per the agent's own self-report. */
export interface TestFirstCompliance {
  /** Every `kind:"fix"` firing recorded, regardless of whether it self-reported. */
  readonly fixFirings: number;
  /** The subset that self-reported `testFirst` one way or the other (excludes
   *  firings that predate the field, or that never emitted a METRICS line at all). */
  readonly reported: number;
  /** `reported` firings that self-reported `testFirst: true`. */
  readonly compliant: number;
  /** `compliant / reported`, or `null` when nothing has reported yet — never
   *  coerced to 0, which would misread "no data" as "no compliance". */
  readonly complianceRate: number | null;
}

/**
 * Aggregate {@link TestFirstCompliance} over every `kind:"fix"` firing recorded
 * for a project, reading the queryable `metrics.test_first` projection (written
 * by `SqliteFiringStore.recordFiring`) rather than re-parsing event payloads —
 * same shape as {@link verifiedKnownGoodFirings}'s plain-SQL-over-`metrics`
 * approach. This is the "telemetry records test-first compliance" half of the
 * backlog item; the prompt-side "requires a FAILING test... BEFORE the fix"
 * half lives in `prompt.ts`'s fix-class TDD rule.
 */
export function testFirstCompliance(db: Db, projectId: string): TestFirstCompliance {
  const rows = db
    .prepare(`SELECT test_first AS testFirst FROM metrics WHERE project_id = ? AND kind = 'fix'`)
    .all(projectId) as { testFirst: number | null }[];
  const fixFirings = rows.length;
  const reported = rows.filter((r) => r.testFirst !== null).length;
  const compliant = rows.filter((r) => r.testFirst === 1).length;
  return {
    fixFirings,
    reported,
    compliant,
    complianceRate: reported > 0 ? compliant / reported : null,
  };
}

/** PICK DISCIPLINE (Goodhart audit — backlog web-msu755l7-mhyvuy) — whether a
 *  firing worked the triage-TOP board task, or recorded an honest reason it
 *  didn't, per the agent's own self-report. */
export interface PickDisciplineAudit {
  /** Firings that self-reported `picked_rank` (linked to a ranked board task;
   *  excludes free picks and firings that predate the field). */
  readonly rankedFirings: number;
  /** `rankedFirings` that worked the triage-TOP task (`picked_rank === 1`). */
  readonly topPicked: number;
  /** `rankedFirings` that deviated (`picked_rank > 1`) AND recorded a `deviation_reason`. */
  readonly justifiedDeviations: number;
  /** `rankedFirings` that deviated with NO recorded reason — the Goodhart
   *  violation this audit exists to surface: comfort-grinding that evades
   *  triage order silently. */
  readonly unjustifiedDeviations: number;
  /** `unjustifiedDeviations / rankedFirings`, or `null` when nothing has
   *  reported yet — never coerced to 0, which would misread "no data" as
   *  "no violations". */
  readonly violationRate: number | null;
}

/**
 * Aggregate {@link PickDisciplineAudit} over every firing recorded for a
 * project that linked to a ranked board task, reading the queryable
 * `metrics.picked_rank` / `metrics.deviation_reason` projection (written by
 * `SqliteFiringStore.recordFiring`) — same shape as {@link testFirstCompliance}.
 */
export function pickDisciplineAudit(db: Db, projectId: string): PickDisciplineAudit {
  const rows = db
    .prepare(
      `SELECT picked_rank AS pickedRank, deviation_reason AS deviationReason
         FROM metrics WHERE project_id = ? AND picked_rank IS NOT NULL`,
    )
    .all(projectId) as { pickedRank: number; deviationReason: string | null }[];
  const rankedFirings = rows.length;
  const topPicked = rows.filter((r) => r.pickedRank === 1).length;
  const deviations = rows.filter((r) => r.pickedRank !== 1);
  const justifiedDeviations = deviations.filter(
    (r) => r.deviationReason !== null && r.deviationReason.trim() !== '',
  ).length;
  const unjustifiedDeviations = deviations.length - justifiedDeviations;
  return {
    rankedFirings,
    topPicked,
    justifiedDeviations,
    unjustifiedDeviations,
    violationRate: rankedFirings > 0 ? unjustifiedDeviations / rankedFirings : null,
  };
}

/** BOARD DIVERSITY audit (backlog web-mtb8i2s3-wd3rod) — whether deviations from
 *  the triage-TOP task keep landing on the SAME board item instead of rotating.
 *  {@link pickDisciplineAudit} only checks that a deviation carried SOME reason;
 *  a firing can honestly supply a fresh-reading `deviation_reason` on every one
 *  of many consecutive firings and still be comfort-picking the same easy item
 *  over and over — that pattern is invisible to a justified/unjustified split
 *  and needs its own measure. */
export interface BoardDiversityAudit {
  /** Ranked firings that deviated from the triage-TOP task AND named the board
   *  item they worked instead — the population this audit measures. */
  readonly deviatedFirings: number;
  /** Distinct item ids among `deviatedFirings` — low relative to that count
   *  means deviations keep re-landing on a small set of items. */
  readonly distinctItems: number;
  /** Longest run of consecutive `deviatedFirings` (ordered by `created_at`)
   *  that named the identical item — the comfort-picking signal itself. */
  readonly longestSameItemStreak: number;
  /** The item id behind `longestSameItemStreak`, or `null` when there were no
   *  deviated firings to measure. */
  readonly mostRepeatedItem: string | null;
}

/**
 * Aggregate {@link BoardDiversityAudit} over every deviated, item-tagged firing
 * recorded for a project, reading the same queryable `metrics.picked_rank` /
 * `metrics.item` projection {@link pickDisciplineAudit} reads, ordered by
 * `created_at` so consecutive-streak detection reflects firing order.
 */
export function boardDiversityAudit(db: Db, projectId: string): BoardDiversityAudit {
  const rows = db
    .prepare(
      `SELECT item FROM metrics
         WHERE project_id = ? AND picked_rank IS NOT NULL AND picked_rank != 1 AND item IS NOT NULL
         ORDER BY created_at ASC, id ASC`,
    )
    .all(projectId) as { item: string }[];

  const deviatedFirings = rows.length;
  const distinctItems = new Set(rows.map((r) => r.item)).size;

  let longestSameItemStreak = 0;
  let mostRepeatedItem: string | null = null;
  let currentItem: string | null = null;
  let currentStreak = 0;
  for (const row of rows) {
    currentStreak = row.item === currentItem ? currentStreak + 1 : 1;
    currentItem = row.item;
    if (currentStreak > longestSameItemStreak) {
      longestSameItemStreak = currentStreak;
      mostRepeatedItem = currentItem;
    }
  }

  return { deviatedFirings, distinctItems, longestSameItemStreak, mostRepeatedItem };
}

/** A gate check whose label matches one of the kinds `fly.ts`'s `PARALLEL_GATE_KINDS`
 *  marks `parallel: true` (typecheck/lint/format — see gateParallelSavings below). */
const PARALLEL_LABEL_SUBSTRINGS = ['typecheck', 'lint', 'format'] as const;

function isParallelEligibleLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return PARALLEL_LABEL_SUBSTRINGS.some((s) => lower.includes(s));
}

export interface GateParallelSavings {
  /** Firings with ≥2 parallel-eligible checks recorded — the only ones a
   *  concurrent-vs-sequential comparison is meaningful for. */
  readonly sampledFirings: number;
  /** Sum of every parallel-eligible check's own `durationMs` — what the gate
   *  would have cost running those checks one after another. */
  readonly sequentialMs: number;
  /** Sum, per sampled firing, of the SLOWEST parallel-eligible check's
   *  `durationMs` — the real wall-clock a concurrent batch actually takes
   *  (bounded below by its slowest member, not their total). */
  readonly observedMs: number;
  /** `sequentialMs - observedMs` — the measured wall-clock saved by running
   *  typecheck/lint/format concurrently instead of one after another. */
  readonly savedMs: number;
  /** `savedMs / sequentialMs`, or `null` with no sampled firings. */
  readonly savedPct: number | null;
}

/**
 * Measures the real wall-clock savings from running the gate's typecheck/
 * lint/format steps concurrently (`fly.ts`'s `PARALLEL_GATE_KINDS`,
 * BACKLOG web-msnt26tn-jvyihy "PARALLEL GATE + test-impact") instead of
 * sequentially. `GateRunner` already times every check independently
 * (`GateCheckResult.durationMs`) and persists the full list in each firing's
 * `events.payload` — this re-derives the counterfactual sequential cost
 * (sum of the parallel-eligible checks' own durations) and compares it
 * against the real observed cost (their max, since they ran concurrently),
 * from that already-collected telemetry. No live gate behavior changes;
 * this only reads history to prove the change that already shipped worked.
 * A firing with fewer than 2 parallel-eligible checks (predates the change,
 * or a gate missing typecheck/lint/format entirely) contributes nothing —
 * there is no concurrency to measure.
 */
export function gateParallelSavings(db: Db, projectId: string): GateParallelSavings {
  const rows = db
    .prepare(`SELECT payload FROM events WHERE project_id = ? AND type = 'firing'`)
    .all(projectId) as { payload: string | null }[];

  let sampledFirings = 0;
  let sequentialMs = 0;
  let observedMs = 0;
  for (const row of rows) {
    if (!row.payload) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      continue;
    }
    const checks = parsed['gateChecks'];
    if (!Array.isArray(checks)) continue;
    const durations = checks
      .filter(
        (c): c is { label: string; durationMs: number } =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as { label?: unknown }).label === 'string' &&
          isParallelEligibleLabel((c as { label: string }).label) &&
          typeof (c as { durationMs?: unknown }).durationMs === 'number',
      )
      .map((c) => c.durationMs);
    if (durations.length < 2) continue;
    sampledFirings += 1;
    sequentialMs += durations.reduce((sum, d) => sum + d, 0);
    observedMs += Math.max(...durations);
  }

  const savedMs = sequentialMs - observedMs;
  return {
    sampledFirings,
    sequentialMs,
    observedMs,
    savedMs,
    savedPct: sequentialMs > 0 ? savedMs / sequentialMs : null,
  };
}

/** Tolerances `evaluatePromptVersionGate` judges a candidate prompt version against —
 *  a regression past any one of these fails the gate. */
export interface PromptVersionGateThresholds {
  /** Below this many pinned-suite firings, the candidate is judged "not enough data yet"
   *  rather than pass/fail — a single lucky or unlucky firing should not decide a gate. */
  readonly minSampleSize: number;
  /** Absolute drop in pass rate (0-1) tolerated vs. the baseline, e.g. 0.15 = 15 points. */
  readonly maxPassRateDrop: number;
  /** Fractional increase in cost-per-solved-task tolerated vs. the baseline, e.g. 0.25 = 25%. */
  readonly maxCostIncreaseRatio: number;
  /** Fractional increase in median turns tolerated vs. the baseline, e.g. 0.25 = 25%. */
  readonly maxTurnsIncreaseRatio: number;
}

export const DEFAULT_PROMPT_VERSION_GATE_THRESHOLDS: PromptVersionGateThresholds = {
  minSampleSize: 3,
  maxPassRateDrop: 0.15,
  maxCostIncreaseRatio: 0.25,
  maxTurnsIncreaseRatio: 0.25,
};

/** Verdict from {@link evaluatePromptVersionGate} — `ok: true` with a non-empty `reasons`
 *  means the gate passed but with a caveat (e.g. insufficient sample, no baseline yet), not
 *  a clean bill of health; only `ok: false` should ever block a bump. */
export interface PromptVersionGateResult {
  readonly ok: boolean;
  readonly candidate: string;
  readonly baseline: string | null;
  readonly reasons: readonly string[];
}

/**
 * Judges whether `candidate` (the prompt version about to be bumped to/already shipping)
 * regressed against `baseline` (the prior version with the most measured firings) on any of
 * the SOTA-MAP H3 numbers {@link aggregateEvalRows} computes — pass rate, cost per solved
 * task, and median turns. This is the missing enforcement half of `evalRegressionOverPinnedSuite`:
 * that function can *report* the four numbers together, but nothing previously turned a
 * regression into a blocking decision (`docs/MODEL-CARD.md` §6, `scripts/self-study/check-prompt-gate.mjs`).
 *
 * Deliberately conservative: with no baseline (first-ever measured version) or too few
 * candidate firings to trust, this returns `ok: true` rather than blocking on noise — see
 * `reasons` for why in that case.
 */
export function evaluatePromptVersionGate(
  candidate: PromptVersionEval,
  baseline: PromptVersionEval | null,
  thresholds: PromptVersionGateThresholds = DEFAULT_PROMPT_VERSION_GATE_THRESHOLDS,
): PromptVersionGateResult {
  const result = (ok: boolean, reasons: readonly string[]): PromptVersionGateResult => ({
    ok,
    candidate: candidate.promptVersion,
    baseline: baseline?.promptVersion ?? null,
    reasons,
  });

  if (candidate.firings < thresholds.minSampleSize) {
    return result(true, [
      `insufficient sample (${candidate.firings} firing(s) < ${thresholds.minSampleSize} minimum) — provisional pass, cannot yet judge "${candidate.promptVersion}"`,
    ]);
  }
  if (!baseline) {
    return result(true, [
      `no prior version with pinned-suite data to compare "${candidate.promptVersion}" against — provisional pass`,
    ]);
  }

  const reasons: string[] = [];

  const passRateDrop = baseline.passRate - candidate.passRate;
  if (passRateDrop > thresholds.maxPassRateDrop) {
    reasons.push(
      `pass rate dropped ${(passRateDrop * 100).toFixed(1)} pts (${(baseline.passRate * 100).toFixed(1)}% -> ${(candidate.passRate * 100).toFixed(1)}%), exceeds the ${(thresholds.maxPassRateDrop * 100).toFixed(0)}pt tolerance`,
    );
  }

  if (
    baseline.costPerSolved !== null &&
    candidate.costPerSolved !== null &&
    baseline.costPerSolved > 0
  ) {
    const increase = (candidate.costPerSolved - baseline.costPerSolved) / baseline.costPerSolved;
    if (increase > thresholds.maxCostIncreaseRatio) {
      reasons.push(
        `cost/solved rose ${(increase * 100).toFixed(1)}% ($${baseline.costPerSolved.toFixed(2)} -> $${candidate.costPerSolved.toFixed(2)}), exceeds the ${(thresholds.maxCostIncreaseRatio * 100).toFixed(0)}% tolerance`,
      );
    }
  }

  if (baseline.medianTurns !== null && candidate.medianTurns !== null && baseline.medianTurns > 0) {
    const increase = (candidate.medianTurns - baseline.medianTurns) / baseline.medianTurns;
    if (increase > thresholds.maxTurnsIncreaseRatio) {
      reasons.push(
        `median turns rose ${(increase * 100).toFixed(1)}% (${baseline.medianTurns} -> ${candidate.medianTurns}), exceeds the ${(thresholds.maxTurnsIncreaseRatio * 100).toFixed(0)}% tolerance`,
      );
    }
  }

  return result(reasons.length === 0, reasons);
}
