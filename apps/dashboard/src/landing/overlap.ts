// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The LANDING preview's same-file overlap warning (RESEARCH-LIBRARY fleet
 * anti-duplication, defense-stack item 3): before merging THIS branch onto
 * base, checks whether any sibling flight branch (same-folder parallel
 * instance, `autopilot/flight-worktree-<projectId>` or its
 * `--<instanceId>`-suffixed form — the naming convention
 * `flight/worktree.ts`'s `deriveWorktreePlan` writes) has its OWN unlanded
 * commits touching the same files: a same-file landing about to collide with
 * work a sibling hasn't landed yet. File-level candidates come from
 * `@autopilot/engine`'s `detectLandingOverlap` (pure set-intersection), then
 * `narrowToHunkOverlap` drops any candidate whose actual changed lines don't
 * intersect — two branches touching opposite ends of the same large file
 * aren't a real collision risk. Mergiraf as a resolution aid remains a
 * follow-up.
 */

import { execFileSync } from 'node:child_process';
import {
  detectLandingOverlap,
  narrowToHunkOverlap,
  type GitVcs,
  type LandingOverlapWarning,
} from '@autopilot/engine';

export type { LandingOverlapWarning } from '@autopilot/engine';

/** Sibling flight branch names for `projectId` at `target`, excluding
 *  `ownBranch`. Reads `refs/heads/*` directly rather than going through
 *  `GitVcs` — refs are shared across a repo's linked worktrees, so a plain
 *  `for-each-ref` at `target` sees every sibling's branch with no worktree
 *  path needed. Two patterns, matching `deriveWorktreePlan`'s (worktree.ts)
 *  own two branch shapes: the bare `flight-worktree-<projectId>` a solo/base
 *  instance (no `instanceId`) checks out, and the `--<instanceId>`-suffixed
 *  form each fleet instance checks out. A single `--*` glob previously missed
 *  the bare form entirely — a solo sibling's unlanded work went undetected.
 *  `for-each-ref` ORs multiple patterns together, so both match in one call;
 *  a loose prefix glob (`flight-worktree-<projectId>*`, no `--`) was avoided
 *  since it would also match an unrelated project id sharing that prefix.
 *  Degrades to `[]` on a non-repo path rather than throwing. */
function siblingBranchNames(target: string, projectId: string, ownBranch: string): string[] {
  let out: string;
  try {
    out = execFileSync(
      'git',
      [
        '-C',
        target,
        'for-each-ref',
        '--format=%(refname:short)',
        `refs/heads/autopilot/flight-worktree-${projectId}`,
        `refs/heads/autopilot/flight-worktree-${projectId}--*`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
  } catch {
    return [];
  }
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((ref) => ref !== '' && ref !== ownBranch);
}

/**
 * Gathers each sibling flight branch's own unlanded files (commits ahead of
 * `base` on that branch) and flags any overlap with `myFiles`, the files
 * THIS landing is about to bring into `base`. `vcs` must already be rooted
 * at `target`.
 */
export async function gatherLandingOverlaps(
  vcs: GitVcs,
  target: string,
  projectId: string,
  ownBranch: string,
  base: string,
  myFiles: readonly string[],
): Promise<readonly LandingOverlapWarning[]> {
  const siblings = siblingBranchNames(target, projectId, ownBranch);
  const siblingFiles = await Promise.all(
    siblings.map(async (branch) => ({
      branch,
      files: [...new Set((await vcs.commitsAhead(base, branch)).flatMap((c) => c.files))],
    })),
  );
  const fileWarnings = detectLandingOverlap(myFiles, siblingFiles);
  if (fileWarnings.length === 0) return fileWarnings;

  const [myRanges, branchRangePairs] = await Promise.all([
    vcs.changedLineRanges(base, ownBranch),
    Promise.all(
      fileWarnings.map(
        async (w) => [w.branch, await vcs.changedLineRanges(base, w.branch)] as const,
      ),
    ),
  ]);
  return narrowToHunkOverlap(fileWarnings, myRanges, new Map(branchRangePairs));
}

/** A sibling flight branch that has its own unlanded commits ahead of
 *  `base` — reported regardless of whether those commits touch any file
 *  this landing is about to bring in. */
export interface AheadSibling {
  readonly branch: string;
  readonly commitCount: number;
}

/**
 * LANDING STRAGGLER GUARD (web-mt5yrpn8-ez0xh4): `gatherLandingOverlaps`
 * only ever surfaces a sibling flight branch whose unlanded commits touch
 * the SAME lines this landing is about to bring into `base` — a sibling with
 * its own unlanded work on entirely unrelated files sails through invisibly.
 * That's still a straggler the instant the ritual merge lands: `base` moves
 * past `autopilot/flight` while the sibling's branch sits behind it,
 * unlanded, and stays that way until someone notices and runs the manual
 * "sync stragglers" cleanup by hand. This widens visibility to EVERY sibling
 * flight branch with commits ahead of `base`, overlap or not, so the ritual
 * can report it before merging instead of leaving it to be discovered later.
 * Detection-only, same as `gatherLandingOverlaps` — it never blocks or
 * resolves anything.
 */
export async function gatherAheadSiblings(
  vcs: GitVcs,
  target: string,
  projectId: string,
  ownBranch: string,
  base: string,
): Promise<readonly AheadSibling[]> {
  const siblings = siblingBranchNames(target, projectId, ownBranch);
  const counts = await Promise.all(
    siblings.map(async (branch) => ({
      branch,
      commitCount: (await vcs.commitsAhead(base, branch)).length,
    })),
  );
  return counts.filter((s) => s.commitCount > 0);
}
