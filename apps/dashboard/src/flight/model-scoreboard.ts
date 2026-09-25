// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE MODEL SCOREBOARD (operator, 2026-09-25): the fleet benchmarks its own
 * models and staffs each tier from the result — and keeps doing so when new
 * models ship.
 *
 * Every routing decision is recorded (`model-route` event: task, tier, the
 * alias asked for). A firing is matched to the latest decision for its task,
 * so each tier gets its own scoreboard of the models that actually served it
 * — keyed by the SERVED model id (`claude-opus-5-5`), not the alias. When an
 * alias starts serving a newer model, that id has no record yet, and the
 * tier explores it again on its own; no one has to notice the launch.
 *
 * The policy, per tier, over its candidate aliases:
 *   - EXPLORE while any candidate's current model has fewer than
 *     {@link MIN_ARM_FIRINGS} firings in the tier: tasks spread evenly across
 *     the candidates by a stable hash, so every arm gets data on the same
 *     mix of work.
 *   - EXPLOIT once all have: the LEADER is the cheapest per shipped commit
 *     among the candidates whose ship rate is within
 *     {@link SHIP_RATE_TOLERANCE} of the best. It takes the tier; one task in
 *     {@link WATCH_ONE_IN} still goes to another candidate, so a model that
 *     improves or degrades is seen.
 * This is the rule the operator set: Opus takes a tier if its ship rate is
 * within 5 points and its cost per ship is lower.
 */

import type { Store } from '@autopilot/store';
import { taskHash } from './model-routing.js';
import type { ModelTier } from './model-routing.js';

/** Firings a model needs in a tier before its numbers are trusted. */
export const MIN_ARM_FIRINGS = 15;
/** How far below the best ship rate a cheaper model may sit and still lead. */
export const SHIP_RATE_TOLERANCE = 0.05;
/** In the exploit phase, one task in this many watches a non-leader. */
export const WATCH_ONE_IN = 5;
/** How far back the scoreboard reads. */
export const SCOREBOARD_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** The aliases each tier chooses between. The CLI resolves an alias to the
 *  family's newest model, so a launch reaches a tier without a code change. */
export const TIER_CANDIDATES: Readonly<Record<ModelTier, readonly string[]>> = {
  escalated: ['fable', 'opus'],
  default: ['sonnet', 'opus'],
  mechanical: ['haiku', 'sonnet'],
};

export interface ArmStats {
  /** The model id this alias serves now — the one the stats belong to. */
  readonly modelId: string | null;
  readonly firings: number;
  readonly shipped: number;
  readonly costUsd: number;
}

export interface RoutedFiring {
  readonly tier: ModelTier;
  readonly modelId: string;
  readonly shipped: boolean;
  readonly costUsd: number;
}

export interface ModelChoice {
  readonly model: string;
  readonly phase: 'explore' | 'exploit';
  readonly reason: string;
}

/** The alias family a served model id belongs to: `claude-opus-5-5` → `opus`. */
export function aliasOf(modelId: string): string | null {
  const id = modelId.toLowerCase();
  for (const alias of ['fable', 'opus', 'sonnet', 'haiku']) {
    if (id.includes(alias)) return alias;
  }
  return null;
}

/**
 * Per alias, the stats of the model it serves NOW in `tier`: the most recent
 * served id of that family is its current model, and only firings of that
 * id count — an older version's record does not vouch for a newer one.
 */
export function tierStats(
  firings: readonly RoutedFiring[],
  tier: ModelTier,
  candidates: readonly string[],
): Map<string, ArmStats> {
  const stats = new Map<string, ArmStats>();
  for (const alias of candidates) {
    const ofAlias = firings.filter((f) => aliasOf(f.modelId) === alias);
    const current = ofAlias.length === 0 ? null : ofAlias[ofAlias.length - 1]!.modelId;
    const counted = firings.filter((f) => f.tier === tier && f.modelId === current);
    stats.set(alias, {
      modelId: current,
      firings: counted.length,
      shipped: counted.filter((f) => f.shipped).length,
      costUsd: counted.reduce((sum, f) => sum + f.costUsd, 0),
    });
  }
  return stats;
}

function shipRate(s: ArmStats): number {
  return s.firings === 0 ? 0 : s.shipped / s.firings;
}

