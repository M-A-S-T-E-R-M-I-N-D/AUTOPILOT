// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's contribution heatmap (`web/features/activity-heatmap.ts`)
 * carried two hardcoded English strings past every other i18n slice (board
 * web-msnsndki-dz3vn1): the SVG's own `aria-label` ("Firing activity over the
 * last N weeks — green days shipped, red days had a death", a one-slot
 * `{weeks}` template — the heading beside it, `firingActivity`, was already
 * tagged) and the color-key legend paragraph beneath the grid. Both are
 * plain `setAttribute`/DOM-text calls the `pnpm i18n:untagged` scanner cannot
 * see, the same blind spot `gauge-label-i18n.test.ts` documents for the fleet
 * card. The aria-label takes the one-slot template route already proven by
 * `cardActivityAria`: `tr()` paints it at build time and the node carries
 * `data-i18n-aria-template` + `data-i18n-args` so a mid-session switch flips
 * it in place; the legend is a plain `data-i18n` swap.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { HEATMAP_WEEKS } from '../../src/web/heatmap.js';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0); // Wed 2026-08-12 12:00 UTC

function projectWith(flightLog: unknown[]) {
  return {
    id: 'p1',
    slug: 'alpha',
    name: 'Alpha',
    status: 'idle',
    createdAt: 1,
    fileCount: 2,
    totalBytes: 100,
    languages: [],
    topDirs: [],
    hotFiles: [],
    gate: null,
    backedUp: false,
    firings: flightLog.length,
    shipped: 0,
    cost: 0,
    tokensIn: 0,
    tokensOut: 0,
    shipRate: null,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: NOW,
    flightLog,
    activity: [],
    tasks: [],
  };
}

function stateWith(project: ReturnType<typeof projectWith>) {
  return {
    generatedAt: NOW,
    totals: {
      projects: 1,
      flying: 0,
      needsYou: 0,
      firings: 1,
      shipped: 1,
      openFindings: 0,
      cost: 0,
    },
    projects: [project],
    empty: false,
  };
}

const PROJECT = projectWith([
  {
    id: 'f1',
    item: null,
    kind: 'fix',
    sha: 'abc1234',
    shipped: true,
    gateResult: null,
    cost: 0.01,
    tokensIn: 1,
    tokensOut: 1,
    turns: 1,
    commitSubject: null,
    failedCheck: null,
    died: null,
    at: NOW,
  },
]);

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => stateWith(PROJECT) }) as unknown as Response,
  );
  new Function(clientJs())();
}

function svg(): SVGElement {
  const node = document.querySelector<SVGElement>('.heatmap-grid');
  expect(node).not.toBeNull();
  return node as SVGElement;
}

function legend(): HTMLElement {
  const node = document.querySelector<HTMLElement>('.heatmap-legend');
  expect(node).not.toBeNull();
  return node as HTMLElement;
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function heTemplate(step: number): string {
  return STRINGS.he.activityHeatmapAria.split('{weeks}').join(String(step));
}

describe('project-page activity heatmap i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('both new keys exist in every locale, keep their slot, and Hebrew actually translates', () => {
    for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
      expect(STRINGS[locale].activityHeatmapAria, locale).toBeTruthy();
      expect(STRINGS[locale].activityHeatmapAria, locale).toContain('{weeks}');
      expect(STRINGS[locale].activityHeatmapLegend, locale).toBeTruthy();
    }
    expect(STRINGS.he.activityHeatmapAria).not.toBe(STRINGS.en.activityHeatmapAria);
    expect(STRINGS.he.activityHeatmapLegend).not.toBe(STRINGS.en.activityHeatmapLegend);
  });

  it('tags the grid aria-label as a one-slot template and the legend as a plain key, English intact', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const grid = svg();
    expect(grid.getAttribute('data-i18n-aria-template')).toBe('activityHeatmapAria');
    expect(JSON.parse(grid.getAttribute('data-i18n-args') as string)).toEqual({
      weeks: HEATMAP_WEEKS,
    });
    expect(grid.getAttribute('aria-label')).toBe(
      STRINGS.en.activityHeatmapAria.replaceAll('{weeks}', String(HEATMAP_WEEKS)),
    );

    const p = legend();
    expect(p.getAttribute('data-i18n')).toBe('activityHeatmapLegend');
    expect(p.textContent).toBe(STRINGS.en.activityHeatmapLegend);
  });

  it('switching to Hebrew flips both the grid aria-label and the legend text in place', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    clickLocale('he');

    expect(svg().getAttribute('aria-label')).toBe(heTemplate(HEATMAP_WEEKS));
    expect(legend().textContent).toBe(STRINGS.he.activityHeatmapLegend);
  });

  it('a saved Hebrew locale paints both strings in Hebrew at build, before any switch', async () => {
    localStorage.setItem('ap-locale', 'he');
    boot();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.documentElement.lang).toBe('he');
    expect(svg().getAttribute('aria-label')).toBe(heTemplate(HEATMAP_WEEKS));
    expect(legend().textContent).toBe(STRINGS.he.activityHeatmapLegend);
  });

  it('switching back to English restores the exact pre-i18n text', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    clickLocale('he');

    clickLocale('en');

    expect(svg().getAttribute('aria-label')).toBe(
      STRINGS.en.activityHeatmapAria.replaceAll('{weeks}', String(HEATMAP_WEEKS)),
    );
    expect(legend().textContent).toBe(STRINGS.en.activityHeatmapLegend);
  });
});
