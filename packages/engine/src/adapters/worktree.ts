// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Git worktree lifecycle for flight isolation (docs/FLIGHT-CONTAINMENT.md,
 * docs/epics/0004-bash-containment-worktree.md slice 1). A linked worktree is
 * a second working directory backed by the SAME `.git` object database as
 * `repo` but physically separate on disk — a `cd ..`-class Bash escape from
 * inside it lands in scratch space, not the real checkout. This module only
 * creates and removes worktrees; nothing in the live flight loop (`fly.ts`)
 * is wired to it yet — that's slice 3.
 *
 * Deliberately duplicates `adapters/git.ts`'s small execFile wrapper instead
 * of importing it: that file is dense with Stryker-verified mutation-testing
 * comments pinned to its exact current call sites, and this slice's whole
 * point is to stay a low-risk, unwired addition — not to widen the diff on
 * the adapter every other flight primitive depends on.
 */

import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * OS-canonical form (symlinks resolved, Windows 8.3 short names expanded,
 * true case) so the path we register equals the path a later caller passes.
 * Field failure (CI-only, three OS runners): macOS tempdirs live behind the
 * `/var → /private/var` symlink and Windows runners hand out 8.3 tempdirs —
 * git records the canonical form at `worktree add` time, the raw input never
 * matched it again, and `ensureWorktree`'s reuse check missed its own
 * registration. The target may not exist yet: canonicalize its parent and
 * rejoin; with no resolvable ancestor, fall back to the input unchanged.
 */
export function canonicalWorktreePath(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    /* not created yet — canonicalize the parent instead */
  }
  try {
    return join(realpathSync.native(dirname(p)), basename(p));
  } catch {
    return p;
  }
}

function git(repo: string, args: readonly string[]): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', repo, ...args],
      // Stryker disable next-line ObjectLiteral, BooleanLiteral: windowsHide
      // only affects whether a console window flashes on Windows — invisible
      // to stdout, stderr, or the exit code this wrapper actually observes;
      // maxBuffer only matters for output far larger than any test here
      // produces (same reasoning as adapters/git.ts's git()).
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        const code =
          // Stryker disable next-line ConditionalExpression, EqualityOperator, StringLiteral:
          // every caller in this module only branches on exitCode === 0 vs
          // !== 0, never the exact numeric value — whether this resolves to
          // git's real exit code or the `err ? 1 : 0` fallback below is
          // unobservable from any consumer here.
          err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? (err as unknown as { code: number }).code
            : err
              ? 1
              : 0;
        // Stryker disable next-line StringLiteral: Node's execFile callback
        // always passes `stdout` as a string with no `encoding: 'buffer'`
        // override — this fallback is unreachable defensive typing, not
        // live behavior (same reasoning as adapters/git.ts's git()).
        resolve({ stdout: stdout ?? '', exitCode: code });
      },
    );
  });
}

/** `git worktree list --porcelain` always echoes forward slashes, even on Windows — normalize before comparing against an OS-native path. */
function toGitPath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Resolves `path` to the platform's canonical spelling — symlinks followed,
 * Windows drive-letter case normalized — so it compares equal to git's own
 * canonical form for the identical directory. Git always normalizes a
 * worktree's registered path (verified against real git: a worktree added
 * via a lowercase drive letter is echoed back uppercase in `worktree list
 * --porcelain`), but the caller-supplied `worktreePath` here comes straight
 * from `os.tmpdir()`-derived strings, which aren't guaranteed to already be
 * in that canonical form — GitHub Actions' Windows runners set `TEMP` in a
 * casing that doesn't always match, and macOS's tmpdir is a `/var` ->
 * `/private/var` symlink. Left uncorrected, `worktreeIsRegistered`'s literal
 * string compare misses an already-registered worktree on those runners
 * even though both paths name the same directory. Falls back to the raw
 * path when it doesn't exist yet — nothing to resolve, and "not found" is
 * the correct answer for a path that isn't registered.
 */
function canonicalize(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

export function worktreeIsRegistered(porcelainOutput: string, worktreePath: string): boolean {
  const target = toGitPath(worktreePath);
  return porcelainOutput
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .some((line) => toGitPath(line.slice('worktree '.length).trim()) === target);
}

/** One `git worktree list --porcelain` record: its path and checked-out branch (undefined when detached). */
export interface WorktreeListEntry {
  readonly path: string;
  readonly branch: string | undefined;
}

/**
 * Parses `git worktree list --porcelain` into full path/branch records —
 * the same `key value` line format `worktreeIsRegistered` already reads
 * (including its trailing-`\r` tolerance for Windows git), but returning
 * every entry instead of testing a single path. Used by fleet-awareness
 * callers that need to map a sibling's branch name back to its worktree
 * directory (RESEARCH-LIBRARY fleet anti-duplication, defense-stack item 2:
 * a sibling's live uncommitted files are a work-intent signal no board claim
 * or commit history can show).
 */
export function parseWorktreeList(porcelainOutput: string): WorktreeListEntry[] {
  const entries: WorktreeListEntry[] = [];
  let path: string | undefined;
  let branch: string | undefined;
  for (const rawLine of porcelainOutput.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('worktree ')) {
      if (path !== undefined) entries.push({ path, branch });
      path = line.slice('worktree '.length).trim();
      branch = undefined;
    } else if (line.startsWith('branch ')) {
      branch = line.slice('branch '.length).trim();
    }
  }
  if (path !== undefined) entries.push({ path, branch });
  return entries;
}

