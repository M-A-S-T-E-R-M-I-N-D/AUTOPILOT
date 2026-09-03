// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { dirname } from 'node:path';
import { openStore, listProjects, type ProjectRow } from '@autopilot/store';
import { samePath } from '../paths.js';
import { isFlightOwnerAlive } from '../flight/lock.js';
import type { FlightRunnerDeps } from '../flight/runner.js';

/** The slice of watchdog capability that decides whether to spawn a flight —
 *  the flight-spawning half of RING-0 SUPERVISOR (web-msq9hfhd-ebmy8k),
 *  alongside the already-shipped server-lifecycle half (watchdog.ts). */
export interface FlightWatchdogControl {
  /** The target project's current status, or null when it has never been onboarded. */
  projectStatus(): ProjectRow['status'] | null;
  /**
   * Whether a live process still holds this project's flight lock — checked
   * only when `projectStatus()` reports `'flying'`. Optional: omitting it (or
   * returning true) preserves the pre-existing "flying is untouchable"
   * behavior. Exists to reconcile a project stuck on `'flying'` forever
   * because its flight process died ungracefully (SIGKILL, host reboot)
   * before its own `finally` block (fly.ts) could flip the status back — see
   * docs/RUNBOOK.md, "Recovery: a flight died without releasing 'flying'".
   */
  flyingOwnerAlive?(): boolean;
  /** Spawn a real flight against the configured target. */
  spawnFlight(): void;
}

export interface FlightWatchdogTickResult {
  readonly spawned: boolean;
  readonly status: ProjectRow['status'] | null;
}

/** Statuses a tick treats as "idle, safe to (re)launch": never onboarded
 *  (`null`) or sitting `registered` (a previous flight ended cleanly). Every
 *  other status is left alone deliberately — `flying` is already going,
 *  `paused` is an explicit operator hold that only Resume (not the watchdog)
 *  should clear, and the reserved `hibernating`/`needs_you` states exist
 *  precisely to keep an unattended loop from barreling through them. */
const FLYABLE_STATUSES: ReadonlySet<ProjectRow['status'] | null> = new Set(['registered', null]);

/**
 * One flight-spawning tick: the "not flying → spawn" counterpart to
 * `watchdogTick`'s "not running → start", scoped to a single operator-chosen
 * target instead of the server process itself. Opt-in only — the CLI wires
 * this up exclusively when the operator names a folder on `watch`, the same
 * explicit-consent posture as the watchdog daemon itself (you run it in a
 * window; it never runs unless you start it).
 *
 * A `'flying'` status is normally left alone (see `FLYABLE_STATUSES`), but a
 * flight that died ungracefully (SIGKILL, host reboot) never reaches the
 * `finally` block that flips it back — so `'flying'` alone can't prove a
 * flight is actually still running. `flyingOwnerAlive()`, when the control
 * implements it, closes that gap by checking the same lock file the flight
 * itself holds; only a confirmed-dead owner reconciles the status here,
 * everything else keeps the existing hands-off behavior.
 */
export function flightWatchdogTick(control: FlightWatchdogControl): FlightWatchdogTickResult {
  const status = control.projectStatus();
  const abandonedFlying = status === 'flying' && control.flyingOwnerAlive?.() === false;
  if (!abandonedFlying && !FLYABLE_STATUSES.has(status)) return { spawned: false, status };
  control.spawnFlight();
  return { spawned: true, status };
}

/** Guards a flight-spawn attempt (RING-0 SUPERVISOR, web-msq9hfhd-ebmy8k)
 *  against the two things that must never overlap it: a flight this daemon
 *  already launched still running, and a landing-ritual tick mid `git
 *  checkout`/merge against the same target repo's working tree (see
 *  LandWatchdogControl.land — GitVcs.land checks the base branch out,
 *  merges, then checks the flight branch back out; a flight spawned into
 *  that window would start work against whatever branch happens to be
 *  checked out at that instant). Requires the server itself confirmed
 *  running first — the dashboard is what records the flight's progress. */
export interface FlightSpawnGuardState {
  readonly serverRunning: boolean;
  readonly spawnedFlightRunning: boolean;
  readonly landInProgress: boolean;
}

export function canSpawnFlight(state: FlightSpawnGuardState): boolean {
  return state.serverRunning && !state.spawnedFlightRunning && !state.landInProgress;
}

export interface FlightWatchdogOptions {
  readonly dbPath: string;
  /** Absolute path to the folder the watchdog keeps flying. */
  readonly targetFolder: string;
  readonly spawnFlight: FlightRunnerDeps['spawnFlight'];
  readonly firings: number;
  readonly budgetUsd: number;
  readonly totalBudgetUsd?: number;
}

/** Real `FlightWatchdogControl`: reads project status fresh from the store
 *  every tick (a flight is a separate process that writes its own status
 *  transitions — see fly.ts — so nothing here can cache it) and spawns via
 *  the same `spawnFlight` the dashboard's own FlightRunner uses. */
export function createFlightWatchdogControl(options: FlightWatchdogOptions): FlightWatchdogControl {
  return {
    projectStatus: () => {
      const store = openStore(options.dbPath, { readonly: true });
      try {
        const project = listProjects(store.db).find((p) =>
          samePath(p.root_path, options.targetFolder),
        );
        return project ? project.status : null;
      } finally {
        store.close();
      }
    },
    // No instanceId: `watch` targets one un-instanced folder.
    flyingOwnerAlive: () => isFlightOwnerAlive(dirname(options.dbPath), options.targetFolder),
    spawnFlight: () => {
      options.spawnFlight(
        options.targetFolder,
        options.firings,
        options.budgetUsd,
        options.totalBudgetUsd,
      );
    },
  };
}
