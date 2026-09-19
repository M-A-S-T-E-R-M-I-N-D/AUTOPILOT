// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GitVcs,
  GitHeadReader,
  describePushFailure,
  parseCommitLogWithRenames,
  parseHunkRanges,
  parseNumstat,
} from '../../src/adapters/git.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(dir: string): void {
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'Test']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
}

describe('GitVcs', () => {
  let dir: string;
  let vcs: GitVcs;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-git-'));
    initRepo(dir);
    writeFileSync(join(dir, 'a.txt'), 'one');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-1 first']);
    vcs = new GitVcs(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads HEAD and the last commit', async () => {
    expect(await vcs.head()).toMatch(/^[0-9a-f]{40}$/);
    const last = await vcs.lastCommit();
    expect(last?.subject).toBe('feat: AP-1 first');
    expect(last?.shortSha).toMatch(/^[0-9a-f]{7,}$/);
  });

  it('verifies a sha is within the firing range — reachable from headAfter, NOT from headBefore (GATE HOLE 5)', async () => {
    const headBefore = await vcs.head();
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    const headAfter = await vcs.head();
    const newCommit = await vcs.lastCommit();

    // The firing's own new commit verifies true.
    expect(await vcs.commitInFiringRange(newCommit?.shortSha ?? '', headBefore, headAfter)).toBe(
      true,
    );
    // A commit that PREDATES this firing must NOT verify even though the
    // object genuinely exists — a plain `cat-file -e` existence check
    // cannot tell "this firing's own commit" from "any of the repo's
    // thousands of other historical commits", which is exactly the hole a
    // hallucinated or stale self-reported sha slips through.
    expect(await vcs.commitInFiringRange(headBefore, headBefore, headAfter)).toBe(false);
    // A sha that resolves to nothing at all still degrades to false.
    expect(await vcs.commitInFiringRange('deadbeef', headBefore, headAfter)).toBe(false);
  });

  it("treats an unborn headBefore as no ancestor constraint — a repo's very first commit verifies", async () => {
    const empty = mkdtempSync(join(tmpdir(), 'autopilot-git-empty-'));
    initRepo(empty);
    try {
      const emptyVcs = new GitVcs(empty);
      const headBefore = await emptyVcs.head();
      writeFileSync(join(empty, 'a.txt'), 'one');
      gitSync(empty, ['add', '-A']);
      gitSync(empty, ['commit', '-q', '-m', 'feat: first ever commit']);
      const headAfter = await emptyVcs.head();
      const first = await emptyVcs.lastCommit();
      expect(await emptyVcs.commitInFiringRange(first?.shortSha ?? '', headBefore, headAfter)).toBe(
        true,
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('lists the net changed paths of a ref range, degrading to [] on unborn/bogus refs (D4 file lens)', async () => {
    const headBefore = await vcs.head();
    writeFileSync(join(dir, 'a.txt'), 'one edited');
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 touch two files']);
    const headAfter = await vcs.head();

    expect([...(await vcs.changedFiles(headBefore, headAfter))].sort()).toEqual(['a.txt', 'b.txt']);
    // Same ref twice: an honestly-empty diff, not an error.
    expect(await vcs.changedFiles(headAfter, headAfter)).toEqual([]);
    // Unborn-HEAD sentinel and unresolvable refs degrade to [] — the record
    // omits filesTouched rather than fabricating paths.
    expect(await vcs.changedFiles('', headAfter)).toEqual([]);
    expect(await vcs.changedFiles('deadbeef', headAfter)).toEqual([]);
  });

  it('verifies file existence at HEAD (committed, not just present in the working tree)', async () => {
    expect(await vcs.fileExists('a.txt')).toBe(true);
    expect(await vcs.fileExists('does-not-exist.txt')).toBe(false);

    writeFileSync(join(dir, 'uncommitted.txt'), 'not committed');
    expect(await vcs.fileExists('uncommitted.txt')).toBe(false);
  });

  it('shows a committed file content at HEAD, not the dirty working-tree copy', async () => {
    expect(await vcs.showFile('a.txt')).toBe('one');

    writeFileSync(join(dir, 'a.txt'), 'one\ndirty');
    expect(await vcs.showFile('a.txt')).toBe('one');
  });

  it('returns empty content for a missing path and for a non-repo directory', async () => {
    expect(await vcs.showFile('does-not-exist.txt')).toBe('');

    const outside = mkdtempSync(join(tmpdir(), 'autopilot-not-a-repo-'));
    try {
      expect(await new GitVcs(outside).showFile('a.txt')).toBe('');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('lists tracked files by pathspec, resolving a bare basename via */name', async () => {
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(join(dir, 'nested', 'a.txt'), 'nested copy');
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 nested']);

    expect(await vcs.lsFiles(['a.txt', '*/a.txt'])).toEqual(['a.txt', 'nested/a.txt']);
    expect(await vcs.lsFiles(['b.txt'])).toEqual(['b.txt']);
    expect(await vcs.lsFiles(['missing.txt'])).toEqual([]);
  });

  it('lists no files for a non-repo directory', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'autopilot-not-a-repo-'));
    try {
      expect(await new GitVcs(outside).lsFiles(['a.txt'])).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('finds committed text case-insensitively, ignoring uncommitted-only matches', async () => {
    expect(await vcs.containsText('one')).toBe(true);
    expect(await vcs.containsText('ONE')).toBe(true);
    expect(await vcs.containsText('nowhere')).toBe(false);

    writeFileSync(join(dir, 'uncommitted.txt'), 'nowhere');
    expect(await vcs.containsText('nowhere')).toBe(false);
  });

  it('treats containsText patterns as literal strings, not regex', async () => {
    writeFileSync(join(dir, 'regex.txt'), 'a.b (literal dot and parens)');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 regex chars']);

    expect(await vcs.containsText('a.b')).toBe(true);
    expect(await vcs.containsText('aXb')).toBe(false); // '.' must not act as a regex wildcard
  });

  it('lists committed paths containing text, case-insensitively and literally', async () => {
    writeFileSync(join(dir, 'b.txt'), 'ONE more time');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-4 second file']);

    // Exact equality (not arrayContaining): a stray trailing empty-string
    // entry from an unfiltered `split('\n')` artifact must not sneak in.
    expect(await vcs.filesContainingText('one')).toEqual(['a.txt', 'b.txt']);
    expect(await vcs.filesContainingText('nowhere')).toEqual([]);

    writeFileSync(join(dir, 'uncommitted.txt'), 'one');
    expect(await vcs.filesContainingText('one')).not.toContain('uncommitted.txt');
  });

  it('additively reverts the last commit (adds a revert, keeps history)', async () => {
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    const before = Number(gitSync(dir, ['rev-list', '--count', 'HEAD']));

    await vcs.revertLast();

    const after = Number(gitSync(dir, ['rev-list', '--count', 'HEAD']));
    expect(after).toBe(before + 1); // additive: a new revert commit, not a reset
    expect(gitSync(dir, ['log', '-1', '--format=%s'])).toMatch(/^Revert/);
  });

  it('additively reverts the FULL RANGE back to sinceRef, not just the tip (GATE HOLE 3, board web-mtb8hghd-72z52z — a firing that makes two commits must have both undone on a gate failure)', async () => {
    const headBefore = await vcs.head(); // HEAD at 'feat: AP-1 first', before either of the two commits below

    writeFileSync(join(dir, 'a.txt'), 'one\ntwo');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);

    writeFileSync(join(dir, 'b.txt'), 'three');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 third']);
    const before = Number(gitSync(dir, ['rev-list', '--count', 'HEAD']));

    await vcs.revertLast(headBefore);

    const after = Number(gitSync(dir, ['rev-list', '--count', 'HEAD']));
    expect(after).toBe(before + 2); // additive: one revert commit per original commit, both undone
    expect(await vcs.showFile('a.txt')).toBe('one'); // AP-2's edit undone
    expect(await vcs.fileExists('b.txt')).toBe(false); // AP-3's new file undone
  });

  it('reverts only the tip when sinceRef is omitted (RemediatingGate undoing just its own autoformat commit)', async () => {
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    writeFileSync(join(dir, 'b.txt'), 'three');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'style: autoformat']);
    const before = Number(gitSync(dir, ['rev-list', '--count', 'HEAD']));

    await vcs.revertLast();

    const after = Number(gitSync(dir, ['rev-list', '--count', 'HEAD']));
    expect(after).toBe(before + 1); // only the tip commit reverted
    expect(await vcs.fileExists('b.txt')).toBe(false); // autoformat commit undone
    expect(await vcs.showFile('a.txt')).toBe('one\ntwo'); // earlier commit left alone
  });

  it("treats an EMPTY sinceRef as no anchor and reverts the tip — head() returns '' on an unborn HEAD, and ''..HEAD is an empty commit set git refuses (exit 128)", async () => {
    // Regression: firing.ts threads `headBefore = await vcs.head()` straight
    // into revertLast on a gate failure. On a repo whose first firing commits
    // (headBefore === ''), `'' !== undefined` built the literal range
    // `..HEAD`, which git reads as HEAD..HEAD — "error: empty commit set
    // passed", exit 128. That threw out of runFiring uncaught, so the bad
    // commit was NEVER reverted and the flight loop died: strictly worse than
    // the single-tip revert this replaced.
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    const before = Number(gitSync(dir, ['rev-list', '--count', 'HEAD']));

    await expect(vcs.revertLast('')).resolves.toBeUndefined();

    const after = Number(gitSync(dir, ['rev-list', '--count', 'HEAD']));
    expect(after).toBe(before + 1); // the bad commit really was undone
    expect(await vcs.showFile('a.txt')).toBe('one');
  });

  it('throws a descriptive error when git revert fails (e.g. a dirty tree blocks the merge)', async () => {
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo\nuncommitted'); // blocks the revert's merge

    await expect(vcs.revertLast()).rejects.toThrow(/git revert failed \(exit \d+\)/);
  });

  it("surfaces git's real stderr reason for a blocked revert, not an empty string (board web-mss2y67i-3lmwzi — git writes this to stderr, not stdout)", async () => {
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo\nuncommitted'); // blocks the revert's merge

    await expect(vcs.revertLast()).rejects.toThrow(/would be overwritten by merge/);
  });

  it('reverts the FULL RANGE via its first-parent chain when a merge commit sits inside it (web-mtbeu5h9-o3mlll, follow-up to d7f19648 — plain `git revert <range>` refuses with "no -m option given" the moment a merge appears)', async () => {
    const headBefore = await vcs.head(); // HEAD at 'feat: AP-1 first'

    gitSync(dir, ['switch', '-q', '-c', 'side']);
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 side']);
    gitSync(dir, ['switch', '-q', '-']); // back to the branch checked out before 'side'
    writeFileSync(join(dir, 'c.txt'), 'three');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 trunk']);
    gitSync(dir, ['merge', '--no-ff', '-q', '-m', 'merge: AP-4 side into trunk', 'side']);
    writeFileSync(join(dir, 'd.txt'), 'four');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-5 after merge']);

    // A plain range revert walks the FULL graph (both merge parents), so
    // side's commit appears as a SEPARATE entry alongside the merge itself
    // — reverting both double-applies the same inverse diff. Reverting only
    // the range's first-parent chain (this branch's own commits, with the
    // merge counted once) avoids that, so this must resolve cleanly with no
    // thrown error and no commit left un-reverted.
    await expect(vcs.revertLast(headBefore)).resolves.toBeUndefined();

    expect(await vcs.fileExists('b.txt')).toBe(false); // side's own change, undone via the merge's inverse
    expect(await vcs.fileExists('c.txt')).toBe(false);
    expect(await vcs.fileExists('d.txt')).toBe(false);
    expect(await vcs.showFile('a.txt')).toBe('one'); // predates the range, untouched
    expect(gitSync(dir, ['status', '--short'])).toBe(''); // no stuck "revert in progress" state left behind
  });

  it('reverts HEAD itself via -m 1 when it is a merge commit and no sinceRef is given (RemediatingGate undoing just its own merge commit)', async () => {
    gitSync(dir, ['switch', '-q', '-c', 'side']);
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 side']);
    gitSync(dir, ['switch', '-q', '-']); // back to the branch checked out before 'side'
    gitSync(dir, ['merge', '--no-ff', '-q', '-m', 'merge: AP-3 side into trunk', 'side']);

    // No sinceRef: target is plain 'HEAD', which IS the merge — the plain
    // revert refuses with "no -m option was given" same as the ranged case,
    // but there is no range to walk a first-parent chain over, so this must
    // fall into the other branch of the same catch (git.ts:370-374) and
    // revert the merge alone with an explicit mainline.
    await expect(vcs.revertLast()).resolves.toBeUndefined();

    expect(await vcs.fileExists('b.txt')).toBe(false); // side's change, undone via the merge's -m 1 inverse
    expect(await vcs.showFile('a.txt')).toBe('one'); // trunk's own prior commit, untouched
    expect(gitSync(dir, ['status', '--short'])).toBe(''); // no stuck "revert in progress" state left behind
  });

  it("returns '' for head() on a repo with no commits yet (unborn HEAD) — not just a non-repo path", async () => {
    const empty = mkdtempSync(join(tmpdir(), 'autopilot-git-unborn-'));
    initRepo(empty);
    try {
      // `git rev-parse HEAD` on an unborn branch exits 128 but still echoes
      // the literal ref string 'HEAD' to stdout — pins that '' comes from
      // the exit-code check itself, not merely from stdout happening to be
      // empty (as it is on an outright non-repo path).
      expect(await new GitVcs(empty).head()).toBe('');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('degrades to empty/null on a non-repo path', async () => {
    const missing = new GitVcs(join(dir, 'does-not-exist'));
    expect(await missing.head()).toBe('');
    expect(await missing.lastCommit()).toBeNull();
    expect(await missing.commitInFiringRange('abc', 'h0', 'h1')).toBe(false);
    expect(await missing.fileExists('a.txt')).toBe(false);
    expect(await missing.containsText('one')).toBe(false);
    expect(await missing.filesContainingText('one')).toEqual([]);
  });

  it('commitPaths commits ONLY the given paths, leaving unrelated WIP untouched (the ritual-sweep fix)', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'paper.md'), 'ritual output');
    writeFileSync(join(dir, 'unrelated-wip.txt'), 'operator work in progress');

    const committed = await vcs.commitPaths(['docs'], 'docs: scoped ritual');

    expect(committed).toBe(true);
    const last = await vcs.lastCommit();
    expect(last?.subject).toBe('docs: scoped ritual');
    // the unrelated WIP must still be dirty — NOT swept into the ritual commit
    expect(await vcs.isDirty()).toBe(true);
    const status = gitSync(dir, ['status', '--porcelain']);
    expect(status).toContain('unrelated-wip.txt');
    expect(status).not.toContain('docs/paper.md');
  });

  it('commitPaths is a no-op (returns false, no commit) when the paths hold no changes', async () => {
    const before = await vcs.lastCommit();
    writeFileSync(join(dir, 'unrelated-wip.txt'), 'wip');
    mkdirSync(join(dir, 'docs'), { recursive: true });

    const committed = await vcs.commitPaths(['docs'], 'docs: should not happen');

    expect(committed).toBe(false);
    expect((await vcs.lastCommit())?.subject).toBe(before?.subject);
  });

  it('commitPaths is a clean no-op when the paths hold no changes even if UNRELATED work is pre-staged', async () => {
    // The ritual-sweep hole: a supervising agent (or the operator) had already
    // `git add`-ed an unrelated file before the flight-end ritual fired, and
    // the ritual's own paths hold nothing new. The emptiness probe must be
    // scoped to the paths — a whole-index probe sees the pre-staged file, then
    // `git commit -- <paths>` finds nothing to commit and throws.
    const before = await vcs.lastCommit();
    writeFileSync(join(dir, 'unrelated-wip.txt'), 'operator work in progress');
    gitSync(dir, ['add', 'unrelated-wip.txt']);
    mkdirSync(join(dir, 'docs'), { recursive: true }); // docs holds no changes

    const committed = await vcs.commitPaths(['docs'], 'docs: should not happen');

    expect(committed).toBe(false);
    // nothing was committed — the pre-staged history is untouched...
    expect((await vcs.lastCommit())?.subject).toBe(before?.subject);
    // ...and the unrelated pre-staged work survives, unswept.
    const status = gitSync(dir, ['status', '--porcelain']);
    expect(status).toContain('unrelated-wip.txt');
  });

  it('dirtyPaths lists every uncommitted path, letting a caller diff before/after a specific operation', async () => {
    expect(await vcs.dirtyPaths()).toEqual([]);
    writeFileSync(join(dir, 'unrelated-wip.txt'), 'operator work in progress');
    gitSync(dir, ['add', 'unrelated-wip.txt']); // staged, not just working-tree
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'paper.md'), 'ritual output'); // unstaged

    const paths = await vcs.dirtyPaths();

    expect(paths).toContain('unrelated-wip.txt');
    expect(paths).toContain('docs/paper.md');
    expect(paths).toHaveLength(2);
  });

  it('detects a dirty tree and packs it up with commitAll (the checkpoint move)', async () => {
    expect(await vcs.isDirty()).toBe(false);
    writeFileSync(join(dir, 'wip.txt'), 'half-finished work');
    expect(await vcs.isDirty()).toBe(true);

    await vcs.commitAll('wip(autopilot): checkpoint — test');

    expect(await vcs.isDirty()).toBe(false);
    const last = await vcs.lastCommit();
    expect(last?.subject).toContain('wip(autopilot): checkpoint');
  });

  it('throws a descriptive error when git commit fails (e.g. a commit-msg hook rejects it)', async () => {
    writeFileSync(join(dir, '.git', 'hooks', 'commit-msg'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeFileSync(join(dir, 'wip.txt'), 'half-finished work');

    await expect(vcs.commitAll('wip(autopilot): checkpoint — test')).rejects.toThrow(
      /git commit \(checkpoint\) failed \(exit \d+\)/,
    );
  });

  it('computes diffstat between two refs', async () => {
    const from = await vcs.head();
    writeFileSync(join(dir, 'b.txt'), 'two\nlines');
    writeFileSync(join(dir, 'c.txt'), 'new file');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 grow']);

    const stat = await vcs.diffstat(from, 'HEAD');

    expect(stat.filesChanged).toBe(2);
    expect(stat.insertions).toBeGreaterThan(0);
    expect(stat.deletions).toBe(0);
  });

  it('reports zero deletions/insertions/files for an empty diff (identical refs)', async () => {
    const stat = await vcs.diffstat('HEAD', 'HEAD');
    expect(stat).toEqual({ filesChanged: 0, insertions: 0, deletions: 0 });
  });

  it('degrades to all-zero diffstat on an invalid ref rather than throwing', async () => {
    const stat = await vcs.diffstat('deadbeef', 'HEAD');
    expect(stat).toEqual({ filesChanged: 0, insertions: 0, deletions: 0 });
  });

  it('computes per-file insertions/deletions between two refs (diff-size gate input, BACKLOG-999 C4)', async () => {
    const from = await vcs.head();
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo\nthree');
    writeFileSync(join(dir, 'c.txt'), 'new file');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 grow a.txt, add c.txt']);

    const stats = [...(await vcs.diffNumstat(from, 'HEAD'))].sort((a, b) =>
      a.path.localeCompare(b.path),
    );

    expect(stats).toEqual([
      { path: 'a.txt', insertions: 3, deletions: 1 },
      { path: 'c.txt', insertions: 1, deletions: 0 },
    ]);
  });

  it('returns non-ASCII paths raw, not C-quoted — a quoted path escapes the mechanical-path exemption and can revert a legitimate commit (BACKLOG-999 C4)', async () => {
    // git C-quotes any path carrying non-ASCII bytes unless -z is passed
    // (core.quotePath): the wire shape becomes "__snapshots__/caf\303\251.snap",
    // quotes and all. isMechanicalDiffPath() anchors on `.snap$` and on a
    // `__snapshots__/` segment, so a quoted path matches NEITHER — the file's
    // lines then count as review burden, and a big-but-mechanical commit gets
    // reverted wholesale. changedFiles() above already passes -z for exactly
    // this reason; this pins that diffNumstat does too.
    const from = await vcs.head();
    mkdirSync(join(dir, '__snapshots__'), { recursive: true });
    writeFileSync(join(dir, '__snapshots__', 'café.snap'), 'one\ntwo\nthree\n');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'test: AP-2 add a non-ASCII snapshot path']);

    const stats = await vcs.diffNumstat(from, 'HEAD');

    expect(stats.map((s) => s.path)).toEqual(['__snapshots__/café.snap']);
  });

  it('degrades to [] for diffNumstat on an unborn/invalid ref, same as changedFiles', async () => {
    expect(await vcs.diffNumstat('', 'HEAD')).toEqual([]);
    expect(await vcs.diffNumstat('deadbeef', 'HEAD')).toEqual([]);
    expect(await vcs.diffNumstat('HEAD', 'HEAD')).toEqual([]);
  });

  it('computes per-file old-side line ranges for a modification, an addition, and a deletion', async () => {
    writeFileSync(
      join(dir, 'multi.txt'),
      Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n'),
    );
    writeFileSync(join(dir, 'doomed.txt'), 'bye1\nbye2');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: seed multi.txt and doomed.txt']);
    const base = await vcs.head();

    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
    lines[0] = 'CHANGED';
    writeFileSync(join(dir, 'multi.txt'), lines.join('\n'));
    writeFileSync(join(dir, 'brand-new.txt'), 'fresh');
    execFileSync('git', ['-C', dir, 'rm', '-q', 'doomed.txt']);
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: modify, add, delete']);

    const ranges = await vcs.changedLineRanges(base, 'HEAD');

    expect(ranges.get('multi.txt')).toEqual([{ start: 1, end: 1 }]);
    expect(ranges.get('doomed.txt')).toEqual([{ start: 1, end: 2 }]);
    // Pure insertion: measured as its top-of-file boundary span, so two
    // branches both adding the same new file intersect instead of relying on
    // the narrower's "unmeasurable → keep" fallback.
    expect(ranges.get('brand-new.txt')).toEqual([{ start: 0, end: 1 }]);
  });

  it('records a pure mid-file insertion as its old-side boundary span — dropped entirely before, so a file where two siblings each edited DIFFERENT lines but inserted at the SAME point (the classic both-append collision, specimen f21c003) measured as non-overlapping and cleared hunk narrowing into a blind merge conflict', async () => {
    writeFileSync(
      join(dir, 'multi.txt'),
      Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n'),
    );
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: seed multi.txt']);
    const base = await vcs.head();

    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
    lines[1] = 'CHANGED';
    lines.splice(6, 0, 'inserted-a', 'inserted-b');
    writeFileSync(join(dir, 'multi.txt'), lines.join('\n'));
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: edit line 2, insert after line 6']);

    const ranges = await vcs.changedLineRanges(base, 'HEAD');

    // The insertion touches the boundary between old lines 6 and 7 — recorded
    // as that span so another branch's same-point insertion (or an edit of
    // either adjacent line, which git also refuses to auto-merge) intersects.
    expect(ranges.get('multi.txt')).toEqual([
      { start: 2, end: 2 },
      { start: 6, end: 7 },
    ]);
  });

  it('reports two separate hunks for two non-adjacent edits in the same file', async () => {
    writeFileSync(
      join(dir, 'multi.txt'),
      Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n'),
    );
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: seed multi.txt']);
    const base = await vcs.head();

    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
    lines[0] = 'TOP';
    lines[9] = 'BOTTOM';
    writeFileSync(join(dir, 'multi.txt'), lines.join('\n'));
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: edit top and bottom']);

    const ranges = await vcs.changedLineRanges(base, 'HEAD');

    expect(ranges.get('multi.txt')).toEqual([
      { start: 1, end: 1 },
      { start: 10, end: 10 },
    ]);
  });

  it("keys a renamed-and-edited file's ranges under BOTH the old and new path — same rename hazard `commitsAhead`/`parseCommitLogWithRenames` already closed, but `changedLineRanges` had no equivalent fix, so the landing overlap detector's hunk-narrowing silently loses precision (falls back to 'unmeasurable, keep as warning') for any sibling that renamed a file it also edited", async () => {
    // Forces rename detection deterministically — plain `git diff` (no `-M`)
    // only detects a rename when `diff.renames` is configured true, so
    // without this the test's outcome would depend on the machine's ambient
    // git config instead of exercising the rename path on purpose.
    gitSync(dir, ['config', 'diff.renames', 'true']);
    writeFileSync(
      join(dir, 'old.txt'),
      Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n'),
    );
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: seed old.txt']);
    const base = await vcs.head();

    gitSync(dir, ['mv', 'old.txt', 'new.txt']);
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
    lines[0] = 'CHANGED';
    writeFileSync(join(dir, 'new.txt'), lines.join('\n'));
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: rename and edit old.txt -> new.txt']);

    const ranges = await vcs.changedLineRanges(base, 'HEAD');

    expect(ranges.get('new.txt')).toEqual([{ start: 1, end: 1 }]);
    expect(ranges.get('old.txt')).toEqual([{ start: 1, end: 1 }]);
  });

  it('never leaks a stale old-side path across file boundaries — a plain addition following a modify/delete in the same diff must not be mistaken for a rename', async () => {
    writeFileSync(join(dir, 'first.txt'), 'a\nb\nc');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: seed first.txt']);
    const base = await vcs.head();

    writeFileSync(join(dir, 'first.txt'), 'CHANGED\nb\nc');
    writeFileSync(join(dir, 'second.txt'), 'fresh');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: edit first.txt, add second.txt']);

    const ranges = await vcs.changedLineRanges(base, 'HEAD');

    expect(ranges.get('first.txt')).toEqual([{ start: 1, end: 1 }]);
    // Keyed under its own path (no stale-rename leak) with the top-of-file
    // boundary span a pure insertion now measures as.
    expect(ranges.get('second.txt')).toEqual([{ start: 0, end: 1 }]);
  });

  it('degrades to an empty map on an invalid ref rather than throwing', async () => {
    const ranges = await vcs.changedLineRanges('deadbeef', 'HEAD');
    expect(ranges.size).toBe(0);
  });

  it('degrades to an empty map for a non-repo path rather than throwing', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'autopilot-not-a-repo-'));
    try {
      const outsideVcs = new GitVcs(outside);
      const ranges = await outsideVcs.changedLineRanges('base', 'HEAD');
      expect(ranges.size).toBe(0);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('parses double-digit files/insertions counts (regex \\d+, not a single \\d)', async () => {
    const from = await vcs.head();
    for (let i = 0; i < 12; i++) {
      writeFileSync(join(dir, `many-${i}.txt`), 'x');
    }
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: many new files']);

    const stat = await vcs.diffstat(from, 'HEAD');

    expect(stat).toEqual({ filesChanged: 12, insertions: 12, deletions: 0 });
  });

  it('parses double-digit deletions counts (regex \\d+, not \\D+)', async () => {
    writeFileSync(
      join(dir, 'many-lines.txt'),
      Array.from({ length: 13 }, (_, i) => `line${i}`).join('\n'),
    );
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: add many lines']);
    const from = await vcs.head();
    writeFileSync(join(dir, 'many-lines.txt'), '');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: remove many lines']);

    const stat = await vcs.diffstat(from, 'HEAD');

    expect(stat).toEqual({ filesChanged: 1, insertions: 0, deletions: 13 });
  });

  it('parses the singular "1 file changed, 1 insertion(+)" wording (regex plural boundary)', async () => {
    const from = await vcs.head();
    writeFileSync(join(dir, 'single.txt'), 'x');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: single line add']);

    const stat = await vcs.diffstat(from, 'HEAD');

    expect(stat).toEqual({ filesChanged: 1, insertions: 1, deletions: 0 });
  });

  it('parses the singular "1 deletion(-)" wording (regex plural boundary)', async () => {
    // Trailing newlines on BOTH revisions — an absent one on either side
    // turns into a spurious "no newline at end of file" insertion+deletion
    // pair instead of a clean single-line removal.
    writeFileSync(join(dir, 'twolines.txt'), 'first\nsecond\n');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: two lines']);
    const from = await vcs.head();
    writeFileSync(join(dir, 'twolines.txt'), 'first\n');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: remove one line']);

    const stat = await vcs.diffstat(from, 'HEAD');

    expect(stat).toEqual({ filesChanged: 1, insertions: 0, deletions: 1 });
  });

  it("handles git output over Node's default 1MB maxBuffer without truncating", async () => {
    const big = 'x'.repeat(2 * 1024 * 1024); // 2MB — over the 1MB Node default, under our 16MB cap
    writeFileSync(join(dir, 'big.txt'), big);
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: big file']);

    const patch = await vcs.showPatch('HEAD');

    expect(patch).toContain('feat: big file');
    expect(patch.length).toBeGreaterThan(1024 * 1024);
  });

  it('reports the real numeric git exit code, not a coerced 1 (e.g. exit 128 on a rejected tag name)', async () => {
    const result = await vcs.tag('not a valid tag name', 'x');

    // The real exit code (128, not a coerced 1) plus git's real stderr reason
    // (board web-mss2y67i-3lmwzi — previously read from the always-empty
    // stdout instead).
    expect(result).toEqual({
      ok: false,
      details: "git tag failed (exit 128): fatal: 'not a valid tag name' is not a valid tag name.",
    });
  });

  it('reports exit 1 (not the raw spawn errno string) when the git binary itself cannot be resolved', async () => {
    const originalPath = process.env['PATH'];
    process.env['PATH'] = '';
    try {
      await expect(vcs.commitAll('wip(autopilot): checkpoint — test')).rejects.toThrow(
        'git commit (checkpoint) failed (exit 1): ',
      );
    } finally {
      process.env['PATH'] = originalPath;
    }
  });

  it('reports failure and recovers when the branch ref cannot be fast-forwarded onto base (advance step)', async () => {
    gitSync(dir, ['branch', '-m', 'main']);
    gitSync(dir, ['checkout', '-b', 'autopilot/flight']);
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    const flightHead = await vcs.head();
    // A stale ref lock — git's own locking mechanism — blocks ONLY `branch
    // -f`'s ref write; checkout(base)/merge (which never touch this ref)
    // and the recovery checkout (which only READS it) are unaffected.
    writeFileSync(join(dir, '.git', 'refs', 'heads', 'autopilot', 'flight.lock'), '');

    const result = await vcs.land('main');

    expect(result.ok).toBe(false);
    expect(result.details).toContain(
      "landed onto 'main' but failed to fast-forward 'autopilot/flight'",
    );
    expect(result.details).toContain('(exit 128)');
    expect(await vcs.currentBranch()).toBe('autopilot/flight'); // recovery checkout returned here
    expect(await vcs.head()).toBe(flightHead); // branch ref itself was never advanced
  });

  it('lists recent commits newest-first, capped at the requested count', async () => {
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    writeFileSync(join(dir, 'c.txt'), 'three');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 third']);

    const commits = await vcs.recentCommits(2);

    expect(commits).toHaveLength(2);
    expect(commits[0]?.subject).toBe('feat: AP-3 third');
    expect(commits[1]?.subject).toBe('feat: AP-2 second');
    expect(commits[0]?.shortSha).toMatch(/^[0-9a-f]{7,}$/);
  });

  it("includes each commit's changed file paths (feeds the board/git reconciliation path-match signal)", async () => {
    writeFileSync(join(dir, 'b.txt'), 'two');
    writeFileSync(join(dir, 'c.txt'), 'three');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);

    const commits = await vcs.recentCommits(1);

    expect(commits[0]?.files).toEqual(expect.arrayContaining(['b.txt', 'c.txt']));
    expect(commits[0]?.files).toHaveLength(2);
  });

  it('reports an empty files list for a commit that touched no files', async () => {
    gitSync(dir, ['commit', '-q', '--allow-empty', '-m', 'chore: AP-2 empty']);

    const commits = await vcs.recentCommits(1);

    expect(commits[0]?.subject).toBe('chore: AP-2 empty');
    expect(commits[0]?.files).toEqual([]);
  });

  it('degrades to [] on a non-repo path rather than throwing', async () => {
    const missing = new GitVcs(join(dir, 'does-not-exist'));
    expect(await missing.recentCommits(5)).toEqual([]);
  });

  it('lists commits ahead of a base ref, newest first (the LANDING card preview)', async () => {
    const base = await vcs.head();
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    writeFileSync(join(dir, 'c.txt'), 'three');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 third']);

    const commits = await vcs.commitsAhead(base);

    expect(commits).toHaveLength(2);
    expect(commits[0]?.subject).toBe('feat: AP-3 third');
    expect(commits[1]?.subject).toBe('feat: AP-2 second');
    expect(commits[0]?.files).toEqual(['c.txt']);
  });

  it('reports no commits ahead when base is already HEAD', async () => {
    expect(await vcs.commitsAhead('HEAD')).toEqual([]);
  });

  it('degrades to [] when base does not exist rather than throwing', async () => {
    expect(await vcs.commitsAhead('does-not-exist-branch')).toEqual([]);
  });

  it("lists commits ahead of base for an explicit sibling ref, without checking it out (the landing overlap detector's data source)", async () => {
    const base = await vcs.head();
    gitSync(dir, ['branch', 'sibling']);
    gitSync(dir, ['checkout', '-q', 'sibling']);
    writeFileSync(join(dir, 'sibling-only.txt'), 'sibling work');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-4 sibling work']);
    gitSync(dir, ['checkout', '-q', '-']); // back to the original branch, HEAD untouched

    const fromHead = await vcs.commitsAhead(base);
    const fromSibling = await vcs.commitsAhead(base, 'sibling');

    expect(fromHead).toEqual([]);
    expect(fromSibling).toHaveLength(1);
    expect(fromSibling[0]?.subject).toBe('feat: AP-4 sibling work');
    expect(fromSibling[0]?.files).toEqual(['sibling-only.txt']);
  });

  it("includes a renamed file's OLD path alongside the new one — git's default rename detection collapses `--name-only` to just the new path, which would make the landing overlap detector blind to a sibling that edited the file under its FORMER name", async () => {
    const base = await vcs.head();
    gitSync(dir, ['branch', 'sibling']);
    gitSync(dir, ['checkout', '-q', 'sibling']);
    // Unedited rename (100% similarity) is what triggers git's rename
    // detection and collapses `--name-only` down to just the new path — an
    // edited-beyond-recognition rename falls back to plain delete+add, which
    // already lists both paths and wouldn't exercise this bug at all.
    gitSync(dir, ['mv', 'a.txt', 'renamed.txt']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-5 pure rename']);
    gitSync(dir, ['checkout', '-q', '-']);

    const commits = await vcs.commitsAhead(base, 'sibling');

    expect(commits[0]?.files).toEqual(expect.arrayContaining(['a.txt', 'renamed.txt']));
    expect(commits[0]?.files).toHaveLength(2);
  });

  it('reads the current branch name', async () => {
    // Renamed explicitly so the assertion doesn't depend on the ambient
    // `init.defaultBranch` git config (main/master/trunk/...).
    gitSync(dir, ['branch', '-m', 'autopilot/flight']);
    expect(await vcs.currentBranch()).toBe('autopilot/flight');
  });

  it("returns '' for currentBranch on a non-repo path rather than throwing", async () => {
    const missing = new GitVcs(join(dir, 'does-not-exist'));
    expect(await missing.currentBranch()).toBe('');
  });

  it("returns '' for currentBranch on a repo with no commits yet (unborn HEAD) — not just a non-repo path", async () => {
    const empty = mkdtempSync(join(tmpdir(), 'autopilot-git-unborn-'));
    initRepo(empty);
    try {
      // `git rev-parse --abbrev-ref HEAD` on an unborn branch exits 128 but
      // still echoes 'HEAD' to stdout — same pin as head()'s unborn-repo test.
      expect(await new GitVcs(empty).currentBranch()).toBe('');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("finds 'main' as the default branch when it exists", async () => {
    gitSync(dir, ['branch', '-m', 'main']);
    expect(await vcs.defaultBranch()).toBe('main');
  });

  it("falls back to 'master' when 'main' does not exist", async () => {
    gitSync(dir, ['branch', '-m', 'master']);
    expect(await vcs.defaultBranch()).toBe('master');
  });

  it("returns '' when neither main nor master exists (e.g. only a flight branch)", async () => {
    gitSync(dir, ['branch', '-m', 'autopilot/flight']);
    expect(await vcs.defaultBranch()).toBe('');
  });

  it("returns '' for defaultBranch on a non-repo path rather than throwing", async () => {
    const missing = new GitVcs(join(dir, 'does-not-exist'));
    expect(await missing.defaultBranch()).toBe('');
  });

  it('returns false for hasRemote when the repo has no remote configured', async () => {
    expect(await vcs.hasRemote()).toBe(false);
  });

  it('returns true for hasRemote once a remote is added', async () => {
    gitSync(dir, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
    expect(await vcs.hasRemote()).toBe(true);
  });

  it('returns false for hasRemote on a non-repo path rather than throwing', async () => {
    const missing = new GitVcs(join(dir, 'does-not-exist'));
    expect(await missing.hasRemote()).toBe(false);
  });

  it('returns null for lastTag when the repo has no tags yet', async () => {
    expect(await vcs.lastTag()).toBeNull();
  });

  it('finds the most recently created tag, not the alphabetically first one', async () => {
    // Explicit, far-apart dates (not wall-clock) so the ordering can never tie/flake.
    // Names are alphabetically the OPPOSITE of their creation order (aaa-early
    // sorts first alphabetically but was tagged first chronologically too) so
    // a sort-by-creatordate bug (e.g. losing `--sort=-creatordate` and falling
    // back to git's default refname-ascending order) picks the WRONG tag
    // instead of coincidentally agreeing with the correct one.
    const early = {
      ...process.env,
      GIT_COMMITTER_DATE: '2020-01-01T00:00:00',
      GIT_AUTHOR_DATE: '2020-01-01T00:00:00',
    };
    const late = {
      ...process.env,
      GIT_COMMITTER_DATE: '2021-01-01T00:00:00',
      GIT_AUTHOR_DATE: '2021-01-01T00:00:00',
    };
    execFileSync('git', ['-C', dir, 'tag', '-a', 'aaa-early', '-m', 'early'], {
      encoding: 'utf8',
      env: early,
    });
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'feat: AP-2 second'], {
      encoding: 'utf8',
      env: late,
    });
    gitSync(dir, ['tag', 'zzz-late']); // lightweight — creatordate falls back to the pointed commit's (later) date

    const tag = await vcs.lastTag();

    expect(tag?.name).toBe('zzz-late');
    const rawUnixSeconds = Number(
      gitSync(dir, ['for-each-ref', '--format=%(creatordate:unix)', 'refs/tags/zzz-late']),
    );
    expect(tag?.at).toBe(rawUnixSeconds * 1000); // ms, not a truncated /1000
  });

  it('returns null for lastTag on a non-repo path rather than throwing', async () => {
    const missing = new GitVcs(join(dir, 'does-not-exist'));
    expect(await missing.lastTag()).toBeNull();
  });

  it("reads a commit's full patch (message + diff) — the DELIVERABLE verifier's grep target", async () => {
    writeFileSync(join(dir, 'tooltip.txt'), 'renders a tooltip on hover');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: add hover tooltip']);

    const patch = await vcs.showPatch('HEAD');

    expect(patch).toContain('feat: add hover tooltip');
    expect(patch).toContain('renders a tooltip on hover');
  });

  it("returns '' for showPatch on an invalid ref rather than throwing", async () => {
    expect(await vcs.showPatch('deadbeef')).toBe('');
  });

  it("returns '' for showPatch on a non-repo path rather than throwing", async () => {
    const missing = new GitVcs(join(dir, 'does-not-exist'));
    expect(await missing.showPatch('HEAD')).toBe('');
  });

  it('lands the checked-out branch onto base: merges --no-ff --signoff, then advances the branch to it', async () => {
    gitSync(dir, ['branch', '-m', 'main']);
    gitSync(dir, ['checkout', '-b', 'autopilot/flight']);
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    const flightHead = await vcs.head();

    const result = await vcs.land('main');

    expect(result).toEqual({ ok: true, details: 'landed autopilot/flight onto main' });
    expect(await vcs.currentBranch()).toBe('autopilot/flight'); // returns to the flight branch
    expect(await vcs.head()).not.toBe(flightHead); // advanced onto the new merge commit
    expect(gitSync(dir, ['log', '-1', 'main', '--format=%s'])).toBe(
      'chore: land autopilot/flight into main',
    );
    expect(gitSync(dir, ['rev-parse', 'main'])).toBe(
      gitSync(dir, ['rev-parse', 'autopilot/flight']),
    );
    expect(gitSync(dir, ['log', '-1', 'main', '--format=%B'])).toContain('Signed-off-by:');
  });

  it('accepts a custom merge message', async () => {
    gitSync(dir, ['branch', '-m', 'main']);
    gitSync(dir, ['checkout', '-b', 'autopilot/flight']);
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);

    await vcs.land('main', 'chore: land 3 ships');

    expect(gitSync(dir, ['log', '-1', 'main', '--format=%s'])).toBe('chore: land 3 ships');
  });

  it('reports failure without throwing when the final checkout back to the branch fails, despite a successful merge+advance', async () => {
    gitSync(dir, ['branch', '-m', 'main']);
    gitSync(dir, ['checkout', '-b', 'autopilot/flight']);
    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);
    // A post-checkout hook that only fails when landing back onto the FLIGHT
    // branch — the checkout of 'main' (land's first step) is unaffected, so
    // merge and advance both genuinely complete before this final step fails.
    writeFileSync(
      join(dir, '.git', 'hooks', 'post-checkout'),
      '#!/bin/sh\n[ "$(git rev-parse --abbrev-ref HEAD)" = "autopilot/flight" ] && exit 1\nexit 0\n',
      { mode: 0o755 },
    );

    const result = await vcs.land('main');

    expect(result.ok).toBe(false);
    expect(result.details).toContain(
      "landed and advanced 'autopilot/flight' but failed to check it back out",
    );
    expect(result.details).toContain('(exit 1)');
    // The merge + advance genuinely happened for real before the final
    // checkout tripped the hook — main now carries the flight branch's commit.
    expect(gitSync(dir, ['log', '-1', 'main', '--format=%s'])).toBe(
      'chore: land autopilot/flight into main',
    );
  });

  it('refuses to land when the working tree is dirty (touches nothing)', async () => {
    gitSync(dir, ['branch', '-m', 'main']);
    gitSync(dir, ['checkout', '-b', 'autopilot/flight']);
    writeFileSync(join(dir, 'wip.txt'), 'half-finished');

    const result = await vcs.land('main');

    expect(result).toEqual({ ok: false, details: 'nothing to land: the working tree is dirty' });
    expect(await vcs.currentBranch()).toBe('autopilot/flight'); // never switched away
  });

  it('refuses to land when no branch distinct from base is checked out', async () => {
    gitSync(dir, ['branch', '-m', 'main']);

    const result = await vcs.land('main');

    expect(result).toEqual({
      ok: false,
      details: "nothing to land: no branch distinct from 'main' is checked out (got 'main')",
    });
  });

  it("refuses to land on a non-repo path, reporting '(detached)' rather than an empty branch name", async () => {
    const missing = new GitVcs(join(dir, 'does-not-exist'));

    const result = await missing.land('main');

    expect(result).toEqual({
      ok: false,
      details: "nothing to land: no branch distinct from 'main' is checked out (got '(detached)')",
    });
  });

  it('aborts a conflicting merge and returns to the branch untouched', async () => {
    gitSync(dir, ['branch', '-m', 'main']);
    gitSync(dir, ['checkout', '-b', 'autopilot/flight']);
    writeFileSync(join(dir, 'a.txt'), 'flight change');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 conflicting change']);
    const flightHead = await vcs.head();
    gitSync(dir, ['checkout', 'main']);
    writeFileSync(join(dir, 'a.txt'), 'main change');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 diverging main change']);
    gitSync(dir, ['checkout', 'autopilot/flight']);

    const result = await vcs.land('main');

    expect(result.ok).toBe(false);
    // Pins the FULL message, including the real conflict text a merge
    // failure (unlike a fatal error) genuinely puts on stdout, not stderr —
    // trimmed of the trailing newline git always appends.
    expect(result.details).toBe(
      "merge of 'autopilot/flight' into 'main' failed (exit 1): Auto-merging a.txt\nCONFLICT (content): Merge conflict in a.txt\nAutomatic merge failed; fix conflicts and then commit the result.",
    );
    expect(await vcs.currentBranch()).toBe('autopilot/flight'); // returned to the flight branch
    expect(await vcs.head()).toBe(flightHead); // untouched — no partial merge left behind
    expect(await vcs.isDirty()).toBe(false); // the abort cleaned up fully
  });

  it('refuses when base does not exist, without switching branches', async () => {
    gitSync(dir, ['branch', '-m', 'autopilot/flight']);

    const result = await vcs.land('does-not-exist-branch');

    expect(result.ok).toBe(false);
    expect(result.details).toContain("checkout of 'does-not-exist-branch' failed");
    expect(await vcs.currentBranch()).toBe('autopilot/flight');
  });

  it("signs off checkpoint commits — required by this repo's commit-msg hook (regression: silently stranded WIP)", async () => {
    // Mirrors the real .husky/commit-msg + commitlint `signed-off-by` rule: a
    // commit-msg hook that rejects any message lacking a `Signed-off-by:`
    // trailer. Before commitAll passed --signoff, this hook rejected every
    // checkpoint commit and the caller's try/catch swallowed the failure —
    // WIP was silently dropped instead of packed up.
    writeFileSync(
      join(dir, '.git', 'hooks', 'commit-msg'),
      '#!/bin/sh\ngrep -q "^Signed-off-by:" "$1" || exit 1\n',
      { mode: 0o755 },
    );
    writeFileSync(join(dir, 'wip.txt'), 'half-finished work');

    await vcs.commitAll('wip(autopilot): checkpoint — test');

    expect(await vcs.isDirty()).toBe(false); // rejected commits leave the tree dirty
    const last = await vcs.lastCommit();
    expect(gitSync(dir, ['log', '-1', '--format=%B'])).toContain('Signed-off-by:');
    expect(last?.subject).toContain('wip(autopilot): checkpoint');
  });

  it('creates an annotated tag at HEAD', async () => {
    const head = await vcs.head();

    const result = await vcs.tag('v0.13.0', 'release v0.13.0');

    expect(result).toEqual({ ok: true, details: "created annotated tag 'v0.13.0' at HEAD" });
    expect(gitSync(dir, ['rev-parse', 'v0.13.0^{commit}'])).toBe(head); // points at HEAD
    expect(gitSync(dir, ['cat-file', '-t', 'v0.13.0'])).toBe('tag'); // annotated, not lightweight
    expect(
      gitSync(dir, ['for-each-ref', '--format=%(contents:subject)', 'refs/tags/v0.13.0']),
    ).toBe('release v0.13.0');
  });

  it('refuses to create a tag that already exists, touching nothing', async () => {
    await vcs.tag('v0.13.0', 'first release');
    const tagSha = gitSync(dir, ['rev-parse', 'v0.13.0']);
    writeFileSync(join(dir, 'c.txt'), 'more');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 second']);

    const result = await vcs.tag('v0.13.0', 'second attempt, same name');

    expect(result).toEqual({ ok: false, details: "tag 'v0.13.0' already exists" });
    expect(gitSync(dir, ['rev-parse', 'v0.13.0'])).toBe(tagSha); // untouched
  });

  it('reports failure without throwing when git rejects the tag name', async () => {
    const result = await vcs.tag('not a valid tag name', 'x');

    expect(result.ok).toBe(false);
    expect(result.details).toContain('git tag failed');
  });

  it("surfaces git's real stderr reason for a rejected tag name, not an empty string (board web-mss2y67i-3lmwzi — git writes this to stderr, not stdout)", async () => {
    const result = await vcs.tag('not a valid tag name', 'x');

    expect(result.details).toContain('is not a valid tag name');
    expect(result.details).not.toMatch(/failed \(exit \d+\): $/);
  });

  it('preserves markdown ### headings in the tag body — git\'s comment-line cleanup treats a leading "#" as commentary regardless of what follows, so the release tag message (release.ts\'s buildReleaseTagMessage, "### Added"/"### Fixed"/"### Performance") must be tagged with --cleanup=whitespace or those headings vanish and the notes read as one flat bullet list (board web-mtongs56-uswvds)', async () => {
    const message =
      'Release v0.23.0 (minor) — 2026-09-01\n\n### Added\n\n- foo\n\n### Fixed\n\n- bar';

    const result = await vcs.tag('v0.23.0', message);

    expect(result.ok).toBe(true);
    const body = gitSync(dir, ['for-each-ref', '--format=%(contents:body)', 'refs/tags/v0.23.0']);
    expect(body).toContain('### Added');
    expect(body).toContain('### Fixed');
  });

  it('attaches a git-notes attestation to a commit', async () => {
    const head = await vcs.head();

    const result = await vcs.notes(head, 'Release v0.13.0 (minor) — 2026-08-12');

    expect(result).toEqual({ ok: true, details: `attached a note to '${head}'` });
    expect(gitSync(dir, ['notes', 'show', head])).toBe('Release v0.13.0 (minor) — 2026-08-12');
  });

  it('refuses to attach a second note to the same commit, touching nothing', async () => {
    const head = await vcs.head();
    await vcs.notes(head, 'first attestation');

    const result = await vcs.notes(head, 'second attestation');

    expect(result).toEqual({ ok: false, details: `a note already exists on '${head}'` });
    expect(gitSync(dir, ['notes', 'show', head])).toBe('first attestation');
  });

  it('reports failure without throwing when git rejects the commitish', async () => {
    const result = await vcs.notes('not-a-real-commit', 'x');

    expect(result.ok).toBe(false);
    expect(result.details).toContain('git notes add failed');
  });

  it('attaches a huge attestation body without blowing the OS command-line length limit (board web-mt65yd1p-muhrxp — v0.14.0 shipped 1902 commits since its last tag, and passing all of their subjects inline via `-m` hit ENAMETOOLONG on Windows)', async () => {
    const head = await vcs.head();
    const hugeMessage = Array.from(
      { length: 2000 },
      (_, i) => `- feat: commit number ${i} with a reasonably long subject line to pad it out`,
    ).join('\n');
    expect(hugeMessage.length).toBeGreaterThan(100_000); // far past Windows' ~32K argv ceiling

    const result = await vcs.notes(head, hugeMessage);

    expect(result).toEqual({ ok: true, details: `attached a note to '${head}'` });
    expect(gitSync(dir, ['notes', 'show', head])).toBe(hugeMessage);
  });
});

describe('GitHeadReader (containment audit)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-head-'));
    initRepo(dir);
    writeFileSync(join(dir, 'a.txt'), 'one');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'init']);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the current HEAD sha and reflects a new commit', () => {
    const reader = new GitHeadReader();
    const before = reader.headOf(dir);
    expect(before).toMatch(/^[0-9a-f]{40}$/);

    writeFileSync(join(dir, 'b.txt'), 'two');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'second']);

    expect(reader.headOf(dir)).not.toBe(before); // a moved HEAD is detectable
  });

  it("returns '' for a non-repo path (never a false breach)", () => {
    expect(new GitHeadReader().headOf(join(dir, 'nope'))).toBe('');
  });
});

