// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLEET LAUNCH PLAN — the coordinator `scope-partition.ts` was written for and
 * never got (EVAL 08-27, board web-mtb8i2lo-j7qcg9 "SHARDING HAS NO CALLER").
 *
 * `partitionBoardScopes` documents itself as "computed by the LAUNCHER (the
 * coordinator role in the consensus pattern)", but no launcher existed: lanes
 * are independent processes started by hand, each pulling from the whole
 * board. The partitioner's only importer was its own test.
 *
 * The 3-lane ramp on 2026-08-27 measured what that costs. Leases held — three
 * lanes claimed three DIFFERENT tasks — but leases guard TASKS, and two of
 * those tasks both needed `packages/engine/src/firing.ts`. The pre-commit
 * sibling scan correctly refused the second commit, so the work was never
 * lost; it was simply paid for twice and shipped once. That is precisely the
 * case the partitioner's HUB RULE exists to prevent, since it groups by area
 * and "the same-area tasks are exactly the ones that touch the same files".
 *
 * This module is deliberately pure: it decides WHO works WHAT, and nothing
 * else. Spawning lives in the CLI so the decision stays unit-testable.
 */

import { partitionBoardScopes } from './scope-partition.js';

/** One lane's launch instruction: its identity, and the disjoint slice of the
 *  board reserved for it. An EMPTY scope is not "idle" — under
 *  partition-then-pull it means "no reservation, take from the open board". */
export interface FleetLanePlan {
  /** `undefined` for the base lane, which flies without an instance id exactly
   *  as a solo flight always has. */
  readonly instanceId: string | undefined;
  readonly taskScope: readonly string[];
}

/**
 * The lane roster for `count` lanes: the base lane first (no instance id),
 * then `fleet-2`, `fleet-3`, … — numbered to match the worktrees already on
 * disk (`fly-autopilot`, `fly-autopilot--fleet-2`, …), so lane two is
 * `fleet-2` and there is deliberately no `fleet-1`.
 */
export function fleetLaneNames(count: number): (string | undefined)[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`a fleet needs at least one lane (got ${count})`);
  }
  return Array.from({ length: count }, (_, i) => (i === 0 ? undefined : `fleet-${i + 1}`));
}

/** Internal partition key for the base lane, which has no instance id of its
 *  own. Never leaves this module — the plan carries `undefined` instead.
 *  Cannot collide with a real lane: {@link fleetLaneNames} only ever mints
 *  `fleet-N`. */
const BASE_LANE_KEY = 'base';

/** Parsed, validated `dashboard fleet <folder> <lanes> [firings] [budgetUsd]`
 *  arguments — see {@link parseFleetCliArgs}. */
export interface FleetCliArgs {
  readonly folder: string;
  readonly laneCount: number;
  readonly firings: number;
  readonly budgetUsd: number;
}

const FLEET_CLI_USAGE = 'usage: dashboard fleet <folder> <lanes> [firings] [budgetUsd]';

/**
 * Parse and validate the `dashboard fleet` command line. Pulled out of the
 * CLI switch because `laneCount` was the only argument actually checked —
 * `firings` and `budgetUsd` were read with a bare `Number(...)` and never
 * validated, so a typo'd argument became `NaN` and rode silently into every
 * spawned flight's firing count and budget.
 *
 * `argv` is `[folder, laneCount, firings, budgetUsd]` (`process.argv.slice(3, 7)`
 * at the call site) — each optional past `folder`, defaulting to 3 lanes, 1
 * firing, and the caller-supplied `defaultBudgetUsd`.
 */
export function parseFleetCliArgs(
  argv: readonly (string | undefined)[],
  defaultBudgetUsd: number,
):
  | { readonly ok: true; readonly args: FleetCliArgs }
  | { readonly ok: false; readonly usage: string } {
  const [folder, laneCountRaw, firingsRaw, budgetUsdRaw] = argv;
  const laneCount = Number(laneCountRaw ?? 3);
  const firings = Number(firingsRaw ?? 1);
  const budgetUsd = Number(budgetUsdRaw ?? defaultBudgetUsd);
  const folderOk = folder !== undefined && folder.trim().length > 0;
  const laneCountOk = Number.isInteger(laneCount) && laneCount >= 1;
  const firingsOk = Number.isInteger(firings) && firings >= 1;
  const budgetUsdOk = Number.isFinite(budgetUsd) && budgetUsd > 0;
  if (!folderOk || !laneCountOk || !firingsOk || !budgetUsdOk) {
    return { ok: false, usage: FLEET_CLI_USAGE };
  }
  return { ok: true, args: { folder: folder as string, laneCount, firings, budgetUsd } };
}

