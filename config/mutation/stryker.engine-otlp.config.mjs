// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/otlp.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the eighteenth module wired
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
 * (stryker.engine-guard-hook.config.mjs), and stream.ts
 * (stryker.engine-stream.config.mjs), widening one more slice.
 *
 * otlp.ts maps a `FiringRecord` into an OTLP/HTTP JSON trace payload and
 * exports it to a collector (BACKLOG-999 ap-mskoz971-3) — nothing in the
 * engine calls it yet, but a surviving mutant here would still be a latent
 * bug: an attribute silently dropped from `buildAttributes`, the
 * deterministic trace/span ID hashing drifting so retries mint duplicate
 * spans instead of idempotent re-exports, or `statusCode`'s
 * reverted/shipped/unset precedence flipping so a failed firing reports as
 * OK. `exportOtlpResourceSpans`'s never-throw contract (timeout, network
 * error, non-2xx) is exactly the kind of edge a mutant loves to hide in.
 *
 * otlp.ts's only runtime import is `node:crypto` (createHash) plus a
 * type-only import from telemetry.ts — no adapters/git.ts, no subprocess, no
 * workspace package — same safe shape as the seventeen prior modules.
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
    configFile: 'config/mutation/vitest.engine-otlp.config.ts',
  },
  mutate: ['packages/engine/src/otlp.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-otlp/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-otlp/mutation.json' },
  tempDirName: '.stryker-tmp-engine-otlp',
};
