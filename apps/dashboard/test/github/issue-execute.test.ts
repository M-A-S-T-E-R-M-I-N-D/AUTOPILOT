// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { createGithubIssueExecuteApi } from '../../src/github/issue-execute.js';
import type { CommandResult } from '../../src/github/execute.js';
import type { CliRun } from '../../src/connection/cli-probe.js';
import { UPSTREAM_REPO } from '../../src/info.js';

const V = '1.2.3';
const REPO_LINK = '[AUTOPILOT](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)';

const authedExec = async (bin: string, args: readonly string[]): Promise<CliRun> => {
  if (bin === 'gh' && args[0] === '--version') return { code: 0, stdout: 'gh version 2.60.0' };
  if (bin === 'gh' && args[0] === 'auth') {
    return { code: 0, stdout: 'Logged in to github.com account octocat' };
  }
  return { code: 1, stdout: '' };
};

describe('createGithubIssueExecuteApi', () => {
  it('runs "gh issue create --repo <upstream> --title --body" and reports the created issue URL', async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const api = createGithubIssueExecuteApi(
      async (command, args) => {
        calls.push({ command, args });
        const ok: CommandResult = {
          exitCode: 0,
          stdout: 'https://github.com/mastermind/autopilot/issues/42\n',
          stderr: '',
        };
        return ok;
      },
      'mastermind/autopilot',
      authedExec,
      V,
    );

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
          `steps to repro...\n\n🛩️ Flown by ${REPO_LINK} v${V}, on behalf of @octocat\n\nAutopilot-Agent: true`,
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
    const api = createGithubIssueExecuteApi(
      async () => {
        const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
        return ok;
      },
      'mastermind/autopilot',
      authedExec,
    );

    const result = await api('a title', 'a body');
    expect(result.ok).toBe(true);
    expect(result.url).toBeUndefined();
  });

  it("reports failure with the command's stderr when gh exits non-zero", async () => {
    const api = createGithubIssueExecuteApi(
      async () => {
        const fail: CommandResult = { exitCode: 1, stdout: '', stderr: 'gh: not authenticated' };
        return fail;
      },
      'mastermind/autopilot',
      authedExec,
    );

    const result = await api('a title', 'a body');
    expect(result).toEqual({ ok: false, details: 'gh: not authenticated' });
  });

  it('defaults to the canonical UPSTREAM_REPO when none is given', async () => {
    const calls: Array<{ args: readonly string[] }> = [];
    const api = createGithubIssueExecuteApi(
      async (_command, args) => {
        calls.push({ args });
        const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
        return ok;
      },
      undefined,
      authedExec,
    );

    await api('a title', 'a body');
    expect(calls[0]?.args).toContain(UPSTREAM_REPO);
  });

  it('refuses without running any command when gh is not authenticated', async () => {
    const api = createGithubIssueExecuteApi(
      async () => {
        throw new Error('runCommand must not be called when gh is unauthenticated');
      },
      'mastermind/autopilot',
      async () => ({ code: 1, stdout: '' }),
    );

    const result = await api('a title', 'a body');
    expect(result).toEqual({
      ok: false,
      details: 'gh is not authenticated — run `gh auth login` before reporting to upstream.',
    });
  });
});
