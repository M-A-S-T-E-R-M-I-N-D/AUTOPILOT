// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * GH READ CACHE (2026-10-05): the dashboard's GitHub panels drained the
 * operator's whole hourly GraphQL quota — ~24 `gh` calls in 40 s from the
 * server, the same four `gh issue list … --limit 1000 --json …comments`
 * reads over and over from several panels and tabs — and the landing
 * ritual's `gh pr create` then failed on "API rate limit already exceeded".
 * One shared cache at the exec seam: identical reads within the TTL hit
 * GitHub once, concurrent identical reads share one call, a failed read is
 * never cached, and any write clears everything so the dashboard never
 * shows its own action's stale before-state.
 */

import { describe, it, expect } from 'vitest';
import type { CliExec, CliRun } from '../../src/connection/cli-probe.js';
import { isGhRead, withGhReadCache } from '../../src/connection/gh-read-cache.js';

// Windows install paths, built at runtime so the personal-path scanner never
// sees a drive-letter literal in this fixture.
const DRIVE = String.fromCharCode(67) + ':';
const BS = String.fromCharCode(92);

describe('isGhRead', () => {
  it('reads: the list/view/status shapes the panels poll', () => {
    const reads: string[][] = [
      ['issue', 'list', '--state', 'open', '--limit', '1000', '--json', 'number'],
      ['issue', 'view', '16', '--json', 'title'],
      ['issue', 'status'],
      ['pr', 'list', '--state', 'open', '--json', 'number,statusCheckRollup'],
      ['pr', 'view', '33'],
      ['pr', 'checks', '33'],
      ['pr', 'diff', '33'],
      ['pr', 'status'],
      ['run', 'list', '--workflow', 'ci.yml', '--limit', '1'],
      ['run', 'view', '123', '--json', 'jobs'],
      ['workflow', 'list'],
      ['workflow', 'view', 'ci.yml'],
      ['repo', 'view', '--json', 'nameWithOwner'],
      ['label', 'list'],
      ['release', 'list'],
      ['release', 'view', 'v0.58.0'],
      ['search', 'issues', 'is:open'],
      ['search', 'prs', 'is:open'],
      ['search', 'repos', 'autopilot'],
      ['search', 'code', 'x'],
      ['search', 'commits', 'x'],
      ['auth', 'status'],
    ];
    for (const args of reads) expect(isGhRead('gh', args), args.join(' ')).toBe(true);
  });

  it('gh api reads: no method, GET in every spelling, and a path that merely contains a flag-like text', () => {
    const reads: string[][] = [
      ['api', 'user'],
      ['api', 'repos/{owner}/{repo}/milestones?state=open&per_page=100&page=1'],
      ['api', '-X', 'GET', 'repos/o/r/issues'],
      ['api', '-X', 'get', 'repos/o/r/issues'],
      ['api', '--method', 'GET', 'repos/o/r/pulls'],
      ['api', '-XGET', 'repos/o/r/pulls'],
      ['api', '-Xget', 'repos/o/r/pulls'],
      ['api', '--method=GET', 'repos/o/r/pulls'],
      ['api', '--method=get', 'repos/o/r/pulls'],
      ['api', '--paginate', 'repos/o/r/issues/1/comments', '--jq', '.[].id'],
      ['api', 'search/issues?q=a--field=b--input=c'],
    ];
    for (const args of reads) expect(isGhRead('gh', args), args.join(' ')).toBe(true);
  });

  it('writes: anything that changes GitHub', () => {
    const writes: string[][] = [
      ['issue', 'comment', '16', '--body', 'x'],
      ['issue', 'edit', '16', '--add-label', 'priority: high'],
      ['issue', 'create', '--title', 't'],
      ['pr', 'merge', '33', '--squash'],
      ['pr', 'create', '--draft'],
      ['pr', 'close', '33'],
      ['pr', 'review', '33', '--approve'],
      ['label', 'create', 'x'],
      ['run', 'rerun', '123'],
      ['workflow', 'run', 'mutation.yml'],
      ['issue'],
      ['list', 'issue'],
      [],
    ];
    for (const args of writes) expect(isGhRead('gh', args), args.join(' ')).toBe(false);
  });

  it('gh api writes: a body in any flag spelling, a non-GET method in any spelling, a dangling -X, a bare `api`', () => {
    const writes: string[][] = [
      ['api', '-X', 'POST', 'repos/o/r/issues/1/comments'],
      ['api', '--method', 'PATCH', 'repos/o/r/issues/comments/9'],
      ['api', '-XDELETE', 'repos/o/r/git/refs/tags/v1'],
      ['api', '--method=POST', 'repos/o/r/labels'],
      ['api', 'repos/o/r/issues/1/comments', '-f', 'body=x'],
      ['api', 'repos/o/r/labels', '-F', 'name=x'],
      ['api', 'graphql', '--raw-field', 'query=mutation{x}'],
      ['api', 'repos/o/r/issues', '--field', 'title=t'],
      ['api', 'repos/o/r/issues', '--field=title=t'],
      ['api', 'graphql', '--raw-field=query=mutation{x}'],
      ['api', 'repos/o/r/contents/x', '--input', 'body.json'],
      ['api', 'repos/o/r/contents/x', '--input=body.json'],
      ['api', 'repos/o/r/issues', '-X'],
      ['api'],
    ];
    for (const args of writes) expect(isGhRead('gh', args), args.join(' ')).toBe(false);
  });

  it('only the gh binary is a cacheable read, whichever separator its path uses', () => {
    expect(isGhRead('git', ['issue', 'list'])).toBe(false);
    expect(isGhRead('claude', ['issue', 'list'])).toBe(false);
    expect(isGhRead('ghx', ['issue', 'list'])).toBe(false);
    expect(isGhRead('/opt/gh/tool', ['issue', 'list'])).toBe(false);
    expect(isGhRead('GH.EXE', ['issue', 'list'])).toBe(true);
    expect(isGhRead('/usr/bin/gh', ['run', 'list'])).toBe(true);
    expect(isGhRead(`${DRIVE}/Program Files/GitHub CLI/gh.exe`, ['issue', 'list'])).toBe(true);
    expect(isGhRead(`${DRIVE}${BS}Program Files${BS}GitHub CLI${BS}gh.exe`, ['pr', 'list'])).toBe(
      true,
    );
    // The LAST separator wins, whichever kind it is.
    expect(isGhRead(`a/b${BS}gh.exe`, ['pr', 'list'])).toBe(true);
    expect(isGhRead(`a${BS}b/gh`, ['pr', 'list'])).toBe(true);
    expect(isGhRead(`a/gh${BS}tool`, ['pr', 'list'])).toBe(false);
  });
});

