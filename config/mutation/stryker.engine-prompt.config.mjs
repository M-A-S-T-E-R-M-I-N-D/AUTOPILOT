// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/prompt.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the ninth module wired after
 * store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), containment.ts
 * (stryker.engine-containment.config.mjs), inbox.ts
 * (stryker.engine-inbox.config.mjs), repo-map.ts
 * (stryker.engine-repo-map.config.mjs), auth.ts
 * (stryker.engine-auth.config.mjs), and ask.ts
 * (stryker.engine-ask.config.mjs), widening one more self-contained slice —
 * prompt.ts renders the actual instruction text a live firing runs: a
 * surviving mutant here could mean a hard rule (containment, additive-only
 * git, the un-fakeable METRICS line, the FOCUS MODE lock) silently stops
 * reaching the agent while the gate stays green.
 *
 * prompt.ts is the same shape of good target the eight prior modules were:
 * zero imports (a fully self-contained pure module that renders the firing
 * prompt, see the module's own header) and its test file drives it with
 * plain in-memory strings/objects, never a real filesystem read or a
 * database connection. Widening further (anything that still imports
 * adapters/git.ts transitively, or spawns a subprocess in its own tests)
 * remains a follow-up slice, same reasoning as the eight prior configs.
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
    configFile: 'config/mutation/vitest.engine-prompt.config.ts',
  },
  mutate: ['packages/engine/src/prompt.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-prompt/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-prompt/mutation.json' },
  tempDirName: '.stryker-tmp-engine-prompt',
};