function costPerShip(s: ArmStats): number {
  return s.shipped === 0 ? Number.POSITIVE_INFINITY : s.costUsd / s.shipped;
}

/** The leader among fully measured candidates, by the operator's rule. */
export function leaderOf(stats: ReadonlyMap<string, ArmStats>): string {
  const arms = [...stats.entries()];
  const best = Math.max(...arms.map(([, s]) => shipRate(s)));
  const eligible = arms.filter(([, s]) => shipRate(s) >= best - SHIP_RATE_TOLERANCE);
  eligible.sort((a, b) => costPerShip(a[1]) - costPerShip(b[1]) || a[0].localeCompare(b[0]));
  return eligible[0]![0];
}

/** The model for one task in one tier. Stable per task. */
export function chooseModel(
  tier: ModelTier,
  taskId: string,
  stats: ReadonlyMap<string, ArmStats>,
): ModelChoice {
  const candidates = [...stats.keys()];
  const hash = taskHash(`${tier}:${taskId}`);
  const thin = candidates.filter((alias) => stats.get(alias)!.firings < MIN_ARM_FIRINGS);
  if (thin.length > 0) {
    const model = candidates[hash % candidates.length]!;
    return {
      model,
      phase: 'explore',
      reason: `exploring: ${thin.map((a) => `${a} ${stats.get(a)!.firings}/${MIN_ARM_FIRINGS}`).join(', ')}`,
    };
  }
  const leader = leaderOf(stats);
  const others = candidates.filter((a) => a !== leader);
  if (others.length > 0 && hash % WATCH_ONE_IN === 0) {
    const model = others[(hash >>> 3) % others.length]!;
    return { model, phase: 'exploit', reason: `watching ${model} beside the leader ${leader}` };
  }
  const s = stats.get(leader)!;
  return {
    model: leader,
    phase: 'exploit',
    reason: `leader ${leader} (${s.modelId}): ${Math.round(shipRate(s) * 100)}% shipped, $${costPerShip(s).toFixed(2)} per ship`,
  };
}

/** Records the routing decision a firing is about to fly under. */
export function recordModelRoute(
  store: Store,
  projectId: string,
  route: {
    readonly taskId: string;
    readonly tier: ModelTier;
    readonly model: string;
    readonly lane?: string;
  },
  now: number,
): void {
  store.db
    .prepare(
      'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
    )
    .run(projectId, 'model-route', JSON.stringify(route), now);
}

/**
 * Every firing in the window matched to the latest routing decision for its
 * task at or before it — the rows the scoreboard counts. Firings with no
 * recorded decision (before the scoreboard existed) are left out.
 */
/** The lane a firing flew in, from its id: `base`, or the `fleet-N` suffix. */
export function laneOfFiring(firingId: string): string {
  const head = firingId.split(':', 1)[0] ?? '';
  const at = head.indexOf('--');
  return at === -1 ? 'base' : head.slice(at + 2);
}

/** A routing decision stays the one a lane's firing flew under for this long. */
const ROUTE_MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * Every firing in the window matched to the routing decision it flew under —
 * the rows the scoreboard counts. A firing is matched to the latest decision
 * its OWN LANE recorded before it (2026-09-26: matching by the task a firing
 * reported missed two of five Opus firings in one round, because a firing
 * does not always report the task it was routed for). Decisions recorded
 * before lanes were named fall back to the task id. Firings with no decision
 * (before the scoreboard existed) are left out.
 */
