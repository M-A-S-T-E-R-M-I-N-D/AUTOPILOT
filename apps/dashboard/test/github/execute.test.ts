// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import { createGithubSyncExecuteApi, type CommandResult } from '../../src/github/execute.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(repo: string): void {
  gitSync(repo, ['init', '-q']);
  gitSync(repo, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(repo, ['config', 'user.name', 'Test']);
  gitSync(repo, ['config', 'commit.gpgsign', 'false']);
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

describe('createGithubSyncExecuteApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-unknown-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      const api = createGithubSyncExecuteApi(dbPath, async () => {
        throw new Error('runCommand must not be called for an unknown project');
      });
      expect(await api('nope', 'private')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('plans a "create" sync (private, --source=., --push) when the repo has no remote', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-noremote-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-db-'));
    try {
      initRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
      const result = await createGithubSyncExecuteApi(dbPath, async (command, args, cwd) => {
        calls.push({ command, args, cwd });
        const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
        return ok;
      })('p1', 'private');

      expect(calls).toEqual([
        {
          command: 'gh',
          args: ['repo', 'create', 'my-project', '--private', '--source=.', '--push'],
          cwd: repo,
        },
      ]);
      expect(result).toEqual({
        ok: true,
        action: 'create',
        details:
          'no remote configured — creating a new private GitHub repo "my-project" and pushing',
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('plans a "create" sync with --public when the caller chooses public visibility', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-public-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-db-'));
    try {
      initRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const calls: Array<{ command: string; args: readonly string[] }> = [];
      const result = await createGithubSyncExecuteApi(dbPath, async (command, args) => {
        calls.push({ command, args });
        const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
        return ok;
      })('p1', 'public');

      expect(calls).toEqual([
        {
          command: 'gh',
          args: ['repo', 'create', 'my-project', '--public', '--source=.', '--push'],
        },
      ]);
      expect(result).toEqual({
        ok: true,
        action: 'create',
        details:
          'no remote configured — creating a new public GitHub repo "my-project" and pushing',
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('plans a "push" re-sync when the repo already has a remote', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-remote-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-db-'));
    try {
      initRepo(repo);
      gitSync(repo, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const calls: Array<{ command: string; args: readonly string[] }> = [];
      const result = await createGithubSyncExecuteApi(dbPath, async (command, args) => {
        calls.push({ command, args });
        const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
        return ok;
      })('p1', 'private');

      expect(calls).toEqual([{ command: 'git', args: ['push'] }]);
      expect(result).toEqual({
        ok: true,
        action: 'push',
        details: 're-sync: remote already configured — pushing to it',
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('blocks a public sync when the secret scanner flags a file, without running any command', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-secret-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-db-'));
    try {
      initRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const result = await createGithubSyncExecuteApi(
        dbPath,
        async () => {
          throw new Error('runCommand must not be called when the secret scan blocks the sync');
        },
        () => ['.env'],
      )('p1', 'public');

      expect(result).toEqual({
        ok: false,
        action: 'create',
        details:
          'Public sync blocked — possible secrets found: .env. Resolve these before syncing publicly.',
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('does not run the secret scanner for a private sync', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-noscan-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-db-'));
    try {
      initRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const result = await createGithubSyncExecuteApi(
        dbPath,
        async () => {
          const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
          return ok;
        },
        () => {
          throw new Error('scan must not run for a private sync');
        },
      )('p1', 'private');

      expect(result?.ok).toBe(true);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it("reports failure with the command's stderr when the runner exits non-zero", async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-fail-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-ghsync-db-'));
    try {
      initRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', 'my-project', repo);
      s.close();

      const result = await createGithubSyncExecuteApi(dbPath, async () => {
        const fail: CommandResult = { exitCode: 1, stdout: '', stderr: 'gh: not authenticated' };
        return fail;
      })('p1', 'private');

      expect(result).toEqual({
        ok: false,
        action: 'create',
        details: 'gh: not authenticated',
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });
});
