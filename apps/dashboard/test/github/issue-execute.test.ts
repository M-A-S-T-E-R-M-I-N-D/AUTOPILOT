// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { createGithubIssueExecuteApi } from '../../src/github/issue-execute.js';
import type { CommandResult } from '../../src/github/execute.js';
import { UPSTREAM_REPO } from '../../src/info.js';

describe('createGithubIssueExecuteApi', () => {
  it('runs "gh issue create --repo <upstream> --title --body" and reports the created issue URL', async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const api = createGithubIssueExecuteApi(async (command, args) => {
      calls.push({ command, args });
      const ok: CommandResult = {
        exitCode: 0,
        stdout: 'https://github.com/mastermind/autopilot/issues/42\n',
        stderr: '',
      };
      return ok;
    }, 'mastermind/autopilot');

    const result = await api('flights crash on empty SOUL', 'steps to repro...');

    expect(calls).toEqual([
      {
        command: 'gh',
        args: [
          'issue',
          'create',
          '--repo',
          'mastermind/autopilot',
          '--title',
          'flights crash on empty SOUL',
          '--body',
          'steps to repro...',
        ],
      },
    ]);
    expect(result).toEqual({
      ok: true,
      details: 'opening an issue against mastermind/autopilot: "flights crash on empty SOUL"',
      url: 'https://github.com/mastermind/autopilot/issues/42',
    });
  });

  it('omits url when gh prints nothing to stdout on success', async () => {
    const api = createGithubIssueExecuteApi(async () => {
      const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
      return ok;
    }, 'mastermind/autopilot');

    const result = await api('a title', 'a body');
    expect(result.ok).toBe(true);
    expect(result.url).toBeUndefined();
  });

  it("reports failure with the command's stderr when gh exits non-zero", async () => {
    const api = createGithubIssueExecuteApi(async () => {
      const fail: CommandResult = { exitCode: 1, stdout: '', stderr: 'gh: not authenticated' };
      return fail;
    }, 'mastermind/autopilot');

    const result = await api('a title', 'a body');
    expect(result).toEqual({ ok: false, details: 'gh: not authenticated' });
  });

  it('defaults to the canonical UPSTREAM_REPO when none is given', async () => {
    const calls: Array<{ args: readonly string[] }> = [];
    const api = createGithubIssueExecuteApi(async (_command, args) => {
      calls.push({ args });
      const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
      return ok;
    });

    await api('a title', 'a body');
    expect(calls[0]?.args).toContain(UPSTREAM_REPO);
  });
});
