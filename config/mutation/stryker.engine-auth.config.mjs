// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/auth.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the seventh module wired after
 * store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), containment.ts
 * (stryker.engine-containment.config.mjs), inbox.ts
 * (stryker.engine-inbox.config.mjs), and repo-map.ts
 * (stryker.engine-repo-map.config.mjs), widening one more self-contained
 * slice — and a security-sensitive one: a surviving mutant here would mean
 * the credential-isolation logic that keeps `api-key`/`oauth-token`/
 * `subscription` auth modes from leaking into each other could silently
 * break.
 *
 * auth.ts is the same shape of good target the six prior modules were: zero
 * imports (a fully self-contained pure module that resolves the spawned
 * CLI's credential env, see the module's own header) and its test file
 * drives it with plain in-memory env objects, never a real filesystem read
 * or a database connection. Widening further (anything that still imports
 * adapters/git.ts transitively, or spawns a subprocess in its own tests)
 * remains a follow-up slice, same reasoning as the six prior configs.
 * guard.ts was tried as an earlier slice's target first but its regex-heavy
 * PreToolUse command guard surfaced 118 surviving mutants plus 10
 * no-coverage — too large a gap to close in one firing; it stays a
 * follow-up target sized for its own dedicated slice(s).
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
    configFile: 'config/mutation/vitest.engine-auth.config.ts',
  },
  mutate: ['packages/engine/src/auth.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-auth/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-auth/mutation.json' },
  tempDirName: '.stryker-tmp-engine-auth',
};
