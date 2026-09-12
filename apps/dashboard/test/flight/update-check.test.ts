// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  latestVersionFromTags,
  isNewerVersion,
  createUpdateCheckApi,
  createUpdateExecuteApi,
} from '../../src/flight/update-check.js';
import type { CommandRunner, CommandResult } from '../../src/github/execute.js';

const OK: CommandResult = { exitCode: 0, stdout: '', stderr: '' };

describe('latestVersionFromTags', () => {
  it('picks the highest v-tag, tolerating peeled ^{} refs and non-version tags', () => {
    const out = [
      'abc\trefs/tags/m4',
      'abc\trefs/tags/v0.21.0',
      'abc\trefs/tags/v0.22.0',
      'abc\trefs/tags/v0.22.0^{}',
      'abc\trefs/tags/v0.9.0',
    ].join('\n');
    expect(latestVersionFromTags(out)).toBe('0.22.0');
  });

  it('ignores pre-release-suffixed tags — the banner never advertises an rc', () => {
    expect(latestVersionFromTags('abc\trefs/tags/v1.0.0-rc.1')).toBeUndefined();
  });

  it('returns undefined when no v-tag exists', () => {
    expect(latestVersionFromTags('abc\trefs/heads/main')).toBeUndefined();
  });
});

describe('isNewerVersion', () => {
  it('compares numerically, not lexically (0.9.0 < 0.22.0)', () => {
    expect(isNewerVersion('0.22.0', '0.9.0')).toBe(true);
    expect(isNewerVersion('0.9.0', '0.22.0')).toBe(false);
    expect(isNewerVersion('0.22.0', '0.22.0')).toBe(false);
  });

  it('treats unparseable input as not-newer — no banner off garbage', () => {
    expect(isNewerVersion('main', '0.22.0')).toBe(false);
  });
});

