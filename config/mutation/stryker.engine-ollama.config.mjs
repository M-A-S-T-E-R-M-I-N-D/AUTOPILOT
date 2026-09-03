// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/ollama.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — widening one more
 * self-contained slice, same "safe shape" reasoning as otlp.ts
 * (stryker.engine-otlp.config.mjs): ollama.ts's only runtime import is a
 * type-only import from `../ports.js` plus the injectable `fetchImpl` its
 * own tests fake (never a real network call) — no adapters/git.ts, no
 * subprocess, no `@autopilot/store` import. That last point matters:
 * stryker.store.config.mjs documents a root-cause-isolated, upstream-blocked
 * Stryker limitation where any file that transitively imports
 * `@autopilot/store` crashes inside Stryker's sandbox (pnpm's non-flat
 * `node_modules` never copies `better-sqlite3` in) — it names
 * `adapters/pacer.ts` and `adapters/store.ts` as blocked on exactly that.
 * ollama.ts has no such import, so it doesn't hit that wall.
 *
 * A surviving mutant here would be a latent bug: parseOllamaResponse's
 * malformed/HTTP-error branching silently misreporting isError, a duration
 * unit conversion drifting, or OllamaModel's AbortController timeout/cleanup
 * failing to fire — exactly the kind of edge this adapter's own doc comment
 * calls out ("never rejects" contract) that a mutant loves to hide in.
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
    configFile: 'config/mutation/vitest.engine-ollama.config.ts',
  },
  mutate: ['packages/engine/src/adapters/ollama.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-ollama/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-ollama/mutation.json' },
  tempDirName: '.stryker-tmp-engine-ollama',
};
