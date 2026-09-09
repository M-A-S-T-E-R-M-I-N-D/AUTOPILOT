// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MERGE INTEGRITY guard — both corpora.
 *
 * A merge commit claims "both parents' work is in here". `git merge
 * -s ours` records that claim while keeping only the first parent's tree.
 * Nothing in this repo could detect it until the claim was made for real
 * (2026-09-09, reconciling a working branch after a rebase).
 *
 * Two things must be true of the check, and the second is the one that
 * nearly shipped broken:
 *
 *  1. TRUE POSITIVE — a real `-s ours` that discards unique work fails it.
 *  2. NEGATIVE CORPUS — the merges this repo produces BY DESIGN pass. The
 *     fleet's sync-back falls back to `--no-ff` (worktree.ts), and an
 *     already-applied lane produces a merge whose tree equals its first
 *     parent's while the lane still carries its own commits. Run over this
 *     repo's real history, the tree-identity heuristic alone flagged 14
 *     such merges — every one a false positive, proven by `git cherry`.
 *     A guard with fourteen false alarms and no true ones trains everyone
 *     to ignore it (FAILURE-DOCTRINE row 6).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../../../../scripts/ci/check-merge-integrity.mjs', import.meta.url),
);

let repo: string;

function git(args: readonly string[], cwd = repo): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function commit(file: string, body: string, message: string): void {
  writeFileSync(join(repo, file), body, 'utf8');
  git(['add', file]);
  git(['commit', '-q', '--no-verify', '-m', message]);
}

/** Runs the guard and returns its exit code + combined output. */
function runGuard(range: string): { code: number; output: string } {
  try {
    return {
      code: 0,
      output: execFileSync(process.execPath, [SCRIPT, range], { cwd: repo, encoding: 'utf8' }),
    };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('check-merge-integrity', () => {
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'ap-merge-integrity-'));
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    git(['config', 'commit.gpgsign', 'false']);
    commit('base.txt', 'base\n', 'chore: base');
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('FAILS a -s ours merge that discarded work present on no other branch', () => {
    git(['checkout', '-q', '-b', 'lane']);
    commit('lane-only.txt', 'work nobody else has\n', 'feat: lane work');
    git(['checkout', '-q', 'main']);
    commit('main.txt', 'main work\n', 'feat: main work');
    git(['merge', '-q', '-s', 'ours', '--no-edit', '-m', 'chore: absorb lane', 'lane']);

    const { code, output } = runGuard('HEAD~2..HEAD');

    expect(code).toBe(1);
    expect(output).toContain('dropped a parent');
    expect(output).toContain('lane-only.txt');
    expect(output).toContain('work nobody else has');
  });

  it('PASSES the ordinary --no-ff merge the fleet sync-back falls back to', () => {
    git(['checkout', '-q', '-b', 'lane']);
    commit('lane-only.txt', 'lane work\n', 'feat: lane work');
    git(['checkout', '-q', 'main']);
    commit('main.txt', 'main work\n', 'feat: main work');
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: sync lane', 'lane']);

    const { code, output } = runGuard('HEAD~2..HEAD');

    expect(code).toBe(0);
    expect(output).toContain('merge integrity OK');
  });

  it('PASSES an identical-tree merge whose lane work was ALREADY APPLIED — the 14 real ones', () => {
    // The exact shape this repo's history carries: a lane commit that
    // already landed on the branch by another route, then merged. The
    // merge legitimately changes nothing, and the tree matches the first
    // parent — the heuristic that alone would have cried wolf 14 times.
    git(['checkout', '-q', '-b', 'lane']);
    commit('shared.txt', 'the same change\n', 'feat: shared change');
    git(['checkout', '-q', 'main']);
    // Same content, different commit — an independent reland.
    commit('shared.txt', 'the same change\n', 'feat: shared change (relanded)');
    git([
      'merge',
      '-q',
      '-s',
      'ours',
      '--no-edit',
      '-m',
      'chore: absorb already-applied lane',
      'lane',
    ]);

    const { code, output } = runGuard('HEAD~2..HEAD');

    expect(code).toBe(0);
    expect(output).toContain('merge integrity OK');
  });

  it('PASSES a history with no merges at all', () => {
    commit('a.txt', 'a\n', 'chore: a');

    expect(runGuard('HEAD~1..HEAD').code).toBe(0);
  });
});
