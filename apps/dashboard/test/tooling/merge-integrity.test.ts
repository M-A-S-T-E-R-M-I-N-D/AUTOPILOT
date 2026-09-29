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
 *
 * The check runs IN-PROCESS here, with its whole report pinned line by line:
 * Stryker switches a mutant on inside the test process only, so while these
 * tests ran the script as a child process no mutant ever reached it (the
 * 2026-09-29 nightly: 242 survivors). One test still runs the CLI end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  addedLines,
  checkMergeIntegrity,
  firstParentLineHasRevert,
  removedLines,
} from '../../../../scripts/ci/check-merge-integrity.mjs';

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

/** Four lines, so the report's three-line sample leaves one out; the second
 *  is longer than the 90 characters a sample line prints. */
const LANE_WORK = [
  'work nobody else has',
  `a line longer than the report prints, so it is cut short ${'.'.repeat(60)}`,
  'third line of lane work',
  'a fourth line the sample leaves out',
];

const GUARD = [
  'export const flightGuard = true;',
  'export const flightGuardVersion = 2;',
  "export const flightGuardOwner = 'flight';",
  'export default flightGuard;',
];

let repo: string;

function git(args: readonly string[], cwd = repo): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function commit(file: string, body: string, message: string): void {
  writeFileSync(join(repo, file), body, 'utf8');
  git(['add', file]);
  git(['commit', '-q', '--no-verify', '-m', message]);
}

/** How the report names a commit: the first 8 characters of its SHA. */
function short(rev: string): string {
  return git(['rev-parse', rev]).trim().slice(0, 8);
}

/** Runs the check in-process. Omitting `range` exercises its own default. */
function check(range?: string, cwd = repo) {
  return checkMergeIntegrity({ range, cwd });
}

/** The whole report of a range whose every merge kept both parents' work. */
function passed(range: string, merges: number) {
  return {
    code: 0,
    out: [
      `✓ merge integrity OK — every merge in ${range} contains both parents' work`,
      `  (${merges} merge commit(s) checked)`,
    ],
    err: [],
  };
}

/** Runs the CLI as a child process and returns its exit code + combined
 *  output. Omitting `range` exercises the CLI's own default. */
