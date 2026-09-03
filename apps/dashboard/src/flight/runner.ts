// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The FlightRunner — the dashboard's "fly this folder" backing service. It owns a
 * single in-flight run (cautious MVP; multi-project parallelism is M7), spawns the
 * real flight (the `fly` entry) as an isolated child process so a long, quota-spending
 * run never blocks the server event loop, and tracks its status. All effects (spawn,
 * folder check, clock) are injected so the control logic is deterministically testable
 * without touching a real process or disk.
 */

/** Max firings a single dashboard-launched flight may request (cautious cap). */
export const MAX_DASHBOARD_FIRINGS = 20;

/** PER-FIRING budget — operator-chosen, floored but NOT capped (the founder's
 *  explicit call: spend decisions belong to the operator). At the 120-turn cap
 *  (see flight/budget.ts), a firing naturally tops out around $7 of spend before
 *  turns stop it; a $5 default bound BEFORE that ceiling and was killing honest
 *  work on budget instead of turns. $10 clears the ~$7 natural ceiling with
 *  headroom, so it stays a net rather than the everyday killer. The operator
 *  sets it explicitly per flight. */
export const DEFAULT_BUDGET_USD = 10;
export const MIN_BUDGET_USD = 0.5;

/** Who started a flight (RING-0 FLEET WATCHDOG's last acceptance criterion,
 *  docs/epics/0003-ring-0-fleet-watchdog.md, web-msqhh7kh-ptjodv): the
 *  dashboard's own fly bar/per-project card never sets this (undefined →
 *  'operator'); the fleet watchdog's HTTP spawn (control/cli.ts) is the only
 *  caller that ever sends 'fleet-watchdog'. Lets an operator watching the
 *  dashboard tell WHY a project started flying without it. */
export type FlightInitiator = 'operator' | 'fleet-watchdog';

/** A spawned flight child — just enough surface to track it, stop it, clean up. */
export interface SpawnedFlight {
  readonly pid: number | null;
  /** Register a callback fired once when the child process exits. */
  onExit(cb: (code: number | null) => void): void;
  /**
   * Request termination (SIGTERM). The onExit callback fires when it
   * actually dies. STOP ESCALATION (STPA finding web-mt1qa7go-9zjnc0): a
   * real implementation escalates to a forceful, whole-tree kill on its own
   * if the child hasn't exited within a grace window — callers never need
   * to retry or track that themselves.
   */
  kill(): void;
}

export interface FlightRunnerDeps {
  /**
   * Spawn the real flight against `folder` for `firings` firings at `budgetUsd`
   * each. `totalBudgetUsd`, when set, puts the flight in TOTAL-SPEND mode: it
   * keeps firing (up to the `firings` ceiling) until the remaining budget can no
   * longer fund another `budgetUsd` firing, instead of stopping at a fixed count.
   */
  readonly spawnFlight: (
    folder: string,
    firings: number,
    budgetUsd: number,
    totalBudgetUsd?: number,
    /**
     * PARALLEL UNLOCK C (N-way same-folder spawn): which INSTANCE of a
     * same-folder fleet this child belongs to — undefined for every
     * existing single-instance caller. A real implementation folds this
     * into the child's lock/worktree/log identity (see
     * `flight/spawn-flight.ts`) so concurrent instances of the SAME folder
     * don't collide; a bare `FlightRunner` just forwards whatever `start()`
     * recorded on `input.instanceId`.
     */
    instanceId?: string,
    /**
     * FLEET SCOPE PARTITIONER (spec-scoped decomposition, EVALUATION-2026-
     * 08-20-sota lever 5): the DISJOINT set of board-task ids this instance
     * should work first. Rides to the child as the
     * `AUTOPILOT_FLEET_TASK_SCOPE` env var; the flight falls back to the
     * ordinary pull once its scope is exhausted. Undefined/empty for every
     * solo flight — behavior byte-for-byte unchanged.
     */
    taskScope?: readonly string[],
    /**
     * MACHINE BUDGET HOLE FIX (STPA finding web-mt1qa7ij-c6wqgi): true when
     * the caller already knows another flight is concurrently running at
     * spawn time — a `FlightRunnerRegistry` sets this from its own live
     * running count. A bare `FlightRunner` (no registry, no notion of
     * siblings) never sets it. Lets `spawn-flight.ts` apply the fleet vitest-
     * worker cap to ANY concurrent spawn, not only one that happens to carry
     * an `instanceId` — the "base" (no-instanceId) flight starting while
     * siblings already fly was escaping the cap entirely before this.
     */
    siblingsFlying?: boolean,
  ) => SpawnedFlight;
  /** Does the target folder exist (and is usable as a flight target)? */
  readonly folderExists: (folder: string) => boolean;
  /** Resolve the user's input to an absolute path (relative → against the cwd). */
  readonly resolveFolder?: (folder: string) => string;
  readonly now: () => number;
  /**
   * Record a graceful-PAUSE request against `folder` (persisted — the running
   * flight is a separate process that polls for it between firings). Returns
   * false when there's no project at that path to record it against.
   */
  readonly requestPause: (folder: string) => boolean;
  /** Did the last flight against `folder` end by honoring a pause request? */
  readonly isPaused: (folder: string) => boolean;
}

