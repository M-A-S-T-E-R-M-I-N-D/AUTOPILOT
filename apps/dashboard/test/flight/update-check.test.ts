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

  it('surfaces an install failure while keeping the stash intact', async () => {
    const calls: string[] = [];
    const api = createUpdateExecuteApi(
      '/repo',
      { isFlightLive: () => false, restart: vi.fn() },
      runnerScript(
        {
          'git status': { ...OK, stdout: ' M a.ts\n' },
          'git pull': { ...OK, stdout: 'Updating abc..def\n' },
          'pnpm install': { exitCode: 1, stdout: '', stderr: 'ERR_PNPM' },
        },
        calls,
      ),
    );
    const result = await api('stash');
    expect(result).toMatchObject({ ok: false, reason: 'install-failed' });
    expect(result.details).toContain('git stash pop');
  });
});
