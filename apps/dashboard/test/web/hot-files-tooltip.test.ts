// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the detail panel's
 * "Hot files" section header rendered with zero explanation, and "hot" reads
 * as "frequently changed" — the actual definition (packages/onboarding's
 * rankHotFiles) is "largest by byte size", which is easy to misread without
 * a tooltip, unlike every other stat/chip/pill on the fleet card.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: ['src/big-module.ts', 'src/generated.ts'],
  gate: null,
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: null,
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
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('detail panel hot files header', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('explains "hot" means largest by size, not frequently changed, on hover/focus', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const headings = Array.from(document.querySelectorAll('.detail-h'));
    const hotHeading = headings.find((h) => h.textContent === 'Hot files');
    expect(hotHeading).toBeTruthy();
    expect(hotHeading?.getAttribute('tabindex')).toBe('0');
    expect(hotHeading?.getAttribute('data-tip')).toBe(
      'The largest tracked files by byte size — "hot" means big here, not frequently changed',
    );
    expect(hotHeading?.getAttribute('aria-label')).toBe(
      'Hot files: the largest tracked files by byte size, not frequently changed',
    );
  });
});
