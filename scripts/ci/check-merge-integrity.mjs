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

const range = process.argv[2] ?? 'HEAD~50..HEAD';

/** The distinct content lines a diff ADDS, ignoring blank and file
 *  headers — the unit of "what this side actually contributed". */
function addedLines(diff) {
  return new Set(
    diff
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1).trim())
      .filter(Boolean),
  );
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** Merge commits in the range, with their parent lists. */
function mergeCommits() {
  const out = git(['log', '--merges', '--format=%H %P', range]).trim();
  if (out === '') return [];
  return out.split('\n').map((line) => {
    const [sha, ...parents] = line.trim().split(/\s+/);
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
function treeIdenticalTo(merge, parent) {
  try {
    git(['diff', '--quiet', merge, parent]);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const merges = mergeCommits();
  const findings = [];

  for (const { sha, parents } of merges) {
    // Cheap pre-filter: only a merge whose tree is exactly its first
    // parent's took nothing from the other side.
    if (parents.length < 2 || !treeIdenticalTo(sha, parents[0])) continue;

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
      if (contributed.size === 0) continue;
      const absentFromMerge = addedLines(git(['diff', '--no-color', sha, parent]));
      const lost = [...contributed].filter((line) => absentFromMerge.has(line));
      if (lost.length === 0) continue;
      findings.push({ sha, parent, index: i, lines: lost.length, sample: lost.slice(0, 3) });
    }
  }

  const subject = (sha) => git(['log', '-1', '--format=%s', sha]).trim();

  if (findings.length === 0) {
    console.log(`✓ merge integrity OK — every merge in ${range} contains both parents' work`);
    console.log(`  (${merges.length} merge commit(s) checked)`);
    return;
  }

  console.error(`✗ ${findings.length} merge commit(s) dropped a parent's work in ${range}\n`);
  for (const f of findings) {
    console.error(`  ${f.sha.slice(0, 8)}  ${subject(f.sha)}`);
    console.error(
      `    parent ${f.index} (${f.parent.slice(0, 8)}) has ${f.lines} line(s) it ADDED that this merge does not contain:`,
    );

    for (const c of f.sample) console.error(`      ${c.slice(0, 90)}`);
    console.error('    A merge commit claims both parents are included. Re-merge without -s ours,');
    console.error('    or land the missing work as its own commit.\n');
  }
  process.exitCode = 1;
}

main();
