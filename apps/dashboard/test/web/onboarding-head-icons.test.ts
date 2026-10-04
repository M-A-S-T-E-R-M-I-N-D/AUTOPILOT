// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Getting started
 * checklist's head. Its title leads with `compass` and its minimize button
 * draws `arrow-left`, but the two buttons between them, "What do these words
 * mean?" and "Remind me later", were bare words.
 *
 * "What do these words mean?" opens the guided tour, so it leads with the
 * `compass` the overflow menu's Tour item and the tour's own title draw.
 * "Remind me later" puts the checklist off for the day, so it leads with the
 * `clock` the update banner's Later draws for the same kind of put-off.
 * Nothing is newly vendored, and both buttons are server-printed markup the
 * locale sweep keeps a leading icon in, so core does not grow. Each icon is
 * decorative, so a button's name stays its words. Executes the ACTUAL client
 * bundle (`clientJs()`) in jsdom, the convention `onboarding-minimized.test.ts`
 * and `tour-nav-chevrons.test.ts` use.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const tourLink = (): HTMLButtonElement =>
  document.getElementById('ob-tour-link') as HTMLButtonElement;
const snooze = (): HTMLButtonElement => document.getElementById('ob-snooze') as HTMLButtonElement;

/** The button leads with the named decorative icon, drawn shape for shape
 *  from the vendored data, and is named by its words. */
function expectIconed(b: HTMLButtonElement, icon: string): void {
  const first = b.firstElementChild;
  expect(first, icon).not.toBeNull();
  expect(first!.tagName.toLowerCase(), icon).toBe('svg');
  expect(first!.getAttribute('class'), icon).toBe('icon icon-' + icon);
  expect(first!.getAttribute('aria-hidden'), icon).toBe('true');
  expect(first!.getAttribute('focusable'), icon).toBe('false');
  expect(
    [...first!.children].map((c) => c.tagName.toLowerCase()),
    icon,
  ).toEqual(ICON_SHAPES[icon]!.map(([tag]) => tag));
  expect(b.querySelectorAll('svg'), icon).toHaveLength(1);
  expect(b.hasAttribute('aria-label'), icon).toBe(false);
}

function switchTo(lang: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${lang}"]`) as HTMLButtonElement).click();
}

describe('the Getting started checklist’s head buttons lead with stroke icons (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('ap-tour-seen', '1');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads What do these words mean? with compass and Remind me later with clock, their words unchanged', async () => {
    await boot();

    expectIconed(tourLink(), 'compass');
    expectIconed(snooze(), 'clock');
    expect(tourLink().textContent).toBe(STRINGS.en.obTourLink);
    expect(snooze().textContent).toBe(STRINGS.en.obSnooze);
  });

  it('a locale switch rewrites both buttons’ words and keeps both icons', async () => {
    await boot();

    switchTo('he');
    expect(tourLink().textContent).toBe(STRINGS.he.obTourLink);
    expect(snooze().textContent).toBe(STRINGS.he.obSnooze);
    expectIconed(tourLink(), 'compass');
    expectIconed(snooze(), 'clock');

    switchTo('en');
    expect(tourLink().textContent).toBe(STRINGS.en.obTourLink);
    expect(snooze().textContent).toBe(STRINGS.en.obSnooze);
    expectIconed(tourLink(), 'compass');
    expectIconed(snooze(), 'clock');
  });

  it('a click on the compass still opens the tour', async () => {
    await boot();
    expect(document.querySelector('.tour-dialog')).toBeNull();

    tourLink().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('.tour-dialog')).not.toBeNull();
    expectIconed(tourLink(), 'compass');
  });

  it('a click on the clock still snoozes the checklist, and the icon stays', async () => {
    await boot();
    const panel = document.getElementById('onboarding') as HTMLElement;
    expect(panel.classList.contains('is-collapsed')).toBe(false);

    snooze().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(localStorage.getItem('ap-ob-snooze')).not.toBeNull();
    expect(panel.classList.contains('is-collapsed')).toBe(true);
    expectIconed(snooze(), 'clock');
    expect(snooze().textContent).toBe(STRINGS.en.obSnooze);
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain(
      '.ob-tour-link > .icon, .ob-snooze > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the checklist head axe-clean (WCAG A/AA)', async () => {
    await boot();
    const head = document.querySelector('#onboarding .ob-head') as HTMLElement;
    expect(head.closest('[hidden]')).toBeNull();

    vi.useRealTimers();
    const results = await axe.run(head, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
