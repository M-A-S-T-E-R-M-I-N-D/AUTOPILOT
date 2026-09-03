// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/landing.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the eleventh module wired after
 * store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), containment.ts
 * (stryker.engine-containment.config.mjs), inbox.ts
 * (stryker.engine-inbox.config.mjs), repo-map.ts
 * (stryker.engine-repo-map.config.mjs), auth.ts
 * (stryker.engine-auth.config.mjs), ask.ts (stryker.engine-ask.config.mjs),
 * prompt.ts (stryker.engine-prompt.config.mjs), and resilience.ts
 * (stryker.engine-resilience.config.mjs), widening one more self-contained
 * slice. landing.ts is the LANDING card's EXECUTE policy (gate-then-merge —
 * see the module's own header): a surviving mutant here could mean a red
 * gate silently stops short-circuiting and a merge is attempted on
 * unverified work, or a merge failure gets silently reported as success.
 *
 * landing.ts is the same shape of good target the ten prior modules were:
 * its only non-type import is `'./ports.js'` (types only) and `LandResult`
 * from `./adapters/git.js` (also type-only, erased at compile time — no
 * runtime dependency on the real git adapter's subprocess calls), and its
 * test file drives it entirely through fake `GatePort`/`Landable` objects,
 * never a real filesystem read or subprocess. Widening further (anything
 * that still imports adapters/git.ts transitively at RUNTIME, or spawns a
 * subprocess in its own tests) remains a follow-up slice, same reasoning as
 * the ten prior configs.
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
    configFile: 'config/mutation/vitest.engine-landing.config.ts',
  },
  mutate: ['packages/engine/src/landing.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-landing/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-landing/mutation.json' },
  tempDirName: '.stryker-tmp-engine-landing',
};
