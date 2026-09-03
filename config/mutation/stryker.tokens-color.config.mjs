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
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/tokens-color/index.html' },
  jsonReporter: { fileName: 'reports/mutation/tokens-color/mutation.json' },
  tempDirName: '.stryker-tmp-tokens-color',
};
