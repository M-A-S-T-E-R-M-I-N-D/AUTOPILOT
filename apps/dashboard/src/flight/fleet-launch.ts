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

import { isClaimableTitle } from '@autopilot/store';
import { partitionBoardScopes } from './scope-partition.js';
import { WIDE_FLEET_LANES } from './preflight.js';
import { firingEngineFromRequest, firingEngineRequestFields } from './firing-engine.js';

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

/** One lane's engine fields, as `firingEngineRequestFields` writes them: none
 *  when nothing chose an engine, and no model beside Claude. */
export interface FleetLaneEngine {
  readonly engine?: string;
  readonly engineModel?: string;
}

/** {@link FleetCliArgs} plus the engine every lane flies on (epic 0036), which
 *  only the dashboard's `POST /api/fleet` takes. Both ride each lane's
 *  `POST /api/fly` body as given, where `FlightRunner.start()` reads them
 *  through `firingEngineFromRequest`. Omitted, every lane inherits the
 *  dashboard's own `AUTOPILOT_ENGINE`, as before. `laneEngines` flies a lane
 *  on an engine of its own (GitHub #21 slice S-last, a heterogeneous fleet):
 *  lane `i` in roster order takes entry `i`, and a lane past the list's end
 *  takes `engine`/`engineModel`. */
export interface FleetLaunchArgs extends FleetCliArgs, FleetLaneEngine {
  readonly laneEngines?: readonly FleetLaneEngine[];
}

export type FleetLaneEnginesRequest =
  | { readonly ok: true; readonly laneEngines: readonly FleetLaneEngine[] | undefined }
  | { readonly ok: false; readonly reason: string };

/**
 * Reads a `POST /api/fleet` body's `laneEngines`, one `{ engine, engineModel }`
 * per lane in roster order (base, fleet-2, …). Each entry is judged by
 * `firingEngineFromRequest`, as a single launch's pair is, so a lane no CLI
 * could fly refuses the whole launch before its first lane starts. An entry
 * that names no engine takes the launch's own (`fleetEngine`), as a lane past
 * the list's end does. A list longer than the fleet is refused rather than
 * dropped unread.
 */
export function fleetLaneEnginesFromRequest(
  raw: unknown,
  laneCount: number,
  fleetEngine: FleetLaneEngine,
): FleetLaneEnginesRequest {
  if (raw === undefined) return { ok: true, laneEngines: undefined };
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      reason: 'laneEngines must be a list of { engine, engineModel }, one per lane.',
    };
  }
  if (raw.length > laneCount) {
    return {
      ok: false,
      reason: `laneEngines names ${raw.length} lane(s), but the fleet has ${laneCount}.`,
    };
  }
  const names = raw.length > 0 ? fleetLaneNames(raw.length) : [];
  const laneEngines: FleetLaneEngine[] = [];
  for (const [i, entry] of raw.entries()) {
    const lane = names[i] ?? BASE_LANE_KEY;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        ok: false,
        reason: `lane ${lane}: laneEngines entries must be { engine, engineModel }.`,
      };
    }
    const fields = entry as Record<string, unknown>;
    const choice = firingEngineFromRequest(fields['engine'], fields['engineModel']);
    if (!choice.ok) return { ok: false, reason: `lane ${lane}: ${choice.reason}` };
    laneEngines.push(
      choice.route === undefined ? fleetEngine : firingEngineRequestFields(choice.route),
    );
  }
  return { ok: true, laneEngines };
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
  // Only what a lane may claim is worth reserving: an OPERATOR or
  // `VERDICT blocked` row sits on the board for a person, and a slice that
  // holds one looks "still open" to its lane after everything else in it is
  // done (round 53, fleet-4, 2026-10-01 — see `claimableCandidates`).
  const scopes = partitionBoardScopes(
    tasks.filter((t) => isClaimableTitle(t.title)),
    keys,
  );
  return lanes.map((instanceId, i) => ({
    instanceId,
    taskScope: scopes.get(keys[i] as string) ?? [],
  }));
}

/** One lane's `POST /api/fly` body — {@link FleetLanePlan} plus the shared
 *  folder/firings/budget/engine every lane launches with. */
