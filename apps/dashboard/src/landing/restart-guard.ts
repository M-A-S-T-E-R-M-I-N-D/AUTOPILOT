// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A FLEET LAUNCH AND A SELF-RESTART NEVER OVERLAP (2026-09-30). Landing the
 * dashboard's own repo rebuilds and restarts the server right after it
 * answers "landed", and a fleet launch staggers its lanes 20 seconds apart
 * inside that same server. A launch sent right after a landing started the
 * base lane, then the restart closed the process and lanes 2 to 5 never
 * started; nothing said so. Both sides now consult one guard: a launch is
 * refused while a restart is pending, and a restart waits for a launch
 * already under way before it releases the port.
 */

import type { FleetLaunchApi } from '../flight/fleet-launch-api.js';

export interface RestartGuard {
  /** A rebuild for a self-restart is under way. */
  pending: boolean;
  /** Fleet launches still starting their lanes. */
  launches: number;
}

export function createRestartGuard(): RestartGuard {
  return { pending: false, launches: 0 };
}

/** The line a refused launch answers with. */
export const RESTART_PENDING_LINE =
  'fleet: not launched — the dashboard is rebuilding to restart after a landing; launch again once it is back';

/** `api`, refused while a restart is pending and counted while it runs. */
export function guardFleetLaunch(api: FleetLaunchApi, guard: RestartGuard): FleetLaunchApi {
  return async (args) => {
    if (guard.pending) return { ok: false, lines: [RESTART_PENDING_LINE] };
    guard.launches += 1;
    try {
      return await api(args);
    } finally {
      guard.launches -= 1;
    }
  };
}

/** How long a restart waits for launches under way, and how often it looks. */
export const LAUNCH_WAIT_MAX_MS = 3 * 60_000;
const LAUNCH_WAIT_POLL_MS = 1_000;

/**
 * Resolves once no fleet launch is under way, or after `maxMs` — a launch
 * that hangs must not keep a landed rebuild from ever being served.
 */
export async function waitForLaunches(
  guard: RestartGuard,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => number = Date.now,
  maxMs: number = LAUNCH_WAIT_MAX_MS,
): Promise<void> {
  const deadline = now() + maxMs;
  while (guard.launches > 0 && now() < deadline) await sleep(LAUNCH_WAIT_POLL_MS);
}
