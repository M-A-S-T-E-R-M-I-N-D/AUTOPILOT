// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureWorktree } from '../../src/adapters/worktree.js';
import {
  gatherSiblingPrimaryClaims,
  gatherSiblingNewFiles,
  gatherStagedAddedFiles,
  gatherStagedFiles,
  isMergeCommit,
} from '../../src/adapters/sibling-commit-scan.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(dir: string): void {
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'Test']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'a.txt'), 'one');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'feat: AP-1 first']);
}

describe('gatherSiblingPrimaryClaims / gatherStagedFiles', () => {
  let scratch: string;
  let target: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'autopilot-sibling-scan-'));
    target = join(scratch, 'target-repo');
    mkdirSync(target);
    initRepo(target);
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('returns an empty list flying solo (no sibling worktrees)', () => {
    expect(gatherSiblingPrimaryClaims(target)).toEqual([]);
  });

  it("reads a sibling worktree's declared primary-file claim, excluding its own", async () => {
    const branch = 'autopilot/flight-worktree-p--fleet-2';
    const worktreePath = join(scratch, '.autopilot-worktrees', 'p--fleet-2');
    mkdirSync(join(scratch, '.autopilot-worktrees'), { recursive: true });
    const created = await ensureWorktree(target, worktreePath, branch);
    expect(created.ok).toBe(true);
    writeFileSync(join(worktreePath, '.autopilot-intent'), 'src/parser.ts — fix quoting\n');

    expect(gatherSiblingPrimaryClaims(worktreePath)).toEqual([
      // the main repo checkout counts as a sibling too, but it never
      // declares an intent, so only the OTHER linked worktree shows up —
      // here there are none besides `worktreePath` itself, proving
      // self-exclusion by path.
    ]);
    expect(gatherSiblingPrimaryClaims(target)).toEqual([{ branch, primaryFile: 'src/parser.ts' }]);
  });

  it('ignores a worktree with no declared intent', async () => {
    const branch = 'autopilot/flight-worktree-p--fleet-2';
    const worktreePath = join(scratch, '.autopilot-worktrees', 'p--fleet-2');
    mkdirSync(join(scratch, '.autopilot-worktrees'), { recursive: true });
    await ensureWorktree(target, worktreePath, branch);

    expect(gatherSiblingPrimaryClaims(target)).toEqual([]);
  });

  it('treats an intent file with only blank lines as no declared intent', async () => {
    const branch = 'autopilot/flight-worktree-p--fleet-3';
    const worktreePath = join(scratch, '.autopilot-worktrees', 'p--fleet-3');
    mkdirSync(join(scratch, '.autopilot-worktrees'), { recursive: true });
    await ensureWorktree(target, worktreePath, branch);
    writeFileSync(join(worktreePath, '.autopilot-intent'), '\n   \n\t\n');

    expect(gatherSiblingPrimaryClaims(target)).toEqual([]);
  });

  it('ignores a worktree with a declared intent on a non-flight branch', async () => {
    const branch = 'some-other-feature';
    const worktreePath = join(scratch, '.autopilot-worktrees', 'other-feature');
    mkdirSync(join(scratch, '.autopilot-worktrees'), { recursive: true });
    await ensureWorktree(target, worktreePath, branch);
    writeFileSync(join(worktreePath, '.autopilot-intent'), 'src/parser.ts — fix quoting\n');

    expect(gatherSiblingPrimaryClaims(target)).toEqual([]);
  });

  it('ignores a worktree with no checked-out branch (detached HEAD)', () => {
    const worktreePath = join(scratch, 'detached');
    const head = gitSync(target, ['rev-parse', 'HEAD']);
    gitSync(target, ['worktree', 'add', '--detach', worktreePath, head]);

    expect(gatherSiblingPrimaryClaims(target)).toEqual([]);
  });

  it.each([
    ['em dash', 'src/parser.ts — fix quoting'],
    ['en dash', 'src/parser.ts – fix quoting'],
    ['double hyphen', 'src/parser.ts -- fix quoting'],
    ['single hyphen', 'src/parser.ts - fix quoting'],
  ])(
    'parses the primary file from an intent line using a %s separator',
    async (_label, intentLine) => {
      const branch = 'autopilot/flight-worktree-p--fleet-2';
      const worktreePath = join(scratch, '.autopilot-worktrees', 'p--fleet-2');
      mkdirSync(join(scratch, '.autopilot-worktrees'), { recursive: true });
      await ensureWorktree(target, worktreePath, branch);
      writeFileSync(join(worktreePath, '.autopilot-intent'), `${intentLine}\n`);

      expect(gatherSiblingPrimaryClaims(target)).toEqual([
        { branch, primaryFile: 'src/parser.ts' },
      ]);
    },
  );

  it('returns an empty list (fails open) when the path is not a git repo', () => {
    const notARepo = join(scratch, 'not-a-repo');
    mkdirSync(notARepo);
    expect(gatherSiblingPrimaryClaims(notARepo)).toEqual([]);
    expect(gatherStagedFiles(notARepo)).toEqual([]);
  });

  it('lists the files staged for the upcoming commit', () => {
    writeFileSync(join(target, 'b.txt'), 'two');
    gitSync(target, ['add', 'b.txt']);
    expect(gatherStagedFiles(target)).toEqual(['b.txt']);
  });

  it('returns an empty list with a clean tree', () => {
    expect(gatherStagedFiles(target)).toEqual([]);
  });
});

