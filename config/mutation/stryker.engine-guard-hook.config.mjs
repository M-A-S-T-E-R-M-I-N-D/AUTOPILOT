// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/guard-hook.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the sixteenth module wired
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
 * (stryker.engine-info.config.mjs), and loop.ts
 * (stryker.engine-loop.config.mjs), widening one more slice.
 *
 * guard-hook.ts is the stdin/stdout process shim Claude Code actually invokes
 * as the PreToolUse hook (`node guard-hook.js <targetRoot>`): it buffers
 * stdin, fails OPEN (no decision, exit 0) when the target root is
 * misconfigured, and otherwise hands the raw JSON to guard.ts's pure
 * evaluateHookInput. A surviving mutant here could mean the fail-open
 * comparison flips to fail-CLOSED (denying everything on a misconfigured
 * flight) or the decision gate stops writing the deny JSON at all — a
 * containment regression the rest of the suite would never catch, since
 * every other test drives evaluateHookInput directly rather than through
 * this shim. guard-hook.test.ts already exercises it exhaustively (real
 * stdin buffering across multiple chunks, the fail-open path, deny vs.
 * no-decision, malformed JSON) via full process.stdin/stdout/exit mocking —
 * unlike prior modules this file is a genuine (if thin) side-effecting CLI
 * entry rather than a pure function library, so its own dedicated Stryker
 * config, not just line coverage, is what proves those tests actually pin
 * the behavior instead of merely exercising the lines.
 *
 * guard-hook.ts's only runtime import is `evaluateHookInput` from
 * `./guard.js`, which itself imports only `fileURLToPath` from `node:url` —
 * no adapters/git.ts, no subprocess anywhere in the chain — so this stays as
 * safe a target as the fifteen prior modules despite pulling in a real
 * (unmutated) dependency.
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
    configFile: 'config/mutation/vitest.engine-guard-hook.config.ts',
  },
  mutate: ['packages/engine/src/guard-hook.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-guard-hook/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-guard-hook/mutation.json' },
  tempDirName: '.stryker-tmp-engine-guard-hook',
};
