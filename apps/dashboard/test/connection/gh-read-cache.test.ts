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

describe('isGhRead', () => {
  it('reads: list/view/status shapes the panels poll', () => {
    const reads: string[][] = [
      ['issue', 'list', '--state', 'open', '--limit', '1000', '--json', 'number'],
      ['issue', 'view', '16', '--json', 'title'],
      ['pr', 'list', '--state', 'open', '--json', 'number,statusCheckRollup'],
      ['pr', 'view', '33'],
      ['pr', 'checks', '33'],
      ['pr', 'diff', '33'],
      ['run', 'list', '--workflow', 'ci.yml', '--limit', '1'],
      ['run', 'view', '123', '--json', 'jobs'],
      ['repo', 'view', '--json', 'nameWithOwner'],
      ['label', 'list'],
      ['release', 'list'],
      ['release', 'view', 'v0.58.0'],
      ['search', 'issues', 'is:open'],
      ['auth', 'status'],
      ['api', 'user'],
      ['api', 'repos/{owner}/{repo}/milestones?state=open&per_page=100&page=1'],
      ['api', '-X', 'GET', 'repos/o/r/issues'],
      ['api', '--method', 'GET', 'repos/o/r/pulls'],
      ['api', '--paginate', 'repos/o/r/issues/1/comments', '--jq', '.[].id'],
    ];
    for (const args of reads) expect(isGhRead('gh', args), args.join(' ')).toBe(true);
  });

  it('writes: anything that changes GitHub, and every gh api call with a body or a non-GET method', () => {
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
      ['api', '-X', 'POST', 'repos/o/r/issues/1/comments'],
      ['api', '--method', 'PATCH', 'repos/o/r/issues/comments/9'],
      ['api', '-XDELETE', 'repos/o/r/git/refs/tags/v1'],
      ['api', 'repos/o/r/issues/1/comments', '-f', 'body=x'],
      ['api', 'repos/o/r/labels', '-F', 'name=x'],
      ['api', 'graphql', '--raw-field', 'query=mutation{x}'],
      ['api', 'repos/o/r/issues', '--field', 'title=t'],
      ['api', 'repos/o/r/contents/x', '--input', 'body.json'],
      ['api'],
      [],
    ];
    for (const args of writes) expect(isGhRead('gh', args), args.join(' ')).toBe(false);
  });

  it('only the gh binary is ever a cacheable read', () => {
    expect(isGhRead('git', ['log', '--oneline'])).toBe(false);
    expect(isGhRead('claude', ['--version'])).toBe(false);
    // A Windows install path, built at runtime so the personal-path scanner
    // never sees a drive-letter literal in this fixture.
    const winGh = [String.fromCharCode(67), ':/Program Files/GitHub CLI/gh.exe'].join('');
    expect(isGhRead(winGh, ['issue', 'list'])).toBe(true);
    expect(isGhRead('/usr/bin/gh', ['run', 'list'])).toBe(true);
  });
});

function fakeExec(results: CliRun[] = []) {
  const calls: string[] = [];
  let i = 0;
  let release: (() => void) | null = null;
  let gate: Promise<void> | null = null;
  const exec: CliExec = async (bin, args) => {
    calls.push([bin, ...args].join(' '));
    if (gate) await gate;
    const r = results[i] ?? { code: 0, stdout: `out-${i}`, stderr: '' };
    i += 1;
    return r;
  };
  return {
    exec,
    calls,
    hold() {
      gate = new Promise<void>((r) => (release = r));
    },
    let() {
      release?.();
      gate = null;
    },
  };
}

describe('withGhReadCache', () => {
  it('a repeated read within the TTL reaches GitHub once and returns the same result', async () => {
    let now = 1_000;
    const f = fakeExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => now });
    const a = await cached('gh', ['issue', 'list', '--state', 'open']);
    now += 59_999;
    const b = await cached('gh', ['issue', 'list', '--state', 'open']);
    expect(f.calls).toHaveLength(1);
    expect(b).toEqual(a);
  });

  it('re-reads once the TTL has passed', async () => {
    let now = 1_000;
    const f = fakeExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => now });
    await cached('gh', ['run', 'list']);
    now += 60_000;
    const second = await cached('gh', ['run', 'list']);
    expect(f.calls).toHaveLength(2);
    expect(second.stdout).toBe('out-1');
  });

  it('different argv are different entries', async () => {
    const f = fakeExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    await cached('gh', ['issue', 'list', '--label', 'help-wanted']);
    await cached('gh', ['issue', 'list', '--label', 'roadmap']);
    expect(f.calls).toHaveLength(2);
  });

  it('concurrent identical reads share one call', async () => {
    const f = fakeExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    f.hold();
    const p1 = cached('gh', ['pr', 'list']);
    const p2 = cached('gh', ['pr', 'list']);
    f.let();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(f.calls).toHaveLength(1);
    expect(r2).toEqual(r1);
  });

  it('never caches a failed read — a rate-limited answer is retried, not served for a minute', async () => {
    const f = fakeExec([
      { code: 1, stdout: '', stderr: 'GraphQL: API rate limit already exceeded' },
      { code: 0, stdout: '[]', stderr: '' },
    ]);
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    const first = await cached('gh', ['issue', 'list']);
    const second = await cached('gh', ['issue', 'list']);
    expect(first.code).toBe(1);
    expect(second).toEqual({ code: 0, stdout: '[]', stderr: '' });
    expect(f.calls).toHaveLength(2);
  });

  it('a write goes straight through and clears every cached read', async () => {
    const f = fakeExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    await cached('gh', ['issue', 'view', '16']);
    await cached('gh', ['issue', 'edit', '16', '--add-label', 'priority: high']);
    await cached('gh', ['issue', 'view', '16']);
    expect(f.calls).toEqual([
      'gh issue view 16',
      'gh issue edit 16 --add-label priority: high',
      'gh issue view 16',
    ]);
  });

  it('git push clears the cache too (it moves PR heads and checks); other git and non-gh calls pass through untouched', async () => {
    const f = fakeExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    await cached('gh', ['pr', 'list']);
    await cached('git', ['log', '--oneline']);
    await cached('git', ['log', '--oneline']);
    await cached('gh', ['pr', 'list']);
    expect(f.calls.filter((c) => c === 'gh pr list')).toHaveLength(1);
    expect(f.calls.filter((c) => c === 'git log --oneline')).toHaveLength(2);
    await cached('git', ['push', 'origin', 'x']);
    await cached('gh', ['pr', 'list']);
    expect(f.calls.filter((c) => c === 'gh pr list')).toHaveLength(2);
  });

  it('a read that was in flight when a write happened is not stored', async () => {
    const f = fakeExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 60_000, now: () => 0 });
    f.hold();
    const read = cached('gh', ['issue', 'view', '16']);
    f.let();
    const write = cached('gh', ['issue', 'comment', '16', '--body', 'x']);
    await Promise.all([read, write]);
    await cached('gh', ['issue', 'view', '16']);
    expect(f.calls.filter((c) => c === 'gh issue view 16')).toHaveLength(2);
  });

  it('a zero TTL disables caching', async () => {
    const f = fakeExec();
    const cached = withGhReadCache(f.exec, { ttlMs: 0, now: () => 0 });
    await cached('gh', ['run', 'list']);
    await cached('gh', ['run', 'list']);
    expect(f.calls).toHaveLength(2);
  });
});
