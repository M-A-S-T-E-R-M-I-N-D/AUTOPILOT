// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import { createGithubPrExecuteApi } from '../../src/github/pr-execute.js';
import type { CommandResult } from '../../src/github/execute.js';
import type { CliRun } from '../../src/connection/cli-probe.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(repo: string): void {
  gitSync(repo, ['init', '-q', '-b', 'my-fix']);
  gitSync(repo, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(repo, ['config', 'user.name', 'Test']);
  gitSync(repo, ['config', 'commit.gpgsign', 'false']);
  gitSync(repo, ['commit', '--allow-empty', '-q', '-m', 'seed']);
}

function project(s: Store, id: string, slug: string, rootPath: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, slug, id, rootPath, 100, 100);
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

const authedExec = async (bin: string, args: readonly string[]): Promise<CliRun> => {
  if (bin === 'gh' && args[0] === '--version') return { code: 0, stdout: 'gh version 2.60.0' };
  if (bin === 'gh' && args[0] === 'auth') {
    return { code: 0, stdout: 'Logged in to github.com account octocat' };
  }
  return { code: 1, stdout: '' };
};

describe('createGithubPrExecuteApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-unknown-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      const api = createGithubPrExecuteApi(
        dbPath,
        async () => {
          throw new Error('runCommand must not be called for an unknown project');
        },
        authedExec,
      );
      expect(await api('nope', 'a fix', 'body')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('forks, pushes the current branch, and opens a PR (200) on success', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-ok-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-db-'));
    try {
      initRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
      const result = await createGithubPrExecuteApi(
        dbPath,
        async (command, args, cwd) => {
          calls.push({ command, args, cwd });
          const isPrCreate = command === 'gh' && args[0] === 'pr';
          const ok: CommandResult = {
            exitCode: 0,
            stdout: isPrCreate ? 'https://github.com/mastermind/autopilot/pull/7\n' : '',
            stderr: '',
          };
          return ok;
        },
        authedExec,
        'mastermind/autopilot',
      )('p1', 'a landed fix', 'fixes the thing');

      expect(calls).toEqual([
        {
          command: 'gh',
          args: [
            'repo',
            'fork',
            'mastermind/autopilot',
            '--remote',
            '--remote-name',
            'autopilot-fork',
          ],
          cwd: repo,
        },
        { command: 'git', args: ['push', 'autopilot-fork', 'my-fix'], cwd: repo },
        {
          command: 'gh',
          args: [
            'pr',
            'create',
            '--repo',
            'mastermind/autopilot',
            '--head',
            'octocat:my-fix',
            '--title',
            'a landed fix',
            '--body',
            'fixes the thing',
          ],
          cwd: repo,
        },
      ]);
      expect(result).toEqual({
        ok: true,
        details:
          'forking mastermind/autopilot, pushing "my-fix", and opening a PR against mastermind/autopilot: "a landed fix"',
        url: 'https://github.com/mastermind/autopilot/pull/7',
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('refuses without running any command when gh is not authenticated', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-unauth-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-db-'));
    try {
      initRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const result = await createGithubPrExecuteApi(
        dbPath,
        async () => {
          throw new Error('runCommand must not be called when gh is unauthenticated');
        },
        async () => ({ code: 1, stdout: '' }),
      )('p1', 'a fix', 'body');

      expect(result).toEqual({
        ok: false,
        details: 'gh is not authenticated — run `gh auth login` before contributing upstream.',
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('stops at the first failed step and never attempts the next one', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-forkfail-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-db-'));
    try {
      initRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const calls: Array<{ command: string }> = [];
      const result = await createGithubPrExecuteApi(
        dbPath,
        async (command) => {
          calls.push({ command });
          const fail: CommandResult = { exitCode: 1, stdout: '', stderr: 'gh: fork failed' };
          return fail;
        },
        authedExec,
      )('p1', 'a fix', 'body');

      expect(calls).toHaveLength(1);
      expect(result).toEqual({ ok: false, details: 'gh: fork failed' });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('threads issueNumber through to the pr-create body as a Closes trailer (epic 0007 "PLATFORM 6/7")', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-issue-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-db-'));
    try {
      initRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const calls: Array<{ command: string; args: readonly string[] }> = [];
      const result = await createGithubPrExecuteApi(
        dbPath,
        async (command, args) => {
          calls.push({ command, args });
          const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
          return ok;
        },
        authedExec,
        'mastermind/autopilot',
      )('p1', 'a landed fix', 'fixes the thing', 42);

      expect(calls).toHaveLength(3);
      expect(calls[2]?.args).toContain('fixes the thing\n\nCloses #42');
      expect(result?.ok).toBe(true);
      expect(result?.details).toContain('closing #42');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('omits url when gh pr create prints nothing to stdout on success', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-nourl-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghpr-db-'));
    try {
      initRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const result = await createGithubPrExecuteApi(
        dbPath,
        async () => {
          const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
          return ok;
        },
        authedExec,
      )('p1', 'a fix', 'body');

      expect(result?.ok).toBe(true);
      expect(result?.url).toBeUndefined();
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });
});
