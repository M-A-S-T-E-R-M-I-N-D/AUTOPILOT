// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WARM SESSIONS' measurable-win instrument (epic 0009, board item
 * web-msnt26so-0c6tje): the SQL correlation the v15 migration comment promised —
 * `metrics.resumed` against `input_tokens`/`cache_read_tokens`/`cost_usd` — so
 * the epic's still-open acceptance criterion ("a resumed firing paying less
 * than a cold one for the same repeated context") can be answered from
 * telemetry the engine already writes, not assumed. Store-layer half, same
 * split as `dora.ts`; both UX-EXPRESSION surfaces are wired: the fleet-home
 * dashboard tile (`apps/dashboard/src/web/stat-tiles.ts`'s
 * `warmSessionTileItems`) and the PAPER "Warm-session savings" table
 * (`scripts/self-study/generate-data.mjs`'s `renderWarmSessionSavings`).
 *
 * {@link extendedFiringSavings} is the same correlation for the OTHER
 * mechanism epic 0009 narrowed resume down to: a bounded FINISH-LINE
 * EXTENSION self-resume (`firing.ts`'s `finishLineCaps`/`finishLinePrompt`),
 * now that migration v17 projects `record.extended` into queryable
 * `metrics.extended` instead of leaving it stranded in the raw `events` JSON.
 * Its verdict reader is the flight-end PAPER refresh
 * (`scripts/self-study/generate-data.mjs`'s `renderExtendedFiringSavings`):
 * a one-line pending status while the extended group is still empty, the
 * full comparison table the moment it is non-empty. The fleet-home tile
 * stays deferred until that table actually shows a non-empty group —
 * wiring a tile for an always-empty group would be premature.
 */

import type Database from 'better-sqlite3';

type Db = Database.Database;

/** One resume-disposition group's per-firing averages — null-averaged, never
 *  zero-coerced, so an empty group reads as "no data" rather than "free". */
export interface WarmSessionGroupStats {
  readonly firings: number;
  /** Mean `input_tokens` — the fresh (uncached) input a firing paid. */
  readonly avgFreshInputTokens: number | null;
  readonly avgCacheReadTokens: number | null;
  readonly avgCacheWriteTokens: number | null;
  readonly avgCostUsd: number | null;
  readonly avgTurns: number | null;
  /** Mean of each firing's OWN `cost_usd / turns` ratio — not group-total cost
   *  over group-total turns, which would collapse a mix of cheap-short and
   *  expensive-long firings into one misleading average. The confound-controlled
   *  metric epic 0009 still needed: raw `avgCostUsd` conflates resume's effect
   *  with the fact that resumed and cold firings run very different turn counts
   *  (11.6 vs 52.0 observed). A zero-turn firing contributes nothing (undefined
   *  ratio, not a divide-by-zero). */
  readonly avgCostPerTurn: number | null;
}

export interface WarmSessionSavings {
  /** Firings that actually ran on a resumed CLI session (`resumed = 1`). */
  readonly resumed: WarmSessionGroupStats;
  /** Firings that REQUESTED a resume but fell back to a cold spawn at the CLI
   *  level (`resumed = 0`) — cold work that also paid a failed resume attempt,
   *  kept out of both other groups so it can't flatter either side. */
  readonly coldFallback: WarmSessionGroupStats;
  /** Ordinary cold spawns that never requested a resume (`resumed IS NULL`) —
   *  the baseline, including all pre-warm-sessions history. */
  readonly cold: WarmSessionGroupStats;
  /** `cold.avgFreshInputTokens - resumed.avgFreshInputTokens` — positive means
   *  a resumed firing re-sends less context fresh. Null until BOTH groups have
   *  at least one firing (a one-sided average is not a comparison). */
  readonly freshInputDeltaPerFiring: number | null;
  /** `cold.avgCostUsd - resumed.avgCostUsd` — positive means a resumed firing
   *  is cheaper. Same both-sides-populated rule as the fresh-input delta. */
  readonly costDeltaPerFiring: number | null;
  /** `cold.avgCostPerTurn - resumed.avgCostPerTurn` — the confound-controlled
   *  counterpart to {@link costDeltaPerFiring}: it can disagree with the raw
   *  per-firing delta when the two groups run very different average turn
   *  counts (the epic 0009 finding this metric exists to isolate). Same
   *  both-sides-populated rule. */
  readonly costPerTurnDeltaPerFiring: number | null;
}

const EMPTY_GROUP: WarmSessionGroupStats = {
  firings: 0,
  avgFreshInputTokens: null,
  avgCacheReadTokens: null,
  avgCacheWriteTokens: null,
  avgCostUsd: null,
  avgTurns: null,
  avgCostPerTurn: null,
};

type GroupKey = 'resumed' | 'coldFallback' | 'cold';

interface GroupRow extends WarmSessionGroupStats {
  readonly grp: GroupKey;
}

function delta(cold: number | null, resumed: number | null): number | null {
  return cold !== null && resumed !== null ? cold - resumed : null;
}

/**
 * Per-firing cost anatomy grouped by resume disposition, over a project's full
 * recorded history. Reads the queryable `metrics.resumed` projection (written
 * by `SqliteFiringStore.recordFiring`) — same plain-SQL-over-`metrics` shape as
 * `testFirstCompliance`. The deltas compare `resumed` against `cold` only:
 * fallback firings are cold spawns wearing a resume attempt's error, so folding
 * them into the baseline would double-count the failure mode being measured.
 */
export function warmSessionSavings(db: Db, projectId: string): WarmSessionSavings {
  const rows = db
    .prepare(
      `SELECT CASE WHEN resumed = 1 THEN 'resumed'
                   WHEN resumed = 0 THEN 'coldFallback'
                   ELSE 'cold' END AS grp,
              COUNT(*) AS firings,
              AVG(input_tokens) AS avgFreshInputTokens,
              AVG(cache_read_tokens) AS avgCacheReadTokens,
              AVG(cache_write_tokens) AS avgCacheWriteTokens,
              AVG(cost_usd) AS avgCostUsd,
              AVG(turns) AS avgTurns,
              AVG(CASE WHEN turns > 0 THEN CAST(cost_usd AS REAL) / turns END) AS avgCostPerTurn
         FROM metrics
        WHERE project_id = ?
        GROUP BY grp`,
    )
    .all(projectId) as GroupRow[];

  const groups: Record<GroupKey, WarmSessionGroupStats> = {
    resumed: EMPTY_GROUP,
    coldFallback: EMPTY_GROUP,
    cold: EMPTY_GROUP,
  };
  for (const { grp, ...stats } of rows) groups[grp] = stats;

  return {
    ...groups,
    freshInputDeltaPerFiring: delta(
      groups.cold.avgFreshInputTokens,
      groups.resumed.avgFreshInputTokens,
    ),
    costDeltaPerFiring: delta(groups.cold.avgCostUsd, groups.resumed.avgCostUsd),
    costPerTurnDeltaPerFiring: delta(groups.cold.avgCostPerTurn, groups.resumed.avgCostPerTurn),
  };
}

export interface ExtendedFiringSavings {
  /** Firings that got a bounded FINISH-LINE EXTENSION self-resume to close
   *  out a unit (`metrics.extended = 1`). */
  readonly extended: WarmSessionGroupStats;
  /** Every other recorded firing (`metrics.extended IS NULL`) — the baseline
   *  an extension is compared against, including all pre-v17 history. */
  readonly ordinary: WarmSessionGroupStats;
  /** `ordinary.avgCostUsd - extended.avgCostUsd` — positive means an extended
   *  firing costs less than an ordinary one. Null until both groups have at
   *  least one firing (a one-sided average is not a comparison). */
  readonly costDeltaPerFiring: number | null;
  /** Confound-controlled counterpart, same "average of each firing's OWN
   *  cost/turns ratio" rule as {@link WarmSessionSavings.costPerTurnDeltaPerFiring}
   *  — an extension adds a bounded number of turns on top of an already-long
   *  firing, so a raw per-firing cost delta can mislead the same way the
   *  resumed-vs-cold comparison's did before this metric existed. */
  readonly costPerTurnDeltaPerFiring: number | null;
}

type ExtendedGroupKey = 'extended' | 'ordinary';

interface ExtendedGroupRow extends WarmSessionGroupStats {
  readonly grp: ExtendedGroupKey;
}

/**
 * Per-firing cost anatomy grouped by FINISH-LINE EXTENSION disposition, over
 * a project's full recorded history — the epic 0009 "remaining open slice"
 * instrument: once enough extended firings have landed since migration v17,
 * this answers whether extension is actually cheaper than a checkpoint
 * hand-off (a died-mid-unit firing packing up, then a fresh firing re-paying
 * ORIENT to finish it) would have been.
 */
export function extendedFiringSavings(db: Db, projectId: string): ExtendedFiringSavings {
  const rows = db
    .prepare(
      `SELECT CASE WHEN extended = 1 THEN 'extended' ELSE 'ordinary' END AS grp,
              COUNT(*) AS firings,
              AVG(input_tokens) AS avgFreshInputTokens,
              AVG(cache_read_tokens) AS avgCacheReadTokens,
              AVG(cache_write_tokens) AS avgCacheWriteTokens,
              AVG(cost_usd) AS avgCostUsd,
              AVG(turns) AS avgTurns,
              AVG(CASE WHEN turns > 0 THEN CAST(cost_usd AS REAL) / turns END) AS avgCostPerTurn
         FROM metrics
        WHERE project_id = ?
        GROUP BY grp`,
    )
    .all(projectId) as ExtendedGroupRow[];

  const groups: Record<ExtendedGroupKey, WarmSessionGroupStats> = {
    extended: EMPTY_GROUP,
    ordinary: EMPTY_GROUP,
  };
  for (const { grp, ...stats } of rows) groups[grp] = stats;

  return {
    ...groups,
    costDeltaPerFiring: delta(groups.ordinary.avgCostUsd, groups.extended.avgCostUsd),
    costPerTurnDeltaPerFiring: delta(
      groups.ordinary.avgCostPerTurn,
      groups.extended.avgCostPerTurn,
    ),
  };
}
