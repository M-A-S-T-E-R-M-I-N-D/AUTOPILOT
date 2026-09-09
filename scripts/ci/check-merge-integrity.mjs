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

/** The tip of a range — what `git cherry` measures "already applied"
 *  against. `a..b` measures against b; a bare ref measures against it. */
function headOf(r) {
  const parts = r.split('..');
  return parts.length === 2 && parts[1] ? parts[1] : r;
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
      // THE DECISIVE TEST, and the reason the pre-filter alone is not
      // enough: an identical tree usually means the other side's work was
      // ALREADY APPLIED — relanded, cherry-picked, or landed by a sibling
      // lane first. Merging it then legitimately changes nothing. Run
      // against this repo's real history the pre-filter alone flagged 14
      // merges, every one of them a false positive. A guard with fourteen
      // false alarms and no true ones trains everyone to ignore it
      // (guard-precision doctrine, FAILURE-DOCTRINE row 6).
      //
      // `git cherry` cannot answer this: the merge makes the parent
      // reachable, so it reports every one of its commits as "applied"
      // even when the content was discarded. The honest question is about
      // the TREE, at the branch tip, restricted to the files the parent's
      // own commits touched: is their work still there?
      const files = git(['diff', '--name-only', `${parents[0]}...${parent}`])
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
      if (files.length === 0) continue;
      const lost = git(['diff', '--no-color', headOf(range), parent, '--', ...files])
        .split('\n')
        .filter((line) => line.startsWith('+') && !line.startsWith('+++'));
      if (lost.length === 0) continue;
      findings.push({
        sha,
        parent,
        index: i,
        lines: lost.length,
        files,
        sample: lost.slice(0, 3),
      });
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
      `    parent ${f.index} (${f.parent.slice(0, 8)}) has ${f.lines} line(s) MISSING from the branch tip:`,
    );
    console.error(`    files it touched: ${f.files.slice(0, 5).join(', ')}`);
    for (const c of f.sample) console.error(`      ${c.slice(0, 90)}`);
    console.error('    A merge commit claims both parents are included. Re-merge without -s ours,');
    console.error('    or land the missing work as its own commit.\n');
  }
  process.exitCode = 1;
}

main();
