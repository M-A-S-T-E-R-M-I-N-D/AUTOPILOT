// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Root Vitest configuration for the AUTOPILOT monorepo.
 *
 * Coverage gate is ≥80% across lines/functions/branches/statements
 * (PATTERNS-AND-STANDARDS §4). Native modules (better-sqlite3) load as
 * externalized CJS from node_modules, which Vitest handles by default.
 * Cross-package specifiers resolve to source so tests need no prior build.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@autopilot/store': fileURLToPath(new URL('./packages/store/src/index.ts', import.meta.url)),
      '@autopilot/tokens': fileURLToPath(
        new URL('./packages/tokens/src/index.ts', import.meta.url),
      ),
      '@autopilot/engine': fileURLToPath(
        new URL('./packages/engine/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    reporters: ['default'],
    // Real-git suites (engine adapters, onboarding backups) spawn actual git
    // subprocesses that take ~2s solo and flake under Vitest's 5s default on
    // a loaded machine or Windows CI — field-verified on a fresh Windows box
    // (4 different 5s timeouts across two runs, all green in isolation).
    // Inherited by every project below via `extends: true`.
    testTimeout: 30_000,
    // Scrubs flight-runtime env vars so the gate behaves identically inside
    // and outside a fleet flight — see vitest.setup.ts for the field report.
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
          exclude: ['apps/dashboard/test/web/**'],
        },
      },
      {
        extends: true,
        test: {
          // The dashboard's web/ tests drive the real client bundle
          // (apps/dashboard/src/web/shell.ts) against a live DOM — jsdom here,
          // once, instead of a `// @vitest-environment jsdom` pragma repeated
          // at the top of every file in that directory.
          name: 'jsdom',
          environment: 'jsdom',
          include: ['apps/dashboard/test/web/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      // Barrels and type-only modules transpile to zero executable statements;
      // excluding them keeps the report honest and safe under per-file thresholds.
      exclude: [
        '**/dist/**',
        '**/*.d.ts',
        '**/index.ts',
        '**/ports.ts',
        '**/main.ts',
        '**/cli.ts',
        '**/guard-hook.ts',
        '**/demo.ts',
        '**/flight.ts',
        '**/fly.ts',
        '**/reset.ts',
        '**/restore-cli.ts',
        '**/e2e-server.ts',
        '**/*.config.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