/** The runner's public status — no secrets, safe to serve to the dashboard. */
export interface FlightStatus {
  readonly running: boolean;
  readonly folder: string | null;
  readonly firings: number | null;
  /** Set only in TOTAL-SPEND mode (see `StartFlightInput.totalBudgetUsd`). */
  readonly totalBudgetUsd: number | null;
  readonly startedAt: number | null;
  readonly pid: number | null;
  /**
   * True when `folder` isn't running because it was gracefully PAUSED (not
   * stopped, crashed, or simply never started) — the dashboard offers Resume
   * (a normal start against the same folder) instead of a bare "Fly it".
   */
  readonly paused: boolean;
  /**
   * True when `folder` is waiting in a `FlightRunnerRegistry`'s queue because
   * an operator-set concurrency cap is already full (PARALLEL FLIGHTS 5/6,
   * "shared-quota fairness" — docs/epics/0001-parallel-flights.md). Always
   * false for a bare `FlightRunner` (it has no notion of a cap); the registry
   * sets this on the synthetic status entries it reports for queued folders.
   */
  readonly queued: boolean;
  /** Who started this flight — null when idle (nothing to attribute). See
   *  `FlightInitiator`. */
  readonly initiatedBy: FlightInitiator | null;
  /**
   * PARALLEL UNLOCK C (N-way same-folder spawn): which INSTANCE of a
   * same-folder fleet this status belongs to — null while idle, and null for
   * every existing single-instance caller (none of which ever sets
   * `StartFlightInput.instanceId`), so this field is purely additive. Only a
   * `FlightRunnerRegistry` asked to run more than one flight against the SAME
   * folder at once gives two of its runners distinct instanceIds; a bare
   * `FlightRunner` still tracks exactly one flight lineage either way, it
   * just now also records what that lineage was called.
   */
  readonly instanceId: string | null;
}

export interface StartFlightInput {
  readonly folder: string;
  readonly firings?: number;
  /** Operator-chosen PER-FIRING budget in USD (floored at MIN_BUDGET_USD, uncapped). */
  readonly budgetUsd?: number;
  /**
   * Operator-chosen TOTAL spend target for the whole flight, in USD. When set,
   * `firings` is ignored — the flight keeps firing (up to MAX_DASHBOARD_FIRINGS)
   * until the remaining budget can't fund another `budgetUsd` firing. Floored at
   * `budgetUsd` so the target can always fund at least one firing.
   */
  readonly totalBudgetUsd?: number;
  /** Who is starting this flight — omitted (→ 'operator') by every existing
   *  caller (the fly bar, per-project cards, `pnpm dashboard:fly`); only the
   *  fleet watchdog's HTTP spawn sets 'fleet-watchdog'. Any other value is
   *  treated as 'operator' — this is a display label, not a permission, so
   *  an unrecognized value degrades safely instead of being rejected. */
  readonly initiatedBy?: FlightInitiator;
  /**
   * PARALLEL UNLOCK C (N-way same-folder spawn): distinguishes concurrent
   * flight INSTANCES against the SAME folder. Omitted (every existing
   * caller), the folder alone is still the whole identity — a
   * `FlightRunnerRegistry` refuses a second start against that folder
   * exactly like today, byte-for-byte. Given, a registry gives THIS
   * instance its own runner instead of refusing the start outright, so two
   * instances of the same folder can fly concurrently. Blank/whitespace-only
   * is treated the same as omitted. A bare `FlightRunner` has no notion of
   * "another instance" to refuse against — it just records the value for
   * display (see `FlightStatus.instanceId`).
   */
  readonly instanceId?: string;
  /**
   * FLEET SCOPE PARTITIONER (spec-scoped decomposition): the disjoint board
   * scope this instance works first — computed by the launcher
   * (`flight/scope-partition.ts`'s `partitionBoardScopes`), threaded to the
   * child as `AUTOPILOT_FLEET_TASK_SCOPE`. Omitted/empty (every existing
   * caller): no scope, ordinary pull, byte-for-byte unchanged.
   */
  readonly taskScope?: readonly string[];
}

export interface StartFlightResult {
  readonly started: boolean;
  readonly message: string;
  readonly status: FlightStatus;
  /** Set (true) only by a `FlightRunnerRegistry` refusing to start `folder`
   *  immediately because its concurrency cap is full — the request was
   *  QUEUED, not rejected, and will start on its own once a slot frees.
   *  Omitted (not just false) from every plain `FlightRunner` result, which
   *  has no queue to report. */
  readonly queued?: boolean;
}

