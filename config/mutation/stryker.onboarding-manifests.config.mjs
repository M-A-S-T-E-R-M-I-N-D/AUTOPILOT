// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/gate/manifests.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — tenth onboarding
 * module wired after secret-guard.ts, guard.ts+refs.ts, size-guard.ts,
 * ritual.ts, task-id.ts, soul.ts, git-backup.ts, ignore.ts, and info.ts
 * (stryker.onboarding-info.config.mjs).
 *
 * manifests.ts holds the gate detectors' shared building blocks: safe JSON
 * parsing of package.json, the string-only scripts map, the TOML section
 * matcher used to tell `[tool.mypy]` apart from `[tool.mypyc]`, and the
 * argv-array command builders (scriptCommand/execCommand/directCommand)
 * every language detector composes gate commands from. A surviving mutant
 * here — e.g. a flipped `pm === 'npm'` branch, a broken TOML boundary regex,
 * or a dropped scripts-map filter — would corrupt the gate commands every
 * detector emits while the gate itself stays green.
 *
 * manifests.ts has no filesystem/process imports — pure string/JSON logic —
 * so manifests.test.ts never touches the sandbox gap documented in
 * stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-manifests.config.ts',
  },
  mutate: ['packages/onboarding/src/gate/manifests.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-manifests/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-manifests/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-manifests',
};
