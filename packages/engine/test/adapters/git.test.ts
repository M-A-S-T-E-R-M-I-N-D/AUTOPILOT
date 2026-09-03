// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitVcs, GitHeadReader } from '../../src/adapters/git.js';

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
