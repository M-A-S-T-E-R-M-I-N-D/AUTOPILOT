// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/ollama.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — widening one more
 * self-contained slice, same "safe shape" reasoning as otlp.ts
 * (stryker.engine-otlp.config.mjs): ollama.ts's only runtime import is a
 * type-only import from `../ports.js` plus the injectable `fetchImpl` its
 * own tests fake (never a real network call) — no adapters/git.ts, no
 * subprocess, no `@autopilot/store` import. That last point matters:
 * stryker.store.config.mjs documents a root-cause-isolated, upstream-blocked
 * Stryker limitation where any file that transitively imports
 * `@autopilot/store` crashes inside Stryker's sandbox (pnpm's non-flat
 * `node_modules` never copies `better-sqlite3` in) — it names
 * `adapters/pacer.ts` and `adapters/store.ts` as blocked on exactly that.
 * ollama.ts has no such import, so it doesn't hit that wall.
 *
 * A surviving mutant here would be a latent bug: parseOllamaResponse's
 * malformed/HTTP-error branching silently misreporting isError, a duration
 * unit conversion drifting, or OllamaModel's AbortController timeout/cleanup
 * failing to fire — exactly the kind of edge this adapter's own doc comment
 * calls out ("never rejects" contract) that a mutant loves to hide in.
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
    configFile: 'config/mutation/vitest.engine-ollama.config.ts',
  },
  mutate: ['packages/engine/src/adapters/ollama.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/engine-ollama/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-ollama/mutation.json' },
  tempDirName: '.stryker-tmp-engine-ollama',
};
