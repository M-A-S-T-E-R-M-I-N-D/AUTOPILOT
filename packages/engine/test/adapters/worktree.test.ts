// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addDetachedWorktree,
  canonicalWorktreePath,
  ensureWorktree,
  fastForwardWorktree,
  parseWorktreeList,
  removeWorktree,
  repoPrefixOf,
  syncWorktreeBranch,
  worktreeIsRegistered,
} from '../../src/adapters/worktree.js';
import { realpathSync } from 'node:fs';

/**
 * `join(dir, '..', name)`-style worktree paths must live under a scratch
 * root unique to THIS test invocation — never the shared OS tmpdir itself
 * (`dir`'s literal parent) — or a run that crashes before its `removeWorktree`
 * cleanup leaves a stale git-worktree registration at a fixed, shared path
 * that every future run's `ensureWorktree`/`syncWorktreeBranch` calls collide
 * with (observed: a Stryker dry-run abort left `%TEMP%/wt-reuse` registered
 * against a since-deleted repo, breaking every subsequent run with "fatal:
 * not a git repository" until the leftover was manually purged).
 */
function scratchRepoDir(prefix: string): string {
  const scratch = mkdtempSync(join(tmpdir(), prefix));
  const repoDir = join(scratch, 'source');
  mkdirSync(repoDir);
  return repoDir;
}

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(dir: string): void {
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'Test']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'a.txt'), 'one');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'feat: AP-1 first']);
}

describe('worktreeIsRegistered', () => {
  it('matches a real "worktree <path>" line', () => {
    const porcelain = 'worktree /repo/wt-a\nHEAD abc123\nbranch refs/heads/flight-work\n\n';
    expect(worktreeIsRegistered(porcelain, '/repo/wt-a')).toBe(true);
  });

  it('ignores non-"worktree "-prefixed lines even when a naive slice would coincidentally match', () => {
    // Slicing the first 9 characters off "HEAD /repo/wt-a" happens to equal
    // 'o/wt-a' — this line must never be treated as a registration despite
    // that coincidence; only a real "worktree "-prefixed line counts.
    const porcelain = 'HEAD /repo/wt-a\n';
    expect(worktreeIsRegistered(porcelain, 'o/wt-a')).toBe(false);
  });

  it('trims a trailing carriage return from a worktree line before comparing (Windows git porcelain)', () => {
    const porcelain = 'worktree /repo/wt-a\r\n';
    expect(worktreeIsRegistered(porcelain, '/repo/wt-a')).toBe(true);
  });

  it('returns false for empty porcelain output', () => {
    expect(worktreeIsRegistered('', '/repo/wt-a')).toBe(false);
  });
});

describe('parseWorktreeList', () => {
  it('parses multiple entries into path/branch records', () => {
    const porcelain = [
      'worktree /repo/main',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /repo/wt-a',
      'HEAD def456',
      'branch refs/heads/autopilot/flight-worktree-p--fleet-2',
      '',
    ].join('\n');
    expect(parseWorktreeList(porcelain)).toEqual([
      { path: '/repo/main', branch: 'refs/heads/main' },
      { path: '/repo/wt-a', branch: 'refs/heads/autopilot/flight-worktree-p--fleet-2' },
    ]);
  });

  it('leaves branch undefined for a detached-HEAD worktree', () => {
    const porcelain = 'worktree /repo/wt-a\nHEAD abc123\ndetached\n\n';
    expect(parseWorktreeList(porcelain)).toEqual([{ path: '/repo/wt-a', branch: undefined }]);
  });

  it('trims a trailing carriage return from both path and branch lines (Windows git porcelain)', () => {
    const porcelain = 'worktree /repo/wt-a\r\nbranch refs/heads/main\r\n';
    expect(parseWorktreeList(porcelain)).toEqual([
      { path: '/repo/wt-a', branch: 'refs/heads/main' },
    ]);
  });

  it('returns an empty array for empty porcelain output', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });

  it('reads back real output from a live worktree list', () => {
    const repo = scratchRepoDir('autopilot-parse-list-');
    initRepo(repo);
    const out = execFileSync('git', ['-C', repo, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
    });
    const entries = parseWorktreeList(out);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.branch).toMatch(/refs\/heads\//);
  });
});