function runCli(range?: string, cwd = repo): { code: number; output: string } {
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

/** main takes a lane's unique work by a `-s ours` merge that keeps none of it. */
function absorbLaneWithOurs(): void {
  git(['checkout', '-q', '-b', 'lane']);
  commit('lane-only.txt', `${LANE_WORK.join('\n')}\n`, 'feat: lane work');
  git(['checkout', '-q', 'main']);
  commit('main.txt', 'main work\n', 'feat: main work');
  git(['merge', '-q', '-s', 'ours', '--no-edit', '-m', 'chore: absorb lane', 'lane']);
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
    absorbLaneWithOurs();

    expect(check('HEAD~2..HEAD')).toEqual({
      code: 1,
      out: [],
      err: [
        "✗ 1 merge commit(s) dropped a parent's work in HEAD~2..HEAD\n",
        `  ${short('HEAD')}  chore: absorb lane`,
        `    parent 1 (${short('lane')}) has 4 line(s) it ADDED that this merge does not contain:`,
        '      work nobody else has',
        `      ${LANE_WORK[1]!.slice(0, 90)}`,
        '      third line of lane work',
        '    A merge commit claims both parents are included. Re-merge without -s ours,',
        '    or land the missing work as its own commit.\n',
      ],
    });
  });

  it('prints the same verdict from the command line, and exits with its code', () => {
    absorbLaneWithOurs();

    const { code, output } = runCli('HEAD~2..HEAD');

    expect(code).toBe(1);
    expect(output).toContain('dropped a parent');
    expect(output).toContain('work nobody else has');
  });

  it('acknowledges a discard its repaired ledger names instead of failing on it', () => {
    absorbLaneWithOurs();
    const merge = git(['rev-parse', 'HEAD']).trim();

    const result = checkMergeIntegrity({
      range: 'HEAD~2..HEAD',
      cwd: repo,
      repaired: new Map([[merge, 'relanded by hand']]),
    });

    const ok = passed('HEAD~2..HEAD', 1);
    expect(result).toEqual({
      ...ok,
      out: [
        ...ok.out,
        `  ${merge.slice(0, 8)} dropped work, acknowledged as repaired: relanded by hand`,
      ],
    });
  });

  it('PASSES the ordinary --no-ff merge the fleet sync-back falls back to', () => {
    git(['checkout', '-q', '-b', 'lane']);
    commit('lane-only.txt', 'lane work\n', 'feat: lane work');
    git(['checkout', '-q', 'main']);
    commit('main.txt', 'main work\n', 'feat: main work');
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: sync lane', 'lane']);

    expect(check('HEAD~2..HEAD')).toEqual(passed('HEAD~2..HEAD', 1));
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

    expect(check('HEAD~2..HEAD')).toEqual(passed('HEAD~2..HEAD', 1));
  });

  it("PASSES a conflicted --no-ff merge resolved to its first parent's side — the e4ca24b0 shape", () => {
    // Choosing one side of a conflict drops the other side's lines on
    // purpose. The lane's other work did come in, so the tree is not the
    // first parent's: a resolution, not a `-s ours` discard.
    commit('shared.txt', 'shared\n', 'chore: shared');
    git(['checkout', '-q', '-b', 'lane']);
    commit('shared.txt', 'lane version\n', 'feat: lane edit');
    commit('lane-only.txt', 'lane work\n', 'feat: lane work');
    git(['checkout', '-q', 'main']);
    commit('shared.txt', 'main version\n', 'feat: main edit');
    git(['merge', '-q', '--no-ff', '-X', 'ours', '--no-edit', '-m', 'chore: sync lane', 'lane']);

    expect(check('HEAD~1..HEAD')).toEqual(passed('HEAD~1..HEAD', 1));
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
    const fromMain = check('HEAD~2..HEAD');

    // A second branch that diverges afterwards — an unrelated PR.
    git(['checkout', '-q', '-b', 'other']);
    commit('lane-only.txt', 'a different edit entirely\n', 'feat: other work');
    const fromOther = check('HEAD~3..HEAD');

    expect(fromMain.code).toBe(0);
    expect(fromOther.code).toBe(0);
  });

  it('FAILS a sync-back that carries a lane revert of a merge — the b3518be0 shape — from any checkout', () => {
    // A lane merged the flight branch in, then reverted that merge. Merging
    // the lane back re-applies the revert to the flight branch: everything
    // the reverted merge brought in is deleted there. The tree differs from
    // both parents, so the `-s ours` signature never fires — b3518be0 dropped
    // gemini-guard.ts and about 1300 lines of landed work this way, green.
    git(['checkout', '-q', '-b', 'lane']);
    commit('lane-only.txt', 'lane work\n', 'feat: lane work');
    git(['checkout', '-q', 'main']);
    commit('guard.ts', `${GUARD.join('\n')}\n`, 'feat: flight guard');
    git(['checkout', '-q', 'lane']);
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: merge main into lane', 'main']);
    git(['revert', '--no-edit', '-m', '1', 'HEAD']);
    const revert = short('HEAD');
    const reverted = short('HEAD^');
    // Work after the revert, whose message only QUOTES a revert line: the
    // revert is neither the lane's tip nor the first commit its log lists.
    commit('notes.txt', 'lane notes\n', 'docs: what "This reverts commit <sha>" means');
    git(['checkout', '-q', 'main']);
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: sync lane', 'lane']);
    const report = {
      code: 1,
      out: [],
      err: [
        "✗ 1 merge commit(s) dropped a parent's work in main~2..main\n",
        `  ${short('main')}  chore: sync lane`,
        `    parent 1 (${short('lane')}) carries ${revert}, a revert of merge ${reverted},`,
        '    which deleted 4 line(s) the first parent still had — this merge re-applied it:',
        ...GUARD.slice(0, 3).map((line) => `      ${line}`),
        '    Merging a branch that reverted a merge re-applies the revert. Revert the',
        '    revert on that branch before merging it back,',
        '    or land the missing work as its own commit.\n',
      ],
    };

    // The window holds two merges: the lane's own merge of main is judged too.
    expect(check('main~2..main')).toEqual(report);
    // Judged by the range alone, from a checkout that holds none of it.
    git(['checkout', '-q', '-b', 'elsewhere', 'main~2']);
    expect(check('main~2..main')).toEqual(report);
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

    // Two merges: the lane's own merge of side sits in the window too.
    expect(check('HEAD~1..HEAD')).toEqual(passed('HEAD~1..HEAD', 2));
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

    // Two merges: the lane's own merge of main sits in the window too.
    expect(check('HEAD~1..HEAD')).toEqual(passed('HEAD~1..HEAD', 2));
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

    expect(check('HEAD~1..HEAD')).toEqual(passed('HEAD~1..HEAD', 1));
  });

  it('PASSES a lane revert of an ordinary commit the first parent has — an undo merged on purpose', () => {
    // This revert deletes lines the first parent still has, as a merge
    // revert does — but undoing one commit is what a revert is for, and
    // merging it back is how the undo lands. Only a revert OF A MERGE
    // withdraws work nobody chose to withdraw.
    commit('feature.txt', 'a feature\n', 'feat: a feature');
    git(['checkout', '-q', '-b', 'lane']);
    git(['revert', '--no-edit', 'HEAD']);
    git(['checkout', '-q', 'main']);
    commit('main.txt', 'main work\n', 'feat: main work');
    git(['merge', '-q', '--no-ff', '--no-edit', '-m', 'chore: sync lane', 'lane']);

    expect(check('HEAD~1..HEAD')).toEqual(passed('HEAD~1..HEAD', 1));
  });

  it.skipIf(!HAS_B3518BE0)(
    'catches the REAL b3518be0 loss and reports it as repaired, not live',
    () => {
      // The incident itself, read from this repo's history: the acknowledged
      // line prints only when the finding was detected, so this pins both
      // the detection and the ledger that keeps a repaired merge off the gate.
      const { code, out } = check('b3518be0^1..b3518be0', ROOT);

      expect(code).toBe(0);
      expect(out.join('\n')).toContain('b3518be0 dropped work, acknowledged as repaired');
    },
  );

  it('PASSES a history with no merges at all', () => {
    commit('a.txt', 'a\n', 'chore: a');

    expect(check('HEAD~1..HEAD')).toEqual(passed('HEAD~1..HEAD', 0));
  });

  it('uses its own HEAD~50..HEAD default when no range argument is given', () => {
    // A -s ours merge that discarded real work, then buried outside the
    // default 50-commit window by enough padding commits: a wider window
    // would catch it, and the report names the exact window it checked.
    // The 55 padding commits go in through ONE `git fast-import` stream:
    // committing them one by one spawned ~110 git processes and timed out
    // at 20s on a loaded Windows CI runner (main, 2026-09-26).
    absorbLaneWithOurs();
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

    expect(check()).toEqual(passed('HEAD~50..HEAD', 0));
    const cli = runCli();
    expect(cli.code).toBe(0);
    expect(cli.output).toContain('every merge in HEAD~50..HEAD');
  });
});

