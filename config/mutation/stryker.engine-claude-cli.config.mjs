// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/claude-cli.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after gate.ts
 * (stryker.engine-gate.config.mjs) in `packages/engine/src/adapters/`.
 *
 * `parseModelEnvelope`, `buildClaudeArgs`, `ClaudeCliModel`, and
 * `StreamingClaudeCliModel` turn the local `claude` CLI's stdout/NDJSON
 * into the cost/token/activity facts the rest of AUTOPILOT trusts. A
 * surviving mutant here (e.g. `is_error === true` inverted, the
 * `CLI_STDIN_PROMPT_THRESHOLD` comparison flipped so a long prompt blows
 * past Windows' argv ceiling instead of going to stdin, or
 * `activitiesFromEvent`/`textDeltaFromEvent` wiring dropped) could mean
 * AUTOPILOT silently mis-bills a firing, corrupts a spawned command line,
 * or drops the live activity/answer stream without anyone noticing.
 *
 * claude-cli.ts's only runtime imports are `node:child_process` plus
 * ../ports.js (type-only), ../config.js, ../auth.js, and ../stream.js —
 * none of which touch `@autopilot/store` or a native addon — and
 * claude-cli.test.ts mocks `node:child_process` outright via `vi.mock`
 * rather than spawning anything real, so — like clock.ts,
 * instance-lock.ts, fs-control.ts, and gate.ts before it — this needs no
 * `@autopilot/store` alias and stays fast.
 *
 * The two Windows-specific fixes below were required for the prior
 * configs' narrow scope even without a native addon in the mutated file
 * itself — Stryker's sandboxed copy of the tree is enough on its own to
 * trip them — so both carry over here defensively.
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
    configFile: 'config/mutation/vitest.engine-claude-cli.config.ts',
  },
  mutate: ['packages/engine/src/adapters/claude-cli.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-claude-cli/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-claude-cli/mutation.json' },
  tempDirName: '.stryker-tmp-engine-claude-cli',
};
