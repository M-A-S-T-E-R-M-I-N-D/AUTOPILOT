// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { openStore, listProjects, type ProjectRow } from '@autopilot/store';
import { flightWatchdogTick, type FlightWatchdogControl } from './flight-watchdog.js';

/**
 * The fleet-wide counterpart to `flightWatchdogTick` (docs/epics/0003-ring-0-
 * fleet-watchdog.md): ticks EVERY registered project in one pass instead of
 * one operator-named target. Reuses `flightWatchdogTick`'s exact per-project
 * decision — built fresh per row below — so the FLYABLE_STATUSES boundary
 * (registered/never-onboarded spawn; flying/paused/hibernating/needs_you left
 * alone) is enforced identically whether an operator is watching one folder
 * or the whole fleet is ticking unattended. No new idle-boundary logic is
 * invented here, per the epic's constraint to reuse existing primitives.
 */
export interface FleetFlightWatchdogControl {
  /** Every registered project, fresh from the store this tick. */
  listProjects(): readonly ProjectRow[];
  /** Spawn a flight against one idle project — the caller wires this to the
   *  FlightRunnerRegistry's start() so the operator's maxConcurrent cap
   *  queues fairly (FIFO) across the whole fleet, exactly like today's
   *  manual multi-fly path, instead of reimplementing quota logic here. */
  spawnFlight(project: ProjectRow): void;
}

export interface FleetFlightWatchdogTickResult {
  /** Every project this tick spawned a flight for, in listProjects() order. */
  readonly spawned: readonly ProjectRow[];
}

export function fleetFlightWatchdogTick(
  control: FleetFlightWatchdogControl,
): FleetFlightWatchdogTickResult {
  const spawned: ProjectRow[] = [];
  for (const project of control.listProjects()) {
    const perProject: FlightWatchdogControl = {
      projectStatus: () => project.status,
      spawnFlight: () => control.spawnFlight(project),
    };
    if (flightWatchdogTick(perProject).spawned) spawned.push(project);
  }
  return { spawned };
}

export interface FleetFlightWatchdogOptions {
  readonly dbPath: string;
  readonly spawnFlight: (project: ProjectRow) => void;
}

/** Real `FleetFlightWatchdogControl`: reads every project fresh from the
 *  store every tick (same "never cache it" posture as
 *  `createFlightWatchdogControl` — each project's own flight process writes
 *  its own status transitions) before handing spawns off to the injected
 *  `spawnFlight`. */
export function createFleetFlightWatchdogControl(
  options: FleetFlightWatchdogOptions,
): FleetFlightWatchdogControl {
  return {
    listProjects: () => {
      const store = openStore(options.dbPath, { readonly: true });
      try {
        return listProjects(store.db);
      } finally {
        store.close();
      }
    },
    spawnFlight: options.spawnFlight,
  };
}