describe('repoPrefixOf', () => {
  it("resolves to '' when path IS the repo root", async () => {
    const repo = scratchRepoDir('autopilot-prefix-root-');
    initRepo(repo);
    await expect(repoPrefixOf(repo)).resolves.toBe('');
  });

  it("resolves to the repo-relative subpath for a nested project folder (HARNESS GAP, board web-mtm0shsf-hmv8ud: flying a subfolder of a larger repo used the worktree root as flightRoot instead of the nested folder actually registered, so the gate ran the parent repo's suite instead of the flown project's own)", async () => {
    const repo = scratchRepoDir('autopilot-prefix-nested-');
    initRepo(repo);
    const nested = join(repo, 'samples', 'calculator');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'calc.js'), '// stub');
    gitSync(repo, ['add', '-A']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: add nested sample']);
    await expect(repoPrefixOf(nested)).resolves.toBe('samples/calculator/');
  });

  it("resolves to '' (never throws) for a path with no enclosing git repo", async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'autopilot-prefix-none-'));
    await expect(repoPrefixOf(scratch)).resolves.toBe('');
  });
});

describe('worktree lifecycle', () => {
  let dir: string;

  beforeEach(() => {
    dir = scratchRepoDir('autopilot-worktree-');
    initRepo(dir);
  });

  // maxRetries/retryDelay: same Windows EBUSY teardown race
  // worktree-containment-escape.test.ts hardened (a945492b) — every test in
  // this suite runs real `git worktree add`/`remove` cycles, so a
  // just-exited git process can still hold a handle a few ms past exit.
  afterEach(() =>
    rmSync(join(dir, '..'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
  );

  it('creates a linked worktree on a fresh branch', async () => {
    const wtPath = join(dir, '..', 'wt-fresh');
    const result = await ensureWorktree(dir, wtPath, 'flight-work');

    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(result.details).toContain('created worktree');
    expect(existsSync(join(wtPath, 'a.txt'))).toBe(true);
    expect(gitSync(wtPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('flight-work');

    await removeWorktree(dir, wtPath);
  });

  it('reuses an already-registered worktree instead of erroring', async () => {
    const wtPath = join(dir, '..', 'wt-reuse');
    const first = await ensureWorktree(dir, wtPath, 'flight-work');
    expect(first.created).toBe(true);

    const second = await ensureWorktree(dir, wtPath, 'flight-work');
    expect(second.ok).toBe(true);
    expect(second.created).toBe(false);
    expect(second.details).toContain('reusing existing worktree');

    await removeWorktree(dir, wtPath);
  });

  // Windows-only: git normalizes a worktree path to its canonical drive-letter
  // case in `worktree list --porcelain` (verified against real git — a path
  // registered via a lowercase drive letter is always echoed back uppercase),
  // regardless of the case the caller originally passed in. GitHub Actions'
  // windows-latest runners set TEMP in a form whose casing doesn't always
  // match what git reports back, so `worktreeIsRegistered`'s raw string
  // compare missed an already-registered worktree in CI — the "reuse" test
  // above never caught it because a single machine's tmpdir is consistently
  // cased with itself. This reproduces the mismatch directly instead of
  // depending on a specific runner's environment.
  it.runIf(process.platform === 'win32')(
    'reuses a worktree even when the caller-supplied path differs only in drive-letter case',
    async () => {
      const wtPath = join(dir, '..', 'wt-reuse-case');
      const first = await ensureWorktree(dir, wtPath, 'flight-work');
      expect(first.created).toBe(true);

      const driveLetter = wtPath.charAt(0);
      const flippedDrive =
        (driveLetter === driveLetter.toUpperCase()
          ? driveLetter.toLowerCase()
          : driveLetter.toUpperCase()) + wtPath.slice(1);

      const second = await ensureWorktree(dir, flippedDrive, 'flight-work');
      expect(second.ok).toBe(true);
      expect(second.created).toBe(false);
      expect(second.details).toContain('reusing existing worktree');

      await removeWorktree(dir, wtPath);
    },
  );

  it('a write inside the worktree never appears in the source checkout (the isolation property)', async () => {
    const wtPath = join(dir, '..', 'wt-isolated');
    await ensureWorktree(dir, wtPath, 'flight-work');

    writeFileSync(join(wtPath, 'escaped.txt'), 'written from the worktree');
    gitSync(wtPath, ['add', '-A']);
    gitSync(wtPath, ['commit', '-q', '-m', 'feat: commit made inside the worktree only']);

    expect(existsSync(join(dir, 'escaped.txt'))).toBe(false);
    expect(gitSync(dir, ['log', '-1', '--format=%s'])).toBe('feat: AP-1 first');
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('one');

    await removeWorktree(dir, wtPath);
  });

  it('fails cleanly (no throw) when the branch is already checked out in another worktree', async () => {
    const wtPathA = join(dir, '..', 'wt-branch-a');
    const wtPathB = join(dir, '..', 'wt-branch-b');
    await ensureWorktree(dir, wtPathA, 'shared-branch');

    const second = await ensureWorktree(dir, wtPathB, 'shared-branch');
    expect(second.ok).toBe(false);
    expect(second.created).toBe(false);
    expect(second.details).toContain('git worktree add failed');

    await removeWorktree(dir, wtPathA);
  });

  it('removes a worktree, including one with uncommitted changes (force)', async () => {
    const wtPath = join(dir, '..', 'wt-remove');
    await ensureWorktree(dir, wtPath, 'flight-work');
    writeFileSync(join(wtPath, 'dirty.txt'), 'uncommitted');

    const removed = await removeWorktree(dir, wtPath);

    expect(removed.ok).toBe(true);
    expect(removed.details).toContain('removed worktree');
    expect(existsSync(wtPath)).toBe(false);
    expect(gitSync(dir, ['worktree', 'list', '--porcelain'])).not.toContain('wt-remove');
  });

  it('prunes stale worktree registrations left behind by an out-of-band directory deletion', async () => {
    const staleWtPath = join(dir, '..', 'wt-stale');
    const otherWtPath = join(dir, '..', 'wt-other');
    await ensureWorktree(dir, staleWtPath, 'stale-branch');
    await ensureWorktree(dir, otherWtPath, 'other-branch');

    rmSync(staleWtPath, { recursive: true, force: true });
    expect(gitSync(dir, ['worktree', 'list', '--porcelain'])).toContain('wt-stale');

    await removeWorktree(dir, otherWtPath);

    expect(gitSync(dir, ['worktree', 'list', '--porcelain'])).not.toContain('wt-stale');
  });

  it('checks out an existing branch (no -b) when ensureWorktree is called again after a remove', async () => {
    const wtPath = join(dir, '..', 'wt-recreate');
    await ensureWorktree(dir, wtPath, 'flight-work');
    await removeWorktree(dir, wtPath);

    const recreated = await ensureWorktree(dir, wtPath, 'flight-work');

    expect(recreated.ok).toBe(true);
    expect(recreated.created).toBe(true);
    await removeWorktree(dir, wtPath);
  });

  it('degrades to ok:false on a non-repo path instead of throwing', async () => {
    const missing = join(dir, 'does-not-exist');
    const result = await ensureWorktree(missing, join(dir, '..', 'wt-missing'), 'flight-work');
    expect(result.ok).toBe(false);
  });

  it('reports ok:false when removing a path that was never a registered worktree', async () => {
    const neverExisted = join(dir, '..', 'wt-never-existed');
    const result = await removeWorktree(dir, neverExisted);
    expect(result.ok).toBe(false);
    expect(result.details).toContain('git worktree remove failed');
  });
});

describe('addDetachedWorktree', () => {
  let dir: string;

  beforeEach(() => {
    dir = scratchRepoDir('autopilot-worktree-detached-');
    initRepo(dir);
  });

  // maxRetries/retryDelay: same Windows EBUSY teardown race as the
  // 'worktree lifecycle' suite above (a945492b) — this suite also runs real
  // `git worktree add --detach`/`remove` cycles.
  afterEach(() =>
    rmSync(join(dir, '..'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
  );

  it('checks out HEAD detached — no branch is created or moved', async () => {
    const wtPath = join(dir, '..', 'wt-detached');
    const result = await addDetachedWorktree(dir, wtPath, 'HEAD');

    expect(result.ok).toBe(true);
    expect(result.details).toContain('detached worktree');
    expect(existsSync(join(wtPath, 'a.txt'))).toBe(true);
    // `--abbrev-ref HEAD` resolves to the literal string 'HEAD' only for a
    // detached checkout — any real branch name would resolve to itself.
    expect(gitSync(wtPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('HEAD');

    await removeWorktree(dir, wtPath);
  });

  it('never contends with a branch already checked out live in the source repo', async () => {
    // `dir` itself has its default branch checked out live — a detached
    // checkout of the SAME commit in a second worktree must not hit git's
    // one-checkout-per-branch refusal the way a second `ensureWorktree` call
    // for that same branch name would (see the "already checked out in
    // another worktree" case above).
    const wtPath = join(dir, '..', 'wt-detached-live');
    const result = await addDetachedWorktree(dir, wtPath, 'HEAD');

    expect(result.ok).toBe(true);
    await removeWorktree(dir, wtPath);
  });

  it('fails cleanly (no throw) on an unresolvable ref', async () => {
    const wtPath = join(dir, '..', 'wt-detached-bad-ref');
    const result = await addDetachedWorktree(dir, wtPath, 'refs/heads/does-not-exist');

    expect(result.ok).toBe(false);
    expect(result.details).toContain('git worktree add --detach failed');
  });
});

describe('syncWorktreeBranch', () => {
  let dir: string;
  let base: string;

  beforeEach(() => {
    dir = scratchRepoDir('autopilot-worktree-sync-');
    initRepo(dir);
    base = gitSync(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  });

  // maxRetries/retryDelay: same Windows EBUSY teardown race as the
  // 'worktree lifecycle' suite above (a945492b) — this suite also runs real
  // `git worktree add`/`remove` cycles via ensureWorktree/removeWorktree.
  afterEach(() =>
    rmSync(join(dir, '..'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
  );

  it('fast-forwards the target checkout onto the worktree branch', async () => {
    const wtPath = join(dir, '..', 'wt-sync-ff');
    await ensureWorktree(dir, wtPath, 'flight-work');
    writeFileSync(join(wtPath, 'flown.txt'), 'shipped from the worktree');
    gitSync(wtPath, ['add', '-A']);
    gitSync(wtPath, ['commit', '-q', '-m', 'feat: AP-2 flown from worktree']);

    const result = await syncWorktreeBranch(dir, base, 'flight-work');

    expect(result.ok).toBe(true);
    expect(result.details).toContain('fast-forwarded');
    expect(gitSync(dir, ['log', '-1', '--format=%s'])).toBe('feat: AP-2 flown from worktree');
    expect(existsSync(join(dir, 'flown.txt'))).toBe(true);

    await removeWorktree(dir, wtPath);
  });

  it('falls back to a --no-ff merge when the target branch has diverged', async () => {
    const wtPath = join(dir, '..', 'wt-sync-merge');
    await ensureWorktree(dir, wtPath, 'flight-work');
    writeFileSync(join(wtPath, 'flown.txt'), 'shipped from the worktree');
    gitSync(wtPath, ['add', '-A']);
    gitSync(wtPath, ['commit', '-q', '-m', 'feat: AP-2 flown from worktree']);

    writeFileSync(join(dir, 'operator.txt'), 'operator committed on the live checkout meanwhile');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 operator work on the live checkout']);

    const result = await syncWorktreeBranch(dir, base, 'flight-work');

    expect(result.ok).toBe(true);
    expect(result.details).toContain('merged');
    expect(gitSync(dir, ['log', '-1', '--format=%s'])).toBe(`chore: sync flight-work into ${base}`);
    expect(existsSync(join(dir, 'flown.txt'))).toBe(true);
    expect(existsSync(join(dir, 'operator.txt'))).toBe(true);

    await removeWorktree(dir, wtPath);
  });

  it('refuses when the target checkout has uncommitted changes, touching nothing', async () => {
    const wtPath = join(dir, '..', 'wt-sync-dirty');
    await ensureWorktree(dir, wtPath, 'flight-work');
    writeFileSync(join(wtPath, 'flown.txt'), 'shipped from the worktree');
    gitSync(wtPath, ['add', '-A']);
    gitSync(wtPath, ['commit', '-q', '-m', 'feat: AP-2 flown from worktree']);

    writeFileSync(join(dir, 'a.txt'), 'operator edit, never staged');

    const before = gitSync(dir, ['rev-parse', 'HEAD']);
    const result = await syncWorktreeBranch(dir, base, 'flight-work');

    expect(result.ok).toBe(false);
    expect(result.details).toContain('uncommitted changes');
    expect(gitSync(dir, ['rev-parse', 'HEAD'])).toBe(before);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('operator edit, never staged');

    await removeWorktree(dir, wtPath);
  });

  it('refuses when the target checkout has a different branch checked out', async () => {
    const wtPath = join(dir, '..', 'wt-sync-wrong-branch');
    await ensureWorktree(dir, wtPath, 'flight-work');
    gitSync(dir, ['checkout', '-q', '-b', 'operator-branch']);

    const result = await syncWorktreeBranch(dir, base, 'flight-work');

    expect(result.ok).toBe(false);
    expect(result.details).toContain('operator-branch');
    expect(result.details).not.toContain('(detached)');
    expect(gitSync(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('operator-branch');

    await removeWorktree(dir, wtPath);
  });

  it("reports '(detached)' rather than an empty branch name when the target path can't be read at all", async () => {
    const missing = join(dir, 'does-not-exist');
    const result = await syncWorktreeBranch(missing, base, 'flight-work');

    expect(result.ok).toBe(false);
    expect(result.details).toContain('(detached)');
  });

  it('completes a merge where a merge=union attribute absorbs divergent appends to the same file', async () => {
    // The recurring fleet collision: every lane's flight-end appends to the
    // same log-shaped doc (docs/SELF-STUDY/PAPER.md's §8 evidence log). A
    // committed `merge=union` attribute lets git keep BOTH sides' lines
    // instead of conflicting — 100% of each lane's appends survive with no
    // operator involvement.
    writeFileSync(join(dir, '.gitattributes'), 'log.md merge=union\n');
    writeFileSync(join(dir, 'log.md'), 'seed entry\n');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 union-merged log seed']);

    const wtPath = join(dir, '..', 'wt-sync-union');
    await ensureWorktree(dir, wtPath, 'flight-work');
    writeFileSync(join(wtPath, 'log.md'), 'seed entry\nlane appended this\n');
    gitSync(wtPath, ['add', '-A']);
    gitSync(wtPath, ['commit', '-q', '-m', 'feat: AP-3 lane append']);

    writeFileSync(join(dir, 'log.md'), 'seed entry\noperator appended this\n');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-4 operator append']);

    const result = await syncWorktreeBranch(dir, base, 'flight-work');

    expect(result.ok).toBe(true);
    expect(result.details).toContain('merged');
    const merged = readFileSync(join(dir, 'log.md'), 'utf8');
    expect(merged).toContain('lane appended this');
    expect(merged).toContain('operator appended this');

    await removeWorktree(dir, wtPath);
  });

  it('replays a previously recorded conflict resolution via rerere and completes the merge', async () => {
    // Fleet flights hit the SAME conflict shape flight after flight (the
    // same generated block rewritten on both sides). Once an operator has
    // resolved it once — with rerere recording enabled, which
    // syncWorktreeBranch itself turns on — every later occurrence replays
    // that resolution and the sync completes instead of refusing.
    const wtPath = join(dir, '..', 'wt-sync-rerere');
    await ensureWorktree(dir, wtPath, 'flight-work');
    writeFileSync(join(wtPath, 'a.txt'), 'worktree version');
    gitSync(wtPath, ['add', '-A']);
    gitSync(wtPath, ['commit', '-q', '-m', 'feat: AP-2 worktree edit']);

    writeFileSync(join(dir, 'a.txt'), 'operator version');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 operator edit']);

    // First sync refuses (no recorded resolution yet) but leaves rerere
    // enabled with the conflict's preimage recorded.
    const first = await syncWorktreeBranch(dir, base, 'flight-work');
    expect(first.ok).toBe(false);

    // Operator resolves the conflict once, by hand: merge, fix, commit.
    // rerere records the resolution against the conflict's preimage.
    try {
      gitSync(dir, ['merge', 'flight-work']);
    } catch {
      /* expected: the merge stops on the conflict */
    }
    writeFileSync(join(dir, 'a.txt'), 'reconciled by operator');
    gitSync(dir, ['add', 'a.txt']);
    gitSync(dir, ['commit', '-q', '--no-edit']);

    // Rewind the target to before that manual merge — the same conflict now
    // stands again, but this time a recorded resolution exists.
    gitSync(dir, ['reset', '--hard', '-q', 'ORIG_HEAD']);

    const second = await syncWorktreeBranch(dir, base, 'flight-work');

    expect(second.ok).toBe(true);
    expect(second.details).toContain('rerere');
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('reconciled by operator');
    expect(gitSync(dir, ['log', '-1', '--format=%s'])).toBe(`chore: sync flight-work into ${base}`);
    // The completed merge must leave a clean tree — nothing half-staged.
    expect(gitSync(dir, ['status', '--porcelain'])).toBe('');

    await removeWorktree(dir, wtPath);
  });

  it('aborts and refuses when the fallback merge conflicts, leaving the target checkout untouched', async () => {
    const wtPath = join(dir, '..', 'wt-sync-conflict');
    await ensureWorktree(dir, wtPath, 'flight-work');
    writeFileSync(join(wtPath, 'a.txt'), 'changed in the worktree');
    gitSync(wtPath, ['add', '-A']);
    gitSync(wtPath, ['commit', '-q', '-m', 'feat: AP-2 conflicting worktree edit']);

    writeFileSync(join(dir, 'a.txt'), 'changed on the live checkout, conflicting');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 conflicting operator edit']);

    const before = gitSync(dir, ['rev-parse', 'HEAD']);
    const result = await syncWorktreeBranch(dir, base, 'flight-work');

    expect(result.ok).toBe(false);
    expect(result.details).toContain('flight-work');
    // The conflict text git writes to stdout ends with a newline; the
    // trimmed detail message must not carry it through verbatim.
    expect(result.details.endsWith('\n')).toBe(false);
    expect(gitSync(dir, ['rev-parse', 'HEAD'])).toBe(before);
    expect(gitSync(dir, ['status', '--porcelain'])).toBe('');
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe(
      'changed on the live checkout, conflicting',
    );

    await removeWorktree(dir, wtPath);
  });
});

describe('fastForwardWorktree', () => {
  let dir: string;
  let base: string;

  beforeEach(() => {
    dir = scratchRepoDir('autopilot-worktree-ff-');
    initRepo(dir);
    base = gitSync(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  });

  afterEach(() =>
    rmSync(join(dir, '..'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
  );

  it('fast-forwards a clean, behind lane worktree onto the target branch tip', async () => {
    // The 2026-09-03 gap made real: a REUSED lane worktree parked on an
    // older base while the target branch advanced — the lane would rebuild
    // on dead code and manufacture conflicts at sync-back.
    const wtPath = join(dir, '..', 'wt-ff-behind');
    await ensureWorktree(dir, wtPath, 'flight-work');
    writeFileSync(join(dir, 'landed.txt'), 'work another lane already landed');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 target advanced']);

    const result = await fastForwardWorktree(wtPath, base);

    expect(result.ok).toBe(true);
    expect(result.details).toContain('fast-forwarded');
    expect(gitSync(wtPath, ['rev-parse', 'HEAD'])).toBe(gitSync(dir, ['rev-parse', 'HEAD']));
    expect(existsSync(join(wtPath, 'landed.txt'))).toBe(true);

    await removeWorktree(dir, wtPath);
  });

  it('refuses a dirty worktree, touching nothing — crashed-flight leftovers are the checkpoint ritual’s job', async () => {
    const wtPath = join(dir, '..', 'wt-ff-dirty');
    await ensureWorktree(dir, wtPath, 'flight-work');
    writeFileSync(join(dir, 'landed.txt'), 'target advanced');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 target advanced']);
    writeFileSync(join(wtPath, 'a.txt'), 'uncommitted mid-unit work');

    const before = gitSync(wtPath, ['rev-parse', 'HEAD']);
    const result = await fastForwardWorktree(wtPath, base);

    expect(result.ok).toBe(false);
    expect(result.details).toContain('uncommitted');
    expect(gitSync(wtPath, ['rev-parse', 'HEAD'])).toBe(before);
    expect(readFileSync(join(wtPath, 'a.txt'), 'utf8')).toBe('uncommitted mid-unit work');

    await removeWorktree(dir, wtPath);
  });

  it('reports ok:false gracefully when the lane has diverged — never merges, never resets', async () => {
    const wtPath = join(dir, '..', 'wt-ff-diverged');
    await ensureWorktree(dir, wtPath, 'flight-work');
    writeFileSync(join(wtPath, 'lane.txt'), 'unlanded lane work');
    gitSync(wtPath, ['add', '-A']);
    gitSync(wtPath, ['commit', '-q', '-m', 'feat: AP-2 lane work']);
    writeFileSync(join(dir, 'landed.txt'), 'target advanced');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 target advanced']);

    const before = gitSync(wtPath, ['rev-parse', 'HEAD']);
    const result = await fastForwardWorktree(wtPath, base);

    expect(result.ok).toBe(false);
    expect(gitSync(wtPath, ['rev-parse', 'HEAD'])).toBe(before);
    expect(gitSync(wtPath, ['status', '--porcelain'])).toBe('');

    await removeWorktree(dir, wtPath);
  });
});

describe('canonicalWorktreePath', () => {
  // The CI-only reuse failure: macOS tempdirs sit behind the /var →
  // /private/var symlink and Windows runners hand out 8.3 short-name
  // tempdirs — git records canonical forms, the raw input never matched
  // again. These pin the resolution ladder on every OS.
  it('resolves an EXISTING path to the OS-canonical form (what git records)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-canon-'));
    try {
      expect(canonicalWorktreePath(dir)).toBe(realpathSync.native(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('canonicalizes the PARENT for a not-yet-created target and rejoins the leaf', () => {
    const parent = mkdtempSync(join(tmpdir(), 'ap-canon-'));
    try {
      const child = join(parent, 'not-created-yet');
      expect(canonicalWorktreePath(child)).toBe(
        join(realpathSync.native(parent), 'not-created-yet'),
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('falls back to the input unchanged when nothing on the path resolves', () => {
    const ghost = join(tmpdir(), 'ap-canon-ghost-never-here', 'child', 'leaf');
    expect(canonicalWorktreePath(ghost)).toBe(ghost);
  });
});
