// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/otlp.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after deliverable.ts
 * (stryker.dashboard-deliverable.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * otlp.ts is the env-driven OTLP endpoint/header resolver (see its own file
 * header): it decides, from `OTEL_EXPORTER_OTLP_*` env vars, whether tracing
 * export is configured at all and, if so, which endpoint and headers to use.
 * A surviving mutant here (a flipped precedence between the traces-specific
 * and generic env vars, a broken `/v1/traces` suffix check, or a header
 * parse edge case) could silently export traces to the wrong endpoint or
 * drop auth headers.
 *
 * Same shape of good target as deliverable.ts: zero imports (a fully
 * self-contained pure module) and exercised with concrete expected-output
 * assertions by otlp.test.ts.
 *
 * Wiring Stryker here found three real gaps — no test exercised the
 * `.trim()` on either endpoint env var read, and none used more than one
 * trailing slash to distinguish `/\/+$/` from a single-slash regex — closed
 * with three new whitespace/multi-slash cases. It also found one equivalent
 * mutant: `parseOtlpHeaders`' delimiter check was `eq <= 0`, but the
 * `eq === 0` half (delimiter at position 0) is unobservable — `pair.slice(0,
 * 0)` is always `''`, so the `!key` check right after already discards that
 * pair regardless of which side of the boundary this guard uses. Simplified
 * to `eq < 0` (the delimiter-missing case is the only one this guard can
 * actually observe) with a Stryker disable comment on the boundary it no
 * longer covers.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-otlp.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/otlp.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-otlp/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-otlp/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-otlp',
};