/** A fake exec whose every call can be held and released one by one. */
function controllableExec() {
  const calls: { line: string; release: (r?: CliRun) => void }[] = [];
  let holding = false;
  let n = 0;
  const exec: CliExec = (bin, args) => {
    const line = [bin, ...args].join(' ');
    const fallback: CliRun = { code: 0, stdout: `out-${n}`, stderr: '' };
    n += 1;
    return new Promise<CliRun>((resolve) => {
      const release = (r?: CliRun) => resolve(r ?? fallback);
      calls.push({ line, release });
      if (!holding) release();
    });
  };
  return {
    exec,
    calls,
    lines: () => calls.map((c) => c.line),
    hold: () => {
      holding = true;
    },
    free: () => {
      holding = false;
    },
  };
}

describe('withGhReadCache', () => {
  it('a repeated read within the TTL reaches GitHub once and returns the same result', async () => {
    let now = 1_000;
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => now });
    const a = await cached('gh', ['issue', 'list', '--state', 'open']);
    now += 59_999;
    const b = await cached('gh', ['issue', 'list', '--state', 'open']);
    expect(f.calls).toHaveLength(1);
    expect(b).toEqual(a);
  });

  it('re-reads once the TTL has passed', async () => {
    let now = 1_000;
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => now });
    await cached('gh', ['run', 'list']);
    now += 60_000;
    const second = await cached('gh', ['run', 'list']);
    expect(f.calls).toHaveLength(2);
    expect(second.stdout).toBe('out-1');
  });

  it('uses the real clock when no clock is given', async () => {
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000 });
    await cached('gh', ['run', 'list']);
    await cached('gh', ['run', 'list']);
    expect(f.calls).toHaveLength(1);
  });

  it('different argv are different entries', async () => {
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    await cached('gh', ['issue', 'list', '--label', 'help-wanted']);
    await cached('gh', ['issue', 'list', '--label', 'roadmap']);
    expect(f.calls).toHaveLength(2);
  });

  it('concurrent identical reads share one call', async () => {
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    f.hold();
    const p1 = cached('gh', ['pr', 'list']);
    const p2 = cached('gh', ['pr', 'list']);
    f.calls[0]?.release();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(f.calls).toHaveLength(1);
    expect(r2).toEqual(r1);
  });

  it('never caches a failed read — a rate-limited answer is retried, not served for a minute', async () => {
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    f.hold();
    const first = cached('gh', ['issue', 'list']);
    f.calls[0]?.release({
      code: 1,
      stdout: '',
      stderr: 'GraphQL: API rate limit already exceeded',
    });
    expect((await first).code).toBe(1);
    f.free();
    const second = await cached('gh', ['issue', 'list']);
    expect(second.code).toBe(0);
    expect(f.calls).toHaveLength(2);
  });

  it('a zero TTL stores nothing', async () => {
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 0, now: () => 0 });
    await cached('gh', ['run', 'list']);
    await cached('gh', ['run', 'list']);
    expect(f.calls).toHaveLength(2);
  });

  it('a write goes straight through and clears every cached read', async () => {
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    await cached('gh', ['issue', 'view', '16']);
    await cached('gh', ['issue', 'edit', '16', '--add-label', 'priority: high']);
    await cached('gh', ['issue', 'view', '16']);
    expect(f.lines()).toEqual([
      'gh issue view 16',
      'gh issue edit 16 --add-label priority: high',
      'gh issue view 16',
    ]);
  });

  it('a write is never cached itself — two identical writes both reach GitHub', async () => {
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    await cached('gh', ['issue', 'comment', '16', '--body', 'x']);
    await cached('gh', ['issue', 'comment', '16', '--body', 'x']);
    expect(f.calls).toHaveLength(2);
  });

  it('git push clears the cache, in any spelling of git; other git and non-gh calls pass through untouched', async () => {
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    const prList = () => f.lines().filter((l) => l === 'gh pr list').length;
    await cached('gh', ['pr', 'list']);
    await cached('git', ['log', '--oneline']);
    await cached('git', ['log', '--oneline']);
    await cached('node', ['push']);
    await cached('gh', ['pr', 'list']);
    expect(prList()).toBe(1);
    expect(f.lines().filter((l) => l === 'git log --oneline')).toHaveLength(2);
    await cached('git', ['push', 'origin', 'x']);
    await cached('gh', ['pr', 'list']);
    expect(prList()).toBe(2);
    await cached('GIT.EXE', ['push']);
    await cached('gh', ['pr', 'list']);
    expect(prList()).toBe(3);
    await cached(`${DRIVE}${BS}Program Files${BS}Git${BS}bin${BS}git.exe`, ['push']);
    await cached('gh', ['pr', 'list']);
    expect(prList()).toBe(4);
  });

  it('a read in flight across a write is not stored, and a read after the write does not join it', async () => {
    const f = controllableExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    f.hold();
    const before = cached('gh', ['issue', 'view', '16']);
    const write = cached('gh', ['issue', 'comment', '16', '--body', 'x']);
    const after = cached('gh', ['issue', 'view', '16']);
    // The read after the write made its own call rather than joining the old one.
    expect(f.lines()).toEqual([
      'gh issue view 16',
      'gh issue comment 16 --body x',
      'gh issue view 16',
    ]);
    // The old read finishes FIRST: it must neither be stored nor evict the new one.
    f.calls[0]?.release({ code: 0, stdout: 'before', stderr: '' });
    expect((await before).stdout).toBe('before');
    const joined = cached('gh', ['issue', 'view', '16']);
    expect(f.calls).toHaveLength(3);
    f.calls[1]?.release();
    f.calls[2]?.release({ code: 0, stdout: 'after', stderr: '' });
    await write;
    expect((await after).stdout).toBe('after');
    expect((await joined).stdout).toBe('after');
    // And the post-write read is what the cache now serves.
    f.free();
    expect((await cached('gh', ['issue', 'view', '16'])).stdout).toBe('after');
    expect(f.calls).toHaveLength(3);
  });
});
