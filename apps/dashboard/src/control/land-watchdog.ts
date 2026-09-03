// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { openStore, listProjects, type ProjectRow } from '@autopilot/store';
import { GitVcs } from '@autopilot/engine';
import { samePath } from '../paths.js';
import type { LandingExecuteApiResult } from '../landing/execute.js';
import {
  gatherLandingOverlaps,
  gatherAheadSiblings,
  type LandingOverlapWarning,
  type AheadSibling,
} from '../landing/overlap.js';
import { deriveFlyProjectId } from '../flight/lock.js';

/** The slice of watchdog capability that decides whether to land a project's
 *  checked-out branch — the landing-ritual half of RING-0 SUPERVISOR
 *  (web-msq9hfhd-ebmy8k), alongside the already-shipped server-lifecycle
 *  (watchdog.ts) and flight-spawning (flight-watchdog.ts) halves. */
export interface LandWatchdogControl {
  /** How many commits the target's checked-out branch is ahead of its base —
   *  0 means nothing to land, so the real (gate-running) attempt below is
   *  skipped entirely. */
  landableCommitCount(): Promise<number>;
  /** Sibling flight branches whose OWN unlanded hunks overlap what this land
   *  would merge (LANDING OVERLAP DETECTOR, web-msw5zxfi-oa2olf). Optional —
   *  a control without it lands exactly as before. */
  overlapWarnings?(): Promise<readonly LandingOverlapWarning[]>;
  /** Every sibling flight branch with commits ahead of base, overlap or not
   *  (LANDING STRAGGLER GUARD, web-mt5yrpn8-ez0xh4) — informational, checked
   *  only once this tick is actually about to land (no overlap refusal in
   *  the way), so the ritual can name who's about to be left behind instead
   *  of merging silently. Optional — a control without it lands exactly as
   *  before, with no straggler reporting. */
  aheadSiblings?(): Promise<readonly AheadSibling[]>;
  /** Run one real gate-then-merge landing attempt against the target. */
  land(): Promise<LandingExecuteApiResult | null>;
}

export interface LandWatchdogTickResult {
  readonly attempted: boolean;
  readonly result: LandingExecuteApiResult | null;
  /** Non-empty when this tick REFUSED to land because a sibling's unlanded
   *  work overlaps the same changed lines — flagged for lead consolidation
   *  instead of a blind ritual merge. */
  readonly overlaps?: readonly LandingOverlapWarning[];
  /** Non-empty when this tick landed (or is about to) while at least one
   *  sibling flight branch still has its OWN unlanded commits on unrelated
   *  files — surfaced, never blocking, so those branches don't silently turn
   *  into stragglers the moment base moves past them. */
  readonly stragglers?: readonly AheadSibling[];
}

/**
 * One landing-ritual tick: the "commits ahead → land" counterpart to
 * `flightWatchdogTick`'s "idle → spawn", scoped to whatever the target's
 * checked-out branch has already accumulated. Cheap to poll every tick —
 * `landableCommitCount` is a single `git log` call, so a quiet project costs
 * almost nothing — the real gate-then-merge attempt (`land`, which runs the
 * project's full verification gate) only fires once there is actually
 * something to land.
 */
export async function landWatchdogTick(
  control: LandWatchdogControl,
): Promise<LandWatchdogTickResult> {
  const count = await control.landableCommitCount();
  if (count === 0) return { attempted: false, result: null };
  const overlaps = (await control.overlapWarnings?.()) ?? [];
  if (overlaps.length > 0) return { attempted: false, result: null, overlaps };
  const stragglers = (await control.aheadSiblings?.()) ?? [];
  const result = await control.land();
  return stragglers.length > 0
    ? { attempted: true, result, stragglers }
    : { attempted: true, result };
}

export interface LandWatchdogOptions {
  readonly dbPath: string;
  /** Absolute path to the folder the watchdog keeps landed. */
  readonly targetFolder: string;
  /** Executes one real gate-then-merge attempt for a known project id.
   *  Injected — same seam as `FlightWatchdogOptions.spawnFlight` — so this
   *  module stays transport-agnostic: `cli.ts` wires a real POST to the live
   *  server's own `/api/landing/execute` (reusing its already-correct
   *  gate/merge/self-restart policy instead of duplicating it here), tests
   *  wire a fake or the in-process `createLandingExecuteApi` directly. */
  readonly land: (projectId: string) => Promise<LandingExecuteApiResult | null>;
}

/** Real `LandWatchdogControl`: reads the target's project row + git state
 *  fresh every tick (same "never cache it" posture as
 *  `createFlightWatchdogControl` — a flight is a separate process that
 *  commits to this same repo) before handing off to the injected `land`. */
export function createLandWatchdogControl(options: LandWatchdogOptions): LandWatchdogControl {
  const findProject = (): ProjectRow | null => {
    const store = openStore(options.dbPath, { readonly: true });
    try {
      return (
        listProjects(store.db).find((p) => samePath(p.root_path, options.targetFolder)) ?? null
      );
    } finally {
      store.close();
    }
  };
  return {
    landableCommitCount: async () => {
      const project = findProject();
      if (!project) return 0;
      const vcs = new GitVcs(project.root_path);
      const base = await vcs.defaultBranch();
      if (!base) return 0;
      const branch = await vcs.currentBranch();
      if (!branch || branch === base) return 0;
      return (await vcs.commitsAhead(base)).length;
    },
    // Branch glob key is deriveFlyProjectId(root_path) — the id fly.ts
    // actually names flight-worktree branches with (see readLandingInfo's
    // worktreePlan note: the store id and the fly id can differ for a
    // self-onboarded project). Degrades to [] the same way
    // landableCommitCount degrades to 0 — never wedges the ritual.
    overlapWarnings: async () => {
      const project = findProject();
      if (!project) return [];
      const vcs = new GitVcs(project.root_path);
      const base = await vcs.defaultBranch();
      if (!base) return [];
      const branch = await vcs.currentBranch();
      if (!branch || branch === base) return [];
      const myFiles = [...new Set((await vcs.commitsAhead(base)).flatMap((c) => c.files))];
      return gatherLandingOverlaps(
        vcs,
        project.root_path,
        deriveFlyProjectId(project.root_path),
        branch,
        base,
        myFiles,
      );
    },
    aheadSiblings: async () => {
      const project = findProject();
      if (!project) return [];
      const vcs = new GitVcs(project.root_path);
      const base = await vcs.defaultBranch();
      if (!base) return [];
      const branch = await vcs.currentBranch();
      if (!branch || branch === base) return [];
      return gatherAheadSiblings(
        vcs,
        project.root_path,
        deriveFlyProjectId(project.root_path),
        branch,
        base,
      );
    },
    land: async () => {
      const project = findProject();
      return project ? options.land(project.id) : null;
    },
  };
}
