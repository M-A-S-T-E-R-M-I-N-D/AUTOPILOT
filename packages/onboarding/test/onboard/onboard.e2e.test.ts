// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * M2 Definition of Done (docs/ACTION-PLAN.md): point onboarding at 3 different-
 * stack repos → each is backed up, oriented (gate detected), indexed; re-locking
 * a seen repo resumes state; no repo is touched before its MYTH/LEGACY snapshot.
 * Real git + real SQLite throughout.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { openStore, migrate, type Store } from '@autopilot/store';
import { onboard } from '../../src/onboard/onboard.js';
import { slugify } from '../../src/onboard/soul.js';
import type { OnboardDeps } from '../../src/onboard/types.js';
import { GitBackup } from '../../src/adapters/git-backup.js';
import { FsFileSource } from '../../src/adapters/fs-file-source.js';
import { SqliteIndexStore } from '../../src/adapters/sqlite-index-store.js';
import { SqliteProjectStore } from '../../src/adapters/sqlite-project-store.js';
import { readFsSnapshot } from '../../src/adapters/fs-snapshot.js';
import { MYTH_TAG, LEGACY_TAG, FLIGHT_BRANCH } from '../../src/backup/refs.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function makeRepo(dir: string, files: Record<string, string>): void {
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 't@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'T']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'seed']);
}

