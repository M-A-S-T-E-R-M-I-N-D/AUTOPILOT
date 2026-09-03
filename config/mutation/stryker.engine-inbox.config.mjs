// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/inbox.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the fifth module wired after
 * store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), and containment.ts
 * (stryker.engine-containment.config.mjs), widening one more self-contained
 * slice.
 *
 * inbox.ts is the same shape of good target the four prior modules were:
 * zero imports (a fully self-contained pure module that renders the
 * operator's dropped INBOX/ notes into a bounded digest block, see the
 * module's own header) and its test file drives it with plain in-memory
 * arrays, never a real filesystem read or a database connection. Widening
 * further (anything that still imports adapters/git.ts transitively, or
 * spawns a subprocess in its own tests) remains a follow-up slice, same
 * reasoning as the four prior configs.
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
    configFile: 'config/mutation/vitest.engine-inbox.config.ts',
  },
  mutate: ['packages/engine/src/inbox.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-inbox/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-inbox/mutation.json' },
  tempDirName: '.stryker-tmp-engine-inbox',
};
