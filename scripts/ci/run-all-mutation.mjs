// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `pnpm run mutation` — run EVERY Stryker config under config/mutation/,
 * discovered from the filesystem so a newly wired module is included
 * automatically and `pnpm run verify` never grows another mutation step.
 *
 * History (RESEARCH-LIBRARY "runaway-task economics" + this file's reason for
 * existing): the per-firing wiring convention chained each new config into
 * `verify` until the full gate took hours and nobody ran it. VERIFY DIET was
 * even marked done without this extraction actually landing — so the runner
 * is deliberately discovery-based: the fast gate and the deep gate can never
 * drift together again.
 *
 * `--diff [<ref>]` (EVALUATION 2026-08-27 lever 9, the "diff-scoped" half):
 * scope the run to only the configs whose `mutate` target changed since
 * <ref> (default `HEAD~1`) instead of the full ~100-config sweep. This reads
 * each config's `mutate` array the same way
 * `apps/dashboard/src/flight/mutation-scope.ts` does — duplicated rather than
 * imported, because that module lives in a compiled TS package and this
 * script runs standalone, pre-build, in the nightly mutation workflow (same
 * tradeoff `apps/dashboard/test/flight/ci-workflow-gate.test.ts` already
 * documents for this file's discovery logic). Still a manual, explicitly
 * flagged mode, not an automatic gate step — actually wiring this into a live
 * gate (timeout budget, CI trigger) is a separate, larger change left for a
 * follow-up.
 *
 * Usage: node scripts/ci/run-all-mutation.mjs [--list] [--diff [<ref>]]
 *   --list         print the configs that would run, without running them
 *                  (used by tests and for a quick census).
 *   --diff [<ref>] scope to configs touched since <ref> (default HEAD~1)
 *                  instead of running every config.
 */
import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MUTATION_DIR = join(ROOT, 'config', 'mutation');
const MUTATE_BLOCK_RE = /mutate:\s*\[([\s\S]*?)\]/;
const QUOTED_ENTRY_RE = /'([^']+)'/g;

/** Every Stryker config under `dir`, paired with the repo-relative file(s)
 *  its `mutate` array names (`[]` when unparseable — full-sweep mode never
 *  depended on this array, only `--diff` mode does, and an unparseable array
 *  there just means that one config never matches a diff). */
export function discoverConfigs(dir = MUTATION_DIR) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('stryker.') && f.endsWith('.config.mjs'))
    .sort();
  return files.map((file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    const block = src.match(MUTATE_BLOCK_RE);
    const mutate = block ? Array.from(block[1].matchAll(QUOTED_ENTRY_RE), (m) => m[1]) : [];
    return { file, mutate };
  });
}

/** `--diff [<ref>]` from argv: the ref to diff against (default `HEAD~1`
 *  when the flag is bare or immediately followed by another flag), or
 *  `null` when `--diff` is absent (full-sweep mode). */
export function parseDiffRef(argv) {
  const idx = argv.indexOf('--diff');
  if (idx === -1) return null;
  const next = argv[idx + 1];
  return next && !next.startsWith('--') ? next : 'HEAD~1';
}

/** Config filenames to run: every discovered config in full-sweep mode
 *  (`diffRef === null`), or only the ones whose `mutate` target appears in
 *  `touchedFiles` otherwise (backslash paths normalized, same as
 *  `mutation-scope.ts`'s `resolveMutationConfigsForFiles`). */
export function selectConfigFiles(configs, diffRef, touchedFiles) {
  if (diffRef === null) return configs.map((c) => c.file);
  const touched = new Set(touchedFiles.map((f) => f.replace(/\\/g, '/')));
  return configs.filter((c) => c.mutate.some((m) => touched.has(m))).map((c) => c.file);
}

function touchedFilesSince(ref) {
  return execFileSync('git', ['diff', '--name-only', ref], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const configs = discoverConfigs();
  if (configs.length === 0) {
    console.error('run-all-mutation: no stryker configs found under config/mutation/');
    process.exit(1);
  }

  const diffRef = parseDiffRef(process.argv);
  const scoped = selectConfigFiles(
    configs,
    diffRef,
    diffRef === null ? [] : touchedFilesSince(diffRef),
  );

  if (diffRef !== null && scoped.length === 0) {
    console.log(`run-all-mutation: no mutation configs touched since ${diffRef}`);
    process.exit(0);
  }

  if (process.argv.includes('--list')) {
    for (const cfg of scoped) console.log(cfg);
    console.log(`${scoped.length} config(s)`);
    process.exit(0);
  }

  let failed = 0;
  for (const [i, cfg] of scoped.entries()) {
    console.log(`\n[${i + 1}/${scoped.length}] stryker run ${cfg}`);
    try {
      execSync(`npx stryker run ${join('config', 'mutation', cfg)}`, {
        cwd: ROOT,
        stdio: 'inherit',
      });
    } catch {
      failed += 1;
      console.error(`run-all-mutation: FAILED — ${cfg} (continuing; summary at the end)`);
    }
  }

  console.log(`\nrun-all-mutation: ${scoped.length - failed}/${scoped.length} passed`);
  if (failed > 0) process.exit(1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
