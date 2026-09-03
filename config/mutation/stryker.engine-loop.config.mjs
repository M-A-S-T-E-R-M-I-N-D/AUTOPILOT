// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/loop.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the fifteenth module wired
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
 * (stryker.engine-config.config.mjs), and info.ts
 * (stryker.engine-info.config.mjs), widening one more self-contained slice.
 *
 * loop.ts is the outer autopilot loop (docs/M1-ENGINE-PLAN.md) — the
 * firing-number/RETRO cadence, state persistence, consecutive-bad-streak
 * alert, and hibernate-vs-pace branch a live flight runs on every
 * iteration: a surviving mutant here could mean a dropped stop check, a
 * flipped `>=` on the bad-streak alert, or hibernate/pace picking the
 * wrong sleep silently misbehaving in production.
 *
 * Unlike the fully self-contained modules mutated so far, loop.ts imports
 * real functions from firing.ts (`runFiring`) and resilience.ts
 * (`hibernateMinutes`) — both already isolated, subprocess-free modules of
 * their own (see their respective configs). loop.test.ts always supplies a
 * fake through the `LoopDeps.runFiring` test seam, so the real firing
 * runner is loaded but never called, keeping this scope just as safe as
 * the fourteen prior modules: no adapters/git.ts, no subprocess, in-memory
 * fakes only.
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
    configFile: 'config/mutation/vitest.engine-loop.config.ts',
  },
  mutate: ['packages/engine/src/loop.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-loop/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-loop/mutation.json' },
  tempDirName: '.stryker-tmp-engine-loop',
};