export interface StopFlightResult {
  readonly stopping: boolean;
  readonly message: string;
  readonly status: FlightStatus;
}

export interface PauseFlightResult {
  readonly pausing: boolean;
  readonly message: string;
  readonly status: FlightStatus;
}

/** The idle status shape — exported so a multi-folder caller (e.g. the
 *  registry in `flight/registry.ts`) can report "no flight here" for a
 *  folder it has never seen without duplicating this literal. */
export const IDLE_STATUS: FlightStatus = {
  running: false,
  folder: null,
  firings: null,
  totalBudgetUsd: null,
  startedAt: null,
  pid: null,
  paused: false,
  queued: false,
  initiatedBy: null,
  instanceId: null,
};
const IDLE = IDLE_STATUS;

function clampFirings(requested: number | undefined): number {
  const n = Math.floor(Number(requested ?? 1));
  // Stryker disable next-line EqualityOperator: `n` is always an integer
  // (Math.floor above) and MAX_DASHBOARD_FIRINGS >= 1, so `n < 1` vs `n <= 1`
  // return the same value for every reachable n — at n === 1, both the early
  // `return 1` and `Math.min(1, MAX_DASHBOARD_FIRINGS)` below equal 1.
  // Provably unobservable.
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_DASHBOARD_FIRINGS);
}

/** Floored at `budgetUsd` — a total target below one firing's cost is nonsense. */
function clampTotalBudget(requested: number, budgetUsd: number): number {
  const n = Number(requested);
  if (!Number.isFinite(n)) return budgetUsd;
  return Math.max(n, budgetUsd);
}

export class FlightRunner {
  #status: FlightStatus = IDLE;
  #child: SpawnedFlight | null = null;

  constructor(private readonly deps: FlightRunnerDeps) {}

  status(): FlightStatus {
    return this.#status;
  }

