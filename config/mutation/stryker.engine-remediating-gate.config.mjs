// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/remediating-gate.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — the twenty-first
 * module wired after store's rank.ts + schema.ts (stryker.store.config.mjs),
 * engine's release.ts + pace.ts (stryker.engine-release.config.mjs,
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
 * (stryker.engine-otlp.config.mjs), guard.ts
 * (stryker.engine-guard.config.mjs), and telemetry.ts
 * (stryker.engine-telemetry.config.mjs) — the first module from
 * `packages/engine/src/adapters/` rather than `packages/engine/src/` itself.
 *
 * remediating-gate.ts is the mechanical gate-remediation decision (see the
 * module's own header): fix → additive commit → re-verify → keep or roll
 * back, with NO model in the loop. A surviving mutant here could mean a
 * still-red gate gets reported as shipped, a CRASHED verdict gets
 * remediated instead of passed through untouched (wasting a fixer run on an
 * environment it can't repair), the fixer's own commit fails to roll back
 * when remediation doesn't rescue the gate (polluting history with a
 * mismatched autofix commit), or `deriveFormatFixCommand` silently derives
 * the wrong write-mode command from a differently-shaped format:check spec
 * — exactly the kind of trust-critical orchestration where "tests pass but
 * assert nothing" is unacceptable.
 *
 * remediating-gate.ts's only runtime imports are `../ports.js` and
 * `./gate.js`, both `import type` — erased at compile time — so, like
 * containment.ts and guard.ts before it, this needs no `@autopilot/store`
 * alias: no adapters/git.ts, no subprocess, no native binding.
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
    configFile: 'config/mutation/vitest.engine-remediating-gate.config.ts',
  },
  mutate: ['packages/engine/src/adapters/remediating-gate.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-remediating-gate/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-remediating-gate/mutation.json' },
  tempDirName: '.stryker-tmp-engine-remediating-gate',
};
