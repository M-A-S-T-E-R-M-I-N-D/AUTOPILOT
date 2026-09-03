// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/triage.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after self-study.ts
 * (stryker.dashboard-self-study.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * triage.ts builds the post-flight board TRIAGE prompt (`buildTriagePrompt`,
 * fencing task titles as untrusted DATA against prompt injection) and parses
 * the model's ordering reply (`parseTriageOrder`, defensive against unknown
 * ids, duplicates, and a partial answer — never loses a task) plus resolves
 * the mechanical-substep model override (`resolveMechanicalModel`). A
 * surviving mutant here (a dropped title-truncation clamp, a weakened
 * DATA-fencing string, or a flipped dedup/append guard) could silently widen
 * a prompt-injection surface or drop a task from the reordered queue.
 *
 * Same shape of good target as self-study.ts: zero imports (a fully
 * self-contained pure module) and exercised with concrete expected-output
 * assertions by triage.test.ts.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-triage.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/triage.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-triage/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-triage/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-triage',
};
