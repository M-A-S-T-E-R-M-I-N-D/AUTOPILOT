// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/routing.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the pure cost-aware routing
 * decision that board item web-msnt2j50-wk2lxy (M6 GOLD local/cheap
 * offload, ENGINE-RESEARCH I2) landed across the last several firings: the
 * `SubstepKind` → `RoutingTier` table, `modelForTier`'s tier→model-string
 * resolution, and `selectModelForSubstepLabel`'s fail-safe entry point for
 * untrusted labels. A surviving mutant here could mean a mechanical substep
 * silently escapes to a paid top-tier model (harmless but defeats the cost
 * lever this whole chain exists for) or, worse, the fail-safe default
 * flips so an *unrecognized* label routes to local/cheap instead of
 * escalating to top — exactly the "misroute must fail safe" property
 * ENGINE-RESEARCH §7 calls out and `selectModelForSubstepLabel`'s own tests
 * assert.
 *
 * Same shape as resilience.ts/otlp.ts's precedent: routing.ts has zero
 * imports (a fully self-contained pure module, per its own file header) and
 * is exercised by routing.test.ts with concrete expected-output assertions
 * only — no subprocess, no filesystem, no workspace package.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.engine-routing.config.ts',
  },
  mutate: ['packages/engine/src/routing.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-routing/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-routing/mutation.json' },
  tempDirName: '.stryker-tmp-engine-routing',
};
