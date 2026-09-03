// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/resilience.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the tenth module wired after
 * store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), containment.ts
 * (stryker.engine-containment.config.mjs), inbox.ts
 * (stryker.engine-inbox.config.mjs), repo-map.ts
 * (stryker.engine-repo-map.config.mjs), auth.ts
 * (stryker.engine-auth.config.mjs), ask.ts (stryker.engine-ask.config.mjs),
 * and prompt.ts (stryker.engine-prompt.config.mjs), widening one more
 * self-contained slice — and the module its own header calls out as "the
 * engine's hardest-to-reason-about behavior": a surviving mutant here could
 * mean promote-on-exhaustion, time-based re-probe, or escalating
 * hibernation silently breaks, and a live firing either wastes calls
 * hammering an exhausted model or hibernates for the wrong duration, while
 * the gate stays green.
 *
 * resilience.ts is the same shape of good target the nine prior modules
 * were: zero imports (a fully self-contained pure module over an immutable
 * ResilienceState, see the module's own header) and its test file drives it
 * with plain in-memory state objects, never a real filesystem read or a
 * database connection. Widening further (anything that still imports
 * adapters/git.ts transitively, or spawns a subprocess in its own tests)
 * remains a follow-up slice, same reasoning as the nine prior configs.
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
    configFile: 'config/mutation/vitest.engine-resilience.config.ts',
  },
  mutate: ['packages/engine/src/resilience.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-resilience/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-resilience/mutation.json' },
  tempDirName: '.stryker-tmp-engine-resilience',
};
