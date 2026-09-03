// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Resolve a touched source file to its Stryker mutation config (EVALUATION
 * 2026-08-27 "the gate was not running tests", lever 9: "config/mutation/
 * holds ~100 Stryker configs and none of them gate anything"). Every config
 * under config/mutation/ declares a `mutate: [...]` array of one or more
 * repo-relative files (most name one; a few — e.g. the four ecosystem
 * detectors sharing one config — name several); this reads that array back
 * out with a static regex so discovery never has to import/execute ~100
 * config modules just to find out what they target.
 *
 * This is the RESOLUTION half of "wire mutation testing into the gate,
 * diff-scoped" — it answers "which config(s), if any, does this touched file
 * map to", not "run it". `scripts/ci/run-all-mutation.mjs --diff [<ref>]`
 * duplicates this same parse (it runs standalone, pre-build, so it cannot
 * import this compiled module — see that script's own docstring) to answer
 * "run it" as an explicit, manual, diff-scoped mode. Actually wiring either
 * into an AUTOMATIC live gate step is still a separate, larger change
 * (timeout budget, VERIFY DIET's fast-gate/deep-gate split in
 * scripts/ci/validate-configs.mjs) left for a follow-up.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { touchedFilesInPatch } from './patch-files.js';

const STRYKER_PREFIX = 'stryker.';
const STRYKER_SUFFIX = '.config.mjs';
const MUTATE_BLOCK_RE = /mutate:\s*\[([\s\S]*?)\]/;
const QUOTED_ENTRY_RE = /'([^']+)'/g;

/** One discovered Stryker config: its filename, the repo-relative file(s) it
 *  mutates, and the `pnpm run` script name the naming convention implies. */
export interface MutationConfig {
  readonly file: string;
  readonly mutate: readonly string[];
  readonly script: string;
}

function slug(file: string): string {
  return file.slice(STRYKER_PREFIX.length, -STRYKER_SUFFIX.length);
}

/** Every Stryker config under config/mutation/, parsed for its `mutate`
 *  target(s). Throws if a config's `mutate` array is missing, empty, or
 *  unparseable — that would silently drop it from scope resolution, which is
 *  worse than failing loudly. */
export function discoverMutationConfigs(cwd: string = process.cwd()): MutationConfig[] {
  const dir = join(cwd, 'config', 'mutation');
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(STRYKER_PREFIX) && f.endsWith(STRYKER_SUFFIX))
    .sort();
  return files.map((file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    const block = src.match(MUTATE_BLOCK_RE);
    // Both `!` assertions are guaranteed by the regex shape: MUTATE_BLOCK_RE
    // and QUOTED_ENTRY_RE each have exactly one mandatory capturing group, so
    // group 1 exists whenever the surrounding match itself does.
    const mutate = block ? Array.from(block[1]!.matchAll(QUOTED_ENTRY_RE), (m) => m[1]!) : [];
    if (mutate.length === 0) {
      throw new Error(`mutation-scope: ${file} has no parseable "mutate: ['...']" array`);
    }
    return { file, mutate, script: `mutation:${slug(file)}` };
  });
}

/** Given a set of touched (repo-relative) file paths, return the Stryker
 *  configs that mutate at least one of them — the diff-scoped subset a gate
 *  step could run instead of the full ~100-config sweep. Backslash paths
 *  (Windows git output) are normalized before matching. */
export function resolveMutationConfigsForFiles(
  touchedFiles: readonly string[],
  configs: readonly MutationConfig[] = discoverMutationConfigs(),
): MutationConfig[] {
  const touched = new Set(touchedFiles.map((f) => f.replace(/\\/g, '/')));
  return configs.filter((c) => c.mutate.some((m) => touched.has(m)));
}

/**
 * The `pnpm run mutation:<slug>` script name(s) a human should consider
 * running before merging a git-show/git-diff patch — the gate-facing half of
 * "wire mutation testing into the gate, diff-scoped" (EVALUATION 2026-08-27,
 * lever 9). Advisory only: it NAMES which mutation script applies, it does
 * not run Stryker. Wiring an AUTOMATIC live gate step that actually executes
 * one is still a separate, larger change (timeout budget, VERIFY DIET's
 * fast-gate/deep-gate split in scripts/ci/validate-configs.mjs) — see this
 * module's top docstring.
 */
export function mutationScriptsForPatch(
  patch: string,
  configs: readonly MutationConfig[] = discoverMutationConfigs(),
): readonly string[] {
  return resolveMutationConfigsForFiles(touchedFilesInPatch(patch), configs).map((c) => c.script);
}
