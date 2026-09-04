// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Playwright's second `webServer` (`apps/dashboard/e2e/playwright.config.ts`) —
 * boots the REAL server (real routes, real security headers, real client
 * bundle) against a hand-built, POPULATED `ProjectAggregate[]` instead of
 * `e2e-server.ts`'s empty fleet. Epic 0005 slice 3 (Cockpit MX, fleet home +
 * fly bar) named this exact gap: the empty-fleet baseline never renders a fly
 * bar, a live worker card, or a status badge, so it can't prove the restyle.
 * Unlike `pnpm dashboard:demo` (which runs the real onboarding pipeline
 * against the real DB at `resolveDbPath()`), every field here is
 * hand-authored — deterministic across runs, no store/git side effects.
 * Listens on its own fixed port, distinct from both `e2e-server.ts`'s
 * `E2E_PORT` and the real `DEFAULT_PORT`.
 */

import { createServer, LOOPBACK_HOST } from './server/server.js';
import { buildFleetView } from './read/fleet.js';
import type { ProjectAggregate } from './read/fleet.js';

/** Must match `apps/dashboard/e2e/playwright.config.ts`'s populated-server port. */
export const E2E_POPULATED_PORT = 4320;

// FIXED instant, not Date.now() — must stay equal to playwright.config.ts's
// POPULATED_NOW. The visual specs freeze the BROWSER clock to that constant
// (page.clock.install), so every "Xm ago"/"elapsed" string derived from
// browserNow − serverStamp is identical on every run and every machine; a
// boot-time NOW re-introduced run-to-run layout drift (observed: the live
// firing panel oscillating the populated fleet page between 1038px and
// 1053px as relative-time text re-wrapped — masks hide pixels, not layout).
const NOW = Date.parse('2026-09-01T12:00:00.000Z');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const FLYING_FIRING_ID = 'firing-live-1';