export interface FleetLaunchPostBody {
  readonly folder: string;
  readonly firings: number;
  readonly budgetUsd: number;
  readonly instanceId?: string;
  readonly taskScope: readonly string[];
  readonly engine?: string;
  readonly engineModel?: string;
}

/** The engine keys lane `index`'s body carries: its own entry in
 *  `laneEngines`, else the launch's; none when nothing chose one, so the
 *  lane's body is the one it always was. */
function laneEngineFields(args: FleetLaunchArgs, index: number): FleetLaneEngine {
  const fields = args.laneEngines?.[index] ?? args;
  return {
    ...(fields.engine !== undefined ? { engine: fields.engine } : {}),
    ...(fields.engineModel !== undefined ? { engineModel: fields.engineModel } : {}),
  };
}

/** "on codex (gpt-5-codex)", or empty when `fields` name no engine. */
function engineWords(fields: FleetLaneEngine): string {
  if (fields.engine === undefined) return '';
  return `on ${fields.engine}${fields.engineModel !== undefined ? ` (${fields.engineModel})` : ''}`;
}

function hasLaneEngines(args: FleetLaunchArgs): boolean {
  return (args.laneEngines?.length ?? 0) > 0;
}

/** The summary line's engine clause: empty when the launch chose none, and
 *  "engine per lane" when its lanes name their own on their lines. */
function engineClause(args: FleetLaunchArgs): string {
  if (hasLaneEngines(args)) return ', engine per lane';
  const words = engineWords(args);
  return words === '' ? '' : `, ${words}`;
}

/** The bits of `/api/fly`'s response `runFleetLaunch` actually reports. */
export interface FleetLaunchPostResult {
  readonly status: number;
  readonly started?: boolean;
  /** The dashboard's own words for a lane it did not start — a preflight
   *  refusal names what to fix; without it a `409 not started` is mute. */
  readonly message?: string;
  /** The preflight warnings a started lane flies past (`StartFlightResult.warnings`),
   *  named on its line as a single launch's start message names them. */
  readonly warnings?: string;
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
  args: FleetLaunchArgs,
  staggerMs: number,
  deps: FleetLaunchDeps,
): Promise<FleetLaunchResult> {
  const open = deps.loadOpenTasks();
  const plan = buildFleetLaunchPlan(open, args.laneCount);
  const lines: string[] = [
    `fleet: ${args.laneCount} lane(s) over ${open.length} open task(s) — ` +
      `${args.firings} firing(s) each at $${args.budgetUsd}/firing${engineClause(args)}`,
  ];
  if (args.laneCount > WIDE_FLEET_LANES) {
    lines.push(
      `  advisory: ${args.laneCount} lanes on one disk — gates queue behind ${WIDE_FLEET_LANES} lanes and most firings need the long wall clock; expect fewer ships per lane`,
    );
  }
  let ok = true;
  for (const [index, lane] of plan.entries()) {
    if (index > 0) await deps.sleep(staggerMs);
    const engine = laneEngineFields(args, index);
    // A fleet whose lanes chose their own engines names each one on its line.
    const own = hasLaneEngines(args) ? engineWords(engine) : '';
    const name = `${lane.instanceId ?? 'base'}${own === '' ? '' : ` ${own}`}`;
    let result: FleetLaunchPostResult;
    try {
      result = await deps.postFly({
        folder: args.folder,
        firings: args.firings,
        budgetUsd: args.budgetUsd,
        ...(lane.instanceId ? { instanceId: lane.instanceId } : {}),
        taskScope: lane.taskScope,
        ...engine,
      });
    } catch (err) {
      lines.push(`  ${name}: could not reach the dashboard — ${String(err)}`);
      ok = false;
      continue;
    }
    // A refused lane says why; a started one names what its preflight warned
    // of, since the bar shows these lines and never the lane's own message.
    const said = result.started ? result.warnings : result.message;
    const why = said !== undefined ? ` — ${said}` : '';
    lines.push(
      `  ${name}: ${result.status} ${result.started ? 'started' : 'not started'} — ` +
        `${lane.taskScope.length} task(s) reserved${why}`,
    );
  }
  return { ok, lines };
}
