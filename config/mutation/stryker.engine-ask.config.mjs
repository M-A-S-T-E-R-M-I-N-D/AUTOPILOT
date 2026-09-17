// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/ask.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the eighth module wired after
 * store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), containment.ts
 * (stryker.engine-containment.config.mjs), inbox.ts
 * (stryker.engine-inbox.config.mjs), repo-map.ts
 * (stryker.engine-repo-map.config.mjs), and auth.ts
 * (stryker.engine-auth.config.mjs), widening one more self-contained
 * slice — and a security-sensitive one: a surviving mutant here could mean
 * the prompt-injection defense that fences untrusted repo excerpts / chat
 * history away from the model's instructions (REACTIVITY §1/§5) silently
 * stops working.
 *
 * ask.ts is the same shape of good target the seven prior modules were:
 * zero imports (a fully self-contained pure module that builds the
 * retrieval-augmented ask prompt, see the module's own header) and its test
 * file drives it with plain in-memory strings/objects, never a real
 * filesystem read or a database connection. Widening further (anything that
 * still imports adapters/git.ts transitively, or spawns a subprocess in its
 * own tests) remains a follow-up slice, same reasoning as the seven prior
 * configs.
 *
 * The two Windows-specific fixes below were required for the prior configs'
 * narrow scope even without a native addon or subprocess in the mutated
 * file itself — Stryker's sandboxed copy of the tree is enough on its own
 * to trip them — so both carry over here defensively.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts or packages/engine/test/**'s full suite
    // — see this file's header for why.
    configFile: 'config/mutation/vitest.engine-ask.config.ts',
  },
  mutate: ['packages/engine/src/ask.ts'],
  // The sandbox is a COPY of the repo, and this repo carries ~1.4GB of runtime
  // state (.autopilot: the live SQLite db and every backup) that no test reads,
  // copied once PER CONFIG on a 7200 RPM platter across 103 configs. Stryker
  // documents ignorePatterns for exactly this case: "too many (or too large)
  // files are copied to the sandbox that are not needed to run the tests".
  // .stryker-tmp* is listed because a leftover sandbox otherwise gets copied
  // into the next one — 8.1GB was measured sitting in a single leftover
  // (2026-09-17). Measured effect on one config: startup 75s -> 17s.
  ignorePatterns: ['.autopilot', '.stryker-tmp*', 'reports', 'test-results', 'dist'],
  // cleanTempDir defaults to deleting the sandbox only after a SUCCESSFUL run,
  // so every red config leaves its entire sandbox on disk indefinitely — and
  // most are red while this debt is being cleared.
  cleanTempDir: 'always',
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  // Static mutants are out of scope (2026-09-16). Stryker's own term for a
  // mutant "only executed during the loading of a file": a module-level
  // constant is built once at import, BEFORE a mutant can be activated for a
  // given test, so no test can kill one and writing more would not change
  // that. They are an artifact of WHERE the code runs, not evidence of an
  // untested invariant — the store config's own comment works the case
  // through in full. Mutants inside functions that tests call are unaffected,
  // including functions the module also calls at load time.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-ask/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-ask/mutation.json' },
  tempDirName: '.stryker-tmp-engine-ask',
};
