// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, type Store } from '@autopilot/store';
import type * as AutopilotStore from '@autopilot/store';
import {
  landWatchdogTick,
  createLandWatchdogControl,
  type LandWatchdogControl,
} from '../../src/control/land-watchdog.js';
import { createLandingExecuteApi } from '../../src/landing/execute.js';
import { deriveFlyProjectId } from '../../src/flight/lock.js';

vi.mock('@autopilot/store', async (importOriginal) => {
  const actual = await importOriginal<typeof AutopilotStore>();
  return { ...actual, openStore: vi.fn(actual.openStore) };
});

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(repo: string): void {
  gitSync(repo, ['init', '-q']);
  gitSync(repo, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(repo, ['config', 'user.name', 'Test']);
  gitSync(repo, ['config', 'commit.gpgsign', 'false']);
}

/** A branch-ahead-of-main repo: init on main, then one commit on autopilot/flight. */
function setupBranchedRepo(repo: string): void {
  initRepo(repo);
  writeFileSync(join(repo, 'a.txt'), 'one');
  gitSync(repo, ['add', '-A']);
  gitSync(repo, ['commit', '-q', '-m', 'init']);
  gitSync(repo, ['branch', 'main']);
  gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);
  writeFileSync(join(repo, 'b.txt'), 'two');
  gitSync(repo, ['add', '-A']);
  gitSync(repo, ['commit', '-q', '-m', 'feat: second']);
}

