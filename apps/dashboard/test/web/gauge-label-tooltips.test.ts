// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the fleet card's gauge label (`.gauge-label
 * span`) — the "N open findings" count and the "last activity" timestamp
 * above the severity gauge — used to be plain, unexplained text, unlike the
 * gauge segments beneath it (see gauge-langbar-tooltips.test.ts) and every
 * other "ago" label in the shell. They now explain themselves on hover/focus
 * too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 4,
  shipped: 3,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.75,
  recentShipRate: 0.8,
  openFindings: 3,
  gauge: { critical: 1, high: 1, medium: 0, low: 1 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 4,
    shipped: 3,
    openFindings: 3,
    cost: 0.42,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('gauge label explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives every gauge-label span a tooltip and accessible label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const spans = Array.from(document.querySelectorAll('.card-gauge .gauge-label span'));
    expect(spans.length).toBe(2);
    for (const span of spans) {
      expect(span.getAttribute('data-tip')).toBeTruthy();
      expect(span.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('keeps only the first span as a real Tab stop (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const spans = Array.from(document.querySelectorAll('.card-gauge .gauge-label span'));
    expect(spans[0]?.getAttribute('tabindex')).toBe('0');
    expect(spans[1]?.getAttribute('tabindex')).toBe('-1');
  });

  it('labels the open-findings count and the last-activity timestamp distinctly', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const spans = Array.from(document.querySelectorAll('.card-gauge .gauge-label span'));
    expect(spans[0]?.textContent).toBe('3 open findings');
    expect(spans[0]?.getAttribute('data-tip')).toMatch(/unresolved/i);
    expect(spans[1]?.getAttribute('data-tip')).toMatch(/last had any activity/i);
  });
});
