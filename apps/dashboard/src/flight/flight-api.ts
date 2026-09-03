// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Wires a `FlightRunnerRegistry` up to the shape `server.ts`'s `FlightApi`
 * expects. Pulled out of `server/main.ts` (OPS BUG web-mt1w1ik9-zfgaeb: a
 * per-instance `stop`/`pause` on a same-folder fleet member was reporting
 * "no flight is running" because the glue there accepted only `folder` and
 * silently dropped `instanceId` before it ever reached the registry) so this
 * thin routing layer is unit-testable against a fake registry instead of
 * only reachable through a live HTTP server.
 */

import type { FlightRunnerRegistry } from './registry.js';
import {
  IDLE_STATUS,
  type FlightStatus,
  type PauseFlightResult,
  type StartFlightInput,
  type StartFlightResult,
  type StopFlightResult,
} from './runner.js';

export interface FlightApi {
  status(): FlightStatus;
  start(input: StartFlightInput): StartFlightResult;
  stop(folder?: string, instanceId?: string): StopFlightResult;
  pause(folder?: string, instanceId?: string): PauseFlightResult;
  defaultFolder(): string;
  statusAll(): readonly FlightStatus[];
}

/** Wraps `registry` for `server.ts`. `folder ?? runningFolder()` preserves
 *  the legacy single-flight fly bar's behavior (it sends no folder at all):
 *  fall back to whichever folder is actually running. `instanceId` now rides
 *  along unconditionally instead of being dropped on the floor. */
export function createFlightApi(registry: FlightRunnerRegistry): FlightApi {
  const runningFolder = (): string => registry.statusAll().find((s) => s.running)?.folder ?? '';

  return {
    status: () => registry.statusAll()[0] ?? IDLE_STATUS,
    start: (input) => registry.start(input),
    stop: (folder, instanceId) => registry.stop(folder ?? runningFolder(), instanceId),
    pause: (folder, instanceId) => registry.pause(folder ?? runningFolder(), instanceId),
    defaultFolder: () => process.cwd(),
    statusAll: () => registry.statusAll(),
  };
}
