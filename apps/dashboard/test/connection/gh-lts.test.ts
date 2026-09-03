// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { fetchLatestRelease, createLtsStatusApi } from '../../src/connection/gh-lts.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

describe('fetchLatestRelease', () => {
  it('returns the trimmed tag on a clean exit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'v0.13.0\n' });

    const result = await fetchLatestRelease(exec, 'mastermind/autopilot');

    expect(result).toEqual({ tag: 'v0.13.0' });
    expect(exec).toHaveBeenCalledWith('gh', [
      'api',
      'repos/mastermind/autopilot/releases/latest',
      '--jq',
      '.tag_name',
    ]);
  });

  it('returns tag: null on a non-zero exit (no releases yet, unauthenticated, etc.)', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    const result = await fetchLatestRelease(exec, 'mastermind/autopilot');

    expect(result).toEqual({ tag: null });
  });

  it('returns tag: null on empty stdout despite a clean exit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '   \n' });

    const result = await fetchLatestRelease(exec, 'mastermind/autopilot');

    expect(result).toEqual({ tag: null });
  });

  it('returns tag: null when exec rejects rather than throwing', async () => {
    const exec: CliExec = vi.fn().mockRejectedValue(new Error('spawn ENOENT'));

    const result = await fetchLatestRelease(exec, 'mastermind/autopilot');

    expect(result).toEqual({ tag: null });
  });
});

describe('createLtsStatusApi', () => {
  it('starts with an unchecked cache reporting only the running version', () => {
    const exec: CliExec = vi.fn();
    const api = createLtsStatusApi(exec, 'mastermind/autopilot', '0.13.0');

    expect(api.getCached()).toEqual({
      checkedAt: null,
      latestTag: null,
      runningVersion: '0.13.0',
      chip: { status: 'unknown', text: 'you run v0.13.0' },
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it('check() calls gh, updates, and returns the cache with a timestamp', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'v0.14.0' });
    const now = vi.fn().mockReturnValue('2026-08-23T00:00:00.000Z');
    const api = createLtsStatusApi(exec, 'mastermind/autopilot', '0.13.0', now);

    const result = await api.check();

    expect(result).toEqual({
      checkedAt: '2026-08-23T00:00:00.000Z',
      latestTag: 'v0.14.0',
      runningVersion: '0.13.0',
      chip: { status: 'update-available', text: 'v0.14.0 available — you run v0.13.0' },
    });
    expect(api.getCached()).toEqual(result);
  });

  it('getCached() never calls gh, even after a prior check()', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'v0.13.0' });
    const api = createLtsStatusApi(exec, 'mastermind/autopilot', '0.13.0');

    await api.check();
    expect(exec).toHaveBeenCalledTimes(1);

    api.getCached();
    api.getCached();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('a failed re-check overwrites a previously successful cache with the unknown state', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'v0.13.0' })
      .mockResolvedValueOnce({ code: 1, stdout: '' });
    const api = createLtsStatusApi(exec, 'mastermind/autopilot', '0.13.0');

    await api.check();
    const second = await api.check();

    expect(second.chip).toEqual({ status: 'unknown', text: 'you run v0.13.0' });
    expect(second.latestTag).toBeNull();
  });
});
