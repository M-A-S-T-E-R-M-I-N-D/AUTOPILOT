// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Wires `runFleetLaunch` (fleet-launch.ts) for the DASHBOARD SERVER's own
 * `POST /api/fleet` route — the Fly bar's Lanes field (board
 * web-mtdcfel4-0bxf4h): the hub-aware partitioner `dashboard fleet` already
 * gives the CLI (`control/cli.ts`'s `case 'fleet'`) was otherwise reachable
 * only from a terminal, never the dashboard the operator is already looking
 * at. `fleet-launch.ts` stays deliberately pure (its own doc comment); this
 * file is the impure caller, the same role `control/cli.ts` already plays
 * for the CLI path — it just wires IO in-process (`postFly` calls the
 * already-live `FlightApi` directly) instead of a loopback HTTP call to a
 * SEPARATE process the way the CLI, a different process entirely, has to.
 */

import { openStore, recentTasks } from '@autopilot/store';
import {
  runFleetLaunch,
  type FleetCliArgs,
  type FleetLaunchPostBody,
  type FleetLaunchResult,
} from './fleet-launch.js';
import { deriveFlyProjectId } from './lock.js';
import type { StartFlightResult } from './runner.js';

export type FleetLaunchApi = (args: FleetCliArgs) => Promise<FleetLaunchResult>;

/**
 * `startFlight` is the live `FlightApi.start` — called directly, in-process,
 * once per lane. `staggerMs` matches the CLI's own default
 * (`AUTOPILOT_FLEET_STAGGER_MS`, 20s): lanes still must not be started
 * back-to-back (`runFleetLaunch`'s own doc comment explains why — the
 * `.git/index.lock` race is per-REPO, not per-caller).
 */
export function createFleetLaunchApi(
  dbPath: string,
  startFlight: (body: FleetLaunchPostBody) => StartFlightResult,
  staggerMs: number,
): FleetLaunchApi {
  return (args) =>
    runFleetLaunch(args, staggerMs, {
      loadOpenTasks: () => {
        const store = openStore(dbPath);
        try {
          const projectId = deriveFlyProjectId(args.folder);
          // The picker's own order, so the partition sees exactly the board
          // the lanes will pull from — same query control/cli.ts's `fleet`
          // case runs for the CLI path.
          return recentTasks(store.db, projectId, 200)
            .filter((t) => t.status === 'queued')
            .map((t) => ({ id: t.id, title: t.title }));
        } finally {
          store.close();
        }
      },
      postFly: (body) => {
        const result = startFlight(body);
        return Promise.resolve({
          status: result.started ? 200 : result.queued ? 202 : 409,
          started: result.started,
        });
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
}
