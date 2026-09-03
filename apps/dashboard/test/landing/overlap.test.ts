// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitVcs } from '@autopilot/engine';
import { gatherLandingOverlaps, gatherAheadSiblings } from '../../src/landing/overlap.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(repo: string): void {
  gitSync(repo, ['init', '-q']);
  gitSync(repo, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(repo, ['config', 'user.name', 'Test']);
  gitSync(repo, ['config', 'commit.gpgsign', 'false']);
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

describe('gatherLandingOverlaps', () => {
  it('flags a sibling flight-worktree branch whose unlanded commits touch the same file', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-overlap-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);

      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p1--fleet-2']);
      writeFileSync(join(repo, 'shared.txt'), 'sibling');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: sibling touches shared.txt']);

      gitSync(repo, ['checkout', '-q', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);

      const vcs = new GitVcs(repo);
      const overlaps = await gatherLandingOverlaps(vcs, repo, 'p1', 'autopilot/flight', 'main', [
        'shared.txt',
        'mine.txt',
      ]);

      expect(overlaps).toEqual([
        { branch: 'autopilot/flight-worktree-p1--fleet-2', files: ['shared.txt'] },
      ]);
    } finally {
      cleanupDir(repo);
    }
  });

  it('flags the solo/base instance branch (no --instanceId suffix) as a sibling too', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-overlap-solo-sibling-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);

      // deriveWorktreePlan omits the `--instanceId` suffix entirely when no
      // instanceId is given (worktree.ts) — this is that exact branch shape.
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p1']);
      writeFileSync(join(repo, 'shared.txt'), 'solo sibling');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: solo instance touches shared.txt']);

      gitSync(repo, ['checkout', '-q', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p1--fleet-2']);

      const vcs = new GitVcs(repo);
      const overlaps = await gatherLandingOverlaps(
        vcs,
        repo,
        'p1',
        'autopilot/flight-worktree-p1--fleet-2',
        'main',
        ['shared.txt', 'mine.txt'],
      );

      expect(overlaps).toEqual([{ branch: 'autopilot/flight-worktree-p1', files: ['shared.txt'] }]);
    } finally {
      cleanupDir(repo);
    }
  });

  it('returns [] when no sibling flight-worktree branch exists', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-overlap-solo-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);

      const vcs = new GitVcs(repo);
      const overlaps = await gatherLandingOverlaps(vcs, repo, 'p1', 'autopilot/flight', 'main', [
        'a.txt',
      ]);

      expect(overlaps).toEqual([]);
    } finally {
      cleanupDir(repo);
    }
  });

  it('returns [] when a sibling branch exists but touches unrelated files', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-overlap-noconflict-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);

      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p1--fleet-2']);
      writeFileSync(join(repo, 'sibling-only.txt'), 'sibling');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: sibling own file']);

      gitSync(repo, ['checkout', '-q', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);

      const vcs = new GitVcs(repo);
      const overlaps = await gatherLandingOverlaps(vcs, repo, 'p1', 'autopilot/flight', 'main', [
        'mine-only.txt',
      ]);

      expect(overlaps).toEqual([]);
    } finally {
      cleanupDir(repo);
    }
  });

  it('never treats a sibling branch for a DIFFERENT project id as an overlap source', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-overlap-other-project-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);

      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p2--fleet-2']);
      writeFileSync(join(repo, 'shared.txt'), 'other project sibling');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: other project touches shared.txt']);

      gitSync(repo, ['checkout', '-q', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);

      const vcs = new GitVcs(repo);
      const overlaps = await gatherLandingOverlaps(vcs, repo, 'p1', 'autopilot/flight', 'main', [
        'shared.txt',
      ]);

      expect(overlaps).toEqual([]);
    } finally {
      cleanupDir(repo);
    }
  });

  it("never treats the caller's OWN branch as a sibling, even when it matches the flight-worktree pattern", async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-overlap-self-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p1--fleet-2']);
      writeFileSync(join(repo, 'mine.txt'), 'mine');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: my own commit']);

      const vcs = new GitVcs(repo);
      const overlaps = await gatherLandingOverlaps(
        vcs,
        repo,
        'p1',
        'autopilot/flight-worktree-p1--fleet-2',
        'main',
        ['mine.txt'],
      );

      expect(overlaps).toEqual([]);
    } finally {
      cleanupDir(repo);
    }
  });

  it('suppresses a same-file warning when both branches touch disjoint lines', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-overlap-disjoint-lines-'));
    try {
      initRepo(repo);
      const seed = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n');
      writeFileSync(join(repo, 'shared.txt'), seed);
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);

      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p1--fleet-2']);
      const siblingLines = seed.split('\n');
      siblingLines[0] = 'sibling touches the top';
      writeFileSync(join(repo, 'shared.txt'), siblingLines.join('\n'));
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: sibling edits the top of shared.txt']);

      gitSync(repo, ['checkout', '-q', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);
      const mineLines = seed.split('\n');
      mineLines[9] = 'mine touches the bottom';
      writeFileSync(join(repo, 'shared.txt'), mineLines.join('\n'));
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: mine edits the bottom of shared.txt']);

      const vcs = new GitVcs(repo);
      const overlaps = await gatherLandingOverlaps(vcs, repo, 'p1', 'autopilot/flight', 'main', [
        'shared.txt',
      ]);

      expect(overlaps).toEqual([]);
    } finally {
      cleanupDir(repo);
    }
  });

  it('still flags a same-file warning when both branches touch overlapping lines', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-overlap-real-lines-'));
    try {
      initRepo(repo);
      const seed = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n');
      writeFileSync(join(repo, 'shared.txt'), seed);
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);

      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p1--fleet-2']);
      const siblingLines = seed.split('\n');
      siblingLines[0] = 'sibling touches the top';
      writeFileSync(join(repo, 'shared.txt'), siblingLines.join('\n'));
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: sibling edits the top of shared.txt']);

      gitSync(repo, ['checkout', '-q', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);
      const mineLines = seed.split('\n');
      mineLines[0] = 'mine ALSO touches the top';
      writeFileSync(join(repo, 'shared.txt'), mineLines.join('\n'));
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: mine also edits the top of shared.txt']);

      const vcs = new GitVcs(repo);
      const overlaps = await gatherLandingOverlaps(vcs, repo, 'p1', 'autopilot/flight', 'main', [
        'shared.txt',
      ]);

      expect(overlaps).toEqual([
        { branch: 'autopilot/flight-worktree-p1--fleet-2', files: ['shared.txt'] },
      ]);
    } finally {
      cleanupDir(repo);
    }
  });

  it('degrades to [] on a non-repo target rather than throwing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-overlap-norepo-'));
    try {
      const vcs = new GitVcs(dir);
      const overlaps = await gatherLandingOverlaps(vcs, dir, 'p1', 'autopilot/flight', 'main', [
        'a.txt',
      ]);

      expect(overlaps).toEqual([]);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('gatherAheadSiblings', () => {
  it('reports a sibling branch ahead of base even when its files are entirely unrelated', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-ahead-noconflict-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);

      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p1--fleet-7']);
      writeFileSync(join(repo, 'sibling-only.txt'), 'sibling');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: sibling own file 1']);
      writeFileSync(join(repo, 'sibling-only-2.txt'), 'sibling');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: sibling own file 2']);

      gitSync(repo, ['checkout', '-q', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);
      writeFileSync(join(repo, 'mine-only.txt'), 'mine');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: mine own file']);

      const vcs = new GitVcs(repo);
      const stragglers = await gatherAheadSiblings(vcs, repo, 'p1', 'autopilot/flight', 'main');

      expect(stragglers).toEqual([
        { branch: 'autopilot/flight-worktree-p1--fleet-7', commitCount: 2 },
      ]);
    } finally {
      cleanupDir(repo);
    }
  });

  it('returns [] when no sibling flight-worktree branch exists', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-ahead-solo-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);

      const vcs = new GitVcs(repo);
      const stragglers = await gatherAheadSiblings(vcs, repo, 'p1', 'autopilot/flight', 'main');

      expect(stragglers).toEqual([]);
    } finally {
      cleanupDir(repo);
    }
  });

  it('excludes a sibling branch with no commits ahead of base', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-ahead-caughtup-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p1--fleet-2']);
      gitSync(repo, ['checkout', '-q', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);

      const vcs = new GitVcs(repo);
      const stragglers = await gatherAheadSiblings(vcs, repo, 'p1', 'autopilot/flight', 'main');

      expect(stragglers).toEqual([]);
    } finally {
      cleanupDir(repo);
    }
  });

  it("never treats the caller's OWN branch as a sibling", async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-ahead-self-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);
      gitSync(repo, ['branch', 'main']);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight-worktree-p1--fleet-2']);
      writeFileSync(join(repo, 'mine.txt'), 'mine');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: my own commit']);

      const vcs = new GitVcs(repo);
      const stragglers = await gatherAheadSiblings(
        vcs,
        repo,
        'p1',
        'autopilot/flight-worktree-p1--fleet-2',
        'main',
      );

      expect(stragglers).toEqual([]);
    } finally {
      cleanupDir(repo);
    }
  });

  it('degrades to [] on a non-repo target rather than throwing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-ahead-norepo-'));
    try {
      const vcs = new GitVcs(dir);
      const stragglers = await gatherAheadSiblings(vcs, dir, 'p1', 'autopilot/flight', 'main');

      expect(stragglers).toEqual([]);
    } finally {
      cleanupDir(dir);
    }
  });
});