describe('createUpdateCheckApi', () => {
  it('reports an available update and caches until forced', async () => {
    const exec: CommandRunner = vi.fn(async () => ({
      ...OK,
      stdout: 'abc\trefs/tags/v0.23.0',
    }));
    const now = vi.fn(() => 1000);
    const api = createUpdateCheckApi('/repo', '0.22.0', exec, 60000, now);

    const first = await api();
    expect(first).toMatchObject({ current: '0.22.0', latest: '0.23.0', updateAvailable: true });
    await api();
    expect(exec).toHaveBeenCalledTimes(1);
    await api(true);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('degrades to no-update on a failing git — never cries wolf offline', async () => {
    const exec: CommandRunner = vi.fn(async () => ({ exitCode: 1, stdout: '', stderr: 'offline' }));
    const result = await createUpdateCheckApi('/repo', '0.22.0', exec)();
    expect(result.updateAvailable).toBe(false);
    expect(result.latest).toBeUndefined();
  });
});

function runnerScript(responses: Record<string, CommandResult>, calls: string[]): CommandRunner {
  return async (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push(key);
    for (const prefix of Object.keys(responses)) {
      if (key.startsWith(prefix)) return responses[prefix]!;
    }
    return OK;
  };
}

describe('createUpdateExecuteApi — the never-clobber guarantees', () => {
  it('refuses while a flight is live, touching nothing', async () => {
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => true, restart: vi.fn() },
      runnerScript({}, calls),
    );
    const result = await api();
    expect(result).toMatchObject({ ok: false, reason: 'flight-live' });
    expect(calls).toEqual([]);
  });

  it('refuses on a dirty tree by default — local progress is sacred', async () => {
    const calls: string[] = [];
    const restart = vi.fn();
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart },
      runnerScript({ 'git status': { ...OK, stdout: ' M a.ts\n?? b.ts\n' } }, calls),
    );
    const result = await api();
    expect(result).toMatchObject({ ok: false, reason: 'dirty' });
    expect(result.details).toContain('2 file(s)');
    expect(restart).not.toHaveBeenCalled();
    expect(calls.some((c) => c.startsWith('git pull'))).toBe(false);
  });

  it('stashes on explicit opt-in, updates, restarts, and says how to restore', async () => {
    const calls: string[] = [];
    const restart = vi.fn();
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart },
      runnerScript(
        {
          'git status': { ...OK, stdout: ' M a.ts\n' },
          'git pull': { ...OK, stdout: 'Updating abc..def\n' },
        },
        calls,
      ),
    );
    const result = await api('stash');
    expect(result).toMatchObject({ ok: true, reason: 'updated', stashed: true, restarting: true });
    expect(result.details).toContain('git stash pop');
    expect(calls.some((c) => c.startsWith('git stash push -u'))).toBe(true);
    expect(calls.some((c) => c.startsWith('pnpm install --frozen-lockfile'))).toBe(true);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('pops the stash back when ff-only pull refuses — the tree returns byte-for-byte', async () => {
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart: vi.fn() },
      runnerScript(
        {
          'git status': { ...OK, stdout: ' M a.ts\n' },
          'git pull': { exitCode: 1, stdout: '', stderr: 'fatal: Not possible to fast-forward' },
        },
        calls,
      ),
    );
    const result = await api('stash');
    expect(result).toMatchObject({ ok: false, reason: 'diverged' });
    expect(calls.some((c) => c.startsWith('git stash pop'))).toBe(true);
  });

  it('reports up-to-date without installing or restarting', async () => {
    const calls: string[] = [];
    const restart = vi.fn();
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart },
      runnerScript({ 'git pull': { ...OK, stdout: 'Already up to date.\n' } }, calls),
    );
    const result = await api();
    expect(result).toMatchObject({ ok: true, reason: 'up-to-date' });
    expect(restart).not.toHaveBeenCalled();
    expect(calls.some((c) => c.startsWith('pnpm install'))).toBe(false);
  });

  it('rolls the pull back when the install fails — a half-updated checkout is the loop', async () => {
    // Without this, `git pull` has already moved the checkout by the time the
    // install fails: sources are the NEW version, node_modules the old one, and
    // the still-running process older still. The banner compares the RUNNING
    // version against the newest tag, so it re-fires on every refresh and the
    // operator is stuck in an update loop that can never succeed.
    const calls: string[] = [];
    const restart = vi.fn();
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart },
      runnerScript(
        {
          'git rev-parse HEAD': { ...OK, stdout: 'abc1234\n' },
          'git pull': { ...OK, stdout: 'Updating abc..def\n' },
          'pnpm install': { exitCode: 1, stdout: '', stderr: 'ERR_PNPM_OUTDATED_LOCKFILE' },
        },
        calls,
      ),
    );

    const result = await api();

    expect(result).toMatchObject({ ok: false, reason: 'install-failed' });
    expect(calls).toContain('git reset --hard abc1234');
    expect(result.details).toContain('ERR_PNPM_OUTDATED_LOCKFILE');
    expect(result.details).toContain('rolled back');
    expect(restart).not.toHaveBeenCalled();
  });

  it('restores the stash too when it rolls an install failure back', async () => {
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart: vi.fn() },
      runnerScript(
        {
          'git rev-parse HEAD': { ...OK, stdout: 'abc1234\n' },
          'git status': { ...OK, stdout: ' M a.ts\n' },
          'git pull': { ...OK, stdout: 'Updating abc..def\n' },
          'pnpm install': { exitCode: 1, stdout: '', stderr: 'ERR_PNPM' },
        },
        calls,
      ),
    );

    const result = await api('stash');

    expect(result).toMatchObject({ ok: false, reason: 'install-failed' });
    expect(calls).toContain('git reset --hard abc1234');
    expect(calls.filter((c) => c.startsWith('git stash pop'))).toHaveLength(1);
    expect(result.details).toContain('restored');
  });

  it('says the checkout is on the new version when the rollback ITSELF fails', async () => {
    // Rolling back is best-effort. If it cannot be done, the operator has to be
    // told the truth — plus the sha to get back — rather than a message that
    // implies nothing moved.
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart: vi.fn() },
      runnerScript(
        {
          'git rev-parse HEAD': { ...OK, stdout: 'abc1234\n' },
          'git pull': { ...OK, stdout: 'Updating abc..def\n' },
          'pnpm install': { exitCode: 1, stdout: '', stderr: 'ERR_PNPM' },
          'git reset --hard': { exitCode: 1, stdout: '', stderr: 'reset refused' },
        },
        calls,
      ),
    );

    const result = await api();

    expect(result.details).toContain('abc1234');
    expect(result.details).not.toContain('rolled back');
  });

  it('compiles the pulled source before restarting — a bare restart comes back on the OLD build', async () => {
    // `dist/` is gitignored, so the pull only ever delivers TypeScript, and the
    // restart leg compiles nothing (`control.restart()` is stop + start, and
    // `start()` spawns `serverEntry` directly). Without a build in between, the
    // server comes back up on the previous build — and since PRODUCT_VERSION is
    // a compile-time constant, it keeps reporting the old version, the banner
    // re-arms on every refresh, and the operator is in a loop that no number of
    // presses can leave.
    const calls: string[] = [];
    const restart = vi.fn(() => {
      calls.push('restart');
    });
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart },
      runnerScript({ 'git pull': { ...OK, stdout: 'Updating abc..def\n' } }, calls),
    );

    const result = await api();

    expect(result).toMatchObject({ ok: true, reason: 'updated', restarting: true });
    const install = calls.findIndex((c) => c.startsWith('pnpm install'));
    const build = calls.findIndex((c) => c.startsWith('pnpm run build'));
    expect(build).toBeGreaterThan(install);
    expect(calls.indexOf('restart')).toBeGreaterThan(build);
  });

  it('rolls the pull back when the BUILD fails — never restart onto code that will not compile', async () => {
    const calls: string[] = [];
    const restart = vi.fn();
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart },
      runnerScript(
        {
          'git rev-parse HEAD': { ...OK, stdout: 'abc1234\n' },
          'git pull': { ...OK, stdout: 'Updating abc..def\n' },
          'pnpm run build': {
            exitCode: 2,
            stdout: '',
            stderr: "error TS2307: Cannot find module './gone.js'",
          },
        },
        calls,
      ),
    );

    const result = await api();

    expect(result).toMatchObject({ ok: false, reason: 'build-failed' });
    expect(calls).toContain('git reset --hard abc1234');
    expect(result.details).toContain('error TS2307');
    expect(result.details).toContain('rolled back');
    // The running process holds its modules in memory, so it survives — but a
    // half-written dist/ would greet the NEXT restart, so the advice has to
    // name a build rather than imply the checkout is simply fine.
    expect(result.details).toContain('pnpm run build');
    expect(restart).not.toHaveBeenCalled();
  });

  it('restores the stash too when it rolls a build failure back', async () => {
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart: vi.fn() },
      runnerScript(
        {
          'git rev-parse HEAD': { ...OK, stdout: 'abc1234\n' },
          'git status': { ...OK, stdout: ' M a.ts\n' },
          'git pull': { ...OK, stdout: 'Updating abc..def\n' },
          'pnpm run build': { exitCode: 2, stdout: '', stderr: 'error TS1005' },
        },
        calls,
      ),
    );

    const result = await api('stash');

    expect(result).toMatchObject({ ok: false, reason: 'build-failed' });
    expect(calls).toContain('git reset --hard abc1234');
    expect(calls.filter((c) => c.startsWith('git stash pop'))).toHaveLength(1);
    expect(result.details).toContain('restored');
  });

  it('names the uncompilable checkout when a build failure cannot be rolled back', async () => {
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart: vi.fn() },
      runnerScript(
        {
          'git rev-parse HEAD': { ...OK, stdout: 'abc1234\n' },
          'git pull': { ...OK, stdout: 'Updating abc..def\n' },
          'pnpm run build': { exitCode: 2, stdout: '', stderr: 'error TS1005' },
          'git reset --hard': { exitCode: 1, stdout: '', stderr: 'reset refused' },
        },
        calls,
      ),
    );

    const result = await api();

    expect(result.details).toContain('abc1234');
    expect(result.details).toContain('does not compile');
    expect(result.details).not.toContain('rolled back');
  });

  it('never reaches the build when the pull was already up to date', async () => {
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart: vi.fn() },
      runnerScript({ 'git pull': { ...OK, stdout: 'Already up to date.\n' } }, calls),
    );

    await api();

    expect(calls.some((c) => c.startsWith('pnpm run build'))).toBe(false);
  });
});

