// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ONLY A VERIFIED HEAD IS PUBLISHED (four-lane rung, 2026-09-19).
 *
 * A lane's sync-back is the moment its private branch becomes everyone's:
 * the lane head is fast-forwarded or merged into the shared flight branch,
 * and from there it lands on main. That step used to look only at git — is
 * the lane ahead, does it merge — never at whether the head had passed a
 * gate. Firing 109 committed, left a second file uncommitted beside the
 * commit, and the engine rightly refused to gate a commit it could not
 * judge in isolation (`unverifiable`, nothing reverted). The sync-back then
 * published that head anyway; the flight-end full gate went red on a
 * formatting fault, and the landing would have refused the whole rung.
 *
 * So the lane carries one bit across its firings: is the tree at HEAD
 * something a gate has actually judged green? A green gate sets it. A
 * revert leaves it as it was (the tree is back to the last judged state). A
 * checkpoint clears it: an unfinished unit is never published, whatever
 * its telemetry gate said (that gate runs the impacted tests, not the
 * suite — the five-lane rung published two green-looking checkpoints and
 * the full suite went red behind them); the firing that finishes the unit
 * is the one that gets judged. An unverifiable firing that moved the head
 * clears it too — and while it is
 * clear, no sync-back runs: not per firing, not at flight end, not at the
 * next launch's catch-up. The commits stay parked on the lane branch until
 * a later firing's green gate judges the whole tree above them, or the
 * operator does. The bit survives a flight as an events row keyed by the
 * head's sha, so a fresh launch neither trusts a parked head nor keeps
 * distrusting one the operator has since moved.
 */

import type { GateResultKind } from '@autopilot/engine';

export interface LaneHeadVerification {
  readonly verified: boolean;
  readonly reason: string;
}

/** The slice of a firing record this rule reads. */
export interface FiringVerdictLike {
  readonly firing: number;
  readonly gateResult: GateResultKind;
  readonly headAdvanced: boolean;
  readonly gateChecks: readonly { readonly pass: boolean }[];
  readonly gateError?: string | null;
}

export const FRESH_LANE: LaneHeadVerification = {
  verified: true,
  reason: 'fresh lane at the shared tip',
};

/**
 * The lane head's verification after `record`'s firing. Returns `prev`
 * ITSELF (same object) when the firing changed nothing about it, so a
 * caller can persist only real transitions.
 */
export function laneHeadAfterFiring(
  prev: LaneHeadVerification,
  record: FiringVerdictLike,
): LaneHeadVerification {
  switch (record.gateResult) {
    case 'passed':
      return { verified: true, reason: `firing ${record.firing} gate green` };
    case 'checkpointed':
      // Half a unit, packed up so nothing is lost — and parked here until the
      // firing that finishes it is judged. Its telemetry gate is not a verdict
      // on the shared branch.
      return {
        verified: false,
        reason: `firing ${record.firing} checkpointed: an unfinished unit is never published`,
      };
    case 'unverifiable':
      // A crashed or refused gate on a commit that stayed in place: nobody
      // judged this head. Without a commit there is nothing new to distrust.
      return record.headAdvanced
        ? {
            verified: false,
            reason: `firing ${record.firing} unverifiable: ${record.gateError ?? 'no reason recorded'}`,
          }
        : prev;
    case 'reverted':
    case 'no-commit':
    case 'skipped':
      return prev;
  }
}

/** One persisted `lane-head-verified` / `lane-head-unverified` events row. */
export interface LaneHeadMarker {
  readonly verified: boolean;
  readonly sha: string;
  readonly reason: string;
}

export const LANE_HEAD_VERIFIED_EVENT = 'lane-head-verified';
export const LANE_HEAD_UNVERIFIED_EVENT = 'lane-head-unverified';

interface RawLaneHeadMarker {
  readonly branch?: unknown;
  readonly sha?: unknown;
  readonly reason?: unknown;
}

/**
 * The newest marker persisted for `branch`, from events rows NEWEST FIRST.
 * Malformed rows and other branches' rows are skipped, never thrown on.
 */
export function latestLaneHeadMarker(
  rows: readonly { readonly type: string; readonly payload: string | null }[],
  branch: string,
): LaneHeadMarker | null {
  for (const row of rows) {
    if (row.type !== LANE_HEAD_VERIFIED_EVENT && row.type !== LANE_HEAD_UNVERIFIED_EVENT) continue;
    if (row.payload === null) continue;
    let raw: RawLaneHeadMarker;
    try {
      raw = JSON.parse(row.payload) as RawLaneHeadMarker;
    } catch {
      continue;
    }
    if (raw.branch !== branch || typeof raw.sha !== 'string') continue;
    return {
      verified: row.type === LANE_HEAD_VERIFIED_EVENT,
      sha: raw.sha,
      reason: typeof raw.reason === 'string' ? raw.reason : '',
    };
  }
  return null;
}

/**
 * What a fresh launch may assume about the lane head it found: a parked,
 * unverified head is still parked only while it is the SAME commit the
 * marker named — a head the operator (or a hand merge) has since moved is
 * judged afresh, and a verified or absent marker means the lane is clean.
 */
export function laneHeadAtLaunch(
  marker: LaneHeadMarker | null,
  headSha: string,
): LaneHeadVerification {
  if (marker === null || marker.verified) return FRESH_LANE;
  if (marker.sha !== headSha) {
    return { verified: true, reason: 'the lane head moved since it was marked unverified' };
  }
  return { verified: false, reason: `parked since a previous flight: ${marker.reason}` };
}
