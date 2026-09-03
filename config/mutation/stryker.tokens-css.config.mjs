// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/tokens/src/css.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after color.ts
 * (stryker.tokens-color.config.mjs), the second packages/tokens module to
 * widen into.
 *
 * css.ts is the single place every `--space/--color/--elevation/--type-*`
 * custom property the dashboard renders gets assembled from scale.ts,
 * color.ts, themes.ts, and m3.ts — the last step before those token values
 * reach the page. A surviving mutant here (a dropped `--color-` / `--space-`
 * prefix, `kebab()`'s regex flipped to match lowercase instead of uppercase,
 * a theme skipped in `stylesheet()`'s loop, `m3Vars()`'s per-role loop
 * emitting the wrong suffix) could silently ship a stylesheet missing
 * properties consumers depend on, with no runtime signal anywhere else to
 * catch it.
 *
 * css.ts imports only sibling pure token modules (scale.ts, color.ts,
 * themes.ts, m3.ts) — no native bindings, same low-risk shape as color.ts.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.tokens-css.config.ts',
  },
  mutate: ['packages/tokens/src/css.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/tokens-css/index.html' },
  jsonReporter: { fileName: 'reports/mutation/tokens-css/mutation.json' },
  tempDirName: '.stryker-tmp-tokens-css',
};
