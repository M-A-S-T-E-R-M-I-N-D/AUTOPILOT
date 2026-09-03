// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/telemetry.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the twentieth module wired
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
 * (stryker.engine-loop.config.mjs), guard-hook.ts
 * (stryker.engine-guard-hook.config.mjs), stream.ts
 * (stryker.engine-stream.config.mjs), otlp.ts
 * (stryker.engine-otlp.config.mjs), and guard.ts
 * (stryker.engine-guard.config.mjs), widening one more slice.
 *
 * telemetry.ts is the un-fakeable firing record (ENGINE-RESEARCH G2/G3/G4):
 * it parses the agent's self-reported `METRICS:{…}` line, falls back to
 * DERIVING facts from the real commit when the self-report is missing
 * (`iterMetrics = 'inferred'`), and decides `shipped`/`completion` from
 * gate result + sha verification rather than trusting the agent's own
 * claim. A surviving mutant here could mean a gate-failed firing gets
 * recorded as shipped, a malformed self-report silently parses as valid, or
 * an out-of-enum dimension/severity tag leaks through instead of being
 * dropped — exactly the kind of module where "tests pass but assert
 * nothing" would blind the scoreboard.
 *
 * telemetry.ts's only non-type runtime import is `@autopilot/store` (for
 * SEVERITIES/DIMENSIONS) — the `StartedOn` import from resilience.js is
 * `import type`, erased at compile time — so it needs the same
 * `@autopilot/store` alias firing.ts's config introduced (see
 * vitest.engine-telemetry.config.ts), same safe shape as the nineteen prior
 * modules otherwise: no adapters/git.ts, no subprocess.
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
    configFile: 'config/mutation/vitest.engine-telemetry.config.ts',
  },
  mutate: ['packages/engine/src/telemetry.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-telemetry/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-telemetry/mutation.json' },
  tempDirName: '.stryker-tmp-engine-telemetry',
};
