// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE BENCHMARK (operator, 2026-09-26): how every model the fleet has flown
 * performs with AUTOPILOT, from its own firings — a permanent page, before
 * 1.0, that will compare providers side by side as more of them fly.
 *
 * Everything here is read from what the fleet already records: one metrics
 * row per firing (served model, cost, duration, turns, shipped), its firing
 * record (how it died, if it did), and the model scoreboard's routing
 * decisions (flight/model-scoreboard.ts). Nothing is estimated; a model with
 * no firings is simply absent. Grouped by the SERVED model id, so a newer
 * model behind an old alias is its own row, and by vendor, so a second
 * provider is a second colour on the same charts.
 */

import { existsSync } from 'node:fs';
import { listProjects, openStore, type Store } from '@autopilot/store';
import { describeModel, resolveModelVendor } from '@autopilot/engine';
import { parseFiringDeath } from './source.js';
import {
  MIN_ARM_FIRINGS,
  SHIP_RATE_TOLERANCE,
  TIER_CANDIDATES,
  WATCH_ONE_IN,
  leaderOf,
  readRoutedFirings,
  tierStats,
  type RoutedFiring,
} from '../flight/model-scoreboard.js';
import type { ModelTier } from '../flight/model-routing.js';

export interface BenchmarkModel {
  readonly modelId: string;
  readonly label: string;
  readonly vendor: string;
  readonly vendorId: string;
  readonly firings: number;
  readonly shipped: number;
  readonly died: number;
  readonly costUsd: number;
  /** `null` when nothing shipped — a cost per zero ships is not a number. */
  readonly costPerShipUsd: number | null;
  readonly shipRate: number;
  readonly medianMinutes: number;
  readonly medianTurns: number;
  readonly firstAt: number;
  readonly lastAt: number;
}

/** One firing, for the firing-level scatter. */
export interface BenchmarkPoint {
  readonly modelId: string;
  readonly costUsd: number;
  readonly minutes: number;
  readonly turns: number;
  readonly outcome: 'shipped' | 'died' | 'no-ship';
  readonly at: number;
}

export interface BenchmarkArm {
  readonly alias: string;
  readonly modelId: string | null;
  readonly firings: number;
  readonly shipped: number;
  readonly shipRate: number | null;
  readonly costPerShipUsd: number | null;
}

export interface BenchmarkTier {
  readonly tier: ModelTier;
  readonly phase: 'explore' | 'exploit';
  readonly leader: string | null;
  readonly arms: readonly BenchmarkArm[];
}

export interface BenchmarkPayload {
  readonly generatedAt: number;
  readonly windowDays: number;
  readonly models: readonly BenchmarkModel[];
  readonly points: readonly BenchmarkPoint[];
  readonly tiers: readonly BenchmarkTier[];
  readonly rule: {
    readonly minFirings: number;
    readonly shipRateTolerance: number;
    readonly watchOneIn: number;
  };
}

