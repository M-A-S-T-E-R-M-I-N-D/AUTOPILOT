// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, type Store } from '@autopilot/store';
import { ensureSelfOnboarded } from '../../src/server/self-onboard.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function makeRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  gitSync(dir, ['init', '-q', '-b', 'main']);
  gitSync(dir, ['config', 'user.email', 't@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'T']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
  writeFileSync(join(dir, 'src.ts'), 'export const x = 1;\n');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'seed']);
}

describe('ensureSelfOnboarded', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const d = dirs.pop();
      if (!d) continue;
      try {
        rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Windows may briefly hold a temp dir (lingering git/SQLite handle) — the
        // OS reaps it later. A cleanup EBUSY must not fail the assertions above.
      }
    }
  });

  function newRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-self-onboard-repo-'));
    dirs.push(dir);
    makeRepo(dir);
    return dir;
  }

  function newDbPath(): string {
    const workspace = mkdtempSync(join(tmpdir(), 'autopilot-self-onboard-ws-'));
    dirs.push(workspace);
    // Nested + not-yet-created, so onboarding must mkdir the parent itself.
    return join(workspace, 'nested', 'autopilot.db');
  }

  it('registers the running folder as a project (gate detection + index + SOUL)', async () => {
    const repo = newRepo();
    const dbPath = newDbPath();

    const result = await ensureSelfOnboarded(dbPath, repo);
    expect(result.ran).toBe(true);
    expect(result.projectId).toBeDefined();
    expect(existsSync(dbPath)).toBe(true);

    const store: Store = openStore(dbPath);
    migrate(store);
    try {
      const proj = store.db
        .prepare('SELECT root_path, soul, gate_config FROM projects WHERE root_path = ?')
        .get(repo) as { root_path: string; soul: string; gate_config: string } | undefined;
      expect(proj?.root_path).toBe(repo);
      expect(proj?.soul).toContain('# SOUL —');
      expect(JSON.parse(proj?.gate_config ?? '{}')).toMatchObject({ ecosystem: 'js' });

      const index = store.db
        .prepare('SELECT COUNT(*) AS c FROM project_index WHERE project_id = ?')
        .get(result.projectId) as { c: number };
      expect(index.c).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  }, 30000);

  it('never touches git — no tags, no branch switch (a passive boot must not mutate the repo)', async () => {
    const repo = newRepo();
    const dbPath = newDbPath();
    const headBefore = gitSync(repo, ['rev-parse', 'HEAD']);

    await ensureSelfOnboarded(dbPath, repo);

    expect(gitSync(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
    expect(gitSync(repo, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(gitSync(repo, ['tag'])).toBe('');
  }, 30000);

  it('is a no-op the second time — never re-registers an already-onboarded root', async () => {
    const repo = newRepo();
    const dbPath = newDbPath();

    const first = await ensureSelfOnboarded(dbPath, repo);
    const second = await ensureSelfOnboarded(dbPath, repo);

    expect(first.ran).toBe(true);
    expect(second.ran).toBe(false);
    expect(second.projectId).toBeUndefined();

    const store: Store = openStore(dbPath);
    migrate(store);
    try {
      const projects = store.db.prepare('SELECT COUNT(*) AS c FROM projects').get() as {
        c: number;
      };
      expect(projects.c).toBe(1);
    } finally {
      store.close();
    }
  }, 30000);
});
