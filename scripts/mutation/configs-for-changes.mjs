// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Which mutation configs cover the files a change touches.
 *
 *   node scripts/mutation/configs-for-changes.mjs [--base <ref>] [--json]
 *   node scripts/mutation/configs-for-changes.mjs --files a.ts b.ts
 *
 * **Why this exists.** `config/mutation/` holds 103 per-module Stryker configs,
 * every one of them `thresholds: { break: 100 }`. That bar is real, but it is
 * only ever checked by a NIGHTLY full sweep — so the gap between introducing a
 * surviving mutant and hearing about it is a day at best. It was far worse than
 * that in practice: the nightly ran past its job timeout every night from
 * 2026-09-04 to 09-12 and ended `cancelled`, nobody had seen a finished run in
 * over a week, and 347 survivors accumulated across 36 files unseen. Sharding
 * fixed the timeout; it did not fix the feedback loop.
 *
 * A full sweep cannot BE the feedback loop. Measured 2026-09-17: with a warm
 * `--incremental` cache and zero source changes, one small config still costs
 * ~38s — the sandbox build and dry run are fixed cost, paid per config whatever
 * the cache holds. Times 103 that is an hour of CI before a single mutant runs.
 * So the answer is not a faster sweep; it is a SMALLER one. A change touching
 * two modules should test two configs, and it should do that on the pull
 * request, before the debt exists — which is what this script makes possible.
 *
 * The nightly sweep stays as the backstop that catches what a per-change gate
 * structurally cannot: a mutant that survives because of a change somewhere
 * else entirely.
 *
 * Output is one config path per line on stdout (empty when a change touches no
 * mutated module), so a CI step can feed it straight to `stryker run`. Anything
 * the reader needs to know — unmatched files, the config→file map — goes to
 * stderr, so redirecting stdout stays clean.
 */

import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : (argv[i + 1] ?? null);
};
const asJson = argv.includes('--json');

const CONFIG_DIR = 'config/mutation';

/** Every `stryker.*.config.mjs` with the source files it mutates. */
async function loadConfigs() {
  const entries = [];
  for (const file of readdirSync(CONFIG_DIR).sort()) {
    if (!file.startsWith('stryker.') || !file.endsWith('.config.mjs')) continue;
    const path = join(CONFIG_DIR, file);
    const mod = await import(pathToFileURL(resolve(path)).href);
    const mutate = mod.default?.mutate ?? [];
    // Normalize to posix separators: the configs are written with forward
    // slashes and `git diff` reports them that way on every platform, but
    // node's join() does not on Windows.
    entries.push({ path: path.split('\\').join('/'), mutate: mutate.map(String) });
  }
  return entries;
}

/** The changed files, from an explicit list or from git against `base`. */
function changedFiles() {
  const i = argv.indexOf('--files');
  if (i !== -1) return argv.slice(i + 1).filter((a) => !a.startsWith('--'));
  const base = flag('--base') ?? 'origin/main';
  // Three-dot: what THIS branch changed since it diverged, not everything that
  // landed on the base meanwhile — a per-change gate must answer for the
  // change, not for the branch it will land onto.
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

const configs = await loadConfigs();
const changed = changedFiles();

const selected = [];
const covered = new Set();
for (const config of configs) {
  const hits = config.mutate.filter((m) => changed.includes(m));
  if (hits.length === 0) continue;
  selected.push({ config: config.path, files: hits });
  for (const h of hits) covered.add(h);
}

// A changed source file with no config is not a failure — only 103 modules are
// wired, deliberately — but it IS the honest reason a green per-change gate can
// still be followed by a red nightly, so it is always reported.
const uncovered = changed.filter(
  (f) =>
    /^(packages|apps|scripts)\/.+\.(ts|mjs)$/.test(f) &&
    !covered.has(f) &&
    !/\.(test|spec)\./.test(f),
);

if (asJson) {
  process.stdout.write(`${JSON.stringify({ selected, uncovered, changed }, null, 2)}\n`);
} else {
  for (const s of selected) process.stdout.write(`${s.config}\n`);
}

process.stderr.write(
  `configs-for-changes: ${changed.length} changed file(s), ` +
    `${selected.length} mutation config(s) selected\n`,
);
for (const s of selected) process.stderr.write(`  ${s.config}  <- ${s.files.join(', ')}\n`);
if (uncovered.length > 0) {
  process.stderr.write(`  ${uncovered.length} changed source file(s) have no mutation config:\n`);
  for (const f of uncovered) process.stderr.write(`    ${f}\n`);
}