function project(s: Store, id: string, rootPath: string, gateConfig: string | null): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'registered', ?, ?, ?)`,
    )
    .run(id, id, id, rootPath, gateConfig, 100, 100);
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

const NODE_OK = JSON.stringify({
  ecosystem: 'js',
  test: { bin: 'node', args: ['-e', 'process.exit(0)'], label: 'node ok' },
});

describe('landWatchdogTick (pure)', () => {
  it('does not attempt a land when there is nothing ahead of base', async () => {
    const land = vi.fn();
    const control: LandWatchdogControl = { landableCommitCount: async () => 0, land };
    const result = await landWatchdogTick(control);
    expect(result).toEqual({ attempted: false, result: null });
    expect(land).not.toHaveBeenCalled();
  });

  it('attempts a land when the branch is ahead of base', async () => {
    const landResult = { ok: true, reason: 'landed', details: 'ok', restarting: false } as const;
    const land = vi.fn(async () => landResult);
    const control: LandWatchdogControl = { landableCommitCount: async () => 2, land };
    const result = await landWatchdogTick(control);
    expect(result).toEqual({ attempted: true, result: landResult });
    expect(land).toHaveBeenCalledOnce();
  });

  it('defers the land and flags overlaps when a sibling branch has unlanded work on the same lines', async () => {
    const land = vi.fn();
    const overlaps = [{ branch: 'autopilot/flight-worktree-fly-x--sib', files: ['a.ts'] }];
    const control: LandWatchdogControl = {
      landableCommitCount: async () => 2,
      overlapWarnings: async () => overlaps,
      land,
    };
    const result = await landWatchdogTick(control);
    expect(result).toEqual({ attempted: false, result: null, overlaps });
    expect(land).not.toHaveBeenCalled();
  });

  it('lands normally when overlapWarnings reports no overlap', async () => {
    const landResult = { ok: true, reason: 'landed', details: 'ok', restarting: false } as const;
    const land = vi.fn(async () => landResult);
    const control: LandWatchdogControl = {
      landableCommitCount: async () => 1,
      overlapWarnings: async () => [],
      land,
    };
    const result = await landWatchdogTick(control);
    expect(result).toEqual({ attempted: true, result: landResult });
    expect(land).toHaveBeenCalledOnce();
  });

  it('lands and surfaces stragglers when a sibling is ahead of base with no overlap', async () => {
    const landResult = { ok: true, reason: 'landed', details: 'ok', restarting: false } as const;
    const land = vi.fn(async () => landResult);
    const stragglers = [{ branch: 'autopilot/flight-worktree-fly-x--fleet-7', commitCount: 3 }];
    const control: LandWatchdogControl = {
      landableCommitCount: async () => 1,
      overlapWarnings: async () => [],
      aheadSiblings: async () => stragglers,
      land,
    };
    const result = await landWatchdogTick(control);
    expect(result).toEqual({ attempted: true, result: landResult, stragglers });
    expect(land).toHaveBeenCalledOnce();
  });

  it('omits stragglers entirely when aheadSiblings reports none', async () => {
    const landResult = { ok: true, reason: 'landed', details: 'ok', restarting: false } as const;
    const land = vi.fn(async () => landResult);
    const control: LandWatchdogControl = {
      landableCommitCount: async () => 1,
      overlapWarnings: async () => [],
      aheadSiblings: async () => [],
      land,
    };
    const result = await landWatchdogTick(control);
    expect(result).toEqual({ attempted: true, result: landResult });
  });

  it('never calls aheadSiblings when an overlap already refused the land', async () => {
    const land = vi.fn();
    const aheadSiblings = vi.fn(async () => [
      { branch: 'autopilot/flight-worktree-fly-x--fleet-7', commitCount: 3 },
    ]);
    const overlaps = [{ branch: 'autopilot/flight-worktree-fly-x--sib', files: ['a.ts'] }];
    const control: LandWatchdogControl = {
      landableCommitCount: async () => 2,
      overlapWarnings: async () => overlaps,
      aheadSiblings,
      land,
    };
    const result = await landWatchdogTick(control);
    expect(result).toEqual({ attempted: false, result: null, overlaps });
    expect(aheadSiblings).not.toHaveBeenCalled();
    expect(land).not.toHaveBeenCalled();
  });
});

describe('createLandWatchdogControl (real store + real git)', () => {
  it('landableCommitCount() is 0 for a folder that was never onboarded', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const control = createLandWatchdogControl({
        dbPath,
        targetFolder: join(dir, 'nonexistent-project'),
        land: vi.fn() as never,
      });
      expect(await control.landableCommitCount()).toBe(0);
    } finally {
      cleanupDir(dir);
    }
  });

  it('opens the store read-only — findProject() never writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      vi.mocked(openStore).mockClear();
      const control = createLandWatchdogControl({
        dbPath,
        targetFolder: join(dir, 'nonexistent-project'),
        land: vi.fn() as never,
      });
      await control.landableCommitCount();
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });

  it('landableCommitCount() is 0 when the checked-out branch IS the base', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-nobase-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-db-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', '-m', 'main']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, null);
      s.close();

      const control = createLandWatchdogControl({
        dbPath,
        targetFolder: repo,
        land: vi.fn() as never,
      });
      expect(await control.landableCommitCount()).toBe(0);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('landableCommitCount() counts commits ahead of base', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-ahead-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-db-'));
    try {
      setupBranchedRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, null);
      s.close();

      const control = createLandWatchdogControl({
        dbPath,
        targetFolder: repo,
        land: vi.fn() as never,
      });
      expect(await control.landableCommitCount()).toBe(1);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('land() returns null for a folder that was never onboarded', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-noland-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const land = vi.fn();
      const control = createLandWatchdogControl({
        dbPath,
        targetFolder: join(dir, 'nonexistent-project'),
        land,
      });
      expect(await control.land()).toBeNull();
      expect(land).not.toHaveBeenCalled();
    } finally {
      cleanupDir(dir);
    }
  });

  it('land() gate-then-merges the branch into base on a green gate', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-land-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-db-'));
    try {
      setupBranchedRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, NODE_OK);
      s.close();

      const control = createLandWatchdogControl({
        dbPath,
        targetFolder: repo,
        land: createLandingExecuteApi(dbPath),
      });
      expect(await control.landableCommitCount()).toBe(1);
      const result = await control.land();
      expect(result?.ok).toBe(true);
      expect(result?.reason).toBe('landed');

      const mainLog = gitSync(repo, ['log', 'main', '--oneline']);
      expect(mainLog).toContain('feat: second');
      // Landed — nothing left ahead of base.
      expect(await control.landableCommitCount()).toBe(0);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('aheadSiblings() reports a sibling flight-worktree branch ahead of base even with unrelated files', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-strag-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-lwd-db-'));
    try {
      setupBranchedRepo(repo);
      const projectId = deriveFlyProjectId(repo);
      gitSync(repo, ['checkout', '-q', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', `autopilot/flight-worktree-${projectId}--fleet-7`]);
      writeFileSync(join(repo, 'sibling-only.txt'), 'sibling');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: sibling own file']);
      gitSync(repo, ['checkout', '-q', 'autopilot/flight']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, null);
      s.close();

      const control = createLandWatchdogControl({
        dbPath,
        targetFolder: repo,
        land: vi.fn() as never,
      });
      const stragglers = await control.aheadSiblings?.();
      expect(stragglers).toEqual([
        { branch: `autopilot/flight-worktree-${projectId}--fleet-7`, commitCount: 1 },
      ]);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });
});
