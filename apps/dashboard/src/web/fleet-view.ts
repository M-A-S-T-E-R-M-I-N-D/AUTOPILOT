// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure fleet-grid diff-signature math — client-only (no server counterpart),
 * so it lives in `web/` rather than `shared/` (epic 0002 "shell
 * decomposition", slice 2: feature-module split of `shell.ts`), following
 * the same diff-signature pattern `flights.ts`'s `flightsSig` and
 * `search-history.ts`'s `searchProjectsSig` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The fields {@link fleetStateSig} reads off the polled/streamed fleet
 *  state. `totals`/`projects` are opaque here — the whole sub-object is
 *  hashed via `JSON.stringify`, unlike `flightsSig`/`searchProjectsSig`'s
 *  hand-picked field joins, because every field of both matters to the
 *  fleet grid's render (project cards read dozens of fields each). */
export interface FleetStateLike {
  readonly totals: unknown;
  readonly projects: unknown;
  readonly empty: boolean;
}

/** A diff signature for the whole fleet state — changes only when totals,
 *  the project list, or the empty-fleet flag actually changed. The live
 *  stream ticks every ~1.5s even when nothing moved; `generatedAt` is
 *  deliberately excluded (it changes every push) so a tick that changed
 *  nothing else never tears out and rebuilds every card. */
export function fleetStateSig(state: FleetStateLike): string {
  return JSON.stringify({ t: state.totals, p: state.projects, e: state.empty });
}