const PROJECTS: readonly ProjectAggregate[] = [
  {
    id: 'demo-checkout-web',
    slug: 'checkout-web',
    name: 'checkout-web',
    status: 'flying',
    createdAt: NOW - 30 * DAY,
    fileCount: 42,
    totalBytes: 128_000,
    languages: [
      { language: 'typescript', files: 38, bytes: 118_000 },
      { language: 'json', files: 4, bytes: 10_000 },
    ],
    topDirs: [
      { dir: 'src', files: 30 },
      { dir: 'test', files: 12 },
    ],
    hotFiles: ['src/checkout.ts', 'src/cart.ts'],
    gate: 'js · vitest run',
    backedUp: true,
    soul: null,
    soulReviewed: true,
    soulProposed: null,
    soulPrevious: null,
    firings: 12,
    shipped: 9,
    cost: 4.32,
    tokensIn: 84_000,
    tokensOut: 21_000,
    cacheReadTokens: 12_000,
    cacheWriteTokens: 3_000,
    turns: 210,
    gauge: { critical: 0, high: 1, medium: 2, low: 3 },
    lastActivityAt: NOW - 2 * MINUTE,
    flightLog: [],
    activity: [
      {
        tool: 'Edit',
        target: 'src/checkout.ts',
        kind: 'file',
        phase: 'do',
        at: NOW - 2 * MINUTE,
        firingId: FLYING_FIRING_ID,
        reasoning: 'Wiring the new stacked discount-code path through checkout.',
        model: 'claude-sonnet-5',
      },
      {
        tool: 'Read',
        target: 'src/cart.ts',
        kind: 'file',
        phase: 'orient',
        at: NOW - 6 * MINUTE,
        firingId: FLYING_FIRING_ID,
      },
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Support stacked discount codes at checkout',
        body: null,
        status: 'in_progress',
        severity: 'medium',
        dimension: 'feature',
        focus: true,
        priority: 1,
        source: 'dashboard',
        at: NOW - 3 * DAY,
        cumulativeCostUsd: 4.32,
        firingCount: 3,
        isRunaway: false,
      },
    ],
    dora: {
      landingFrequency: { windowDays: 7, landings: 5, perDay: 0.71 },
      taskLeadTime: { tasksCompleted: 9, medianLeadTimeMs: 3_600_000, meanLeadTimeMs: 4_100_000 },
      changeFailureRate: { shipped: 9, reverts: 1, rate: 0.1 },
      mttr: { checkpoints: 1, resolved: 1, medianRecoveryMs: 900_000, meanRecoveryMs: 900_000 },
    },
    gateParallel: {
      sampledFirings: 9,
      sequentialMs: 90_000,
      observedMs: 54_000,
      savedMs: 36_000,
      savedPct: 40,
    },
  },
  {
    id: 'demo-billing-svc',
    slug: 'billing-svc',
    name: 'billing-svc',
    status: 'needs_you',
    createdAt: NOW - 60 * DAY,
    fileCount: 18,
    totalBytes: 52_000,
    languages: [{ language: 'python', files: 18, bytes: 52_000 }],
    topDirs: [{ dir: 'app', files: 10 }],
    hotFiles: ['app.py'],
    gate: 'python · pytest',
    backedUp: true,
    soul: null,
    soulReviewed: true,
    soulProposed: 'Prefer decimal.Decimal over float for money math.',
    soulPrevious: null,
    firings: 7,
    shipped: 5,
    cost: 2.1,
    tokensIn: 40_000,
    tokensOut: 9_000,
    cacheReadTokens: 5_000,
    cacheWriteTokens: 1_000,
    turns: 96,
    gauge: { critical: 1, high: 0, medium: 1, low: 0 },
    lastActivityAt: NOW - 3 * DAY,
    flightLog: [
      {
        id: 'firing-billing-6',
        item: 'task-2',
        kind: 'fix',
        sha: 'a1b2c3d',
        shipped: false,
        gateResult: 'failed',
        cost: 0.8,
        tokensIn: 12_000,
        tokensOut: 3_000,
        turns: 34,
        commitSubject: null,
        completion: null,
        failedCheck: 'typecheck',
        died: null,
        at: NOW - 3 * DAY,
      },
    ],
    activity: [],
    tasks: [
      {
        id: 'task-2',
        title: 'Rounding error on prorated invoices',
        body: null,
        status: 'in_progress',
        severity: 'critical',
        dimension: 'cybersecurity',
        focus: false,
        priority: 1,
        source: 'github',
        at: NOW - 5 * DAY,
        cumulativeCostUsd: 3.6,
        firingCount: 4,
        isRunaway: false,
      },
    ],
    dora: {
      landingFrequency: { windowDays: 7, landings: 1, perDay: 0.14 },
      taskLeadTime: { tasksCompleted: 5, medianLeadTimeMs: 7_200_000, meanLeadTimeMs: 8_000_000 },
      changeFailureRate: { shipped: 5, reverts: 2, rate: 0.29 },
      mttr: { checkpoints: 2, resolved: 1, medianRecoveryMs: 1_800_000, meanRecoveryMs: 1_800_000 },
    },
    gateParallel: {
      sampledFirings: 5,
      sequentialMs: 60_000,
      observedMs: 41_000,
      savedMs: 19_000,
      savedPct: 32,
    },
  },
  {
    id: 'demo-edge-router',
    slug: 'edge-router',
    name: 'edge-router',
    status: 'hibernating',
    createdAt: NOW - 90 * DAY,
    fileCount: 9,
    totalBytes: 21_000,
    languages: [{ language: 'go', files: 9, bytes: 21_000 }],
    topDirs: [{ dir: '.', files: 9 }],
    hotFiles: ['router.go'],
    gate: 'go · go test',
    backedUp: true,
    soul: null,
    soulReviewed: true,
    soulProposed: null,
    soulPrevious: null,
    firings: 20,
    shipped: 19,
    cost: 6.5,
    tokensIn: 150_000,
    tokensOut: 38_000,
    cacheReadTokens: 22_000,
    cacheWriteTokens: 5_000,
    turns: 340,
    gauge: { critical: 0, high: 0, medium: 0, low: 1 },
    lastActivityAt: NOW - 10 * DAY,
    flightLog: [
      {
        id: 'firing-edge-20',
        item: 'task-3',
        kind: 'perf',
        sha: 'e5f6a7b',
        shipped: true,
        gateResult: 'passed',
        cost: 0.3,
        tokensIn: 8_000,
        tokensOut: 1_500,
        turns: 18,
        commitSubject: 'perf: cache route lookups behind an LRU',
        completion: 'complete',
        failedCheck: null,
        died: null,
        at: NOW - 10 * DAY,
        durationMs: 4 * MINUTE,
      },
    ],
    activity: [],
    tasks: [],
    dora: {
      landingFrequency: { windowDays: 7, landings: 0, perDay: 0 },
      taskLeadTime: { tasksCompleted: 19, medianLeadTimeMs: 2_400_000, meanLeadTimeMs: 2_600_000 },
      changeFailureRate: { shipped: 19, reverts: 1, rate: 0.05 },
      mttr: { checkpoints: 1, resolved: 1, medianRecoveryMs: 600_000, meanRecoveryMs: 600_000 },
    },
    gateParallel: {
      sampledFirings: 19,
      sequentialMs: 190_000,
      observedMs: 110_000,
      savedMs: 80_000,
      savedPct: 42,
    },
  },
];

const server = createServer({ readState: () => buildFleetView(NOW, PROJECTS) });
server.listen(E2E_POPULATED_PORT, LOOPBACK_HOST, () => {
  process.stdout.write(
    `AUTOPILOT e2e dashboard (populated) → http://${LOOPBACK_HOST}:${E2E_POPULATED_PORT}\n`,
  );
});
