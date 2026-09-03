// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/info.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the fourteenth module wired
 * after store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), containment.ts
 * (stryker.engine-containment.config.mjs), inbox.ts
 * (stryker.engine-inbox.config.mjs), repo-map.ts
 * (stryker.engine-repo-map.config.mjs), auth.ts
 * (stryker.engine-auth.config.mjs), ask.ts (stryker.engine-ask.config.mjs),
 * prompt.ts (stryker.engine-prompt.config.mjs), resilience.ts
 * (stryker.engine-resilience.config.mjs), landing.ts
 * (stryker.engine-landing.config.mjs), firing.ts
 * (stryker.engine-firing.config.mjs), and config.ts
 * (stryker.engine-config.config.mjs), widening one more self-contained
 * slice. info.ts is the engine's static capability descriptor —
 * ENGINE_VERSION and the fixed 5-node ORIENT/PICK/DO/GATE/COMMIT phase rail
 * (REACTIVITY §3) the live view lights up against: a surviving mutant here
 * could mean a dropped/reordered phase node or a stale version string
 * silently ships unnoticed.
 *
 * info.ts is the same shape of good target the thirteen prior modules were:
 * its only import is `EnginePhase` from `./ports.js`, a TYPE (erased at
 * compile time — no runtime dependency at all), and its test file drives it
 * entirely through its own exported constants, never a real filesystem read
 * or subprocess. Widening further (anything that still imports
 * adapters/git.ts transitively at RUNTIME, or spawns a subprocess in its own
 * tests) remains a follow-up slice, same reasoning as the thirteen prior
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
    configFile: 'config/mutation/vitest.engine-info.config.ts',
  },
  mutate: ['packages/engine/src/info.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-info/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-info/mutation.json' },
  tempDirName: '.stryker-tmp-engine-info',
};