/** One firing as the benchmark reads it. */
export interface BenchmarkFiring {
  readonly modelId: string;
  readonly shipped: boolean;
  readonly died: boolean;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly turns: number;
  readonly at: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Per served model, most firings first. */
export function summarizeModels(firings: readonly BenchmarkFiring[]): BenchmarkModel[] {
  const byModel = new Map<string, BenchmarkFiring[]>();
  for (const f of firings) byModel.set(f.modelId, [...(byModel.get(f.modelId) ?? []), f]);
  const rows = [...byModel.entries()].map(([modelId, fs]): BenchmarkModel => {
    const shipped = fs.filter((f) => f.shipped).length;
    const costUsd = fs.reduce((sum, f) => sum + f.costUsd, 0);
    const vendor = resolveModelVendor(modelId).vendor;
    return {
      modelId,
      label: describeModel(modelId).label,
      vendor: vendor.name,
      vendorId: vendor.id,
      firings: fs.length,
      shipped,
      died: fs.filter((f) => f.died).length,
      costUsd,
      costPerShipUsd: shipped === 0 ? null : costUsd / shipped,
      shipRate: shipped / fs.length,
      medianMinutes: median(fs.map((f) => f.durationMs / 60_000)),
      medianTurns: median(fs.map((f) => f.turns)),
      firstAt: Math.min(...fs.map((f) => f.at)),
      lastAt: Math.max(...fs.map((f) => f.at)),
    };
  });
  return rows.sort((a, b) => b.firings - a.firings || a.modelId.localeCompare(b.modelId));
}

/** Every firing as a scatter point. */
export function firingPoints(firings: readonly BenchmarkFiring[]): BenchmarkPoint[] {
  return firings.map((f) => ({
    modelId: f.modelId,
    costUsd: f.costUsd,
    minutes: f.durationMs / 60_000,
    turns: f.turns,
    outcome: f.shipped ? 'shipped' : f.died ? 'died' : 'no-ship',
    at: f.at,
  }));
}

/** The scoreboard's state per tier, as the page shows it. */
export function scoreboardTiers(routed: readonly RoutedFiring[]): BenchmarkTier[] {
  return (Object.keys(TIER_CANDIDATES) as ModelTier[]).map((tier) => {
    const stats = tierStats(routed, tier, TIER_CANDIDATES[tier]);
    const measured = [...stats.values()].every((s) => s.firings >= MIN_ARM_FIRINGS);
    return {
      tier,
      phase: measured ? 'exploit' : 'explore',
      leader: measured ? leaderOf(stats) : null,
      arms: [...stats.entries()].map(([alias, s]) => ({
        alias,
        modelId: s.modelId,
        firings: s.firings,
        shipped: s.shipped,
        shipRate: s.firings === 0 ? null : s.shipped / s.firings,
        costPerShipUsd: s.shipped === 0 ? null : s.costUsd / s.shipped,
      })),
    };
  });
}

/** How far back the page reads. */
export const BENCHMARK_WINDOW_DAYS = 90;

/** Every firing with a served model in the window, across every project. */
export function readBenchmarkFirings(store: Store, since: number): BenchmarkFiring[] {
  const rows = store.db
    .prepare(
      `SELECT m.model, m.shipped, m.gate_result, m.cost_usd, m.duration_ms, m.turns, m.created_at, e.payload
         FROM metrics m
         LEFT JOIN events e ON e.firing_id = m.firing_id AND e.type = 'firing'
        WHERE m.created_at >= ? AND m.model IS NOT NULL AND m.model != ''
        ORDER BY m.created_at, m.id`,
    )
    .all(since) as {
    model: string;
    shipped: number;
    gate_result: string | null;
    cost_usd: number;
    duration_ms: number;
    turns: number;
    created_at: number;
    payload: string | null;
  }[];
  return rows.map((r) => ({
    modelId: r.model,
    shipped: r.shipped === 1,
    died: r.shipped !== 1 && r.gate_result !== 'reverted' && parseFiringDeath(r.payload) !== null,
    costUsd: r.cost_usd,
    durationMs: r.duration_ms,
    turns: r.turns,
    at: r.created_at,
  }));
}

/** The whole page's data. */
export function readBenchmark(store: Store, now: number): BenchmarkPayload {
  const since = now - BENCHMARK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const firings = readBenchmarkFirings(store, since);
  const routed = listProjects(store.db).flatMap((p) => readRoutedFirings(store, p.id, now));
  return {
    generatedAt: now,
    windowDays: BENCHMARK_WINDOW_DAYS,
    models: summarizeModels(firings),
    points: firingPoints(firings),
    tiers: scoreboardTiers(routed),
    rule: {
      minFirings: MIN_ARM_FIRINGS,
      shipRateTolerance: SHIP_RATE_TOLERANCE,
      watchOneIn: WATCH_ONE_IN,
    },
  };
}

/** The page's data from the dashboard's database, opened read-only for the
 *  one read. A dashboard with no database yet has flown nothing. */
export function readBenchmarkAt(dbPath: string, now: number): BenchmarkPayload {
  if (!existsSync(dbPath)) return readBenchmarkEmpty(now);
  const store = openStore(dbPath, { readonly: true });
  try {
    return readBenchmark(store, now);
  } finally {
    store.close();
  }
}

/** Nothing flown: every tier exploring, no models, no points. */
export function readBenchmarkEmpty(now: number): BenchmarkPayload {
  return {
    generatedAt: now,
    windowDays: BENCHMARK_WINDOW_DAYS,
    models: [],
    points: [],
    tiers: scoreboardTiers([]),
    rule: {
      minFirings: MIN_ARM_FIRINGS,
      shipRateTolerance: SHIP_RATE_TOLERANCE,
      watchOneIn: WATCH_ONE_IN,
    },
  };
}
