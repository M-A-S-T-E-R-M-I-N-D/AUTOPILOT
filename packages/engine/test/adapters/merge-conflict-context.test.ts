// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gatherMergeConflictContext } from '../../src/adapters/merge-conflict-context.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(dir: string): void {
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'Test']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'feat: AP-0 seed']);
}

/** Attempts a merge and swallows the expected "CONFLICT" non-zero exit — the test asserts on the resulting index state, not the merge command itself. */
function mergeExpectingConflict(repo: string, branch: string): void {
  try {
    gitSync(repo, ['merge', '--no-ff', '-m', 'merge', branch]);
  } catch {
    /* expected: a conflicting merge exits non-zero */
  }
}

describe('gatherMergeConflictContext', () => {
  let scratch: string;
  let repo: string;
  let base: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'autopilot-merge-conflict-'));
    repo = join(scratch, 'target-repo');
    mkdirSync(repo);
    initRepo(repo);
    base = gitSync(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('returns base/ours/theirs content for an edit-edit conflict on the same line', async () => {
    writeFileSync(join(repo, 'file.txt'), 'base-line\n');
    gitSync(repo, ['add', '-A']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: AP-1 base']);

    gitSync(repo, ['branch', 'theirs-branch']);

    writeFileSync(join(repo, 'file.txt'), 'ours-line\n');
    gitSync(repo, ['add', '-A']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: AP-2 ours']);

    gitSync(repo, ['checkout', '-q', 'theirs-branch']);
    writeFileSync(join(repo, 'file.txt'), 'theirs-line\n');
    gitSync(repo, ['add', '-A']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: AP-3 theirs']);

    gitSync(repo, ['checkout', '-q', base]);
    mergeExpectingConflict(repo, 'theirs-branch');

    await expect(gatherMergeConflictContext(repo, 'file.txt')).resolves.toEqual({
      path: 'file.txt',
      base: 'base-line\n',
      ours: 'ours-line\n',
      theirs: 'theirs-line\n',
    });
  });

  it('returns a null base for an add-add conflict (the path has no common ancestor)', async () => {
    writeFileSync(join(repo, 'unrelated.txt'), 'anchor\n');
    gitSync(repo, ['add', '-A']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: AP-1 base']);

    gitSync(repo, ['branch', 'theirs-branch']);

    writeFileSync(join(repo, 'new.txt'), 'ours-new\n');
    gitSync(repo, ['add', '-A']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: AP-2 ours adds']);

    gitSync(repo, ['checkout', '-q', 'theirs-branch']);
    writeFileSync(join(repo, 'new.txt'), 'theirs-new\n');
    gitSync(repo, ['add', '-A']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: AP-3 theirs adds']);

    gitSync(repo, ['checkout', '-q', base]);
    mergeExpectingConflict(repo, 'theirs-branch');

    await expect(gatherMergeConflictContext(repo, 'new.txt')).resolves.toEqual({
      path: 'new.txt',
      base: null,
      ours: 'ours-new\n',
      theirs: 'theirs-new\n',
    });
  });

  it('returns a null ours for a modify/delete conflict where our side deleted the path', async () => {
    writeFileSync(join(repo, 'del.txt'), 'orig\n');
    gitSync(repo, ['add', '-A']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: AP-1 base']);

    gitSync(repo, ['branch', 'theirs-branch']);

    gitSync(repo, ['rm', '-q', 'del.txt']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: AP-2 ours deletes']);

    gitSync(repo, ['checkout', '-q', 'theirs-branch']);
    writeFileSync(join(repo, 'del.txt'), 'changed\n');
    gitSync(repo, ['add', '-A']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: AP-3 theirs modifies']);

    gitSync(repo, ['checkout', '-q', base]);
    mergeExpectingConflict(repo, 'theirs-branch');

    await expect(gatherMergeConflictContext(repo, 'del.txt')).resolves.toEqual({
      path: 'del.txt',
      base: 'orig\n',
      ours: null,
      theirs: 'changed\n',
    });
  });

  it('returns all-null sides for a path with no unmerged entry', async () => {
    writeFileSync(join(repo, 'clean.txt'), 'content\n');
    gitSync(repo, ['add', '-A']);
    gitSync(repo, ['commit', '-q', '-m', 'feat: AP-1 base']);

    await expect(gatherMergeConflictContext(repo, 'clean.txt')).resolves.toEqual({
      path: 'clean.txt',
      base: null,
      ours: null,
      theirs: null,
    });
  });
});
