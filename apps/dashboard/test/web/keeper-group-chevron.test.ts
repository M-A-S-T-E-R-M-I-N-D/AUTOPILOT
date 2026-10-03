// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0025 (board web-mtywp7zq-55f3o9), law 1: a project page's two Keeper
 * groups (Rituals, Community) drew their disclosure chevron by hand, a CSS
 * `::after` box with `border-inline-end` and `border-block-end` turned 45°.
 * `border-inline-end` is a logical side, so under `dir="rtl"` the box drew
 * its left and bottom borders instead and the same turn pointed it left
 * while closed and right once open, not down and up. Each summary now
 * carries the vendored `chevron-right`, turned down while closed and up
 * once open. A rotation is physical, so the chevron points the same way in
 * both directions. It drives the real client bundle in jsdom, the way
 * live-worker-lane-grid.test.ts does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [
    {
      id: 'p1',
      slug: 'alpha',
      name: 'Alpha',
      status: 'registered',
      createdAt: 1,
      fileCount: 2,
      totalBytes: 100,
      languages: [],
      topDirs: [],
      hotFiles: [],
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
      activity: [],
      flightLog: [],
      tasks: [],
    },
  ],
  empty: false,
};

/** Every declaration block in the stylesheet whose selector names `needle`,
 *  including one nested in an at-rule such as the reduced-motion query. */
function rulesNaming(css: string, needle: string): string[] {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .filter((block) => {
      const parts = block.split('{');
      return parts.length > 1 && parts[parts.length - 2]!.includes(needle);
    });
}

describe('the Keeper groups draw the vendored chevron (epic 0025)', () => {
  beforeEach(() => {
    // The locale switch below saves 'ap-locale'; never let it reach a later test.
    localStorage.clear();
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leads neither summary with a hand-drawn marker: each ends with a decorative chevron-right, kept across a locale switch', async () => {
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.keeper-rituals-summary')).toHaveLength(2);
    });

    const summaries = () => Array.from(document.querySelectorAll('.keeper-rituals-summary'));
    for (const summary of summaries()) {
      const chevron = summary.lastElementChild;
      expect(chevron?.matches('svg.icon-chevron-right.keeper-rituals-chevron')).toBe(true);
      expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(summaries().map((s) => s.querySelector('.keeper-rituals-title')?.textContent)).toEqual([
      STRINGS.en.keeperRituals,
      STRINGS.en.keeperCommunity,
    ]);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    for (const summary of summaries()) {
      expect(summary.querySelector('svg.keeper-rituals-chevron')).not.toBeNull();
    }
    expect(summaries().map((s) => s.querySelector('.keeper-rituals-title')?.textContent)).toEqual([
      STRINGS.he.keeperRituals,
      STRINGS.he.keeperCommunity,
    ]);
  });

  it('turns the chevron by rotation alone, so it points down then up in either direction', () => {
    const css = layoutCss();
    // No pseudo-element marker survives beside the icon.
    expect(rulesNaming(css, '.keeper-rituals-summary::after')).toEqual([]);
    // No logical border draws a shape whose direction flips under dir=rtl.
    for (const rule of rulesNaming(css, '.keeper-rituals')) {
      expect(rule).not.toMatch(/border-inline-(start|end)\s*:/);
    }
    const [closed] = rulesNaming(css, '.keeper-rituals-chevron');
    expect(closed).toContain('grid-area: chevron');
    expect(closed).toContain('transform: rotate(90deg)');
    const open = rulesNaming(
      css,
      '.keeper-rituals[open] > .keeper-rituals-summary .keeper-rituals-chevron',
    );
    expect(open).toHaveLength(1);
    expect(open[0]).toContain('transform: rotate(-90deg)');
    // No dir=rtl override either: the rotation is the whole story.
    expect(rulesNaming(css, "[dir='rtl'] .keeper-rituals")).toEqual([]);
  });
});