/**
 * THE DEGRADE-TO-EMPTY CONTRACTS (mutation testing, 2026-09-16).
 *
 * `changedFiles`, `diffNumstat` and `commitInFiringRange` each open with
 * guard clauses that every caller depends on and no test entered: an
 * unborn-HEAD `''` ref, a ref git rejects, a binary file whose counts print
 * as a literal `-`. Forty of git.ts's sixty surviving mutants lived in
 * those few lines, because a guard nothing exercises is indistinguishable
 * from a guard that isn't there.
 *
 * These are the contracts the firing record is built on — degrade to empty
 * and omit the field honestly, never fabricate paths or a NaN line count.
 */
describe('GitVcs — the guard clauses the record depends on', () => {
  let dir: string;
  let vcs: GitVcs;
  let first: string;
  let second: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-git-guards-'));
    initRepo(dir);
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: first']);
    first = gitSync(dir, ['rev-parse', 'HEAD']);
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo\nthree\n');
    writeFileSync(join(dir, 'b.txt'), 'new\n');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: second']);
    second = gitSync(dir, ['rev-parse', 'HEAD']);
    vcs = new GitVcs(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('changedFiles', () => {
    it('lists the files that really differ between two refs', async () => {
      expect([...(await vcs.changedFiles(first, second))].sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('degrades to empty on an unborn-HEAD ref, from EITHER side', async () => {
      // An unborn HEAD has no tree to diff, so there is nothing to report.
      // Both sides are checked because the guard is an `||`: a mutant that
      // turned it into `&&` still handled one empty ref and was invisible.
      expect(await vcs.changedFiles('', second)).toEqual([]);
      expect(await vcs.changedFiles(first, '')).toEqual([]);
      expect(await vcs.changedFiles('', '')).toEqual([]);
    });

    it('degrades to empty when git rejects the ref rather than throwing', async () => {
      expect(await vcs.changedFiles(first, 'no-such-ref')).toEqual([]);
    });

    it('drops the empty trailing record `-z` leaves behind', async () => {
      // `-z` terminates each path with a NUL, so the split always yields a
      // final empty string. It must never surface as a zero-length path.
      const files = await vcs.changedFiles(first, second);
      expect(files.every((p) => p.length > 0)).toBe(true);
    });
  });

  describe('diffNumstat', () => {
    it('counts insertions and deletions per file', async () => {
      const stats = await vcs.diffNumstat(first, second);
      const a = stats.find((s) => s.path === 'a.txt');
      expect(a).toEqual({ path: 'a.txt', insertions: 1, deletions: 0 });
    });

    it('degrades to empty on an unborn-HEAD ref, from EITHER side', async () => {
      expect(await vcs.diffNumstat('', second)).toEqual([]);
      expect(await vcs.diffNumstat(first, '')).toEqual([]);
      expect(await vcs.diffNumstat('', '')).toEqual([]);
    });

    it('degrades to empty when git rejects the ref', async () => {
      expect(await vcs.diffNumstat(first, 'no-such-ref')).toEqual([]);
    });

    it('reads a binary file as zero lines, never NaN', async () => {
      // git prints `-` for both counts on binary content because there is no
      // line count to give. Parsed as 0: the path still rides through for the
      // diff-size gate's mechanical-path classification, but it contributes
      // no reviewable lines. `Number('-')` would be NaN and poison every sum
      // downstream, which is exactly what this branch exists to prevent.
      writeFileSync(join(dir, 'logo.png'), Buffer.from([0, 1, 2, 0, 255, 0, 3]));
      gitSync(dir, ['add', '-A']);
      gitSync(dir, ['commit', '-q', '-m', 'feat: binary']);
      const third = gitSync(dir, ['rev-parse', 'HEAD']);

      const binary = (await vcs.diffNumstat(second, third)).find((s) => s.path === 'logo.png');
      expect(binary).toBeDefined();
      expect(binary?.insertions).toBe(0);
      expect(binary?.deletions).toBe(0);
      expect(Number.isNaN(binary?.insertions)).toBe(false);
    });

    it('never yields a record with an empty path', async () => {
      const stats = await vcs.diffNumstat(first, second);
      expect(stats.length).toBeGreaterThan(0);
      expect(stats.every((s) => s.path.length > 0)).toBe(true);
    });
  });

  describe('commitInFiringRange', () => {
    it('refuses everything when HEAD did not move — there is no range to be in', async () => {
      expect(await vcs.commitInFiringRange(second, first, '')).toBe(false);
    });

    it('accepts any reachable commit when the firing started from an unborn HEAD', async () => {
      // No `headBefore` means no ancestor constraint: reachability from
      // `headAfter` alone is the whole check.
      expect(await vcs.commitInFiringRange(first, '', second)).toBe(true);
      expect(await vcs.commitInFiringRange(second, '', second)).toBe(true);
    });

    it('accepts a commit inside the range and refuses one from before it', async () => {
      expect(await vcs.commitInFiringRange(second, first, second)).toBe(true);
      // `first` is reachable from `headAfter`, but it is ALSO reachable from
      // `headBefore` — so the firing did not create it, and claiming it would
      // be exactly the stale-sha forgery this check exists to catch.
      expect(await vcs.commitInFiringRange(first, first, second)).toBe(false);
    });

    it('refuses a sha that is not reachable at all', async () => {
      expect(await vcs.commitInFiringRange('0'.repeat(40), first, second)).toBe(false);
    });
  });
});

/**
 * PUSH AND DIRTY-TREE READING (mutation testing, 2026-09-16).
 *
 * `pushBranch` and `dirtyPaths` carried thirty-one mutants with NO COVERAGE
 * at all — not survivors, but code no test had ever entered. They are not
 * obscure: `pushBranch` is how a landing reaches the remote, and its
 * non-fast-forward detection is the difference between telling an operator
 * "someone else pushed first, integrate and land again" and handing them a
 * generic failure string to grep. `dirtyPaths` feeds the remediating gate's
 * before/after diff.
 *
 * Both went untested for the same reason: one needs a real remote and the
 * other needs a deliberately messy tree. Both are cheap to arrange.
 */
describe('GitVcs — pushing to a real remote, and reading a dirty tree', () => {
  let dir: string;
  let remote: string;
  let vcs: GitVcs;

  beforeEach(() => {
    remote = mkdtempSync(join(tmpdir(), 'autopilot-git-remote-'));
    execFileSync('git', ['init', '-q', '--bare', remote], { windowsHide: true });

    dir = mkdtempSync(join(tmpdir(), 'autopilot-git-push-'));
    initRepo(dir);
    writeFileSync(join(dir, 'a.txt'), 'one\n');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: first']);
    gitSync(dir, ['branch', '-M', 'main']);
    gitSync(dir, ['remote', 'add', 'origin', remote]);
    vcs = new GitVcs(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  });

  describe('pushBranch', () => {
    it('reports a clean push', async () => {
      const result = await vcs.pushBranch('main');
      expect(result).toEqual({ ok: true, nonFastForward: false, detail: 'pushed' });
    });

    it('names a non-fast-forward as its own outcome, not a generic failure', async () => {
      // Someone else pushed first: the remote has a commit this clone has
      // never seen, so the push is rejected. That has a specific remedy —
      // integrate, then land again — which a bare `ok: false` cannot offer.
      await vcs.pushBranch('main');
      const other = mkdtempSync(join(tmpdir(), 'autopilot-git-other-'));
      try {
        // `--branch main` explicitly: the bare repo's own HEAD still points
        // at whatever `git init --bare` chose, so a plain clone checks out an
        // unborn branch and the push below has no refspec to match.
        execFileSync('git', ['clone', '-q', '--branch', 'main', remote, other], {
          windowsHide: true,
        });
        initRepo(other);
        writeFileSync(join(other, 'b.txt'), 'theirs\n');
        gitSync(other, ['add', '-A']);
        gitSync(other, ['commit', '-q', '-m', 'feat: theirs']);
        gitSync(other, ['push', '-q', 'origin', 'main']);
      } finally {
        rmSync(other, { recursive: true, force: true });
      }

      writeFileSync(join(dir, 'c.txt'), 'mine\n');
      gitSync(dir, ['add', '-A']);
      gitSync(dir, ['commit', '-q', '-m', 'feat: mine']);

      const result = await vcs.pushBranch('main');
      expect(result.ok).toBe(false);
      expect(result.nonFastForward).toBe(true);
      expect(result.detail.length).toBeGreaterThan(0);
    });

    it('reports an ordinary failure as NOT a non-fast-forward', async () => {
      // A branch that does not exist is a plain failure. Conflating it with
      // "someone else pushed first" would send an operator to integrate
      // changes that are not there.
      const result = await vcs.pushBranch('no-such-branch');
      expect(result.ok).toBe(false);
      expect(result.nonFastForward).toBe(false);
      expect(result.detail.length).toBeGreaterThan(0);
    });
  });

  describe('dirtyPaths', () => {
    it('is empty on a clean tree', async () => {
      expect(await vcs.dirtyPaths()).toEqual([]);
      expect(await vcs.isDirty()).toBe(false);
    });

    it('reports a modified file and an untracked one', async () => {
      writeFileSync(join(dir, 'a.txt'), 'changed\n');
      writeFileSync(join(dir, 'new.txt'), 'fresh\n');
      const paths = [...(await vcs.dirtyPaths())].sort();
      expect(paths).toEqual(['a.txt', 'new.txt']);
      expect(await vcs.isDirty()).toBe(true);
    });

    it('reports the NEW path of a rename, not the old one', async () => {
      // A rename reads "orig -> new" in porcelain. The new path is the one
      // that needs re-staging; handing back "orig -> new" as a single path
      // would name a file that does not exist.
      gitSync(dir, ['mv', 'a.txt', 'renamed.txt']);
      const paths = await vcs.dirtyPaths();
      expect(paths).toContain('renamed.txt');
      expect(paths.every((p) => !p.includes(' -> '))).toBe(true);
      expect(paths).not.toContain('a.txt');
    });

    it('never yields an empty path from porcelain’s trailing newline', async () => {
      writeFileSync(join(dir, 'a.txt'), 'changed\n');
      expect((await vcs.dirtyPaths()).every((p) => p !== '')).toBe(true);
    });
  });
});

/**
 * COMMIT-LOG PARSING, REMOTES, AND THE SCOPED-COMMIT FAILURE (mutation
 * testing, 2026-09-16).
 *
 * `commitsAhead` feeds the fleet's same-file collision check: two lanes
 * touching one file must intersect, and a rename has to list BOTH paths or
 * the intersection misses a real collision. Nothing tested the rename or
 * copy branch of that parser, nor the record it builds. `hasRemote` decides
 * whether GITHUB SYNC plans `gh repo create --source --push` or a plain
 * push — a wrong answer there creates a repository nobody asked for.
 */
describe('GitVcs — commit-log parsing, remotes, and scoped-commit failure', () => {
  let dir: string;
  let vcs: GitVcs;
  let base: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-git-log-'));
    initRepo(dir);
    writeFileSync(join(dir, 'a.txt'), 'one\n');
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'note.md'), 'note\n');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: base']);
    base = gitSync(dir, ['rev-parse', 'HEAD']);
    vcs = new GitVcs(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('hasRemote', () => {
    it('is false with no remote configured', async () => {
      expect(await vcs.hasRemote()).toBe(false);
    });

    it('is true once one exists', async () => {
      gitSync(dir, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
      expect(await vcs.hasRemote()).toBe(true);
    });

    it('is false for a path that is not a repo at all, rather than throwing', async () => {
      const notARepo = mkdtempSync(join(tmpdir(), 'autopilot-git-bare-dir-'));
      try {
        expect(await new GitVcs(notARepo).hasRemote()).toBe(false);
      } finally {
        rmSync(notARepo, { recursive: true, force: true });
      }
    });
  });

  describe('commitsAhead', () => {
    it('lists each commit ahead of base with the files it touched', async () => {
      writeFileSync(join(dir, 'a.txt'), 'two\n');
      gitSync(dir, ['add', '-A']);
      gitSync(dir, ['commit', '-q', '-m', 'feat: edit a']);

      const commits = await vcs.commitsAhead(base);
      expect(commits).toHaveLength(1);
      expect(commits[0]?.subject).toBe('feat: edit a');
      expect(commits[0]?.shortSha.length).toBeGreaterThan(0);
      expect(commits[0]?.files).toEqual(['a.txt']);
    });

    it('lists BOTH paths of a rename, so a same-file collision still intersects', async () => {
      // This is the whole reason the parser special-cases R/C status. A lane
      // that renamed `a.txt` and a lane that edited `a.txt` collide — but
      // only if the rename reports the OLD path too.
      gitSync(dir, ['mv', 'a.txt', 'renamed.txt']);
      gitSync(dir, ['commit', '-q', '-m', 'refactor: rename a']);

      const files = (await vcs.commitsAhead(base))[0]?.files ?? [];
      expect(files).toContain('a.txt');
      expect(files).toContain('renamed.txt');
    });

    it('defaults its second ref to HEAD', async () => {
      writeFileSync(join(dir, 'a.txt'), 'two\n');
      gitSync(dir, ['add', '-A']);
      gitSync(dir, ['commit', '-q', '-m', 'feat: edit a']);
      expect(await vcs.commitsAhead(base)).toEqual(await vcs.commitsAhead(base, 'HEAD'));
    });

    it('is empty when nothing is ahead', async () => {
      expect(await vcs.commitsAhead(base)).toEqual([]);
    });

    it('never yields a record with an empty sha', async () => {
      writeFileSync(join(dir, 'a.txt'), 'two\n');
      gitSync(dir, ['add', '-A']);
      gitSync(dir, ['commit', '-q', '-m', 'feat: edit a']);
      const commits = await vcs.commitsAhead(base);
      expect(commits.length).toBeGreaterThan(0);
      expect(commits.every((c) => c.shortSha.length > 0)).toBe(true);
    });
  });

  describe('commitPaths', () => {
    it('throws with the exit code and git’s own reason when the commit itself fails', async () => {
      // An empty message is rejected by git. The scoped ritual must not
      // swallow that: a silent false would read as "nothing to commit" and
      // the work would be lost without anyone noticing.
      writeFileSync(join(dir, 'docs', 'note.md'), 'changed\n');
      await expect(vcs.commitPaths(['docs'], '')).rejects.toThrow(/git commit \(scoped\) failed/);
    });
  });
});

/**
 * THE PUSH FAILURE AN OPERATOR ACTUALLY READS (mutation testing, 2026-09-16).
 *
 * `pushBranch`'s `detail` is not decoration — it is the whole explanation a
 * human gets when a landing cannot reach the remote. Eight mutants lived in
 * that one line: drop the `.trim()`, drop the `filter(Boolean)`, widen the
 * `slice(-3)`, blank the `' · '` separator, blank the `'push failed'`
 * fallback. Every one of them changed what a person reads and none of them
 * failed a test, because the only assertion on it was that it had a length.
 */
describe('GitVcs — the push failure detail', () => {
  let dir: string;
  let remote: string;
  let vcs: GitVcs;

  beforeEach(() => {
    remote = mkdtempSync(join(tmpdir(), 'autopilot-git-detail-remote-'));
    execFileSync('git', ['init', '-q', '--bare', remote], { windowsHide: true });
    dir = mkdtempSync(join(tmpdir(), 'autopilot-git-detail-'));
    initRepo(dir);
    writeFileSync(join(dir, 'a.txt'), 'one\n');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'feat: first']);
    gitSync(dir, ['branch', '-M', 'main']);
    gitSync(dir, ['remote', 'add', 'origin', remote]);
    vcs = new GitVcs(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  });

  it('joins the last lines with the separator, and carries no blank ones', async () => {
    const result = await vcs.pushBranch('no-such-branch');
    expect(result.ok).toBe(false);
    // The separator is what makes a multi-line git error readable on one
    // line. Without it the words run together into a single sentence that
    // reads as prose git never wrote.
    expect(result.detail).toContain(' · ');
    // `filter(Boolean)` is why: git's output is newline-padded, and an
    // unfiltered join renders those blanks as " ·  · " runs.
    expect(result.detail).not.toContain(' ·  · ');
    expect(result.detail.startsWith(' ')).toBe(false);
    expect(result.detail.endsWith(' ')).toBe(false);
  });

  it('keeps at most the last three lines, so one failure cannot flood the record', async () => {
    const result = await vcs.pushBranch('no-such-branch');
    expect(result.detail.split(' · ').length).toBeLessThanOrEqual(3);
    expect(result.detail.split(' · ').length).toBeGreaterThan(0);
  });

  it('never returns an empty detail — there is always something to read', async () => {
    // The `|| 'push failed'` fallback. A push that fails while printing
    // nothing would otherwise hand the operator an empty string, which
    // reads as "no reason given" rather than "it failed".
    for (const branch of ['no-such-branch', 'refs/heads/nope']) {
      const result = await vcs.pushBranch(branch);
      expect(result.ok).toBe(false);
      expect(result.detail.trim().length).toBeGreaterThan(0);
    }
  });
});

/**
 * THE PARSERS, FED DIRECTLY (mutation testing, 2026-09-17).
 *
 * Four pure parsers used to live inline in their git-calling methods, so the
 * only way to reach them was through real git output — which is always
 * well-formed, and so could never show which guard in a parser was load-
 * bearing. Each is now a named export with its own tests on crafted input;
 * the real-git tests above stay as the integration layer.
 */

describe('parseHunkRanges', () => {
  it('a hunk header before any file header belongs to no file and is dropped, never keyed under null', () => {
    expect(parseHunkRanges('@@ -1,2 +1,2 @@\n-a\n+b\n').size).toBe(0);
  });

  it('a multi-line hunk spans start..start+count-1 on the old side', () => {
    const ranges = parseHunkRanges('--- a/f.txt\n+++ b/f.txt\n@@ -5,3 +5,4 @@\n');
    expect(ranges.get('f.txt')).toEqual([{ start: 5, end: 7 }]);
  });

  it('a single-line hunk (no count) is that one line', () => {
    const ranges = parseHunkRanges('--- a/f.txt\n+++ b/f.txt\n@@ -9 +9 @@\n');
    expect(ranges.get('f.txt')).toEqual([{ start: 9, end: 9 }]);
  });

  it('a pure addition (old side /dev/null) is keyed under the new path ONLY — no phantom entry for the absent old path', () => {
    const ranges = parseHunkRanges('--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,3 @@\n');
    expect([...ranges.keys()]).toEqual(['new.txt']);
    expect(ranges.get('new.txt')).toEqual([{ start: 0, end: 1 }]);
  });
});

describe('parseNumstat', () => {
  it('reads one record per NUL-terminated entry and drops the trailing empty one', () => {
    expect(parseNumstat('1\t2\ta.ts\0-\t-\tlogo.png\0')).toEqual([
      { path: 'a.ts', insertions: 1, deletions: 2 },
      { path: 'logo.png', insertions: 0, deletions: 0 },
    ]);
  });

  it('keeps a tab inside a path — only the first two tabs are field separators', () => {
    expect(parseNumstat('3\t0\tweird\tname.ts\0')).toEqual([
      { path: 'weird\tname.ts', insertions: 3, deletions: 0 },
    ]);
  });

  it('is empty for empty output', () => {
    expect(parseNumstat('')).toEqual([]);
  });
});

describe('describePushFailure', () => {
  it('keeps the LAST three non-blank lines, joined with the separator, in order', () => {
    const text = ['', 'one', '', 'two', 'three', 'four', 'five', ''].join('\n');
    expect(describePushFailure(text)).toEqual({
      ok: false,
      nonFastForward: false,
      detail: 'three · four · five',
    });
  });

  it('never comes back empty — a silent failure still says it failed', () => {
    expect(describePushFailure('').detail).toBe('push failed');
    expect(describePushFailure('\n\n').detail).toBe('push failed');
  });

  it("names a non-fast-forward from any of git's wordings", () => {
    expect(describePushFailure('! [rejected] main -> main (fetch first)').nonFastForward).toBe(
      true,
    );
    expect(describePushFailure('error: failed to push some refs').nonFastForward).toBe(false);
  });
});

describe('parseCommitLogWithRenames', () => {
  const SEP = String.fromCharCode(0x1f);
  const REC = String.fromCharCode(0x02);
  /** One record exactly as `--format=<REC>%h%x1f%s --name-status` frames it. */
  const record = (sha: string, subject: string, lines: readonly string[]): string =>
    `${REC}${sha}${SEP}${subject}\n\n${lines.map((l) => `${l}\n`).join('')}`;

  it('lists one path for an add/modify/delete and BOTH for a rename or copy, in order', () => {
    const out = parseCommitLogWithRenames(
      record('abc1234', 'feat: move', [
        'M\ta.ts',
        'R100\told.ts\tnew.ts',
        'C75\tsrc.ts\tcopy.ts',
        'D\tgone.ts',
      ]),
    );
    expect(out).toEqual([
      {
        shortSha: 'abc1234',
        subject: 'feat: move',
        files: ['a.ts', 'old.ts', 'new.ts', 'src.ts', 'copy.ts', 'gone.ts'],
      },
    ]);
  });

  it('keeps every record after the leading separator and none before it — no phantom empty commit', () => {
    const out = parseCommitLogWithRenames(
      record('a1', 'first', ['M\tx']) + record('b2', 'second', []),
    );
    expect(out.map((c) => c.shortSha)).toEqual(['a1', 'b2']);
    expect(out[1]?.files).toEqual([]);
  });

  it('a subject with a tab in it stays a subject, never a file', () => {
    const out = parseCommitLogWithRenames(record('a1', 'fix: tab\there', ['M\tx.ts']));
    expect(out[0]?.subject).toBe('fix: tab\there');
    expect(out[0]?.files).toEqual(['x.ts']);
  });

  it('a header with no subject separator yields an empty subject, and a status with no path yields no file', () => {
    const out = parseCommitLogWithRenames(`${REC}a1\n\nM\t\n`);
    expect(out).toEqual([{ shortSha: 'a1', subject: '', files: [] }]);
  });
});

describe('dirtyPaths on a path that is not a repository', () => {
  it('degrades to [], the same as changedFiles and diffNumstat', async () => {
    const missing = join(tmpdir(), `autopilot-git-no-such-repo-${process.pid}`);
    expect(await new GitVcs(missing).dirtyPaths()).toEqual([]);
  });
});

describe('tag — the message file lives in a temp dir that never outlives the call', () => {
  it('leaves nothing behind in the OS temp dir', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'autopilot-git-msgfile-'));
    const repo = join(scratch, 'repo');
    const temp = join(scratch, 'tmp');
    mkdirSync(repo);
    mkdirSync(temp);
    // Steer os.tmpdir() (TMPDIR on POSIX, TEMP/TMP on Windows) at a private
    // directory so the assertion sees only this call's temp files, never a
    // sibling worker's.
    const keys = ['TMPDIR', 'TEMP', 'TMP'] as const;
    const saved = keys.map((k) => [k, process.env[k]] as const);
    for (const k of keys) process.env[k] = temp;
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: first']);
      // `tag` (like `notes`) writes its message through a temp file;
      // `commitAll` passes its message inline and never touches one.
      const result = await new GitVcs(repo).tag('v1.0.0', 'release v1.0.0');
      expect(result.ok).toBe(true);
      expect(readdirSync(temp)).toEqual([]);
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) Reflect.deleteProperty(process.env, k);
        else process.env[k] = v;
      }
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
