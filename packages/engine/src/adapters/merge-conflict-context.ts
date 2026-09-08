// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Rung 4 of the sync-back conflict ladder
 * (docs/EVALUATION-2026-09-03-sync-conflict-taxonomy.md): when a conflict
 * survives union-merge, rerere replay, and fastForwardWorktree, the
 * escalation agent needs the SAME context a human resolving the conflict by
 * hand would read — both sides' full file content plus the merge base, not
 * just the conflict-marker hunk (Rover's 2026 finding: resolution quality
 * depends on context beyond the hunk). This module gathers that context for
 * one unmerged path; nothing in the live flight loop (`fly.ts`) invokes it
 * yet — that wiring, and the invoke/apply-patch/re-gate steps around it, is
 * follow-on work.
 *
 * Deliberately duplicates `adapters/git.ts`'s small execFile wrapper instead
 * of importing it, matching `adapters/worktree.ts`'s own precedent: that
 * file is dense with Stryker-verified mutation-testing comments pinned to
 * its exact current call sites, and this module's whole point is to stay a
 * low-risk, unwired addition.
 */

import { execFile } from 'node:child_process';

function git(repo: string, args: readonly string[]): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', repo, ...args],
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        const code =
          err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? (err as unknown as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ stdout: stdout ?? '', exitCode: code });
      },
    );
  });
}

/**
 * Base/ours/theirs content for one unmerged path, mid-merge. Any side may be
 * `null`: an add-add conflict has no base, a delete-modify conflict has no
 * content on the side that deleted the file — both are ordinary conflict
 * shapes, not error conditions.
 */
export interface MergeConflictSides {
  readonly path: string;
  readonly base: string | null;
  readonly ours: string | null;
  readonly theirs: string | null;
}

/** `git show :N:path` — index stage N's blob content for `path`, or `null` when that stage has no entry (see {@link MergeConflictSides}). */
async function showStage(repo: string, stage: 1 | 2 | 3, path: string): Promise<string | null> {
  const result = await git(repo, ['show', `:${stage}:${path}`]);
  return result.exitCode === 0 ? result.stdout : null;
}

/**
 * Reads the three-way merge context for one unmerged path directly from the
 * index — valid only while a conflicted merge is in progress (unmerged
 * entries carry stages 1 (base), 2 (ours), 3 (theirs); a clean index has
 * none). Missing stages resolve to `null` rather than rejecting, since an
 * add-add or delete-modify conflict legitimately lacks one.
 */
export async function gatherMergeConflictContext(
  repo: string,
  path: string,
): Promise<MergeConflictSides> {
  const [base, ours, theirs] = await Promise.all([
    showStage(repo, 1, path),
    showStage(repo, 2, path),
    showStage(repo, 3, path),
  ]);
  return { path, base, ours, theirs };
}
