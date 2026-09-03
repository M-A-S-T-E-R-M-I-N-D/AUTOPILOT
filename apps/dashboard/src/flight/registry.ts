// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `FlightRunnerRegistry` — PARALLEL FLIGHTS 3/6 (`docs/epics/0001-parallel-flights.md`
 * slice 3): one `FlightRunner` PER folder instead of the dashboard-wide singleton.
 * Two different folders each get their own runner and can fly concurrently; a
 * second flight against the SAME (resolved) folder is still refused — that
 * guarantee is unchanged, just scoped per-folder instead of dashboard-wide.
 *
 * `maxConcurrent` (slice 5/6, "shared-quota fairness") caps how many folders
 * may be RUNNING at once — the shared subscription quota is a real, finite
 * budget, so an unbounded fleet of simultaneous flights would let concurrency
 * silently multiply spend pressure. A `start()` that would exceed the cap is
 * QUEUED (FIFO), not refused: it launches on its own the moment any running
 * flight frees a slot. Defaults to unbounded (`Infinity`) so a caller that
 * never sets it keeps today's behavior byte-for-byte.
 *
 * `server.ts` routing (folder-addressed stop/pause, GET returning every live
 * flight) and the dashboard UI (per-project flight cards, epic slice 4/6) sit
 * on top of this registry — built and tested in isolation first so the live
 * single-flight API/UI keep working unchanged until that wiring lands.
 *
 * PARALLEL UNLOCK C (N-way same-folder spawn): `StartFlightInput.instanceId`,
 * when given, lets more than one flight run against the SAME folder at once —
 * each distinct instanceId gets its own runner instead of colliding with the
 * "one flight per folder" refusal above. Omitted (every existing caller),
 * folder alone is still the whole identity and this class behaves
 * byte-for-byte as it did before instanceId existed. Wiring an actual
 * instanceId all the way to a real spawned child (a distinct worktree via
 * `flight/worktree.ts`'s `deriveWorktreePlan`, a distinct engine lock, a
 * distinct log file) is deliberately a separate, later layer — this class
 * only decides WHICH in-process runner a start/stop/pause/status call
 * targets; it does not yet influence how the child process itself is spawned.
 */

import {
  FlightRunner,
  IDLE_STATUS,
  type FlightRunnerDeps,
  type FlightStatus,
  type PauseFlightResult,
  type SpawnedFlight,
  type StartFlightInput,
  type StartFlightResult,
  type StopFlightResult,
} from './runner.js';

export class FlightRunnerRegistry {
  /** Keyed by `#key(folder, instanceId)` — bare resolved folder for every
   *  single-instance caller (unchanged), or a folder+instance composite once
   *  PARALLEL UNLOCK C's N-way spawn is in play. */
  #runners = new Map<string, FlightRunner>();
  /** FIFO — folder/instance pairs waiting for a slot, keyed the same
   *  composite way so a duplicate `start()` on an already-queued instance is
   *  detected cheaply. */
  #queue: StartFlightInput[] = [];
  #queuedKeys = new Set<string>();

  constructor(
    private readonly deps: FlightRunnerDeps,
    private readonly maxConcurrent: number = Infinity,
  ) {}

