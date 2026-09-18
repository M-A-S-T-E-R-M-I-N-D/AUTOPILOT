// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The status a project is left in when ONE of its flights ends.
 *
 * The flight-end `finally` in `fly.ts` used to write `'registered'`
 * unconditionally — correct for a solo flight, wrong for an N-way round: the
 * first lane to finish cleared `'flying'` while its siblings were still
 * firing, so the fleet card showed nothing in the air for the rest of the
 * round (observed 2026-09-18, a 2-lane round: lane 1 finished 10:53, lane 2
 * flew on to 11:02, the dashboard read `flying=0` throughout). `paused` is
 * an operator hold and still wins — Pause means "hold until Resume",
 * whatever the siblings are doing.
 */
export type FlightEndStatus = 'paused' | 'registered' | 'flying';

export interface FlightEndInput {
  /** This flight honoured a pause request — the project holds. */
  readonly paused: boolean;
  /** Another live flight (a sibling lane, or any other process) still holds
   *  an engine lock for this project — see `isAnyFlightLockLive` with this
   *  flight's own pid excluded. */
  readonly siblingLive: boolean;
}

export function flightEndStatus(input: FlightEndInput): FlightEndStatus {
  if (input.paused) return 'paused';
  return input.siblingLive ? 'flying' : 'registered';
}
