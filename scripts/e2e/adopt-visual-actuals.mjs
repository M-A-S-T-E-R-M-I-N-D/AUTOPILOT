// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Adopt CI-canonical visual baselines from an `e2e-visual-actuals` artifact.
 *
 *   node scripts/e2e/adopt-visual-actuals.mjs <actuals-dir> [repo-root]
 *
 * Playwright writes each failure as
 *   <dir>/<spec>-<describe>-<test>-<PROJECT>[-retryN]/<name>-actual.png
 * and the committed baseline is
 *   apps/dashboard/e2e/<spec>.spec.ts-snapshots/<name>-<PROJECT>-win32.png
 *
 * Baselines are CI-canonical (`-win32`, rendered on the CI runner), so only a
 * CI-rendered PNG may ever be adopted — never a locally produced one. Retry
 * directories hold the same image; the last wins, which is the one CI finally
 * reported.
 *
 * **The project segment is load-bearing.** `project-populated-dark-win32.png`
 * and `project-populated-dark-chromium-win32.png` are BOTH committed, so
 * matching on the actual's file name alone silently adopts the wrong one.
 *
 * And the project is NOT simply the last hyphen segment of the artifact
 * directory: `tablet-landscape` and `tablet-portrait` are real Playwright
 * project names, and taking the last segment yields `landscape`, which matches
 * no committed baseline. That bug left two tablet baselines unadopted on
 * 2026-09-17 and is why this resolves the project from the COMMITTED side
 * instead of parsing the directory: for each actual, every committed
 * `<stem>-<project>-win32.png` is a candidate, and the winner is the longest
 * `<project>` the artifact directory actually ends with. Longest wins because
 * `chromium` and `tablet-landscape` can both suffix-match a directory, and the
 * more specific name is the true one. Anything ambiguous or unmatched is
 * reported and left alone rather than guessed at.
 */

import { readdirSync, statSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const [actualsRoot, repoRoot = '.'] = process.argv.slice(2);
if (!actualsRoot) {
  console.error('usage: adopt-visual-actuals.mjs <actuals-dir> [repo-root]');
  process.exit(1);
}

const snapshotRoot = join(repoRoot, 'apps/dashboard/e2e');
const snapshotDirs = readdirSync(snapshotRoot)
  .filter((d) => d.endsWith('.spec.ts-snapshots'))
  .map((d) => join(snapshotRoot, d));

/** committed baseline file name -> absolute path (names are unique repo-wide) */
const baselines = new Map();
for (const dir of snapshotDirs) {
  for (const file of readdirSync(dir)) baselines.set(file, join(dir, file));
}

/** [absolute actual path, the artifact directory it came from] */
const actuals = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry.endsWith('-actual.png')) actuals.push([p, dir]);
  }
};
walk(actualsRoot);

/** The committed baseline this actual belongs to, or null when unresolvable. */
function resolveBaseline(stem, artifactDir) {
  const dirName = artifactDir
    .split(/[\\/]/)
    .pop()
    .replace(/-retry\d+$/, '');
  const candidates = [];
  for (const name of baselines.keys()) {
    if (!name.startsWith(`${stem}-`) || !name.endsWith('-win32.png')) continue;
    const project = name.slice(stem.length + 1, -'-win32.png'.length);
    if (project.length > 0 && dirName.endsWith(`-${project}`)) candidates.push({ name, project });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.project.length - a.project.length);
  return candidates[0].name;
}

let adopted = 0;
const seen = new Set();
const unmatched = [];
for (const [actual, artifactDir] of actuals.sort()) {
  const stem = actual
    .split(/[\\/]/)
    .pop()
    .replace(/-actual\.png$/, '');
  const wanted = resolveBaseline(stem, artifactDir);
  if (wanted === null) {
    unmatched.push(`${stem} [dir ${artifactDir.split(/[\\/]/).pop()}] -> no committed baseline`);
    continue;
  }
  copyFileSync(actual, baselines.get(wanted));
  if (!seen.has(wanted)) {
    seen.add(wanted);
    adopted += 1;
    console.log(`adopted ${wanted}`);
  }
}

console.log(`\n${adopted} baseline(s) adopted from ${actuals.length} actual(s)`);
if (unmatched.length > 0) {
  console.log('UNMATCHED (left alone):');
  for (const u of [...new Set(unmatched)]) console.log(`  ${u}`);
  process.exitCode = 1;
}
