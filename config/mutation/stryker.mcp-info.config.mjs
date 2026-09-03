// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/mcp/src/info.ts (backlog web-msnswvcq-viays2,
 * "MUTATION TESTING") — the first packages/mcp module wired: a whole package
 * previously uncovered. packages/onboarding was worked through to
 * exhaustion first (see stryker.onboarding-errors.config.mjs's header) —
 * every remaining onboarding module either has no executable statements
 * (model.ts/ports.ts/*.types.ts) or its only test opens a real
 * better-sqlite3 connection, hitting the documented Stryker-sandbox gap
 * (stryker.store.config.mjs). packages/mcp's own control.ts hits that same
 * gap (control.test.ts imports @autopilot/store); info.ts does not.
 *
 * info.ts is the MCP server's static capability descriptor — name, version,
 * the read-only tool set. A surviving mutant here (a silently truncated
 * MCP_TOOLS array, a flipped `readOnly: true`, an emptied version string)
 * would misreport what the server actually exposes to any MCP client
 * introspecting it, with no other test anywhere to catch it.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.mcp-info.config.ts',
  },
  mutate: ['packages/mcp/src/info.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mcp-info/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mcp-info/mutation.json' },
  tempDirName: '.stryker-tmp-mcp-info',
};
