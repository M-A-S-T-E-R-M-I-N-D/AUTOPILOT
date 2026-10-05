// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the guided tour's Skip tour
 * / Close and its "Start the checklist" hand-over. The tour heads every stop
 * with `compass` and steps with chevron-led Back and chevron-trailed Next,
 * but the button that puts it away (Skip tour mid-way, Close on the last
 * stop) and the last stop's hand-over to the checklist were bare words.
 *
 * Skip tour and Close lead with the `x` the What's new Close, the Browse
 * dialog's Cancel and the replay's Exit draw, since each puts the tour away
 * and changes nothing. The hand-over stands where Next stands on every other
 * stop and carries the reader onward into the checklist, so it trails Next's
 * `chevron-right`, mirrored under `dir="rtl"` by the same rule. Nothing is
 * newly vendored, and `tour.ts` rides `/panels.js`, so core does not grow.
 * Each icon is decorative, so a button's name stays its words, and
 * `paintTour()` rebuilds the buttons with `tr()` on every stop, so a Hebrew
 * page paints its words beside the same icons.
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

/** Walks Next until the last stop, where the hand-over replaces it. */
function walkToLastStop(): void {
  for (let i = 0; i < 20; i++) {
    const next = document.querySelector(
      '.tour-dialog button.tour-next',
    ) as HTMLButtonElement | null;
    if (!next) return;
    next.click();
  }
}

/** The put-away button: the only one outside the Back/Next group. */
function skipButton(): HTMLButtonElement | null {
  return document.querySelector('.tour-actions > button');
}

function handOver(): HTMLButtonElement | null {
  return document.querySelector('.tour-dialog button.tour-start');
}

/** The icon sits at the given edge of the button, decorative, and the
 *  button's words, which are also its accessible name, stay its whole text. */
function expectIcon(
  b: HTMLButtonElement | null,
  icon: string,
  edge: 'lead' | 'trail',
  words: string,
): void {
  expect(b).not.toBeNull();
  const svg = edge === 'lead' ? b?.firstElementChild : b?.lastElementChild;
  expect(svg?.tagName.toLowerCase()).toBe('svg');
  expect(svg?.getAttribute('class')).toBe('icon icon-' + icon);
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
  expect(b?.querySelectorAll('svg')).toHaveLength(1);
  expect(b?.textContent).toBe(words);
  expect(b?.hasAttribute('aria-label')).toBe(false);
}

describe('the guided tour’s Skip/Close and hand-over draw vendored icons (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads Skip tour with x on the first stop', async () => {
    await bootAndOpen();

    expectIcon(skipButton(), 'x', 'lead', STRINGS.en.tourSkip);
  });

  it('leads Close with x and trails Start the checklist with chevron-right on the last stop', async () => {
    await bootAndOpen();
    walkToLastStop();

    expectIcon(skipButton(), 'x', 'lead', STRINGS.en.tourClose);
    expectIcon(handOver(), 'chevron-right', 'trail', STRINGS.en.tourToLadder);
    expect(handOver()?.getAttribute('data-tip')).toBe(STRINGS.en.tourToLadderTip);
  });

  it('still puts the tour away from either button', async () => {
    await bootAndOpen();
    skipButton()?.click();
    expect((document.querySelector('.tour-overlay') as HTMLElement).hidden).toBe(true);

    (document.getElementById('tour-btn') as HTMLButtonElement).click();
    walkToLastStop();
    handOver()?.click();
    expect((document.querySelector('.tour-overlay') as HTMLElement).hidden).toBe(true);
  });

  it('paints the Hebrew words beside the same icons', async () => {
    await bootAndOpen('he');

    expectIcon(skipButton(), 'x', 'lead', STRINGS.he.tourSkip);
    walkToLastStop();
    expectIcon(skipButton(), 'x', 'lead', STRINGS.he.tourClose);
    expectIcon(handOver(), 'chevron-right', 'trail', STRINGS.he.tourToLadder);
  });

  it('spaces the x from its words; the hand-over rides the nav’s chevron spacing and mirror', () => {
    const css = layoutCss();

    expect(css).toContain('.tour-skip > .icon { margin-inline-end: 0.25em; }');
    expect(css).toContain('.tour-nav button > .icon:last-child { margin-inline-start: 0.25em; }');
    expect(css).toContain("[dir='rtl'] .tour-nav button > .icon { transform: scaleX(-1); }");
  });

  it('leaves the last stop axe-clean with both icons drawn (WCAG A/AA)', async () => {
    await bootAndOpen();
    walkToLastStop();
    expect(handOver()).not.toBeNull();
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
