// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { isProcessAlive } from '@autopilot/engine';
import type { SpawnedFlight } from './runner.js';

/**
 * Wraps a bare pid this process never spawned as a `SpawnedFlight`, so a
 * `FlightRunnerRegistry` can `adopt()` it — closes the gap docs/RUNBOOK.md §4
 * calls "partially open": a detached flight-child survives a dashboard
 * restart (`flight/spawn-flight.ts` spawns `detached: true` for exactly this
 * reason), but the restart's brand-new registry has no `ChildProcess` handle
 * for it, so Stop/Pause report "no flight is running" even though the store
 * still shows `'flying'` and the lock's pid is genuinely alive. There's no
 * Node 'exit' event for a pid we didn't spawn, so `onExit` polls `isAlive`
 * instead; there's no handle to call `.kill()` on, so `kill()` signals the
 * OS pid directly.
 */
export interface AdoptFlightDeps {
  readonly isAlive: (pid: number) => boolean;
  readonly killPid: (pid: number) => void;
  /** How often `onExit` polls for the adopted pid's death. Defaults to 5s —
   *  a detached flight's own firing loop runs for minutes, so sub-second
   *  precision buys nothing but extra wakeups. */
  readonly pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 5_000;

export function adoptFlight(pid: number, deps: AdoptFlightDeps): SpawnedFlight {
  return {
    pid,
    kill: () => deps.killPid(pid),
    onExit: (cb) => {
      const timer = setInterval(() => {
        if (deps.isAlive(pid)) return;
        clearInterval(timer);
        cb(null);
      }, deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
      // Never hold the dashboard process open just to keep polling a foreign pid.
      timer.unref();
    },
  };
}

/** Real deps: the same OS-level liveness probe the lock file's own liveness
 *  check uses (`isProcessAlive`, shared via `flight/lock.ts`) so "alive" can
 *  never drift between the two, plus a plain SIGTERM. Swallows the signal
 *  failing (ESRCH: the pid already died between the last poll and this call;
 *  EPERM: this process can't signal it) — not a crash either way, since the
 *  next poll tick notices the pid is gone and settles the status regardless
 *  of whether this call actually delivered the signal. */
export const realAdoptFlightDeps: AdoptFlightDeps = {
  isAlive: isProcessAlive,
  killPid: (pid) => {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // handled — see comment above
    }
  },
};
