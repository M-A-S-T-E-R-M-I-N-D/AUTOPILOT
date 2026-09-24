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
  // Stryker disable next-line MethodExpression: `.sort()` guards against a
  // filesystem whose readdir order is not lexical. Every filesystem this
  // runs on already returns names sorted, so removing the call is
  // observably identical here — provably equivalent on this platform, kept
  // for the ones where it is not. The `.filter` beside it IS observable
  // and has a decoy-directory test.
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

/** `--shard <i>/<n>` from argv: run only every n-th config starting at the
 *  i-th (1-based), so a CI matrix can split the full sweep across jobs — the
 *  nightly run of ~200 configs on one runner hit the 180-minute job timeout
 *  four days running (2026-09-09→12) and read as "cancelled" on the CI
 *  panel. `null` when absent (one job runs everything). A malformed value
 *  is an error, not a silent full sweep: a typo in the workflow must not
 *  quietly run six full sweeps. */
export function parseShard(argv) {
  const idx = argv.indexOf('--shard');
  if (idx === -1) return null;
  // Stryker disable next-line StringLiteral: the `?? ''` fallback only feeds
  // the regex, and every string that is not `<digits>/<digits>` fails it the
  // same way — a missing value and any placeholder both throw the same
  // error, so no test can tell them apart here. The message below carries
  // its own fallback, and THAT one is observable.
  const m = /^(\d+)\/(\d+)$/.exec(argv[idx + 1] ?? '');
  const index = m ? Number(m[1]) : NaN;
  const total = m ? Number(m[2]) : NaN;
  // `1 ≤ index ≤ total` already implies `total ≥ 1`; a separate `total < 1`
  // clause was a check no input could reach on its own.
  if (!m || index < 1 || index > total) {
    throw new Error(
      `run-all-mutation: --shard wants <i>/<n> with 1 ≤ i ≤ n, got '${argv[idx + 1] ?? ''}'`,
    );
  }
  return { index, total };
}

/**
 * The i-th of n interleaved slices of `files` (sorted discovery order, so
 * every shard gets a spread of packages rather than one package's tail).
 *
 * WEIGHTING WAS TRIED AND MEASURED WORSE (2026-09-21). The six shards carry
 * uneven mutant counts under this split — 2460, 2428, 1922, 1810, 1620 and
 * 967 on the 2026-09-20 sweep — which looks like an obvious imbalance to
 * fix. Source-file size predicts mutant count well (Pearson r = 0.909 over
 * all 110 configs), so packing heaviest-into-lightest by byte size evened the
 * mutant counts out. It also evened the BYTES to within a kilobyte across all
 * six shards, and the sweep still ran 3, 4, 6, 9, 10 and 11 minutes: a worse
 * spread than the 5-8 minutes interleaving produces, and the slowest shard no
 * faster.
 *
 * Mutant count is not runtime. What a mutant costs is a full run of that
 * config's vitest suite, and suite speed varies far more between configs than
 * mutant count varies with file size, so both proxies optimise the wrong
 * quantity. Anyone revisiting this needs measured per-config RUNTIME, which
 * means a census that has to be kept fresh — weigh that maintenance against
 * the three minutes on the table before starting.
 */
export function shardConfigFiles(files, shard) {
  if (!shard) return files;
  return files.filter((_, i) => i % shard.total === shard.index - 1);
}

// Stryker disable all: `touchedFilesSince` shells out to `git diff`, and the
// only way to test it is to run it against a real history. It is three lines
// of glue with no branch; the logic it feeds (`selectConfigFiles`) is tested.
function touchedFilesSince(ref) {
  return execFileSync('git', ['diff', '--name-only', ref], {
    windowsHide: true,
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
// Stryker restore all

/**
 * Stryker exits 1 when a config lands below its break threshold — that is
 * the ONE failure this sweep is designed to produce, and it means a mutant
 * survived. Any other ending is infrastructure.
 */
const STRYKER_BREAK_EXIT = 1;

/** Why a `stryker run` failed, in a phrase an operator can act on.
 *
 *  `execSync` throws an Error carrying `status` (the exit code) and
 *  `signal`. A signal means something OUTSIDE the run killed the process —
 *  the Linux OOM killer prints a bare `Killed` and nothing else — so no
 *  mutation score was ever produced. That is the opposite diagnosis from a
 *  surviving mutant, and it needs the opposite response: give the job more
 *  headroom, not another test.
 *
 *  The runner used to swallow the error entirely and print only `FAILED`,
 *  which made the two indistinguishable. A config that was SIGKILLed at
 *  80 of 426 mutants read exactly like a config with a live survivor, and
 *  telling them apart meant downloading and scrolling a six-shard log.
 */
export function mutationFailureReason(error) {
  const signal = error?.signal ?? null;
  if (signal !== null)
    return `killed by ${signal} — the process died before scoring, so this is the environment (memory is the usual cause), not a surviving mutant`;
  const status = error?.status ?? null;
  if (status === STRYKER_BREAK_EXIT) return 'exit 1 — below the break threshold: a mutant survived';
  if (typeof status === 'number') return `exit ${status} — stryker failed before it could score`;
  return 'no exit code and no signal — stryker never ran';
}

/** The runner's closing lines: the tally, then every failure BY NAME with
 *  its reason. The tally alone was never enough — `104/110 passed` does not
 *  say which six, and the sweep prints tens of thousands of lines above it. */
export function formatFailureSummary(total, failures) {
  const lines = [`run-all-mutation: ${total - failures.length}/${total} passed`];
  for (const { file, reason } of failures)
    lines.push(`run-all-mutation: FAILED ${file} — ${reason}`);
  return lines;
}

// Stryker disable all: `main` is the process shell — it spawns `npx stryker`
// per config and calls `process.exit`. Every decision it makes is delegated
// to an exported function above, each of which IS mutation-tested; what is
// left here can only be exercised by running the whole sweep.
function main() {
  const configs = discoverConfigs();
  if (configs.length === 0) {
    console.error('run-all-mutation: no stryker configs found under config/mutation/');
    process.exit(1);
  }

  const diffRef = parseDiffRef(process.argv);
  const shard = parseShard(process.argv);
  const scoped = shardConfigFiles(
    selectConfigFiles(configs, diffRef, diffRef === null ? [] : touchedFilesSince(diffRef)),
    shard,
  );
  if (shard)
    console.log(
      `run-all-mutation: shard ${shard.index}/${shard.total} — ${scoped.length} of ${configs.length} config(s)`,
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

  const failures = [];
  for (const [i, cfg] of scoped.entries()) {
    console.log(`\n[${i + 1}/${scoped.length}] stryker run ${cfg}`);
    try {
      execSync(`npx stryker run ${join('config', 'mutation', cfg)}`, {
        windowsHide: true,
        cwd: ROOT,
        stdio: 'inherit',
      });
    } catch (error) {
      const reason = mutationFailureReason(error);
      failures.push({ file: cfg, reason });
      console.error(
        `run-all-mutation: FAILED — ${cfg}: ${reason} (continuing; summary at the end)`,
      );
    }
  }

  console.log('');
  for (const line of formatFailureSummary(scoped.length, failures)) console.log(line);
  if (failures.length > 0) process.exit(1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
