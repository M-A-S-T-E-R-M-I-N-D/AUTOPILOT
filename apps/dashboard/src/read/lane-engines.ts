// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0036 (GitHub #21 slice S1, "provider chip in the fly bar + lane
 * cards"): the CLI each live lane flies on, and for a Claude lane the backend
 * its CLI is routed to, keyed by the lane's `firingIdOf` key —
 * `<project>--<instanceId>` for a named fleet lane, the bare `<project>` for
 * the base flight — so a lane card can find its own from its firing id. The
 * fly bar's rows already name both (`FlightStatus.engine`/`backend`, read at
 * launch), but the cards are built from the store read, which knows nothing
 * of the flight registry, so the server merges this in as it does
 * `otlpConfigured` (`server/main.ts`).
 */

import type { FlightStatus } from '../flight/runner.js';

/** One live lane's engine, as a lane card names it. `backend` and
 *  `backendHost` ride only beside `claude`, as `FlightStatus` reports them. */
export interface LaneEngine {
  readonly engine: NonNullable<FlightStatus['engine']>;
  readonly backend?: NonNullable<FlightStatus['backend']>;
  readonly backendHost?: string;
}

/** The flight-status fields {@link laneEnginesByProject} reads. */
export type LaneEngineFlight = Pick<
  FlightStatus,
  'running' | 'folder' | 'instanceId' | 'engine' | 'backend' | 'backendHost'
>;

/**
 * Every running flight that names an engine, grouped by the project its
 * folder flies (`projectIdOf`, the dashboard's `deriveFlyProjectId`) and keyed
 * within it by lane. A backend with no engine is a Claude flight, since only
 * one reports a backend. A flight that names neither is left out, so a lane
 * card names no engine where the fly bar row names none.
 */
export function laneEnginesByProject(
  flights: readonly LaneEngineFlight[],
  projectIdOf: (folder: string) => string,
): ReadonlyMap<string, Readonly<Record<string, LaneEngine>>> {
  const byProject = new Map<string, Map<string, LaneEngine>>();
  for (const f of flights) {
    if (!f.running || !f.folder) continue;
    const engine = f.engine ?? (f.backend ? 'claude' : undefined);
    if (!engine) continue;
    const projectId = projectIdOf(f.folder);
    const lanes = byProject.get(projectId) ?? new Map<string, LaneEngine>();
    lanes.set(f.instanceId ? `${projectId}--${f.instanceId}` : projectId, {
      engine,
      ...(f.backend ? { backend: f.backend } : {}),
      ...(f.backendHost ? { backendHost: f.backendHost } : {}),
    });
    byProject.set(projectId, lanes);
  }
  // fromEntries defines each key as an own property, whatever its name.
  return new Map([...byProject].map(([id, lanes]) => [id, Object.fromEntries(lanes)]));
}

/**
 * `view` with each project that has a running lane on a named engine carrying
 * those lanes as `laneEngines`. Every other project, and the view itself when
 * no flight names an engine, pass through as they were.
 */
export function withLaneEngines<
  P extends { readonly id: string },
  V extends { readonly projects: readonly P[] },
>(view: V, flights: readonly LaneEngineFlight[], projectIdOf: (folder: string) => string): V {
  const byProject = laneEnginesByProject(flights, projectIdOf);
  if (byProject.size === 0) return view;
  return {
    ...view,
    projects: view.projects.map((p) => {
      const laneEngines = byProject.get(p.id);
      return laneEngines ? { ...p, laneEngines } : p;
    }),
  };
}
