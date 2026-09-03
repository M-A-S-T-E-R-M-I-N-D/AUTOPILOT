// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { dirname, join } from 'node:path';
import { slugify } from '@autopilot/onboarding';

/** Where a flight's linked worktree lives and which branch it's checked out on. */
export interface WorktreePlan {
  readonly path: string;
  readonly branch: string;
}

/**
 * Bash containment slice 3 (docs/epics/0004-bash-containment-worktree.md):
 * derives the linked worktree a flight's Bash actually runs in, physically
 * separate from `target`. Always a SIBLING of `target` (`dirname(target)`),
 * never nested inside it — a worktree nested under target would put the
 * escape hatch this whole mechanism exists to close right back inside the
 * guarded tree (a `cd ../..`-class walk from a nested worktree reaches
 * target directly, same shape as the original hole). Keyed by `projectId` so
 * concurrent flights against different targets never collide, and reused
 * (`ensureWorktree` is idempotent) across firings and across flights of the
 * SAME target instead of being recreated every run.
 *
 * PARALLEL UNLOCK C (N-way same-folder spawn): `instanceId`, when given,
 * folds into the key so two flight INSTANCES against the SAME project each
 * get their own physically separate worktree + branch instead of fighting
 * over one `git worktree` checkout (git refuses two worktrees on the same
 * branch, and two processes writing the same directory would corrupt each
 * other's containment baseline). Slugified — an instance id is not yet
 * trusted input the way `projectId` already is (derived from a slug itself),
 * and this segment feeds directly into a filesystem path, so it must never
 * carry a path separator or `..` segment. Omitted (the default), this is
 * BYTE-FOR-BYTE the single-instance plan every existing caller already
 * depends on.
 */
export function deriveWorktreePlan(
  target: string,
  projectId: string,
  instanceId?: string,
): WorktreePlan {
  const key = instanceId ? `${projectId}--${slugify(instanceId)}` : projectId;
  return {
    path: join(dirname(target), '.autopilot-worktrees', key),
    branch: `autopilot/flight-worktree-${key}`,
  };
}
