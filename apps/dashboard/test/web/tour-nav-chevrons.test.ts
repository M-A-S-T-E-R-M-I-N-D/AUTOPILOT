// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the guided tour's Back and
 * Next. The tour's title leads with the `compass` its overflow item draws,
 * and the Firing Replay steps through its actions with a `chevron-left` Prev
 * and a `chevron-right` Next, but the tour stepped through its stops with
 * bare-word Back and Next buttons.
 *
 * Back leads with that replay's `chevron-left` and Next trails with its
 * `chevron-right`, both mirrored under `dir="rtl"`, where "back" points right,
 * like the replay's pair. Nothing is newly vendored, and `tour.ts` rides
 * `/panels.js`, so core does not grow. Each icon is decorative, so a button's
 * name stays its words; `paintTour()` rebuilds the buttons with `tr()` on
 * every stop, so a Hebrew page paints its words beside the same chevrons.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

async function bootAndOpen(locale?: 'he'): Promise<void> {
  document.open();
  document.write(renderShell());
  document.close();
  // Seeded as already-dismissed so only the Tour item opens the dialog.
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  if (locale)
    (document.querySelector('[data-lang-btn="' + locale + '"]') as HTMLButtonElement).click();
  (document.getElementById('tour-btn') as HTMLButtonElement).click();
}

function navButton(text: string): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll('.tour-nav button'));
  return (buttons.find((b) => b.textContent === text) as HTMLButtonElement | undefined) ?? null;
}

/** The chevron sits at the given edge of the button, decorative, and the
 *  button's words, which are also its accessible name, stay its whole text. */
function expectChevron(b: HTMLButtonElement | null, icon: string, edge: 'lead' | 'trail'): void {
  expect(b).not.toBeNull();
  const svg = edge === 'lead' ? b?.firstElementChild : b?.lastElementChild;
  expect(svg?.tagName.toLowerCase()).toBe('svg');
  expect(svg?.getAttribute('class')).toBe('icon icon-' + icon);
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
  expect(b?.querySelectorAll('svg')).toHaveLength(1);
  expect(b?.hasAttribute('aria-label')).toBe(false);
}

function nextButton(): HTMLButtonElement | null {
  return document.querySelector('.tour-dialog button.tour-next');
}

describe('the guided tour’s Back and Next draw vendored chevrons (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('Next trails with chevron-right on the first stop, which has no Back', async () => {
    await bootAndOpen();

    expect(navButton(STRINGS.en.tourBack)).toBeNull();
    const next = nextButton();
    expect(next?.textContent).toBe(STRINGS.en.tourNext);
    expectChevron(next, 'chevron-right', 'trail');
  });

  it('Back leads with chevron-left on every later stop, and Next keeps its chevron', async () => {
    await bootAndOpen();

    let middleStops = 0;
    for (let i = 0; i < 20; i++) {
      const next = nextButton();
      if (!next) break;
      next.click();
      expectChevron(navButton(STRINGS.en.tourBack), 'chevron-left', 'lead');
      if (nextButton()) {
        expectChevron(nextButton(), 'chevron-right', 'trail');
        middleStops++;
      }
    }
    expect(middleStops).toBeGreaterThan(0);
    // The last stop hands over to the checklist instead of advancing.
    expect(document.querySelector('.tour-start')?.querySelector('svg')).toBeNull();
  });

  it('paints the Hebrew words beside the same chevrons', async () => {
    await bootAndOpen('he');

    const next = nextButton();
    expect(next?.textContent).toBe(STRINGS.he.tourNext);
    expectChevron(next, 'chevron-right', 'trail');
    next?.click();
    const back = navButton(STRINGS.he.tourBack);
    expectChevron(back, 'chevron-left', 'lead');
  });

  it('spaces each chevron from its words and mirrors both under dir=rtl', () => {
    const css = layoutCss();

    expect(css).toContain('.tour-nav button > .icon:first-child { margin-inline-end: 0.25em; }');
    expect(css).toContain('.tour-nav button > .icon:last-child { margin-inline-start: 0.25em; }');
    expect(css).toContain("[dir='rtl'] .tour-nav button > .icon { transform: scaleX(-1); }");
  });

  it('leaves the dialog axe-clean with both chevrons drawn (WCAG A/AA)', async () => {
    await bootAndOpen();
    nextButton()?.click();
    expect(navButton(STRINGS.en.tourBack)).not.toBeNull();
    const dialog = document.querySelector('.tour-dialog') as Element;
    // axe schedules its own checks on timers.
    vi.useRealTimers();

    const results = await axe.run(dialog, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
