// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n wiring for the project page's "is the agent improving?" evolution
 * cluster (`web/features/evolution.ts`, board web-msnsndki-dz3vn1): the trend
 * chart's `<h2>` heading and the stat-tile summary's `<h3>` heading are
 * client-built `el()` nodes — `scripts/i18n/find-untagged-strings.mjs` listed
 * both as untagged. Each must carry its STRINGS key so `translateDom()` (page
 * load AND language switch) renders it in the active locale, the same contract
 * the process-health cluster's three titles already meet. Both panels are
 * built synchronously inside `renderProjectPage()` and ride its page-level
 * sweep — no async re-render path of their own, so no panel-local sweep is
 * needed. Both stay hidden until at least one operator verdict exists, so the
 * boot below seeds one.
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
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 0,
  shipped: 0,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 0.5,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: NOW,
  flightLog: [],
  activity: [],
  tasks: [],
  // One verdict-carrying week inside the trailing window — enough to show
  // both panels, which otherwise return null.
  evaluationLabelDayCounts: [{ day: '2026-08-10', approved: 3, rejected: 1 }],
};

const STATE = {
  generatedAt: NOW,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0.1,
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

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

const TITLES: ReadonlyArray<readonly [selector: string, key: keyof typeof STRINGS.en]> = [
  ['.eval-trend-wrap h2.detail-h', 'evolutionTrendTitle'],
  ['.evolution-panel h3.evolution-title', 'evolutionSummaryTitle'],
];

describe('the evolution cluster headings i18n wiring (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.removeItem('ap-locale');
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags both headings with their STRINGS keys', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    for (const [selector, key] of TITLES) {
      const title = document.querySelector(selector);
      expect(title, selector).not.toBeNull();
      expect(title?.textContent, selector).toBe(STRINGS.en[key]);
      expect(title?.getAttribute('data-i18n'), selector).toBe(key);
    }
  });

  it('switching to Hebrew translates both headings', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    switchToHebrew();

    for (const [selector, key] of TITLES) {
      expect(document.querySelector(selector)?.textContent, selector).toBe(STRINGS.he[key]);
    }
  });

  it('keeps the two Hebrew headings distinct — the summary must not just repeat the chart title', () => {
    expect(STRINGS.he.evolutionTrendTitle).not.toBe(STRINGS.en.evolutionTrendTitle);
    expect(STRINGS.he.evolutionSummaryTitle).not.toBe(STRINGS.en.evolutionSummaryTitle);
    expect(STRINGS.he.evolutionSummaryTitle).not.toBe(STRINGS.he.evolutionTrendTitle);
    // The 🧬 glyph is part of the heading's identity in both locales.
    expect(STRINGS.he.evolutionSummaryTitle.startsWith('🧬')).toBe(true);
  });
});
