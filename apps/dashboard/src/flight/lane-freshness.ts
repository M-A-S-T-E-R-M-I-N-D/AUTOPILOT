// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * LANE FRESHNESS AT LAUNCH — which halves of the launch-time sync a lane
 * may run while a sibling flight holds the project's lock.
 *
 * The launch sync has two halves with two different write surfaces:
 *
 *  - CATCH-UP (`syncWorktreeBranch`): drains the lane's unlanded commits
 *    INTO the target branch — it runs `git merge` in the shared primary
 *    checkout, the exact surface a concurrently running sibling may be
 *    touching. It must yield to a live sibling lock (the flight-vs-flight
 *    race that once discarded uncommitted work through a concurrent
 *    `reset --hard`).
 *  - FORWARD (`fastForwardWorktree`): brings the lane's OWN worktree to the
 *    target's tip — `git merge --ff-only` inside the lane directory. It
 *    reads a ref and writes only this lane. Nothing a sibling does in the
 *    primary checkout can race it.
 *
 * Until 2026-09-12 both halves sat behind one guard, so in a staggered
 * fleet round every lane after the first launched while the first held
 * the lock — and launched STALE. The flight logs say it plainly: the skip
 * line fired 51 times against 33 forwards across six lane logs, and the
 * stale lanes are where round 3's revert/reapply storm (autoformat undone
 * and redone five times, synced sibling features reverted) and its
 * aborted sync-backs came from. Now only the half that needs the guard
 * yields to it.
 */

export interface LaunchSyncPlan {
  /** Drain lane → target in the primary checkout. */
  readonly catchUp: boolean;
  /** Fast-forward the lane's own worktree onto the target tip. */
  readonly forward: boolean;
  /** The operator-facing line for whatever was skipped, when anything was. */
  readonly skipped?: string;
}

/** Decides the launch-time sync from one fact: is a sibling flight live? */
export function planLaunchSync(siblingLockLive: boolean): LaunchSyncPlan {
  if (!siblingLockLive) return { catchUp: true, forward: true };
  return {
    catchUp: false,
    forward: true,
    skipped:
      'catch-up sync skipped: another flight already holds a live lock for this ' +
      'project — running git directly against the shared primary checkout here ' +
      "would race it (the lane's own fast-forward still runs: it writes only this lane).",
  };
}
