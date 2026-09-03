// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MERGE-INTEGRITY AUDIT for fleet sync-backs (operator ritual, run after
 * every fleet collection): proves no lane's work was silently dropped by a
 * `chore: sync <lane> into <target>` merge. For every such merge in the
 * given range it finds the OVERLAP files — paths BOTH parents changed since
 * their merge base, the only place a merge can lose work — and classifies
 * each by comparing the merged blob against the two parents' blobs:
 *
 *   LANE-WON    — result equals the lane side (target's change was older
 *                 context the lane had already absorbed; nothing lost).
 *   COMBINED    — result equals NEITHER side: a genuine 3-way combination
 *                 (regions from both), a `merge=union` absorption, a rerere
 *                 replay, or a manual resolution. Both contributions are in
 *                 the result by construction; the converged gate (full test
 *                 suite) is what validates the combination semantically.
 *   TARGET-WON  — result equals the target side while the LANE had changed
 *                 the file: the lane's change is ABSENT from the merge.
 *                 This is the silent-loss signature the audit exists to
 *                 catch. Exit code 1.
 *
 * Usage:  node scripts/audit-sync-merges.mjs [<since-ref>] [<until-ref>]
 * Defaults: since = the merge-range heuristic `HEAD~200`, until = HEAD.
 * Read-only — touches nothing, safe to run mid-flight.
 *
 * Born 2026-09-03: the first 8-lane self-healing round (rerere +
 * `merge=union`, packages/engine/src/adapters/worktree.ts) collected with
 * exactly one manual resolution, and this audit ran as a one-off shell loop
 * to prove zero TARGET-WON cases across every sync merge of the round.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** Blob id of `path` at `ref`, or null when the path is absent there. */
function blobAt(ref, path) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${ref}:${path}`]) || null;
  } catch {
    return null;
  }
}

function changedSince(base, ref) {
  const out = git(['diff', '--name-only', base, ref]);
  return out === '' ? [] : out.split('\n');
}

/**
 * Classifies one overlap file's merge outcome from its three blob ids — the
 * exact decision the silent-loss guarantee rests on (see the file header for
 * what each class means). Checks `laneBlob` first, same order the original
 * inline `if`/`else if` used, so a file both sides happen to have changed to
 * IDENTICAL content (mergedBlob equals both parents) reads as LANE-WON, not
 * TARGET-WON — there is nothing to lose either way, but the tie-break must
 * stay pinned or a future refactor could silently flip it.
 * @param {string | null} mergedBlob
 * @param {string | null} targetBlob - parent 1 (p1): the branch merged INTO
 * @param {string | null} laneBlob - parent 2 (p2): the branch merged FROM
 * @returns {'LANE-WON' | 'TARGET-WON' | 'COMBINED'}
 */
export function classifyOverlap(mergedBlob, targetBlob, laneBlob) {
  if (mergedBlob === laneBlob) return 'LANE-WON';
  if (mergedBlob === targetBlob) return 'TARGET-WON';
  return 'COMBINED';
}

function main() {
  const since = process.argv[2] ?? 'HEAD~200';
  const until = process.argv[3] ?? 'HEAD';
  const merges = git([
    'log',
    '--merges',
    '--format=%H',
    '--grep=chore: sync',
    `${since}..${until}`,
  ]);

  let targetWon = 0;
  let combined = 0;
  let laneWon = 0;
  let audited = 0;

  for (const merge of merges === '' ? [] : merges.split('\n')) {
    const p1 = git(['rev-parse', `${merge}^1`]);
    const p2 = git(['rev-parse', `${merge}^2`]);
    const base = git(['merge-base', p1, p2]);
    const laneFiles = new Set(changedSince(base, p2));
    const overlap = changedSince(base, p1).filter((f) => laneFiles.has(f));
    if (overlap.length === 0) continue;

    audited += 1;
    console.log(`=== ${git(['log', '-1', '--format=%h %s', merge])}`);
    for (const file of overlap) {
      const verdict = classifyOverlap(blobAt(merge, file), blobAt(p1, file), blobAt(p2, file));
      if (verdict === 'LANE-WON') {
        laneWon += 1;
        console.log(`  LANE-WON: ${file}`);
      } else if (verdict === 'TARGET-WON') {
        targetWon += 1;
        console.log(`  TARGET-WON (lane change ABSENT — silent loss!): ${file}`);
      } else {
        combined += 1;
        console.log(`  COMBINED (3-way/union/rerere/manual): ${file}`);
      }
    }
  }

  console.log(
    `\naudit: ${audited} sync merge(s) with overlap in ${since}..${until} — ` +
      `${combined} combined, ${laneWon} lane-won, ${targetWon} TARGET-WON`,
  );
  if (targetWon > 0) {
    console.error('FAIL: at least one lane change was silently dropped by a sync merge.');
    console.error(
      'KNOWN FALSE-POSITIVE CLASS (first alarm, 2026-09-03): a rerere-replayed\n' +
        'pick-one-side resolution reads as TARGET-WON — the operator resolved the\n' +
        'same conflict shape earlier by KEEPING the target side (e.g. dropping a\n' +
        'duplicate same-idea doc paragraph), and rerere faithfully replayed that\n' +
        'judgment when an older branch re-presented it. Before treating this as\n' +
        'loss: diff what the lane side actually added — if it is a second telling\n' +
        'of content the target already carries (check the kept text), the drop was\n' +
        'the recorded human choice, not silence. Real code TARGET-WONs stay hard\n' +
        'alarms.',
    );
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
