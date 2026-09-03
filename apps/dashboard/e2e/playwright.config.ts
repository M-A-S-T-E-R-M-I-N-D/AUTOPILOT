// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/** Must match `apps/dashboard/src/e2e-server.ts`'s `E2E_PORT`. */
const PORT = 4319;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Must match `apps/dashboard/src/e2e-server-populated.ts`'s `E2E_POPULATED_PORT`. */
export const POPULATED_PORT = 4320;
export const POPULATED_BASE_URL = `http://127.0.0.1:${POPULATED_PORT}`;

/** Must stay equal to `e2e-server-populated.ts`'s fixed `NOW` (that module
 *  boots a server on import, so the constant is mirrored here rather than
 *  imported). The populated visual specs freeze the browser clock to this
 *  instant so every relative-time string renders identically on every run. */
export const POPULATED_NOW = Date.parse('2026-09-01T12:00:00.000Z');

/**
 * Real-browser E2E for the dashboard (unlike the 1168 jsdom unit tests, this
 * drives an actual Chromium against an actual HTTP server). `pnpm run e2e`
 * builds first, then this config's `webServer` boots the compiled
 * `dist/e2e-server.js` — see that file for why it needs no store/fixture —
 * alongside `dist/e2e-server-populated.js` on its own port, for specs (like
 * `visual-populated.spec.ts`) that need a fleet with actual projects in it.
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Deterministic text rendering for the visual baselines: with the
    // populated fixtures' content already byte-stable (frozen browser
    // clock), the ONLY remaining screenshot variance was font
    // antialiasing differing across the heterogeneous windows-latest
    // runner POOL — a constant ~1.9k-pixel signature between two
    // machines rendering identical DOM (observed 2026-09-03: baselines
    // adopted from one runner failed on the next with no size or
    // content delta). LCD subpixel AA and per-device color profiles are
    // the hardware-dependent parts; forcing them off/uniform makes the
    // render portable across the pool.
    launchOptions: {
      args: [
        '--force-color-profile=srgb',
        '--disable-lcd-text',
        '--disable-font-subpixel-positioning',
      ],
    },
  },
  webServer: [
    {
      command: `node ${fileURLToPath(new URL('../dist/e2e-server.js', import.meta.url))}`,
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
    {
      command: `node ${fileURLToPath(new URL('../dist/e2e-server-populated.js', import.meta.url))}`,
      url: `${POPULATED_BASE_URL}/api/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