export interface EnsureWorktreeResult {
  readonly ok: boolean;
  readonly path: string;
  /** False when an existing registered worktree was reused instead of created. */
  readonly created: boolean;
  readonly details: string;
}

/**
 * Creates a linked worktree of `repo` at `worktreePath`, checked out on
 * `branch`. Idempotent: a worktree already registered at `worktreePath` is
 * reused rather than re-created, so a caller can invoke this once per flight
 * without tracking prior state itself — a crashed flight's leftover worktree
 * is picked back up instead of erroring. If `branch` already exists it is
 * checked out as-is (fails if it's checked out in another worktree already —
 * git's own one-checkout-per-branch rule); otherwise a fresh branch is
 * created from `repo`'s current HEAD.
 */
export async function ensureWorktree(
  repo: string,
  worktreePath: string,
  branch: string,
): Promise<EnsureWorktreeResult> {
  worktreePath = canonicalWorktreePath(worktreePath);
  const list = await git(repo, ['worktree', 'list', '--porcelain']);
  // Stryker disable next-line ConditionalExpression: `git worktree list`
  // writes its error to stderr, which this wrapper never captures — on any
  // real failure `list.stdout` is already empty, so `worktreeIsRegistered`
  // returns false on its own; forcing this check to `true` is unobservable.
  if (list.exitCode === 0 && worktreeIsRegistered(list.stdout, canonicalize(worktreePath))) {
    return {
      ok: true,
      path: worktreePath,
      created: false,
      details: `reusing existing worktree at ${worktreePath}`,
    };
  }

  const branchExists = await git(repo, [
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/heads/${branch}`,
  ]);
  const args =
    branchExists.exitCode === 0
      ? ['worktree', 'add', worktreePath, branch]
      : ['worktree', 'add', '-b', branch, worktreePath];
  const add = await git(repo, args);
  if (add.exitCode !== 0) {
    return {
      ok: false,
      path: worktreePath,
      created: false,
      // Stryker disable next-line MethodExpression: `git worktree add`
      // writes its failure text to stderr, which this wrapper never
      // captures — `add.stdout` is empty on every real failure, so
      // `.trim()` here has no observable effect (verified: a
      // branch-already-checked-out-elsewhere failure produces '' on stdout).
      details: `git worktree add failed (exit ${add.exitCode}): ${add.stdout.trim()}`,
    };
  }
  return {
    ok: true,
    path: worktreePath,
    created: true,
    details: `created worktree at ${worktreePath} on branch '${branch}'`,
  };
}

export interface DetachedWorktreeResult {
  readonly ok: boolean;
  readonly path: string;
  readonly details: string;
}

/**
 * Creates a linked worktree of `repo` at `worktreePath`, checked out
 * DETACHED at `ref` — no branch is created or moved, so unlike {@link
 * ensureWorktree} this never contends for git's one-checkout-per-branch slot
 * even when `ref` resolves through a branch already checked out live
 * elsewhere in `repo` itself (e.g. `HEAD`, while a flight owns `repo`'s own
 * working directory). Built for one-shot, read-only, point-in-time checks —
 * out-of-band gate verification, diff inspection — where the caller wants
 * "the commit `ref` names right now" and never intends to commit or advance
 * anything in the worktree. Unlike `ensureWorktree`, this makes no attempt
 * to detect or reuse an existing registration: callers should pass a fresh
 * `worktreePath` per call (e.g. `mkdtempSync`) and clean up with {@link
 * removeWorktree} when done.
 */
export async function addDetachedWorktree(
  repo: string,
  worktreePath: string,
  ref: string,
): Promise<DetachedWorktreeResult> {
  worktreePath = canonicalWorktreePath(worktreePath);
  const add = await git(repo, ['worktree', 'add', '--detach', worktreePath, ref]);
  if (add.exitCode !== 0) {
    return {
      ok: false,
      path: worktreePath,
      details: `git worktree add --detach failed (exit ${add.exitCode}): ${add.stdout.trim()}`,
    };
  }
  return {
    ok: true,
    path: worktreePath,
    details: `created detached worktree at ${worktreePath} on '${ref}'`,
  };
}

export interface SyncWorktreeBranchResult {
  readonly ok: boolean;
  readonly details: string;
}

/**
 * Syncs `worktreeBranch`'s commits onto `targetBranch` as checked out in
 * `repo` — the target's own live checkout, not the worktree (docs/epics/
 * 0004-bash-containment-worktree.md slice 2). A worktree is always on a
 * branch distinct from whatever `repo` has checked out (git's one-
 * checkout-per-branch rule, proven in `ensureWorktree`'s tests), so a
 * flight's commits land in the worktree branch first and need a second,
 * explicit step to reach the branch the operator actually sees.
 *
 * Refuses (`ok: false`, touches nothing) when `repo` doesn't have
 * `targetBranch` checked out, or when its working tree is dirty — the same
 * fail-loud stance as `GitVcs.land`'s dirty-tree guard, for the same
 * reason: silently merging into uncommitted operator work is not a call
 * automation gets to make.
 *
 * Prefers a fast-forward — the common case, since `ensureWorktree` always
 * branches `worktreeBranch` off `repo`'s HEAD at creation time, so the
 * worktree's history is normally a linear descendant. Falls back to a
 * `--no-ff --signoff` merge (same convention as `GitVcs.land`) when
 * `repo`'s branch has moved on since (e.g. another flight landed while
 * this one ran) and a fast-forward is no longer possible. A failed merge
 * is `--abort`ed so `repo` is returned to `targetBranch` untouched — never
 * `reset --hard`.
 *
 * CONFLICT SELF-HEALING (fleet-scaling: file collisions, not CPU, cap lane
 * count — the same two files conflict flight after flight). Two layers keep
 * recurring collisions from stranding lane work behind a manual merge:
 *
 *  1. `rerere` is enabled (with `rerere.autoUpdate`) in `repo` before every
 *     merge attempt. The first occurrence of a conflict still refuses —
 *     automation never invents a resolution — but once an operator resolves
 *     it BY HAND ONCE, git records that resolution and REPLAYS it on every
 *     later occurrence of the same conflict shape. When a replay resolves
 *     every conflicted path (autoUpdate stages the result), the merge is
 *     complete in the index and this function commits it instead of
 *     aborting — the operator's own prior judgment applied, not a guess.
 *  2. Committed `merge=union` attributes (see `.gitattributes`) absorb the
 *     append-only collisions — every lane appending to the same log-shaped
 *     doc — by keeping both sides' lines, so those merges succeed outright.
 *
 * A conflict with no recorded resolution and no union attribute still
 * aborts and refuses, same fail-loud stance as ever.
 */
export async function syncWorktreeBranch(
  repo: string,
  targetBranch: string,
  worktreeBranch: string,
): Promise<SyncWorktreeBranchResult> {
  const current = await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  // Stryker disable next-line ConditionalExpression: `git rev-parse` writes
  // its error to stderr, which this wrapper never captures — on any real
  // failure `current.stdout` is already empty, so both branches of this
  // ternary produce the same '' result; forcing the check to `true` is
  // unobservable.
  const currentBranch = current.exitCode === 0 ? current.stdout.trim() : '';
  if (currentBranch !== targetBranch) {
    return {
      ok: false,
      details: `refusing to sync: '${repo}' has '${currentBranch || '(detached)'}' checked out, not '${targetBranch}'`,
    };
  }

  const status = await git(repo, ['status', '--porcelain']);
  // Stryker disable next-line MethodExpression: `git status --porcelain`
  // output is either exactly '' (clean) or real content lines with no
  // whitespace-only variant in between — verified byte-exact: a clean repo
  // produces 0 bytes, a dirty one produces content with no leading/trailing
  // whitespace `.trim()` would strip differently for this `> 0` check.
  if (status.stdout.trim().length > 0) {
    return { ok: false, details: `refusing to sync: '${repo}' has uncommitted changes` };
  }

  const fastForward = await git(repo, ['merge', '--ff-only', worktreeBranch]);
  if (fastForward.exitCode === 0) {
    return {
      ok: true,
      details: `fast-forwarded '${targetBranch}' onto '${worktreeBranch}'`,
    };
  }

  // Recorded-resolution replay (see CONFLICT SELF-HEALING above). Enabled
  // right before the merge so the very first refused conflict already
  // records its preimage — the operator's one manual resolution afterward
  // is what gets replayed on every later flight. Best-effort: a failed
  // `git config` just means the merge below behaves exactly as before.
  await git(repo, ['config', 'rerere.enabled', 'true']);
  await git(repo, ['config', 'rerere.autoUpdate', 'true']);

  const merge = await git(repo, [
    'merge',
    '--no-ff',
    '--signoff',
    '-m',
    `chore: sync ${worktreeBranch} into ${targetBranch}`,
    worktreeBranch,
  ]);
  if (merge.exitCode !== 0) {
    // `git merge` exits non-zero on ANY conflict, even one rerere fully
    // resolved and staged (autoUpdate). Zero remaining unmerged paths means
    // the index holds a complete merge built from the operator's own prior
    // resolutions — commit it. Any path still unmerged means at least one
    // conflict has no recorded resolution: abort, refuse, touch nothing.
    const unresolved = await git(repo, ['diff', '--name-only', '--diff-filter=U']);
    if (unresolved.exitCode === 0 && unresolved.stdout.trim().length === 0) {
      const commit = await git(repo, ['commit', '--no-edit', '--signoff']);
      if (commit.exitCode === 0) {
        return {
          ok: true,
          details: `merged '${worktreeBranch}' into '${targetBranch}' (conflicts auto-resolved by recorded rerere resolutions)`,
        };
      }
    }
    await git(repo, ['merge', '--abort']);
    return {
      ok: false,
      details: `merge of '${worktreeBranch}' into '${targetBranch}' failed (exit ${merge.exitCode}): ${merge.stdout.trim()}`,
    };
  }

  return { ok: true, details: `merged '${worktreeBranch}' into '${targetBranch}'` };
}

export interface FastForwardWorktreeResult {
  readonly ok: boolean;
  readonly details: string;
}

/**
 * Fast-forwards the branch checked out in `worktreePath` onto `ref` — the
 * launch-time forward half `syncWorktreeBranch` never covers (it moves
 * TARGET onto LANE; nothing moved a reused lane forward). A lane worktree
 * parked on an older base rebuilds on dead code and manufactures conflicts
 * at sync-back (observed 2026-09-03: every round launched on stale lanes
 * paid at least one avoidable COMBINED merge; rounds launched after a
 * manual ff collected clean). Called by fly.ts right after its catch-up
 * sync, so a lane with unlanded commits has already been drained into the
 * target and is ordinarily a plain ancestor again by the time this runs.
 *
 * Fail-safe by construction: refuses a dirty worktree (crashed-flight
 * leftovers belong to the checkpoint ritual, not silent clobbering), and
 * `--ff-only` means a diverged lane reports `ok: false` untouched — never
 * a merge, never a reset.
 */
export async function fastForwardWorktree(
  worktreePath: string,
  ref: string,
): Promise<FastForwardWorktreeResult> {
  worktreePath = canonicalWorktreePath(worktreePath);
  const status = await git(worktreePath, ['status', '--porcelain']);
  // Stryker disable next-line MethodExpression: same byte-exact reasoning as
  // syncWorktreeBranch's dirty check — clean is exactly '', dirty is content.
  if (status.stdout.trim().length > 0) {
    return {
      ok: false,
      details: `refusing to fast-forward: '${worktreePath}' has uncommitted changes`,
    };
  }
  const ff = await git(worktreePath, ['merge', '--ff-only', ref]);
  if (ff.exitCode !== 0) {
    return {
      ok: false,
      details: `cannot fast-forward '${worktreePath}' onto '${ref}' (exit ${ff.exitCode}): ${ff.stdout.trim()}`,
    };
  }
  return { ok: true, details: `fast-forwarded '${worktreePath}' onto '${ref}'` };
}

export interface RemoveWorktreeResult {
  readonly ok: boolean;
  readonly details: string;
}

/**
 * Removes a linked worktree created by {@link ensureWorktree}. `--force`
 * discards any uncommitted changes inside it — the worktree is disposable
 * flight-isolation scratch space, never the repo of record. Always prunes
 * stale worktree metadata afterward (e.g. a directory deleted out-of-band)
 * so a later `ensureWorktree` call at the same path never sees a phantom
 * registration.
 */
export async function removeWorktree(
  repo: string,
  worktreePath: string,
): Promise<RemoveWorktreeResult> {
  worktreePath = canonicalWorktreePath(worktreePath);
  const remove = await git(repo, ['worktree', 'remove', '--force', worktreePath]);
  await git(repo, ['worktree', 'prune']);
  if (remove.exitCode !== 0) {
    return {
      ok: false,
      // Stryker disable next-line MethodExpression: `git worktree remove`
      // writes its failure text to stderr, which this wrapper never
      // captures — `remove.stdout` is empty on every real failure, so
      // `.trim()` here has no observable effect (verified: removing a
      // never-registered path produces '' on stdout).
      details: `git worktree remove failed (exit ${remove.exitCode}): ${remove.stdout.trim()}`,
    };
  }
  return { ok: true, details: `removed worktree at ${worktreePath}` };
}
