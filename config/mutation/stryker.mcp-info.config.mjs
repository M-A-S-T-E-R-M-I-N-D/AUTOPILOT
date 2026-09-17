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
  // The sandbox is a COPY of the repo, and this repo carries ~1.4GB of runtime
  // state (.autopilot: the live SQLite db and every backup) that no test reads,
  // copied once PER CONFIG on a 7200 RPM platter across 103 configs. Stryker
  // documents ignorePatterns for exactly this case: "too many (or too large)
  // files are copied to the sandbox that are not needed to run the tests".
  // .stryker-tmp* is listed because a leftover sandbox otherwise gets copied
  // into the next one — 8.1GB was measured sitting in a single leftover
  // (2026-09-17). Measured effect on one config: startup 75s -> 17s.
  ignorePatterns: ['.autopilot', '.stryker-tmp*', 'reports', 'test-results', 'dist'],
  // cleanTempDir defaults to deleting the sandbox only after a SUCCESSFUL run,
  // so every red config leaves its entire sandbox on disk indefinitely — and
  // most are red while this debt is being cleared.
  cleanTempDir: 'always',
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  // Static mutants are out of scope (2026-09-16). Stryker's own term for a
  // mutant "only executed during the loading of a file": a module-level
  // constant is built once at import, BEFORE a mutant can be activated for a
  // given test, so no test can kill one and writing more would not change
  // that. They are an artifact of WHERE the code runs, not evidence of an
  // untested invariant — the store config's own comment works the case
  // through in full. Mutants inside functions that tests call are unaffected,
  // including functions the module also calls at load time.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mcp-info/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mcp-info/mutation.json' },
  tempDirName: '.stryker-tmp-mcp-info',
};
