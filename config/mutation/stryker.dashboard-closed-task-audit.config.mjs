// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/closed-task-audit.ts (epic
 * web-msu74pog-w4hjgq, "CLOSED-TASK AUDIT ritual") — added after the module
 * shipped across three slices with no dedicated Stryker config, unlike every
 * other `flight/*.ts` ritual (dashboard-doc-freshness, dashboard-triage,
 * dashboard-deliverable, ...). `validate-configs` (scripts/ci/validate-configs.mjs)
 * only checks that an existing `mutation:*` script is wired into the
 * aggregate chain — it can't catch a module that never got a config at all,
 * exactly the gap that let `mutation:dashboard-runner` go unwired before it.
 *
 * `auditClosedTaskDeliverable` and `auditClosedTaskUxExpression` decide
 * whether a closed task's DELIVERABLE clause (and its UI/Docs expression)
 * still checks out against the current tree. A surviving mutant here (e.g. a
 * flipped `some` to `every` in the UX-EXPRESSION path check, or dropping the
 * plural↔singular fallback) would silently let a false-close slip back past
 * the ritual meant to catch it.
 *
 * closed-task-audit.ts's only import is deliverable.js plus its own `AuditVcs`
 * interface — the test suite satisfies that interface with plain in-memory
 * fakes (no real git/DB), so unlike doc-freshness.test.ts this needs no
 * disposable-tmpdir-repo workaround for Stryker's sandbox.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-closed-task-audit.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/closed-task-audit.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-closed-task-audit/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-closed-task-audit/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-closed-task-audit',
};
