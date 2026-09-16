// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/prompt-position-audit.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the COGNITIVE DEFENSES regression
 * guard (board web-mssn107s-qh8d95) that asserts `buildFiringPrompt`'s two
 * non-negotiable sections (Containment, Hard rules) stay in the tail quarter
 * of the prompt, where lost-in-the-middle attention degradation is weakest.
 * A surviving mutant here could mean `CRITICAL_TAIL_FRACTION`'s boundary
 * silently loosens, or a marker missing from the prompt entirely gets
 * misreported as passing — exactly the failure mode this guard exists to
 * catch in `buildFiringPrompt` itself.
 *
 * Same shape as routing.ts/resilience.ts's precedent: prompt-position-audit.ts
 * has zero imports (a fully self-contained pure module, per its own file
 * header) and prompt-position-audit.test.ts imports only vitest and
 * prompt.ts (also zero-import) — no subprocess, no filesystem, no workspace
 * package.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.engine-prompt-position-audit.config.ts',
  },
  mutate: ['packages/engine/src/prompt-position-audit.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/engine-prompt-position-audit/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-prompt-position-audit/mutation.json' },
  tempDirName: '.stryker-tmp-engine-prompt-position-audit',
};