describe('createUpdateExecuteApi — the pull names its ref (#48)', () => {
  const deps = { isFlightLive: () => false, restart: vi.fn() };
  const pulled = (calls: string[]): string | undefined =>
    calls.find((c) => c.startsWith('git pull'));

  it('on a branch tracking origin, pulls that branch by name — the self checkout keeps its own line', async () => {
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      deps,
      runnerScript(
        {
          'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}': {
            ...OK,
            stdout: 'origin/autopilot/flight\n',
          },
          'git pull': { ...OK, stdout: 'Already up to date.\n' },
        },
        calls,
      ),
    );
    await api();
    expect(pulled(calls)).toBe('git pull --ff-only origin autopilot/flight');
  });

  it('on a contribution branch tracking a fork, pulls origin main — never a remote with no branch to resolve', async () => {
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      deps,
      runnerScript(
        {
          'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}': {
            ...OK,
            stdout: 'fork/feat-x\n',
          },
          'git pull': { ...OK, stdout: 'Already up to date.\n' },
        },
        calls,
      ),
    );
    await api();
    expect(pulled(calls)).toBe('git pull --ff-only origin main');
  });

  it('with no upstream at all, pulls origin main', async () => {
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      deps,
      runnerScript(
        {
          'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}': {
            exitCode: 128,
            stdout: '',
            stderr: 'fatal: no upstream configured',
          },
          'git pull': { ...OK, stdout: 'Already up to date.\n' },
        },
        calls,
      ),
    );
    await api();
    expect(pulled(calls)).toBe('git pull --ff-only origin main');
  });
});