/**
 * Cohesion-partition the open board across `laneCount` lanes so that no two
 * lanes are ever in flight on the same area — and therefore, by the HUB
 * RULE's construction, not on the same files.
 *
 * Returns one entry per lane, in roster order, always — a lane with fewer
 * groups than peers gets an empty scope and falls back to the ordinary pull
 * rather than idling.
 */
export function buildFleetLaunchPlan(
  tasks: readonly { readonly id: string; readonly title: string }[],
  laneCount: number,
): FleetLanePlan[] {
  const lanes = fleetLaneNames(laneCount);
  const keys = lanes.map((lane) => lane ?? BASE_LANE_KEY);
  const scopes = partitionBoardScopes(tasks, keys);
  return lanes.map((instanceId, i) => ({
    instanceId,
    taskScope: scopes.get(keys[i] as string) ?? [],
  }));
}

/** One lane's `POST /api/fly` body — {@link FleetLanePlan} plus the shared
 *  folder/firings/budget every lane launches with. */
export interface FleetLaunchPostBody {
  readonly folder: string;
  readonly firings: number;
  readonly budgetUsd: number;
  readonly instanceId?: string;
  readonly taskScope: readonly string[];
}

/** The bits of `/api/fly`'s response `runFleetLaunch` actually reports. */
export interface FleetLaunchPostResult {
  readonly status: number;
  readonly started?: boolean;
}

/** {@link runFleetLaunch}'s injected seams — real callers wire the live store,
 *  a real `fetch`, and a real `setTimeout`-based sleep; tests inject fakes so
 *  the POST/stagger sequencing is verifiable without a live dashboard server. */
export interface FleetLaunchDeps {
  /** The open board, in the picker's own order — {@link buildFleetLaunchPlan}
   *  partitions exactly what this returns. */
  readonly loadOpenTasks: () => readonly { readonly id: string; readonly title: string }[];
  /** POSTs one lane's start to `/api/fly`. Rejecting (a network hiccup) is
   *  reported per-lane and does not stop the remaining lanes from launching. */
  readonly postFly: (body: FleetLaunchPostBody) => Promise<FleetLaunchPostResult>;
  readonly sleep: (ms: number) => Promise<void>;
}

export interface FleetLaunchResult {
  /** False if any lane's POST rejected (could not reach the dashboard) — a
   *  non-2xx response the dashboard itself answered is still `true`, since
   *  that is an honest per-lane refusal, not a launcher failure. */
  readonly ok: boolean;
  readonly lines: readonly string[];
}

/**
 * Partitions the open board, then launches one lane per {@link buildFleetLaunchPlan}
 * entry via `deps.postFly` — the exact `dashboard fleet` CLI body, pulled out of
 * `control/cli.ts` so it is unit-testable without a live server or store.
 *
 * Lanes must not be POSTed back-to-back. Every lane onboards against the SAME
 * target repo (backup → detect gate → index), and `lockRepo` → `ensureOnFlight`
 * → `checkoutBranch` takes `.git/index.lock`, which is per-REPO, not
 * per-worktree. Three simultaneous POSTs raced it live on 2026-08-27 and the
 * third lane died with "another git process seems to be running in this
 * repository" before it ever reached its worktree. `staggerMs` serializes just
 * that opening phase; the flights themselves then run concurrently in their
 * own worktrees as intended.
 */
export async function runFleetLaunch(
  args: FleetCliArgs,
  staggerMs: number,
  deps: FleetLaunchDeps,
): Promise<FleetLaunchResult> {
  const open = deps.loadOpenTasks();
  const plan = buildFleetLaunchPlan(open, args.laneCount);
  const lines: string[] = [
    `fleet: ${args.laneCount} lane(s) over ${open.length} open task(s) — ` +
      `${args.firings} firing(s) each at $${args.budgetUsd}/firing`,
  ];
  let ok = true;
  let first = true;
  for (const lane of plan) {
    if (!first) await deps.sleep(staggerMs);
    first = false;
    const name = lane.instanceId ?? 'base';
    let result: FleetLaunchPostResult;
    try {
      result = await deps.postFly({
        folder: args.folder,
        firings: args.firings,
        budgetUsd: args.budgetUsd,
        ...(lane.instanceId ? { instanceId: lane.instanceId } : {}),
        taskScope: lane.taskScope,
      });
    } catch (err) {
      lines.push(`  ${name}: could not reach the dashboard — ${String(err)}`);
      ok = false;
      continue;
    }
    lines.push(
      `  ${name}: ${result.status} ${result.started ? 'started' : 'not started'} — ` +
        `${lane.taskScope.length} task(s) reserved`,
    );
  }
  return { ok, lines };
}
