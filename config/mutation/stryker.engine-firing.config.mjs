// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/firing.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the twelfth module wired after
 * store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), containment.ts
 * (stryker.engine-containment.config.mjs), inbox.ts
 * (stryker.engine-inbox.config.mjs), repo-map.ts
 * (stryker.engine-repo-map.config.mjs), auth.ts
 * (stryker.engine-auth.config.mjs), ask.ts (stryker.engine-ask.config.mjs),
 * prompt.ts (stryker.engine-prompt.config.mjs), resilience.ts
 * (stryker.engine-resilience.config.mjs), and landing.ts
 * (stryker.engine-landing.config.mjs), widening one more self-contained
 * slice. firing.ts is THE atomic firing (ENGINE-RESEARCH G4/G5): model
 * selection with quota resilience, the un-fakeable sha/HEAD cross-check, and
 * the gate-then-additively-revert policy that keeps a flight either shipped
 * or clean — a surviving mutant here could mean a red gate silently stops
 * reverting a bad commit, or a quota-blocked attempt silently stops
 * refiring on the fallback.
 *
 * firing.ts is the same shape of good target the eleven prior modules were:
 * its only non-type runtime imports are sibling engine modules
 * (resilience.js, telemetry.js — never an adapter), and its test file
 * drives it entirely through fake ModelPort/VcsPort/GatePort/StorePort/
 * ClockPort objects, never a real filesystem read or subprocess. Widening
 * further (anything that still imports adapters/git.ts transitively at
 * RUNTIME, or spawns a subprocess in its own tests) remains a follow-up
 * slice, same reasoning as the eleven prior configs.
 *
 * The two Windows-specific fixes below were required for the prior configs'
 * narrow scope even without a native addon or subprocess in the mutated
 * file itself — Stryker's sandboxed copy of the tree is enough on its own
 * to trip them — so both carry over here defensively.
 *
 * A third fix is new here: unlike the eleven prior targets, firing.ts pulls
 * in telemetry.ts, which imports `@autopilot/store` (a workspace package)
 * at runtime. pnpm links that package only inside a NESTED
 * `packages/engine/node_modules/@autopilot/store` symlink —
 * `symlinkNodeModules: false` (needed to dodge a native-binding crash, see
 * stryker.store.config.mjs) never recreates that symlink in the sandbox, so
 * the bare specifier fails to resolve there even though it resolves fine
 * outside Stryker. vitest.engine-firing.config.ts's `resolve.alias` routes
 * `@autopilot/store` straight to the leaf source module that actually
 * defines the two constants telemetry.ts imports — sidestepping both the
 * missing symlink and the native-binding risk turning `symlinkNodeModules`
 * back on would reintroduce.
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
    configFile: 'config/mutation/vitest.engine-firing.config.ts',
  },
  mutate: ['packages/engine/src/firing.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-firing/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-firing/mutation.json' },
  tempDirName: '.stryker-tmp-engine-firing',
};
