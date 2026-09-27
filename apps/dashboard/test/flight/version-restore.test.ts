// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE VERSIONS SCREEN'S RESTORE (board ap-mui2h3s1-1, slice 5).
 * PATTERNS-AND-STANDARDS.md §9: "a restore is a new branch, never a history
 * rewrite" — these pin that a restore never touches an existing ref, refuses
 * a malformed or unknown sha instead of running git on it, and surfaces a
 * `git branch` failure rather than throwing.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  gitRunnerFor,
  restoreBranchName,
  restoreVersion,
  type GitRunner,
} from '../../src/flight/version-restore.js';

const sha = (n: number): string => n.toString(16).padStart(40, '0');

describe('restoreBranchName', () => {
  it('names the branch from the version short sha and a timestamp', () => {
    const commit = 'abcdef1234567890abcdef1234567890abcdef12';
    expect(restoreBranchName(commit, 1_700_000_000_000)).toBe(
      'autopilot/restore/abcdef1-1700000000000',
    );
  });
});

describe('restoreVersion (fake git)', () => {
  function fakeGit(answers: { verify?: boolean; branch?: boolean; branchOutput?: string }): {
    git: GitRunner;
    calls: string[][];
  } {
    const calls: string[][] = [];
    const git: GitRunner = (args) => {
      calls.push([...args]);
      if (args[0] === 'rev-parse') return { ok: answers.verify ?? true, output: '' };
      if (args[0] === 'branch')
        return { ok: answers.branch ?? true, output: answers.branchOutput ?? '' };
      return { ok: false, output: 'unexpected command' };
    };
    return { git, calls };
  }

  it('refuses a sha that is not a full commit id, before ever touching git', () => {
    const { git, calls } = fakeGit({});
    expect(restoreVersion(git, 'abc123', 1)).toEqual({
      ok: false,
      branch: null,
      sha: null,
      reason: 'not a full commit id',
    });
    expect(calls).toEqual([]);
  });

  it('refuses a well-formed sha the repository does not actually hold', () => {
    const { git } = fakeGit({ verify: false });
    expect(restoreVersion(git, sha(1), 1)).toEqual({
      ok: false,
      branch: null,
      sha: null,
      reason: 'no such version in this repository',
    });
  });

  it('creates a new branch at the verified commit and reports its name', () => {
    const { git, calls } = fakeGit({});
    const result = restoreVersion(git, sha(1), 1_700_000_000_000);
    expect(result).toEqual({
      ok: true,
      branch: `autopilot/restore/${sha(1).slice(0, 7)}-1700000000000`,
      sha: sha(1),
      reason: null,
    });
    expect(calls).toEqual([
      ['rev-parse', '--verify', '--quiet', `${sha(1)}^{commit}`],
      ['branch', `autopilot/restore/${sha(1).slice(0, 7)}-1700000000000`, sha(1)],
    ]);
  });

  it('surfaces a git branch failure instead of throwing', () => {
    const { git } = fakeGit({
      branch: false,
      branchOutput: "fatal: a branch named 'x' already exists",
    });
    const result = restoreVersion(git, sha(1), 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("fatal: a branch named 'x' already exists");
  });
});

describe('gitRunnerFor (a real repository)', () => {
  const run = (dir: string, args: readonly string[]): string =>
    execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@localhost', ...args], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim();

  it('creates a new branch at a historical commit, leaving the current branch untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-restore-'));
    try {
      run(dir, ['init', '-q']);
      writeFileSync(join(dir, 'a.txt'), 'one');
      run(dir, ['add', 'a.txt']);
      run(dir, ['commit', '-q', '--no-gpg-sign', '-m', 'base']);
      const base = run(dir, ['rev-parse', 'HEAD']);
      writeFileSync(join(dir, 'a.txt'), 'two');
      run(dir, ['add', 'a.txt']);
      run(dir, ['commit', '-q', '--no-gpg-sign', '-m', 'second']);
      const head = run(dir, ['rev-parse', 'HEAD']);
      const beforeBranch = run(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);

      const result = restoreVersion(gitRunnerFor(dir), base, 1_700_000_000_000);

      expect(result.ok).toBe(true);
      expect(result.branch).toBe(`autopilot/restore/${base.slice(0, 7)}-1700000000000`);
      // Additive only: HEAD, the current branch, and every other ref are
      // exactly where they were — only a new branch appeared.
      expect(run(dir, ['rev-parse', 'HEAD'])).toBe(head);
      expect(run(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe(beforeBranch);
      expect(run(dir, ['rev-parse', result.branch as string])).toBe(base);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('answers ok:false, not a throw, for a sha the repository never held', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-restore-unknown-'));
    try {
      run(dir, ['init', '-q']);
      writeFileSync(join(dir, 'a.txt'), 'one');
      run(dir, ['add', 'a.txt']);
      run(dir, ['commit', '-q', '--no-gpg-sign', '-m', 'base']);

      const result = restoreVersion(gitRunnerFor(dir), sha(9), 1);
      expect(result).toEqual({
        ok: false,
        branch: null,
        sha: null,
        reason: 'no such version in this repository',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