export function readRoutedFirings(store: Store, projectId: string, now: number): RoutedFiring[] {
  const since = now - SCOREBOARD_WINDOW_MS;
  const routes = store.db
    .prepare(
      `SELECT payload, created_at AS at FROM events
        WHERE project_id = ? AND type = 'model-route' AND created_at >= ?
        ORDER BY created_at`,
    )
    .all(projectId, since) as { payload: string; at: number }[];
  const byLane = new Map<string, { tier: ModelTier; at: number }[]>();
  const byTask = new Map<string, { tier: ModelTier; at: number }[]>();
  for (const r of routes) {
    try {
      const p = JSON.parse(r.payload) as { taskId?: unknown; tier?: unknown; lane?: unknown };
      if (typeof p.tier !== 'string') continue;
      const decision = { tier: p.tier as ModelTier, at: r.at };
      if (typeof p.lane === 'string') {
        byLane.set(p.lane, [...(byLane.get(p.lane) ?? []), decision]);
      } else if (typeof p.taskId === 'string') {
        byTask.set(p.taskId, [...(byTask.get(p.taskId) ?? []), decision]);
      }
    } catch {
      /* a malformed row is skipped */
    }
  }
  const rows = store.db
    .prepare(
      `SELECT firing_id AS firingId, item, model, shipped, cost_usd AS costUsd, created_at AS at
         FROM metrics
        WHERE project_id = ? AND created_at >= ? AND model IS NOT NULL
        ORDER BY created_at, id`,
    )
    .all(projectId, since) as {
    firingId: string;
    item: string | null;
    model: string;
    shipped: number;
    costUsd: number;
    at: number;
  }[];
  const latestBefore = (
    list: readonly { tier: ModelTier; at: number }[] | undefined,
    at: number,
  ): { tier: ModelTier; at: number } | undefined => {
    const before = (list ?? []).filter((d) => d.at <= at && at - d.at <= ROUTE_MATCH_WINDOW_MS);
    return before[before.length - 1];
  };
  const out: RoutedFiring[] = [];
  for (const row of rows) {
    const decision =
      latestBefore(byLane.get(laneOfFiring(row.firingId)), row.at) ??
      (row.item === null ? undefined : latestBefore(byTask.get(row.item), row.at));
    if (!decision) continue;
    out.push({
      tier: decision.tier,
      modelId: row.model,
      shipped: row.shipped === 1,
      costUsd: row.costUsd,
    });
  }
  return out;
}

/** The env var that pins a tier to one model, when set — routing is a
 *  default, never a lock-out. `AUTOPILOT_MODEL` pins every tier. */
export function tierOverride(tier: ModelTier, env: NodeJS.ProcessEnv): string | undefined {
  const specific = {
    escalated: env['AUTOPILOT_ESCALATED_MODEL'],
    default: env['AUTOPILOT_DEFAULT_MODEL'],
    mechanical: env['AUTOPILOT_MECHANICAL_MODEL'],
  }[tier];
  return env['AUTOPILOT_MODEL'] || specific || undefined;
}

/**
 * The model one task flies under, and why — the override if one is set,
 * otherwise the scoreboard's choice. The decision is recorded so the
 * scoreboard can count the firing it produces.
 */
export function routeTaskModel(
  store: Store,
  projectId: string,
  tier: ModelTier,
  taskId: string,
  env: NodeJS.ProcessEnv,
  now: number,
  lane = 'base',
): ModelChoice {
  const pinned = tierOverride(tier, env);
  const choice: ModelChoice =
    pinned !== undefined
      ? { model: pinned, phase: 'exploit', reason: 'pinned by the operator' }
      : chooseModel(
          tier,
          taskId,
          tierStats(readRoutedFirings(store, projectId, now), tier, TIER_CANDIDATES[tier]),
        );
  recordModelRoute(store, projectId, { taskId, tier, model: choice.model, lane }, now);
  return choice;
}

/** The scoreboard as printable lines, one block per tier. */
export function renderScoreboard(firings: readonly RoutedFiring[]): string[] {
  const lines = ['model scoreboard (by tier, current model of each alias)'];
  for (const tier of Object.keys(TIER_CANDIDATES) as ModelTier[]) {
    const stats = tierStats(firings, tier, TIER_CANDIDATES[tier]);
    const measured = [...stats.values()].every((s) => s.firings >= MIN_ARM_FIRINGS);
    lines.push(`  ${tier}: ${measured ? `leader ${leaderOf(stats)}` : 'exploring'}`);
    for (const [alias, s] of stats) {
      const rate = s.firings === 0 ? '-' : `${Math.round(shipRate(s) * 100)}%`;
      const per = s.shipped === 0 ? '-' : `$${costPerShip(s).toFixed(2)}`;
      lines.push(
        `    ${alias.padEnd(7)} ${(s.modelId ?? 'not served yet').padEnd(28)} ` +
          `${String(s.firings).padStart(3)}/${MIN_ARM_FIRINGS} firings  shipped ${rate.padStart(4)}  per ship ${per}`,
      );
    }
  }
  return lines;
}