  /** Registers `child`'s exit so the runner goes idle (or `paused`, per
   *  `deps.isPaused`) whenever it actually dies — shared by `start()`
   *  (a freshly spawned child) and `adopt()` (a pre-existing pid this
   *  runner never spawned) so the two can never wire this differently. */
  #wireExit(child: SpawnedFlight, folder: string, instanceId: string | null): void {
    child.onExit(() => {
      this.#status = this.deps.isPaused(folder)
        ? { ...IDLE, folder, paused: true, instanceId }
        : IDLE;
      this.#child = null;
    });
  }

  /**
   * Adopt a flight this runner never spawned — a still-alive lock owner
   * found by boot-time reconciliation after a dashboard restart lost its
   * previous in-memory registry (`flight/adopt.ts`, docs/RUNBOOK.md §4).
   * There was no `StartFlightInput` for THIS process to derive
   * firings/totalBudgetUsd/startedAt/initiatedBy from, so those report
   * null/unattributed rather than guessed — `folder`, `instanceId`, and
   * `child.pid` are the only facts this runner can state with certainty.
   * Exit is wired exactly like `start()`'s own child, so a later
   * paused/idle transition behaves identically either way. Callers (the
   * registry) are expected to gate this against an already-running runner
   * themselves — unlike `start()`, this has no "already flying" refusal of
   * its own, since it's only ever called for a key the caller has already
   * confirmed has no runner yet.
   */
  adopt(child: SpawnedFlight, folder: string, instanceId: string | null): void {
    this.#child = child;
    this.#status = {
      running: true,
      folder,
      firings: null,
      totalBudgetUsd: null,
      startedAt: null,
      pid: child.pid,
      paused: false,
      queued: false,
      initiatedBy: null,
      instanceId,
    };
    this.#wireExit(child, folder, instanceId);
  }

  /**
   * Request the running flight to stop (SIGTERM the child, escalating to a
   * forceful kill if it doesn't actually exit — see SpawnedFlight.kill).
   * Returns the current status; the runner goes idle only when the child
   * actually exits (via onExit). A no-op when nothing is flying.
   */
  stop(): StopFlightResult {
    // Stryker disable next-line LogicalOperator: `running` and `#child` are
    // always set together (start()) and cleared together (the onExit
    // callback) — never independently — so `||` vs `&&` here is unobservable;
    // the guard is provably a single condition under that invariant.
    if (!this.#status.running || !this.#child) {
      return { stopping: false, message: 'no flight is running', status: IDLE };
    }
    const folder = this.#status.folder;
    // Stryker disable next-line StringLiteral: `folder` is always a non-null
    // string here (set together with `running: true` in start(), and this
    // guard only proceeds when running) — the '?? "the flight"' fallback is
    // provably unreachable, so its literal text is unobservable.
    const label = folder ?? 'the flight';
    this.#child.kill();
    return { stopping: true, message: `stopping ${label}…`, status: this.#status };
  }

  /**
   * Request the running flight to hold after the firing it's currently in the
   * middle of — a graceful counterpart to stop(). Unlike stop(), the child is
   * NEVER killed: it's the flight's own loop (apps/dashboard/src/fly.ts) that
   * notices the request, finishes the in-flight firing, and exits on its own,
   * landing the project on `status = 'paused'`. Resume is just start() again
   * against the same folder — no separate resume() method needed. A no-op
   * when nothing is flying, or when the running folder has no project row to
   * record the request against.
   */
  pause(): PauseFlightResult {
    // Stryker disable next-line LogicalOperator: same running/#child
    // invariant as stop() above — see that comment.
    if (!this.#status.running || !this.#child) {
      return { pausing: false, message: 'no flight is running', status: IDLE };
    }
    const folder = this.#status.folder;
    if (!folder || !this.deps.requestPause(folder)) {
      return {
        pausing: false,
        message: 'could not record the pause request',
        status: this.#status,
      };
    }
    return {
      pausing: true,
      message: `pausing ${folder} — holding after the firing in progress…`,
      status: this.#status,
    };
  }

  start(input: StartFlightInput): StartFlightResult {
    const raw = input.folder?.trim() ?? '';

    if (this.#status.running) {
      // Stryker disable next-line StringLiteral: `this.#status.folder` is
      // always a non-null string while running (set together in start()) —
      // the '?? "a folder"' fallback is provably unreachable, so its literal
      // text is unobservable.
      const label = this.#status.folder ?? 'a folder';
      return {
        started: false,
        message: `already flying ${label} — one flight at a time`,
        status: this.#status,
      };
    }
    if (raw.length === 0) {
      return { started: false, message: 'a folder path is required', status: IDLE };
    }
    // Resolve to an absolute path so a relative name like "AUTOPILOT" becomes a
    // real path the user can see (and the "folder not found" message is honest).
    const folder = this.deps.resolveFolder ? this.deps.resolveFolder(raw) : raw;
    if (!this.deps.folderExists(folder)) {
      return { started: false, message: `folder not found: ${folder}`, status: IDLE };
    }

    const budgetUsd = clampBudget(input.budgetUsd);
    // TOTAL-SPEND mode: the operator gave a $ target instead of a firing count —
    // `firings` becomes a safety ceiling only; the flight itself decides when the
    // remaining budget can no longer fund another firing (apps/dashboard/src/fly.ts).
    const totalBudgetUsd =
      input.totalBudgetUsd !== undefined
        ? clampTotalBudget(input.totalBudgetUsd, budgetUsd)
        : undefined;
    const firings =
      totalBudgetUsd !== undefined ? MAX_DASHBOARD_FIRINGS : clampFirings(input.firings);
    const initiatedBy: FlightInitiator =
      input.initiatedBy === 'fleet-watchdog' ? 'fleet-watchdog' : 'operator';
    // Blank/whitespace-only is the same as omitted — see StartFlightInput.instanceId.
    const instanceId = input.instanceId?.trim() || null;
    // Sanitize the scope: strings only, trimmed, non-empty, bounded — a wild
    // API caller must not be able to ride an unbounded env var into the child.
    const taskScope = (input.taskScope ?? [])
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, 200);
    const child = this.deps.spawnFlight(
      folder,
      firings,
      budgetUsd,
      totalBudgetUsd,
      instanceId ?? undefined,
      taskScope.length > 0 ? taskScope : undefined,
    );
    this.#child = child;
    this.#status = {
      running: true,
      folder,
      firings,
      totalBudgetUsd: totalBudgetUsd ?? null,
      startedAt: this.deps.now(),
      pid: child.pid,
      paused: false,
      queued: false,
      initiatedBy,
      instanceId,
    };
    // When the child exits (done, crashed, or killed) the runner is free again —
    // UNLESS it honored a pause request, in which case `folder`/`paused` survive
    // the transition to `running: false` so the dashboard can offer Resume
    // instead of a bare "Fly it" (the fleet's own status pill shows 'paused' too).
    // `instanceId` survives that same transition — a paused INSTANCE of a
    // same-folder fleet must stay distinguishable from its siblings, exactly
    // like `folder` already does.
    this.#wireExit(child, folder, instanceId);

    return {
      started: true,
      message:
        totalBudgetUsd !== undefined
          ? `flying ${folder} — up to $${totalBudgetUsd} total`
          : `flying ${folder} — ${firings} firing(s)`,
      status: this.#status,
    };
  }
}

function clampBudget(requested: number | undefined): number {
  const n = Number(requested ?? DEFAULT_BUDGET_USD);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BUDGET_USD;
  return Math.max(n, MIN_BUDGET_USD);
}