  /** Resolve raw operator input to the folder half of the map key — the SAME
   *  resolution `FlightRunner.start()` applies internally, done here first so
   *  the registry can pick (or create) the right runner. */
  #resolve(raw: string): string {
    return this.deps.resolveFolder ? this.deps.resolveFolder(raw) : raw;
  }

  /** PARALLEL UNLOCK C (N-way same-folder spawn): the map/queue key a runner
   *  is stored/looked-up under. Bare resolved folder when no instanceId is
   *  given (or it's blank/whitespace-only) — BYTE-FOR-BYTE today's
   *  single-instance key, so every existing caller keeps refusing a second
   *  flight against the same folder exactly as before. A real instanceId
   *  folds in behind a NUL separator (illegal in a filesystem path on every
   *  target platform, so it can never collide with an actual folder) so two
   *  INSTANCES of the same folder land on distinct keys and fly concurrently
   *  instead of colliding. */
  #key(folder: string, instanceId?: string): string {
    const id = instanceId?.trim();
    return id ? `${folder}\u0000${id}` : folder;
  }

  #existing(folder: string, instanceId?: string): FlightRunner | undefined {
    return this.#runners.get(this.#key(this.#resolve(folder), instanceId));
  }

  #runningCount(): number {
    let count = 0;
    for (const runner of this.#runners.values()) {
      if (runner.status().running) count += 1;
    }
    return count;
  }

  /** The runner for `key` (already folder+instance resolved), creating one —
   *  wired with a `spawnFlight` that also wakes the queue once ITS child
   *  exits — the first time this key is seen. */
  #runnerFor(key: string): FlightRunner {
    let runner = this.#runners.get(key);
    // Stryker disable next-line ConditionalExpression: `start()` (called on
    // the returned runner immediately after, by every caller below) fully
    // overwrites `#status`/`#child` regardless of whether the instance is
    // reused or freshly constructed — reuse vs. recreate is provably
    // unobservable from any of this class's public methods.
    if (!runner) {
      runner = new FlightRunner({
        ...this.deps,
        spawnFlight: (folder, firings, budgetUsd, totalBudgetUsd, instanceId, taskScope) => {
          // MACHINE BUDGET HOLE FIX (STPA finding web-mt1qa7ij-c6wqgi): this
          // registry is the one thing that actually knows the live running
          // count — forward it so spawnFlight can cap ANY concurrent spawn,
          // not only one that happens to carry an instanceId. Computed
          // BEFORE this new runner's own status flips to running (that only
          // happens after `start()` gets this return value), so it reflects
          // OTHER flights only.
          const siblingsFlying = this.#runningCount() > 0;
          const child = this.deps.spawnFlight(
            folder,
            firings,
            budgetUsd,
            totalBudgetUsd,
            instanceId,
            taskScope,
            siblingsFlying,
          );
          return {
            pid: child.pid,
            kill: () => child.kill(),
            // FlightRunner.start() calls onExit exactly once with its own
            // status-transition callback. Draining the queue must run AFTER
            // that callback updates this folder's status to idle — draining
            // first would still see it as "running" and refuse to start the
            // next queued folder, so the wait NEVER resolves. Wrapping
            // (rather than registering a second, independent onExit) is what
            // guarantees that order.
            onExit: (cb) => {
              child.onExit((code) => {
                cb(code);
                this.#drainQueue();
              });
            },
          };
        },
      });
      this.#runners.set(key, runner);
    }
    return runner;
  }

  /** Start every queued folder/instance the cap now has room for, in FIFO
   *  order. */
  #drainQueue(): void {
    // Stryker disable next-line ConditionalExpression,EqualityOperator: the
    // `> 0` half of this guard is redundant with the `if (!next) break`
    // below — synchronous JS guarantees nothing else can empty `#queue`
    // between this check and the `shift()` two lines down, so `> 0` vs
    // `>= 0` (or dropping it to `true`) is provably unobservable.
    while (this.#queue.length > 0 && this.#runningCount() < this.maxConcurrent) {
      const next = this.#queue.shift();
      // Stryker disable next-line ConditionalExpression: needed only to
      // narrow `next` from `StartFlightInput | undefined` to
      // `StartFlightInput` for `next.folder` below — the `length > 0` guard
      // above already guarantees `shift()` returns a real element here.
      if (!next) break;
      const folder = this.#resolve(next.folder.trim());
      const key = this.#key(folder, next.instanceId);
      this.#queuedKeys.delete(key);
      this.#runnerFor(key).start(next);
    }
  }

  /**
   * Start a flight. Different (resolved) folders each get their own runner
   * and fly concurrently up to `maxConcurrent`; the SAME folder+instanceId
   * combination while it's already running is refused exactly like the
   * single-runner `FlightRunner.start()` — that refusal is delegated to the
   * per-key runner itself, not reimplemented. PARALLEL UNLOCK C: a caller
   * that sets `input.instanceId` gets its OWN runner even against a folder
   * that's already flying under a different instanceId — every existing
   * caller never sets it, so the folder alone stays the whole identity and
   * the single-flight-per-folder refusal is completely unchanged for them.
   * Beyond the cap, the request is queued (`queued: true`) rather than
   * refused — PARALLEL FLIGHTS 5/6's "flights beyond the cap queue rather
   * than fail" acceptance criterion.
   */
  start(input: StartFlightInput): StartFlightResult {
    const raw = input.folder?.trim() ?? '';
    if (raw.length === 0) {
      return { started: false, message: 'a folder path is required', status: IDLE_STATUS };
    }
    const folder = this.#resolve(raw);
    const instanceId = input.instanceId?.trim() || undefined;
    const key = this.#key(folder, instanceId);
    const runner = this.#runners.get(key);
    if (runner?.status().running) {
      return runner.start(input);
    }
    if (this.#queuedKeys.has(key)) {
      return {
        started: false,
        queued: true,
        message: `${folder} is already queued — waiting for a flight slot`,
        status: { ...IDLE_STATUS, folder, queued: true, instanceId: instanceId ?? null },
      };
    }
    if (this.#runningCount() >= this.maxConcurrent) {
      this.#queue.push(input);
      this.#queuedKeys.add(key);
      return {
        started: false,
        queued: true,
        message: `queued ${folder} — ${this.maxConcurrent} flight(s) already running`,
        status: { ...IDLE_STATUS, folder, queued: true, instanceId: instanceId ?? null },
      };
    }
    return this.#runnerFor(key).start(input);
  }

  /**
   * Adopt a folder's (and instance's) flight this registry never spawned —
   * see `flight/adopt.ts` and docs/RUNBOOK.md §4, "Dashboard server itself
   * dies while a detached flight-child keeps running". Gives
   * stop()/pause()/status() a real runner to act on instead of reporting
   * "no flight is running" for a project the store still (correctly) shows
   * 'flying'. A no-op when this registry already has a runner for the key —
   * never override a runner this process genuinely spawned itself, or a
   * flight already adopted earlier this boot.
   */
  adopt(folder: string, child: SpawnedFlight, instanceId?: string): void {
    const resolved = this.#resolve(folder);
    const id = instanceId?.trim() || null;
    const key = this.#key(resolved, id ?? undefined);
    if (this.#runners.has(key)) return;
    this.#runnerFor(key).adopt(child, resolved, id);
  }

  /** Request the flight against `folder` (and, for an N-way same-folder
   *  fleet, the specific `instanceId`) to stop. Cancels it out of the queue
   *  when it's merely waiting for a slot (never actually started); a no-op
   *  (not an error) for a folder/instance this registry has never seen. */
  stop(folder: string, instanceId?: string): StopFlightResult {
    const resolved = this.#resolve(folder);
    const key = this.#key(resolved, instanceId);
    if (this.#queuedKeys.has(key)) {
      this.#queuedKeys.delete(key);
      this.#queue = this.#queue.filter(
        (i) => this.#key(this.#resolve(i.folder.trim()), i.instanceId) !== key,
      );
      return {
        stopping: true,
        message: `removed ${resolved} from the flight queue`,
        status: IDLE_STATUS,
      };
    }
    const runner = this.#existing(folder, instanceId);
    if (!runner) return { stopping: false, message: 'no flight is running', status: IDLE_STATUS };
    return runner.stop();
  }

  /** Request the flight against `folder` (and instance, see `stop`) to pause
   *  after its current firing. A no-op (not an error) for a folder/instance
   *  this registry has never seen. */
  pause(folder: string, instanceId?: string): PauseFlightResult {
    const runner = this.#existing(folder, instanceId);
    if (!runner) return { pausing: false, message: 'no flight is running', status: IDLE_STATUS };
    return runner.pause();
  }

  /** One folder+instance's status — IDLE_STATUS for a combination this
   *  registry has never seen a flight against (never started, never any
   *  state to report); a synthetic `queued: true` status while it's waiting
   *  on the cap. Omitting `instanceId` targets the bare-folder key, exactly
   *  as every single-instance caller already does. */
  status(folder: string, instanceId?: string): FlightStatus {
    const resolved = this.#resolve(folder);
    const key = this.#key(resolved, instanceId);
    if (this.#queuedKeys.has(key)) {
      return {
        ...IDLE_STATUS,
        folder: resolved,
        queued: true,
        instanceId: instanceId?.trim() || null,
      };
    }
    return this.#existing(folder, instanceId)?.status() ?? IDLE_STATUS;
  }

  /** Every folder/instance this registry currently has anything to report
   *  for — running right now, idle-but-paused (Resume is offered), or queued
   *  (waiting on the cap). A folder whose flight ended cleanly and was never
   *  paused reports IDLE and is omitted, the same way a never-flown folder
   *  is: nothing to show the dashboard. Two instances of the same folder
   *  each get their own entry, distinguishable by `instanceId`. */
  statusAll(): readonly FlightStatus[] {
    const statuses: FlightStatus[] = [];
    for (const runner of this.#runners.values()) {
      const status = runner.status();
      if (status.running || status.paused) statuses.push(status);
    }
    for (const item of this.#queue) {
      const folder = this.#resolve(item.folder.trim());
      statuses.push({
        ...IDLE_STATUS,
        folder,
        queued: true,
        instanceId: item.instanceId?.trim() || null,
      });
    }
    return statuses;
  }
}
