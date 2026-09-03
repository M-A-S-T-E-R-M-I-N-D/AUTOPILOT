// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { getGhStatus, parseGhAuthStatus } from '../../src/connection/gh-probe.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

describe('parseGhAuthStatus', () => {
  it('reports authenticated with the parsed login on a clean exit', () => {
    const result = parseGhAuthStatus(
      0,
      'github.com\n  ✓ Logged in to github.com account octocat (keyring)\n  - Active account: true',
    );

    expect(result).toEqual({ authenticated: true, login: 'octocat' });
  });

  it('reports authenticated with a null login when the account cannot be parsed', () => {
    const result = parseGhAuthStatus(0, 'github.com\n  ✓ Logged in to github.com');

    expect(result).toEqual({ authenticated: true, login: null });
  });

  it('reports not authenticated on a non-zero exit code', () => {
    const result = parseGhAuthStatus(1, 'You are not logged into any GitHub hosts.');

    expect(result).toEqual({ authenticated: false, login: null });
  });
});

describe('getGhStatus', () => {
  it('reports present + version + authenticated identity on a clean run', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'gh version 2.86.0 (2026-01-21)' })
      .mockResolvedValueOnce({
        code: 0,
        stdout: '  ✓ Logged in to github.com account octocat (keyring)',
      });

    const result = await getGhStatus(exec);

    expect(result).toEqual({
      present: true,
      version: '2.86.0',
      authenticated: true,
      login: 'octocat',
    });
    expect(exec).toHaveBeenNthCalledWith(1, 'gh', ['--version']);
    expect(exec).toHaveBeenNthCalledWith(2, 'gh', ['auth', 'status']);
  });

  it('reports absent without probing auth when gh --version fails', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    const result = await getGhStatus(exec);

    expect(result).toEqual({ present: false, version: null, authenticated: false, login: null });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('reports absent when exec rejects on the presence probe', async () => {
    const exec: CliExec = vi.fn().mockRejectedValue(new Error('spawn ENOENT'));

    const result = await getGhStatus(exec);

    expect(result).toEqual({ present: false, version: null, authenticated: false, login: null });
  });

  it('reports present-but-not-authenticated when the auth probe rejects', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'gh version 2.86.0 (2026-01-21)' })
      .mockRejectedValueOnce(new Error('spawn ENOENT'));

    const result = await getGhStatus(exec);

    expect(result).toEqual({
      present: true,
      version: '2.86.0',
      authenticated: false,
      login: null,
    });
  });

  it('reports present-but-not-authenticated when gh auth status exits non-zero', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'gh version 2.86.0 (2026-01-21)' })
      .mockResolvedValueOnce({ code: 1, stdout: 'You are not logged into any GitHub hosts.' });

    const result = await getGhStatus(exec);

    expect(result).toEqual({
      present: true,
      version: '2.86.0',
      authenticated: false,
      login: null,
    });
  });
});