describe('addedLines / removedLines', () => {
  const DIFF = [
    'diff --git a/f.txt b/f.txt',
    'index 1111111..2222222 100644',
    '--- a/f.txt',
    '+++ b/f.txt',
    '@@ -1,4 +1,4 @@',
    ' kept',
    '-old line',
    '-  old line',
    '+  new line  ',
    '+',
    '+new line',
    '',
  ].join('\n');

  it('reads the distinct, trimmed content lines a diff adds or removes — never a header or a blank', () => {
    expect([...addedLines(DIFF)]).toEqual(['new line']);
    expect([...removedLines(DIFF)]).toEqual(['old line']);
  });
});

describe('firstParentLineHasRevert', () => {
  // c3 → c2 → c1 is one first-parent line, with a revert at its far end;
  // m → x is another, with none. r is a revert that is its own start.
  const index = {
    reverts: new Set(['c1', 'r']),
    firstParent: new Map<string, string | undefined>([
      ['c3', 'c2'],
      ['c2', 'c1'],
      ['c1', undefined],
      ['m', 'x'],
    ]),
  };

  it('finds a revert anywhere up the first-parent line, its start included', () => {
    expect(firstParentLineHasRevert('c3', index)).toBe(true);
    expect(firstParentLineHasRevert('r', index)).toBe(true);
  });

  it('finds none on a line that holds none', () => {
    expect(firstParentLineHasRevert('m', index)).toBe(false);
  });
});
