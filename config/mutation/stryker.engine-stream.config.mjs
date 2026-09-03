// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/stream.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the seventeenth module wired
 * after store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), containment.ts
 * (stryker.engine-containment.config.mjs), inbox.ts
 * (stryker.engine-inbox.config.mjs), repo-map.ts
 * (stryker.engine-repo-map.config.mjs), auth.ts
 * (stryker.engine-auth.config.mjs), ask.ts (stryker.engine-ask.config.mjs),
 * prompt.ts (stryker.engine-prompt.config.mjs), resilience.ts
 * (stryker.engine-resilience.config.mjs), landing.ts
 * (stryker.engine-landing.config.mjs), firing.ts
 * (stryker.engine-firing.config.mjs), config.ts
 * (stryker.engine-config.config.mjs), info.ts
 * (stryker.engine-info.config.mjs), loop.ts
 * (stryker.engine-loop.config.mjs), and guard-hook.ts
 * (stryker.engine-guard-hook.config.mjs), widening one more slice.
 *
 * stream.ts turns Claude Code's `--output-format stream-json` NDJSON into the
 * live activity timeline the dashboard renders (MASTER-PLAN §5.2, REACTIVITY
 * §4): which tool ran, its target, the assistant's stated reasoning, and the
 * per-turn model/token usage. A surviving mutant here could mean a
 * `tokensIn`/`tokensOut` swap, the field-precedence fallback chain
 * (command → file_path/path/notebook_path → pattern/query → description)
 * silently reordering, or `textDeltaFromEvent` starting to leak
 * `thinking_delta` content into the answer stream — wrong numbers and leaked
 * content a user would only notice by cross-checking the raw JSONL.
 *
 * stream.ts has NO runtime imports at all (pure NDJSON → Activity parsing) —
 * an even safer target than the sixteen prior modules: no `node:url`, no
 * adapters/git.ts, no subprocess, no workspace package.
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
    configFile: 'config/mutation/vitest.engine-stream.config.ts',
  },
  mutate: ['packages/engine/src/stream.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-stream/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-stream/mutation.json' },
  tempDirName: '.stryker-tmp-engine-stream',
};
