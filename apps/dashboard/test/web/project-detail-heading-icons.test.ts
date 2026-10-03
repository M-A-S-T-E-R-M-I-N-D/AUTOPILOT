// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the project page's panel
 * headings. On the Data tab, Health, Evolution, DORA and gate parallelism lead
 * with a stroke icon, but the two chart panels between them, "Firing
 * activity" and "Evolution — is the agent improving?", headed with bare
 * words; so did "Recently shipped" at the top of the Fleet tab, above the
 * iconed Landing and Flight console panels. Each now leads with its own
 * decorative vendored icon (`calendar-days`, `trending-up`, `package-check`).
 *
 * The STRINGS key stays on the `<h2>` itself, as the i18n tests
 * (detail-panel-i18n, evolution-i18n, flight-summary-i18n) pin, and
 * `setSweptText()` keeps a leading `svg.icon` through every sweep, the way the
 * tasks heading's focus-mode `target` survives.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0); // Wed 2026-08-12 12:00 UTC

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.12,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: NOW,
  activity: [],
  tasks: [],
  // One shipped firing shows the heatmap and the flight summary; one
  // verdict-carrying week shows the evolution trend chart.
  flightLog: [
    {
      id: 'f1',
      shipped: true,
      item: null,
      cost: 0.12,
      sha: 'abc1234',
      at: NOW - 60_000,
      kind: 'fix',
    },
  ],
  evaluationLabelDayCounts: [{ day: '2026-08-10', approved: 3, rejected: 1 }],
};

const STATE = {
  generatedAt: NOW,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.12,
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

const HEADINGS = [
  { selector: '.heatmap-wrap > h2.detail-h', key: 'firingActivity', icon: 'calendar-days' },
  { selector: '.eval-trend-wrap > h2.detail-h', key: 'evolutionTrendTitle', icon: 'trending-up' },
  { selector: '.flight-summary > h2.detail-h', key: 'flightSummaryTitle', icon: 'package-check' },
] as const;

describe('the project page detail headings (epic 0025 slice 2)', () => {
  beforeEach(() => {
    localStorage.removeItem('ap-locale');
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(HEADINGS)('$key leads with the decorative $icon icon beside its words', async (h) => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const title = document.querySelector(h.selector);
    expect(title).not.toBeNull();
    expect(title?.getAttribute('data-i18n')).toBe(h.key);
    const icon = title?.firstElementChild;
    expect(icon?.getAttribute('class')).toBe('icon icon-' + h.icon);
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelectorAll('path, rect').length).toBeGreaterThan(0);
    expect(title?.querySelectorAll('svg')).toHaveLength(1);
    expect(title?.textContent).toBe(STRINGS.en[h.key]);
  });

  it('switching to Hebrew translates all three headings and keeps their icons', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    for (const h of HEADINGS) {
      const title = document.querySelector(h.selector);
      expect(title?.textContent).toBe(STRINGS.he[h.key]);
      expect(title?.firstElementChild?.getAttribute('class')).toBe('icon icon-' + h.icon);
    }
  });
});
