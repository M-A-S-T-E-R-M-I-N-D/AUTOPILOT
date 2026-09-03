// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The impure gather half of the pre-commit sibling scan (SLICE-RELAY DUP
 * 2/3, guard.ts's checkPreCommitSiblingOverlap): fresh git/filesystem reads
 * at the exact moment a firing's Bash tool is about to run `git commit`, so
 * the check sees sibling state as of RIGHT NOW instead of the FLEET digest
 * baked into the firing's prompt at its start. `git worktree list` run from
 * ANY worktree (linked or main) already lists every worktree sharing the
 * same `.git` object database, so this needs only the firing's own worktree
 * path — no separate "main repo" argument.
 *
 * Deliberately duplicates the tiny primary-file/path-normalization logic
 * `apps/dashboard/src/flight/intent-claims.ts` already has (declaredIntent,
 * parseIntentPrimaryFile) rather than importing it: engine has no dependency
 * on the dashboard app (the reverse is true), and the same tradeoff was
 * already made for this module's neighbor — see adapters/worktree.ts's own
 * docstring on deliberately duplicating adapters/git.ts's execFile wrapper.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorktreeList } from './worktree.js';
import type { SiblingPrimaryClaim } from '../guard.js';

const INTENT_FILE_NAME = '.autopilot-intent';

function norm(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

/** Resolve symlink/8.3/aliased forms before the own-worktree comparison —
 *  the same CI-only failure class already fixed in `worktree.ts`'s
 *  `canonicalize`/`canonicalWorktreePath` and `intent-claims.ts`'s
 *  `canonicalIntentPath` (c0f8f16b: GitHub Actions' Windows runners hand out
 *  8.3-short-form tempdirs, and only `realpathSync.native` — not the plain
 *  JS-fallback `realpathSync` — reliably expands them to the same true-case,
 *  symlink-resolved form git itself records at `worktree add` time). This
 *  module was extracted after both fixes landed and never got its own copy,
 *  so `gatherSiblingPrimaryClaims` would leak its own claim as a spurious
 *  sibling on an affected runner and `checkPreCommitSiblingOverlap` would
 *  spuriously deny the commit. Falls back to the raw path when it doesn't
 *  resolve (e.g. already removed) — "not found" degrades to no rewrite. */
function canonicalPath(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
}

/** The primary-file half of a declared "<primary file> — <goal>" intent line. */
function primaryFileFromIntentLine(line: string): string {
  const [file = ''] = line.split(/\s+(?:—|–|--|-)\s+/);
  return file.trim();
}

function declaredPrimaryFile(worktreePath: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(join(worktreePath, INTENT_FILE_NAME), 'utf8');
  } catch {
    return null; // no declared intent — not an error.
  }
  const line = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '');
  if (line === undefined) return null;
  const primaryFile = primaryFileFromIntentLine(line);
  return primaryFile === '' ? null : primaryFile;
}

/**
 * Every OTHER flight worktree's standing intent claim, read fresh right now
 * — own worktree excluded by path. Fails to an empty list (never throws) on
 * any git/filesystem error: a broken read must not block a legitimate
 * commit, only a confirmed overlap does.
 */
export function gatherSiblingPrimaryClaims(ownWorktreePath: string): SiblingPrimaryClaim[] {
  let porcelain: string;
  try {
    porcelain = execFileSync('git', ['-C', ownWorktreePath, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
      windowsHide: true,
    });
  } catch {
    return [];
  }
  const own = norm(canonicalPath(ownWorktreePath));
  const claims: SiblingPrimaryClaim[] = [];
  for (const entry of parseWorktreeList(porcelain)) {
    if (entry.branch === undefined) continue;
    if (!entry.branch.startsWith('refs/heads/autopilot/flight-worktree-')) continue;
    if (norm(canonicalPath(entry.path)) === own) continue;
    const primaryFile = declaredPrimaryFile(entry.path);
    if (primaryFile === null) continue;
    claims.push({ branch: entry.branch.replace(/^refs\/heads\//, ''), primaryFile });
  }
  return claims;
}

/**
 * True while `worktreePath` is mid-merge (`MERGE_HEAD` present) — a `git
 * merge` invocation, possibly `--no-commit`, possibly conflicted and now
 * resolved, waiting on the finalizing `git commit`. That commit carries
 * forward content git's own merge machinery already reconciled (a clean
 * auto-merge, or a human/agent resolution of a real conflict); it is not
 * "originating" new work in whatever files the merge happens to touch, so
 * the pre-commit sibling scan — built to catch a firing about to WRITE into
 * a sibling's claimed file (see checkPreCommitSiblingOverlap) — should not
 * apply to it. Left unexempted, a badly stale lane's catch-up merge (see
 * ap-mtjwbrok-0: 937 commits behind) can never finalize, because a
 * multi-hundred-commit diff is near-guaranteed to touch some file an active
 * sibling currently claims — a self-sync deadlock the guard never intended
 * to create. Fails to false — the guard stays active — on any git error,
 * same fail-safe stance as the other reads in this module.
 */
export function isMergeCommit(worktreePath: string): boolean {
  try {
    execFileSync('git', ['-C', worktreePath, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The files staged for the commit about to happen in `worktreePath`. The
 * SOUL's own commit convention always stages then commits in one breath
 * (`git add -A && git commit`), so `--cached` is exactly what the upcoming
 * commit will record. Fails to an empty list on any git error, same
 * fail-open stance as {@link gatherSiblingPrimaryClaims}.
 */
export function gatherStagedFiles(worktreePath: string): string[] {
  try {
    const out = execFileSync('git', ['-C', worktreePath, 'diff', '--cached', '--name-only'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
  } catch {
    return [];
  }
}