describe('isMergeCommit', () => {
  let scratch: string;
  let target: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'autopilot-sibling-scan-merge-'));
    target = join(scratch, 'target-repo');
    mkdirSync(target);
    initRepo(target);
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('is false on a clean working tree with no merge in progress', () => {
    expect(isMergeCommit(target)).toBe(false);
  });

  it('is true while a merge is in progress (MERGE_HEAD set, staged but not yet committed)', () => {
    const base = gitSync(target, ['rev-parse', '--abbrev-ref', 'HEAD']);
    gitSync(target, ['checkout', '-b', 'catch-up']);
    writeFileSync(join(target, 'b.txt'), 'two');
    gitSync(target, ['add', 'b.txt']);
    gitSync(target, ['commit', '-q', '-m', 'feat: b']);
    gitSync(target, ['checkout', base]);
    gitSync(target, ['merge', '--no-commit', '--no-ff', 'catch-up']);

    expect(isMergeCommit(target)).toBe(true);
  });

  it('returns false (fails safe — the guard stays active) when the path is not a git repo', () => {
    const notARepo = join(scratch, 'not-a-repo');
    mkdirSync(notARepo);
    expect(isMergeCommit(notARepo)).toBe(false);
  });
});

describe('gatherSiblingNewFiles / gatherStagedAddedFiles (2026-09-25)', () => {
  let scratch: string;
  let target: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'autopilot-sibling-new-'));
    target = join(scratch, 'target-repo');
    mkdirSync(target);
    initRepo(target);
    gitSync(target, ['branch', 'autopilot/flight']);
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("reads a sibling's untracked, staged and unsynced new files, and never its own", async () => {
    const branch = 'autopilot/flight-worktree-p--fleet-2';
    const sibling = join(scratch, '.autopilot-worktrees', 'p--fleet-2');
    const self = join(scratch, '.autopilot-worktrees', 'p--fleet-3');
    mkdirSync(join(scratch, '.autopilot-worktrees'), { recursive: true });
    expect((await ensureWorktree(target, sibling, branch)).ok).toBe(true);
    expect((await ensureWorktree(target, self, 'autopilot/flight-worktree-p--fleet-3')).ok).toBe(
      true,
    );
    // committed on the sibling's lane, not yet on the flight branch
    writeFileSync(join(sibling, 'committed.mjs'), 'x');
    gitSync(sibling, ['add', 'committed.mjs']);
    gitSync(sibling, ['commit', '-q', '-m', 'test: add']);
    // staged but uncommitted, and untracked in a new folder
    writeFileSync(join(sibling, 'staged.mjs'), 'x');
    gitSync(sibling, ['add', 'staged.mjs']);
    mkdirSync(join(sibling, 'config', 'mutation'), { recursive: true });
    writeFileSync(join(sibling, 'config', 'mutation', 'new.mjs'), 'x');
    // an edit to a tracked file is not a new file, and the intent file is metadata
    writeFileSync(join(sibling, 'a.txt'), 'changed');
    writeFileSync(join(sibling, '.autopilot-intent'), 'x.ts — y\n');
    writeFileSync(join(self, 'mine.mjs'), 'x');

    const found = gatherSiblingNewFiles(self)
      .map((f) => `${f.branch} ${f.path}`)
      .sort();
    expect(found).toEqual([
      `${branch} committed.mjs`,
      `${branch} config/mutation/new.mjs`,
      `${branch} staged.mjs`,
    ]);
  });

  it('lists only the files a commit adds, not the ones it edits', () => {
    writeFileSync(join(target, 'a.txt'), 'edited');
    writeFileSync(join(target, 'b.txt'), 'new');
    gitSync(target, ['add', '-A']);
    expect(gatherStagedAddedFiles(target)).toEqual(['b.txt']);
  });

  it('fails to empty lists outside a repository', () => {
    expect(gatherSiblingNewFiles(scratch)).toEqual([]);
    expect(gatherStagedAddedFiles(scratch)).toEqual([]);
  });
});
