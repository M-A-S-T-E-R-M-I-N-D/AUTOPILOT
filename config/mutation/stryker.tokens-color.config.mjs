// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/tokens/src/color.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after
 * flight/registry.ts (stryker.dashboard-registry.config.mjs), and the
 * first packages/tokens module to widen into: a whole package previously
 * uncovered.
 *
 * color.ts is the pure OKLCH → WCAG-contrast core every themed surface in
 * the dashboard relies on to stay accessible (see COCKPIT's token layer,
 * web-msrrjyhr-2vqw1r). A surviving mutant here — a swapped luminance
 * coefficient, a flipped clamp bound, hi/lo swapped in contrastRatio, or a
 * broken percent/fraction branch in parseOklch — could silently certify a
 * theme as WCAG-compliant when it isn't, with no runtime signal anywhere
 * else to catch it.
 *
 * Same shape of good target as registry.ts/runner.ts: zero imports at all
 * (not even a sibling module), pure math, exercised with concrete
 * expected-output assertions by color.test.ts.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.tokens-color.config.ts',
  },
  mutate: ['packages/tokens/src/color.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/tokens-color/index.html' },
  jsonReporter: { fileName: 'reports/mutation/tokens-color/mutation.json' },
  tempDirName: '.stryker-tmp-tokens-color',
};
