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

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** A shallow clone lacks the incident; only a full history can replay it. */
const HAS_B3518BE0 = (() => {
  try {
    execFileSync('git', ['cat-file', '-e', 'b3518be0^{commit}'], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

let repo: string;

function git(args: readonly string[], cwd = repo): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function commit(file: string, body: string, message: string): void {
  writeFileSync(join(repo, file), body, 'utf8');
  git(['add', file]);
  git(['commit', '-q', '--no-verify', '-m', message]);
}

/** Runs the guard and returns its exit code + combined output. Omitting
 *  `range` exercises the script's own default (HEAD~50..HEAD). */
function runGuard(range?: string, cwd = repo): { code: number; output: string } {
  const args = range === undefined ? [SCRIPT] : [SCRIPT, range];
  try {
    return {
      code: 0,
      output: execFileSync(process.execPath, args, { cwd, encoding: 'utf8' }),
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

  it('gives the SAME verdict from any branch — the check consults no tip', () => {
    // The design flaw that broke PR #34's CI: measuring against whatever
    // branch you ran from made one commit pass on main and fail on a PR,
    // where unrelated files legitimately differ. The verdict must depend
    // only on the merge and its own parents.
    git(['checkout', '-q', '-b', 'lane']);
    commit('lane-only.txt', 'lane work\n', 'feat: lane work');
    git(['checkout', '-q', 'main']);
    commit('main.txt', 'main work\n', 'feat: main work');
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: sync lane', 'lane']);
    const fromMain = runGuard('HEAD~2..HEAD');

    // A second branch that diverges afterwards — an unrelated PR.
    git(['checkout', '-q', '-b', 'other']);
    commit('lane-only.txt', 'a different edit entirely\n', 'feat: other work');
    const fromOther = runGuard('HEAD~3..HEAD');

    expect(fromMain.code).toBe(0);
    expect(fromOther.code).toBe(0);
  });

  it('FAILS a sync-back that carries a lane revert of a merge — the b3518be0 shape', () => {
    // A lane merged the flight branch in, then reverted that merge. Merging
    // the lane back re-applies the revert to the flight branch: everything
    // the reverted merge brought in is deleted there. The tree differs from
    // both parents, so the `-s ours` signature never fires — b3518be0 dropped
    // gemini-guard.ts and about 1300 lines of landed work this way, green.
    git(['checkout', '-q', '-b', 'lane']);
    commit('lane-only.txt', 'lane work\n', 'feat: lane work');
    git(['checkout', '-q', 'main']);
    commit('guard.ts', 'export const flightGuard = true;\n', 'feat: flight guard');
    git(['checkout', '-q', 'lane']);
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: merge main into lane', 'main']);
    git(['revert', '--no-edit', '-m', '1', 'HEAD']);
    git(['checkout', '-q', 'main']);
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: sync lane', 'lane']);

    const { code, output } = runGuard('HEAD~1..HEAD');

    expect(code).toBe(1);
    expect(output).toContain('dropped a parent');
    expect(output).toContain('revert of merge');
    expect(output).toContain('export const flightGuard = true;');
  });

  it('PASSES a lane revert of a merge whose content the first parent never had', () => {
    // The lane merged a side branch, then thought better of it. The revert
    // deletes only the side branch's lines, which the flight branch never
    // carried — the sync-back loses nothing.
    git(['checkout', '-q', '-b', 'side']);
    commit('side.txt', 'side experiment\n', 'feat: side experiment');
    git(['checkout', '-q', 'main']);
    git(['checkout', '-q', '-b', 'lane']);
    commit('lane-only.txt', 'lane work\n', 'feat: lane work');
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: merge side into lane', 'side']);
    git(['revert', '--no-edit', '-m', '1', 'HEAD']);
    git(['checkout', '-q', 'main']);
    commit('main.txt', 'main work\n', 'feat: main work');
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: sync lane', 'lane']);

    const { code, output } = runGuard('HEAD~1..HEAD');

    expect(code).toBe(0);
    expect(output).toContain('merge integrity OK');
  });

  it('PASSES a lane that reverted the merge and then reverted the revert', () => {
    // Undoing the revert restores the merge's content before the sync-back,
    // so the merge keeps everything the first parent had.
    git(['checkout', '-q', '-b', 'lane']);
    commit('lane-only.txt', 'lane work\n', 'feat: lane work');
    git(['checkout', '-q', 'main']);
    commit('guard.ts', 'export const flightGuard = true;\n', 'feat: flight guard');
    git(['checkout', '-q', 'lane']);
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: merge main into lane', 'main']);
    git(['revert', '--no-edit', '-m', '1', 'HEAD']);
    git(['revert', '--no-edit', 'HEAD']);
    git(['checkout', '-q', 'main']);
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: sync lane', 'lane']);

    const { code, output } = runGuard('HEAD~1..HEAD');

    expect(code).toBe(0);
    expect(output).toContain('merge integrity OK');
  });

  it('PASSES a lane revert of an ordinary commit — only merge reverts carry the hazard', () => {
    // Reverting one of the lane's own commits is ordinary work: the lines it
    // removes were the lane's, never the first parent's.
    git(['checkout', '-q', '-b', 'lane']);
    commit('lane-only.txt', 'a lane misstep\n', 'feat: lane misstep');
    git(['revert', '--no-edit', 'HEAD']);
    commit('lane-next.txt', 'lane work\n', 'feat: lane work');
    git(['checkout', '-q', 'main']);
    commit('main.txt', 'main work\n', 'feat: main work');
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: sync lane', 'lane']);

    const { code, output } = runGuard('HEAD~1..HEAD');

    expect(code).toBe(0);
    expect(output).toContain('merge integrity OK');
  });

  it.skipIf(!HAS_B3518BE0)(
    'catches the REAL b3518be0 loss and reports it as repaired, not live',
    () => {
      // The incident itself, read from this repo's history: the acknowledged
      // line prints only when the finding was detected, so this pins both
      // the detection and the ledger that keeps a repaired merge off the gate.
      const { code, output } = runGuard('b3518be0^1..b3518be0', ROOT);

      expect(code).toBe(0);
      expect(output).toContain('b3518be0 dropped work, acknowledged as repaired');
    },
  );

  it('PASSES a history with no merges at all', () => {
    commit('a.txt', 'a\n', 'chore: a');

    expect(runGuard('HEAD~1..HEAD').code).toBe(0);
  });

  it('uses its own HEAD~50..HEAD default when no range argument is given', () => {
    // A -s ours merge that discarded real work, then buried outside the
    // default 50-commit window by enough padding commits. The default
    // pins BOTH the "50" and the "HEAD~..HEAD" shape: a narrower or wider
    // window, or a malformed one, would either still catch this merge or
    // error on a bad revision — either way this test would fail.
    // The 55 padding commits go in through ONE `git fast-import` stream:
    // committing them one by one spawned ~110 git processes and timed out
    // at 20s on a loaded Windows CI runner (main, 2026-09-26).
    git(['checkout', '-q', '-b', 'lane']);
    commit('lane-only.txt', 'work nobody else has\n', 'feat: lane work');
    git(['checkout', '-q', 'main']);
    commit('main.txt', 'main work\n', 'feat: main work');
    git(['merge', '-q', '-s', 'ours', '--no-edit', '-m', 'chore: absorb lane', 'lane']);
    const stream = Array.from({ length: 55 }, (_, i) => {
      const message = `chore: pad ${i}\n`;
      const content = `pad ${i}\n`;
      return [
        'commit refs/heads/main',
        `committer t <t@example.invalid> ${1_700_000_000 + i} +0000`,
        `data ${Buffer.byteLength(message)}`,
        message.slice(0, -1),
        ...(i === 0 ? ['from refs/heads/main^0'] : []),
        `M 100644 inline pad-${i}.txt`,
        `data ${Buffer.byteLength(content)}`,
        content.slice(0, -1),
        '',
      ].join('\n');
    }).join('');
    execFileSync('git', ['fast-import', '--quiet', '--force'], { cwd: repo, input: stream });
    git(['reset', '-q', '--hard', 'main']);

    const { code, output } = runGuard();

    expect(code).toBe(0);
    expect(output).toContain('merge integrity OK');
  });
});
