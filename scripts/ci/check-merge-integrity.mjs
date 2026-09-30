#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MERGE INTEGRITY — catches the merge that LIES about what it merged.
 *
 * A merge commit is a claim: "both parents' work is in here." `git merge
 * -s ours` records that claim while keeping only the first parent's tree,
 * so anything unique to the second parent is silently gone — and the
 * history says it was merged. Nothing in the repo could detect that.
 *
 * The claim was made for real on 2026-09-09: reconciling a working branch
 * after a rebase, `merge -s ours` was used to move it forward without a
 * force-push. That instance turned out to be harmless (the discarded
 * parent was a strictly older ancestor of the same work — proven by
 * diffing it against the result), but it was harmless by luck, not by
 * construction. Nothing would have said otherwise.
 *
 * The check: for every merge commit in the range, diff the merge against
 * each parent. If a parent contains content the merge does not, that
 * parent's work was dropped — the commit's claim is false. A normal merge
 * (`--no-ff`, the fleet's own sync-back fallback) always contains both
 * parents' content and passes.
 *
 * The second way a merge drops work is subtler, and it happened on
 * 2026-09-27: a lane merged the flight branch in, then REVERTED that
 * merge. Merging the lane back re-applied the revert to the flight branch
 * — `b3518be0` deleted gemini-guard.ts and about 1300 lines of landed
 * work. Its tree differs from both parents, so the `-s ours` signature
 * never fired and the check stayed green. So for every merge the check
 * also finds the reverts OF MERGES that the non-first parent brings in,
 * and fails when a line such a revert deleted is one the first parent
 * still had and the merge no longer does.
 *
 * Deliberately NOT a rule against merge commits: this repo's fleet
 * architecture produces them by design (see
 * `packages/engine/src/adapters/worktree.ts` — sync-back tries `--ff-only`
 * first and falls back to `--no-ff`), because never force-pushing a shared
 * flight branch is the stronger law. Merge commits are the deliberate
 * consequence. Merges that DISCARD are the actual defect.
 *
 * Usage:
 *   node scripts/ci/check-merge-integrity.mjs [<range>]
 *   node scripts/ci/check-merge-integrity.mjs origin/main~50..origin/main
 *
 * Defaults to the last 50 commits on HEAD — enough to cover any single
 * push, cheap enough to run on every CI job.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Merges this check caught after the fact whose loss was restored by hand,
 * each with the commits that restored it. History keeps the merge forever;
 * without this ledger a repaired incident would hold every gate red until
 * it scrolled out of the 50-commit window. An entry needs its repair LANDED
 * and every leftover line accounted for — never add one to quiet a live loss.
 */
const REPAIRED = new Map([
  [
    'b3518be0c863398cde228c092304e0bcf0a49547',
    'f8cf80bf + fd2e3cfa relanded 784 of its 835 lost lines; the other 51 were since rewritten',
  ],
]);

/** The distinct content lines a diff ADDS (`sign` '+') or REMOVES ('-'),
 *  ignoring blank lines and file headers. */
function changedLines(diff, sign) {
  const header = sign.repeat(3);
  return new Set(
    diff
      .split('\n')
      .filter((l) => l.startsWith(sign) && !l.startsWith(header))
      .map((l) => l.slice(1).trim())
      .filter(Boolean),
  );
}

/** What a side actually contributed. */
export const addedLines = (diff) => changedLines(diff, '+');
/** What a revert took away. */
export const removedLines = (diff) => changedLines(diff, '-');

/** A git runner bound to the repository at `cwd`. */
function gitIn(cwd) {
  return (args, input) =>
    execFileSync('git', args, {
      cwd,
      // Stryker disable next-line BooleanLiteral: it only hides the console window Windows opens for the child
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      input,
    });
}

/** Merge commits in the range, with their parent lists. */
function mergeCommits(git, range) {
  const out = git(['log', '--merges', '--format=%H %P', range]).trim();
  if (out === '') return [];
  return out.split('\n').map((line) => {
    const [sha, ...parents] = line.split(' ');
    return { sha, parents };
  });
}

/**
 * The `-s ours` signature, and the reason this check is precise rather
 * than merely suspicious: a `-s ours` merge's tree is BYTE-IDENTICAL to
 * its first parent's. Nothing from the other side survived.
 *
 * The naive version of this check — "does a parent have lines the merge
 * lacks?" — flags every conflicted `--no-ff` merge too, because choosing
 * one side of a conflict legitimately drops the other's lines. That is a
 * deliberate resolution, not a lie, and flagging it would be exactly the
 * cry-wolf failure the guard-precision doctrine names (a scanner whose
 * false positives train everyone to ignore it). Field-checked against
 * both: `2cf0e866` (the real `-s ours`) is identical to its first parent;
 * `e4ca24b0` (a real conflicted sync-back) is not.
 */
function treeIdenticalTo(git, merge, parent) {
  try {
    git(['diff', '--quiet', merge, parent]);
  } catch {
    return false;
  }
  return true;
}

/** Whether `rev` names a commit with a second parent. */
function isMerge(git, rev) {
  try {
    git(['rev-parse', '--verify', '--quiet', `${rev}^2`]);
  } catch {
    return false;
  }
  return true;
}

/**
 * The reverts OF MERGES that `parent` brings into a merge — commits on its
 * own first-parent line that the first parent lacks, whose message names a
 * reverted commit that is itself a merge. Reverting an ordinary commit is
 * ordinary work; reverting a merge withdraws everything that merge brought
 * in, and merging the reverting branch back re-applies that withdrawal to
 * whichever branch the merge came from — git's own "revert a faulty merge"
 * hazard, and the whole of the b3518be0 loss.
 *
 * `--first-parent` judges a revert where it ENTERS a branch. Without it,
 * the next landing of that branch carried the same revert again and was
 * flagged for 51 lines that were only regenerated data the branch had since
 * legitimately rewritten (5a2838a4, landing b3518be0's flight into main).
 */
function mergeRevertsBroughtBy(git, firstParent, parent) {
  return mergeRevertsIn(
    git,
    git(['log', '--first-parent', ...REVERT_LOG, `${firstParent}..${parent}`]),
  );
}

const REVERT_LOG = ['--no-merges', '--grep=This reverts commit ', '--format=%H%x1f%B%x1e'];

/** The `{ sha, reverted }` merge reverts in a `REVERT_LOG`-formatted log. The
 *  empty record after the last separator matches nothing and yields none. */
function mergeRevertsIn(git, out) {
  return out
    .split('\x1e')
    .map((record) => record.trim())
    .flatMap((record) => {
      const [sha] = record.split('\x1f');
      const match = /This reverts commit ([0-9a-f]{7,40})/.exec(record);
      return match !== null && isMerge(git, match[1]) ? [{ sha, reverted: match[1] }] : [];
    });
}

/**
 * Speed: a `git log` per merge cost minutes over the gate window's 322
 * merges on a loaded Windows machine. Two calls over the whole window find
 * the few merge reverts any merge can reach and every commit's first
 * parent; a merge pays for the precise walk only when one of those reverts
 * sits on an incoming parent's first-parent line.
 */
function carriedRevertIndex(git, merges) {
  const index = { reverts: new Set(), firstParent: new Map() };
  // Stryker disable next-line ConditionalExpression: a speed-up only — with no merge, nothing reads the index
  if (merges.length === 0) return index;
  const tips = merges.map(({ sha }) => sha).join('\n');
  for (const { sha } of mergeRevertsIn(git, git(['log', '--stdin', ...REVERT_LOG], tips))) {
    index.reverts.add(sha);
  }
  // Stryker disable next-line ConditionalExpression: a speed-up only — with no revert, no walk can find one
  if (index.reverts.size === 0) return index;
  for (const line of git(['rev-list', '--parents', '--stdin'], tips).split('\n')) {
    // A root commit (and the empty last line) maps to undefined: no parent.
    const [sha, parent] = line.split(' ');
    index.firstParent.set(sha, parent);
  }
  return index;
}

/** Whether a merge revert in `index` sits on `start`'s first-parent line. */
export function firstParentLineHasRevert(start, index) {
  for (let c = start; c !== undefined; c = index.firstParent.get(c)) {
    if (index.reverts.has(c)) return true;
  }
  return false;
}

/** Findings for a merge whose non-first parent carried a revert of a merge
 *  that deleted lines the first parent still had — and the merge lost. */
function droppedByCarriedRevert(git, sha, parents, index) {
  const findings = [];
  let absentFromMerge;
  // Stryker disable next-line EqualityOperator: parents[parents.length] is undefined, and no revert sits on its empty line
  for (let i = 1; i < parents.length; i += 1) {
    // Stryker disable next-line ConditionalExpression: the index is a speed-up only — the precise walk below reaches the same verdict
    if (!firstParentLineHasRevert(parents[i], index)) continue;
    for (const revert of mergeRevertsBroughtBy(git, parents[0], parents[i])) {
      absentFromMerge ??= addedLines(git(['diff', '--no-color', sha, parents[0]]));
      const deleted = removedLines(git(['diff', '--no-color', `${revert.sha}^`, revert.sha]));
      const lost = [...deleted].filter((line) => absentFromMerge.has(line));
      if (lost.length === 0) continue;
      findings.push({
        sha,
        parent: parents[i],
        index: i,
        revert,
        lines: lost.length,
        sample: lost.slice(0, 3),
      });
    }
  }
  return findings;
}

/** Findings for a `-s ours` merge that discarded what a parent added. */
function droppedByOursStrategy(git, sha, parents) {
  const findings = [];
  // Cheap pre-filter: only a merge whose tree is exactly its first
  // parent's took nothing from the other side.
  if (!treeIdenticalTo(git, sha, parents[0])) return findings;

  for (let i = 1; i < parents.length; i += 1) {
    const parent = parents[i];
    // THE DECISIVE TEST. Two earlier attempts got this wrong, and both
    // wrongs are worth naming because they are the natural ones to make:
    //
    //   1. "Does the parent have lines the merge lacks?" — flagged 14 of
    //      this repo's 90 merges, every one a false positive. A lane that
    //      is merely BEHIND on some file has old content the merge
    //      legitimately superseded.
    //   2. Comparing against the branch TIP instead of the merge — made
    //      the answer depend on which branch you ran from. The same
    //      commit passed on main and failed on PR #34, where unrelated
    //      files legitimately differ. A check whose verdict changes with
    //      the checkout is not a check.
    //
    // The question is only ever about ONE commit and its own parents:
    // what did this parent ADD since the merge base, and is that in the
    // merge's tree? Already-applied work is in the tree via the first
    // parent and passes; a `-s ours` discard is not and fails. No branch
    // tip is consulted, so the verdict is identical everywhere.
    const base = git(['merge-base', parents[0], parent]).trim();
    const contributed = addedLines(git(['diff', '--no-color', base, parent]));
    // Stryker disable next-line ConditionalExpression: a speed-up only — nothing contributed, nothing can be lost
    if (contributed.size === 0) continue;
    const absentFromMerge = addedLines(git(['diff', '--no-color', sha, parent]));
    const lost = [...contributed].filter((line) => absentFromMerge.has(line));
    if (lost.length === 0) continue;
    findings.push({ sha, parent, index: i, lines: lost.length, sample: lost.slice(0, 3) });
  }
  return findings;
}

/** What the check prints — `out` to stdout, `err` to stderr — and its exit code. */
function report(git, allFindings, merges, range, repaired) {
  const subject = (sha) => git(['log', '-1', '--format=%s', sha]).trim();
  const findings = allFindings.filter((f) => !repaired.has(f.sha));
  const out = [];
  const err = [];

  if (findings.length === 0) {
    out.push(`✓ merge integrity OK — every merge in ${range} contains both parents' work`);
    out.push(`  (${merges.length} merge commit(s) checked)`);
    // Every finding left here is one the ledger acknowledges.
    for (const sha of new Set(allFindings.map((f) => f.sha))) {
      out.push(`  ${sha.slice(0, 8)} dropped work, acknowledged as repaired: ${repaired.get(sha)}`);
    }
    return { code: 0, out, err };
  }

  err.push(`✗ ${findings.length} merge commit(s) dropped a parent's work in ${range}\n`);
  for (const f of findings) {
    err.push(`  ${f.sha.slice(0, 8)}  ${subject(f.sha)}`);
    if (f.revert === undefined) {
      err.push(
        `    parent ${f.index} (${f.parent.slice(0, 8)}) has ${f.lines} line(s) it ADDED that this merge does not contain:`,
      );
    } else {
      err.push(
        `    parent ${f.index} (${f.parent.slice(0, 8)}) carries ${f.revert.sha.slice(0, 8)}, a revert of merge ${f.revert.reverted.slice(0, 8)},`,
        `    which deleted ${f.lines} line(s) the first parent still had — this merge re-applied it:`,
      );
    }

    for (const c of f.sample) err.push(`      ${c.slice(0, 90)}`);
    if (f.revert === undefined) {
      err.push('    A merge commit claims both parents are included. Re-merge without -s ours,');
    } else {
      err.push(
        '    Merging a branch that reverted a merge re-applies the revert. Revert the',
        '    revert on that branch before merging it back,',
      );
    }
    err.push('    or land the missing work as its own commit.\n');
  }
  return { code: 1, out, err };
}

/**
 * The whole check over `range` in the repository at `cwd`: the lines it
 * prints and the exit code it ends with. Exported so the tests run it
 * in-process: Stryker switches a mutant on inside the test process only, so
 * while the tests ran this script as a child process none reached it, and
 * the nightly run of 2026-09-29 counted 242 survivors here.
 */
export function checkMergeIntegrity({
  range = 'HEAD~50..HEAD',
  cwd = process.cwd(),
  repaired = REPAIRED,
} = {}) {
  const git = gitIn(cwd);
  // `git log --merges` lists only commits with 2+ parents, and both checks
  // walk parents[1..] — a lone parent would simply yield no findings.
  const merges = mergeCommits(git, range);
  const index = carriedRevertIndex(git, merges);
  const findings = merges.flatMap(({ sha, parents }) => [
    ...droppedByOursStrategy(git, sha, parents),
    ...droppedByCarriedRevert(git, sha, parents, index),
  ]);
  return report(git, findings, merges, range, repaired);
}

// Stryker disable all: the process shell — it prints what checkMergeIntegrity
// returns. merge-integrity.test.ts runs that in-process, and runs this shell
// end-to-end as a child process too.
function main() {
  const { code, out, err } = checkMergeIntegrity({ range: process.argv[2] });
  for (const line of out) console.log(line);
  for (const line of err) console.error(line);
  process.exitCode = code;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
// Stryker restore all
