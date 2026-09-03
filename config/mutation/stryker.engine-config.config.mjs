// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/config.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the thirteenth module wired
 * after store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), containment.ts
 * (stryker.engine-containment.config.mjs), inbox.ts
 * (stryker.engine-inbox.config.mjs), repo-map.ts
 * (stryker.engine-repo-map.config.mjs), auth.ts
 * (stryker.engine-auth.config.mjs), ask.ts (stryker.engine-ask.config.mjs),
 * prompt.ts (stryker.engine-prompt.config.mjs), resilience.ts
 * (stryker.engine-resilience.config.mjs), landing.ts
 * (stryker.engine-landing.config.mjs), and firing.ts
 * (stryker.engine-firing.config.mjs), widening one more self-contained
 * slice. config.ts is the engine's DEFAULT_ENGINE_CONFIG — the model pair,
 * budget caps, turn limits, and allowed/disallowed tool lists every flight
 * starts from: a surviving mutant here could mean a widened budget cap, a
 * flipped allow/disallow list membership, or a drifted resilience model
 * pair silently ships unnoticed.
 *
 * config.ts is the same shape of good target the twelve prior modules were:
 * its only import is `ResilienceConfig` from `./resilience.js`, a TYPE
 * (erased at compile time — no runtime dependency at all), and its test
 * file drives it entirely through its own exported constants, never a real
 * filesystem read or subprocess. Widening further (anything that still
 * imports adapters/git.ts transitively at RUNTIME, or spawns a subprocess
 * in its own tests) remains a follow-up slice, same reasoning as the twelve
 * prior configs.
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
    configFile: 'config/mutation/vitest.engine-config.config.ts',
  },
  mutate: ['packages/engine/src/config.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-config/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-config/mutation.json' },
  tempDirName: '.stryker-tmp-engine-config',
};
