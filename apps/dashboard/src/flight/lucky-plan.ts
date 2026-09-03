// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * "I'M FEELING LUCKY" flight-plan calibrator — one pure function that turns
 * a machine + board probe into a launch plan sized so the fleet DELIVERS
 * without freezing the operator's machine. Born of the 2026-09-03 incident:
 * a blind 8-lane launch pegged the 12-core box at 99% CPU, froze the
 * operator's foreground work, and starved the dashboard server into its own
 * BE-RIGHT-BACK overlay — the fix that day was manual (priority drops, a
 * lane stopped by hand); this module is that judgment turned into
 * arithmetic the Fly bar's 🍀 button can roll on demand.
 *
 * Deliberately PURE (probe in, plan out, no I/O): the server assembles the
 * probe (`GET /api/lucky` in server/main.ts samples CPU, RAM, the flight
 * registry, and the board) and the client only paints; every threshold
 * below is testable arithmetic, not a live measurement.
 *
 * The plan only ever FILLS the Fly bar — it never launches. Flying spends
 * real quota, and that click stays the operator's (the same never-auto-
 * launch stance fly-from-dashboard has always had).
 */

/** What the server measured the moment the dice were rolled. */
export interface LuckyProbe {
  /** Current whole-machine CPU load, 0-100. */
  readonly cpuLoadPct: number;
  readonly logicalCores: number;
  readonly freeRamGb: number;
  /** Queued (workable) tasks on the target project's board. */
  readonly queuedTasks: number;
  /** Flights currently running or queued in the registry, fleet-wide. */
  readonly runningFlights: number;
}

/** The rolled plan — either a calibrated launch or an explained refusal. */
export interface LuckyPlan {
  readonly ok: boolean;
  readonly lanes: number;
  readonly firings: number;
  readonly budgetUsd: number;
  /** One line per bound, so the operator can audit how the dice landed. */
  readonly reasoning: readonly string[];
  /** Set exactly when `ok` is false — why now is not the time. */
  readonly refusal?: string;
}

/** Fleet-wide lane ceiling — matches the widest round ever flown; beyond it
 *  collection cost dominates whatever the extra lanes ship. */
export const LUCKY_MAX_LANES = 8;

/** Per-firing budget, the fleet default the CLI and Fly bar already use. */
export const LUCKY_BUDGET_USD = 10;

/** Refuse outright above this CPU load — the operator is using the machine. */
const CPU_REFUSAL_PCT = 85;

/** A lane's working set: the Claude CLI (~0.5 GB) plus its fly loop and
 *  gate processes (tsc/vitest), observed ≈1.5 GB steady-state. */
const RAM_GB_PER_LANE = 1.5;

/** Head-room reserved for the operator's own applications and the dashboard
 *  server — refuse below it, budget lanes only from what exceeds it. */
const RAM_GB_RESERVED = 4;

/** A lane saturates about two logical cores while its gate runs (CLI + one
 *  compiler/test worker) — the 99%-CPU incident's 8 lanes on 12 cores was
 *  this ratio ignored. */
const CORES_PER_LANE = 2;

/** A lane below this many reserved tasks is not worth its worktree spin-up
 *  and sync-back — the partitioner would hand it a starved shard. */
const TASKS_PER_LANE = 2;

const FIRINGS_MIN = 2;
const FIRINGS_MAX = 4;

function refuse(reason: string, reasoning: readonly string[]): LuckyPlan {
  return { ok: false, lanes: 0, firings: 0, budgetUsd: 0, reasoning, refusal: reason };
}

/** Rolls the dice: probe in, calibrated plan (or explained refusal) out. */
export function luckyPlan(probe: LuckyProbe): LuckyPlan {
  if (probe.runningFlights > 0) {
    return refuse(
      `a flight is already running (${probe.runningFlights}) — land it before rolling again`,
      [],
    );
  }
  if (probe.queuedTasks <= 0) {
    return refuse('the board has no queued tasks — nothing to fly', []);
  }
  if (probe.freeRamGb < RAM_GB_RESERVED) {
    return refuse(
      `free RAM ${probe.freeRamGb.toFixed(1)} GB is below the ${RAM_GB_RESERVED} GB floor`,
      [],
    );
  }
  if (probe.cpuLoadPct > CPU_REFUSAL_PCT) {
    return refuse(
      `CPU is already at ${Math.round(probe.cpuLoadPct)}% — the machine is busy with your work`,
      [],
    );
  }

  const idleCores = ((100 - probe.cpuLoadPct) / 100) * probe.logicalCores;
  const lanesByCpu = Math.floor(idleCores / CORES_PER_LANE);
  const lanesByRam = Math.floor((probe.freeRamGb - RAM_GB_RESERVED) / RAM_GB_PER_LANE);
  const lanesByTasks = Math.floor(probe.queuedTasks / TASKS_PER_LANE);
  const lanes = Math.max(1, Math.min(LUCKY_MAX_LANES, lanesByCpu, lanesByRam, lanesByTasks));

  // Size the round to roughly drain each lane's shard; the floor keeps a
  // second firing for collection/repair, the cap keeps the round short
  // enough that the operator sees results within the hour.
  const firings = Math.min(
    FIRINGS_MAX,
    Math.max(FIRINGS_MIN, Math.ceil(probe.queuedTasks / lanes)),
  );

  const reasoning = [
    `CPU: ${Math.round(probe.cpuLoadPct)}% load on ${probe.logicalCores} cores leaves ~${idleCores.toFixed(1)} idle → ${lanesByCpu} lane(s) at ${CORES_PER_LANE} cores each`,
    `RAM: ${probe.freeRamGb.toFixed(1)} GB free minus ${RAM_GB_RESERVED} GB reserved → ${lanesByRam} lane(s) at ${RAM_GB_PER_LANE} GB each`,
    `board: ${probe.queuedTasks} queued task(s) → ${lanesByTasks} lane(s) at ≥${TASKS_PER_LANE} tasks each`,
    `rolled: ${lanes} lane(s) × ${firings} firing(s) at $${LUCKY_BUDGET_USD}/firing (cap ${LUCKY_MAX_LANES} lanes)`,
  ];

  return { ok: true, lanes, firings, budgetUsd: LUCKY_BUDGET_USD, reasoning };
}