describe('M2 DoD — onboard', () => {
  let store: Store;
  let dirs: string[];
  let counter: number;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    dirs = [];
    counter = 0;
  });
  afterEach(() => {
    store.close();
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Windows may briefly hold a temp dir (lingering git/SQLite handle) — the
        // OS reaps it later. A cleanup EBUSY must not fail the assertions above.
      }
    }
  });

  function newRepo(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-onboard-'));
    dirs.push(dir);
    makeRepo(dir, files);
    return dir;
  }

  function deps(dir: string): OnboardDeps {
    return {
      vcs: new GitBackup(dir),
      readSnapshot: (root) => readFsSnapshot(root),
      fileSource: new FsFileSource(dir),
      indexStore: new SqliteIndexStore(store),
      projects: new SqliteProjectStore(store, () => `task-${++counter}`),
      newId: () => `proj-${++counter}`,
    };
  }

  it('backs up, orients, and indexes 3 different-stack repos', async () => {
    const stacks = [
      {
        name: 'ts-app',
        ecosystem: 'js',
        files: {
          'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
          'pnpm-lock.yaml': '',
          'src/index.ts': 'export const x = 1;',
        },
      },
      {
        name: 'py-svc',
        ecosystem: 'python',
        files: { 'pyproject.toml': '[tool.pytest.ini_options]\n', 'app.py': 'print(1)' },
      },
      {
        name: 'go-svc',
        ecosystem: 'go',
        files: { 'go.mod': 'module x\n', 'main.go': 'package main' },
      },
    ];

    for (const stack of stacks) {
      const dir = newRepo(stack.files);
      const result = await onboard(deps(dir), { root: dir, name: stack.name });

      // Backed up: MYTH/LEGACY tags + on the flight branch.
      expect(gitSync(dir, ['rev-parse', `refs/tags/${MYTH_TAG}`])).toMatch(/^[0-9a-f]{40}$/);
      expect(gitSync(dir, ['rev-parse', `refs/tags/${LEGACY_TAG}`])).toMatch(/^[0-9a-f]{40}$/);
      expect(gitSync(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe(FLIGHT_BRANCH);

      // Oriented: the gate is detected for this stack.
      expect(result.gate.spec.ecosystem).toBe(stack.ecosystem);

      // Triaged: a code repo is always classified as 'code'.
      expect(result.triage.kind).toBe('code');

      // Indexed: the content-hash index has entries.
      expect(result.indexDiff.added.length).toBeGreaterThan(0);

      // Registered + board seeded.
      const proj = store.db
        .prepare('SELECT slug, soul, gate_config FROM projects WHERE root_path = ?')
        .get(dir) as { slug: string; soul: string; gate_config: string };
      expect(proj.soul).toContain(`# SOUL — ${stack.name}`);
      expect(JSON.parse(proj.gate_config)).toMatchObject({ ecosystem: stack.ecosystem });
      const tasks = store.db
        .prepare('SELECT COUNT(*) AS c FROM tasks WHERE project_id = ?')
        .get(result.projectId) as { c: number };
      expect(tasks.c).toBeGreaterThan(0);

      // Backup recorded in the versions projection: MYTH + LEGACY + flight.
      const tiers = store.db
        .prepare('SELECT tier FROM versions WHERE project_id = ? ORDER BY tier')
        .all(result.projectId) as { tier: string }[];
      expect(tiers.map((t) => t.tier)).toEqual(['flight', 'legacy', 'myth']);
    }

    const projects = store.db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number };
    expect(projects.c).toBe(3);
  }, 60000); // real git on 3 SEQUENTIAL repos — 3x the work of every other case
  // in this file, so it needs 3x their budget: the 30s default (vitest.config.ts)
  // already timed this out under fleet parallel-run load (board web-mtbui5hu-0ai168,
  // observed: `pnpm run test` failed here once in 2 full runs with "Test timed out
  // in 30000ms", then passed clean standalone via `detect-flaky` (4/4) — a resource-
  // contention flake, not a logic bug).

  it('re-locking a seen repo resumes state (no duplicate, empty index diff)', async () => {
    const dir = newRepo({ 'go.mod': 'module x', 'main.go': 'package main' });

    const first = await onboard(deps(dir), { root: dir, name: 'svc' });
    const second = await onboard(deps(dir), { root: dir, name: 'svc' });

    expect(first.resumed).toBe(false);
    expect(second.resumed).toBe(true);
    expect(second.projectId).toBe(first.projectId);
    expect(second.indexDiff.added).toHaveLength(0);
    expect(second.indexDiff.changed).toHaveLength(0);

    const projects = store.db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number };
    expect(projects.c).toBe(1); // never re-registered
  }, 30000);

  it('derives name from basename(root) and slug via slugify when both are omitted', async () => {
    const dir = newRepo({ 'go.mod': 'module x', 'main.go': 'package main' });

    const result = await onboard(deps(dir), { root: dir });

    const expectedName = basename(dir);
    const proj = store.db
      .prepare('SELECT slug, soul FROM projects WHERE root_path = ?')
      .get(dir) as { slug: string; soul: string };
    expect(proj.soul).toContain(`# SOUL — ${expectedName}`);
    expect(proj.slug).toBe(slugify(expectedName));
    expect(result.resumed).toBe(false);
  }, 30000);

  it("a resumed project's SOUL-declared Backlog: line overrides re-detection", async () => {
    const dir = newRepo({ 'go.mod': 'module x', 'main.go': 'package main', 'PLAN.md': '' });

    const first = await onboard(deps(dir), { root: dir, name: 'svc' });
    expect(first.backlogPath).toBeNull(); // PLAN.md doesn't match the filename heuristic

    store.db
      .prepare('UPDATE projects SET soul = soul || ? WHERE id = ?')
      .run('\nBacklog: PLAN.md\n', first.projectId);

    const second = await onboard(deps(dir), { root: dir, name: 'svc' });
    expect(second.resumed).toBe(true);
    expect(second.backlogPath).toBe('PLAN.md');
  }, 30000);

  it('resumes a project whose stored SOUL is NULL by falling back to re-detection', async () => {
    // A defensive path, not one the onboarding flow itself produces (register()
    // always writes a generated starter SOUL) — but the `soul` column is
    // nullable, so a legacy/hand-inserted row can still have NULL there.
    const dir = newRepo({ 'go.mod': 'module x', 'main.go': 'package main', 'BACKLOG.md': '' });

    const first = await onboard(deps(dir), { root: dir, name: 'svc' });
    expect(first.backlogPath).toBe('BACKLOG.md');

    store.db.prepare('UPDATE projects SET soul = NULL WHERE id = ?').run(first.projectId);

    const second = await onboard(deps(dir), { root: dir, name: 'svc' });
    expect(second.resumed).toBe(true);
    expect(second.backlogPath).toBe('BACKLOG.md'); // falls back to detection, does not throw
  }, 30000);

  it('triages a non-code folder and seeds a TRIAGE-mode SOUL (Generic-folder competence, board web-msnioxgz-emkgca)', async () => {
    const dir = newRepo({ 'notes.md': '# hi', 'todo.md': 'buy milk', 'draft.md': '...' });

    const result = await onboard(deps(dir), { root: dir, name: 'notes' });

    expect(result.triage.kind).toBe('docs');
    expect(result.gate.spec.ecosystem).toBe('unknown');
    const proj = store.db.prepare('SELECT soul FROM projects WHERE root_path = ?').get(dir) as {
      soul: string;
    };
    expect(proj.soul).toContain('Kind: docs folder (3 files, no code gate)');
    expect(proj.soul).toContain('- docs: 3');
  }, 30000);

  it('never touches the repo before/after the MYTH/LEGACY snapshot (detect + index add no commits)', async () => {
    const dir = newRepo({ 'go.mod': 'module x', 'main.go': 'package main' });
    const headBefore = gitSync(dir, ['rev-parse', 'HEAD']);

    await onboard(deps(dir), { root: dir, name: 'svc' });

    // The flight branch points at the same seed commit — detection + indexing
    // created no commits, and the snapshot exists.
    expect(gitSync(dir, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(gitSync(dir, ['rev-list', '--count', 'HEAD'])).toBe('1');
    expect(gitSync(dir, ['rev-parse', `refs/tags/${MYTH_TAG}`])).toBe(headBefore);
  }, 30000);
});
