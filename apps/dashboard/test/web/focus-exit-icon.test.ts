// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 (board web-mtywp7zq-55f3o9): focus mode's Exit focus pill. The
 * rail's Focus button leads with the vendored `maximize`, four corners pushed
 * out, but the pill that floats in the corner once the chrome leaves was bare
 * words, the one control on screen in focus mode.
 *
 * It leads with Lucide's `minimize` now, the same four corners pulled in, so
 * the way out reads as the way in reversed. The icon is decorative, so the
 * button's name stays its words; the label already sat in an inner
 * `[data-i18n]` span, so a locale switch rewrites the words and leaves the
 * icon beside them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { ICON_SHAPES } from '../../src/web/icons.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function exitPill(): HTMLButtonElement {
  const exit = document.getElementById('focus-exit') as HTMLButtonElement;
  expect(exit).not.toBeNull();
  expect(exit.children).toHaveLength(2);
  const icon = exit.firstElementChild!;
  expect(icon.getAttribute('class')).toBe('icon icon-minimize');
  expect(icon.getAttribute('aria-hidden')).toBe('true');
  expect(icon.hasAttribute('width')).toBe(false);
  expect(icon.querySelectorAll('path')).toHaveLength(4);
  expect(exit.lastElementChild!.matches('span[data-i18n="focusExit"]')).toBe(true);
  return exit;
}

describe('focus mode’s Exit focus pill (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('vendors Lucide’s minimize, the maximize corners pulled in', () => {
    expect(ICON_SHAPES['minimize']).toEqual([
      ['path', { d: 'M8 3v3a2 2 0 0 1-2 2H3' }],
      ['path', { d: 'M21 8h-3a2 2 0 0 1-2-2V3' }],
      ['path', { d: 'M3 16h3a2 2 0 0 1 2 2v3' }],
      ['path', { d: 'M16 21v-3a2 2 0 0 1 2-2h3' }],
    ]);
  });

  it('the server prints the pill led by minimize, its name still its words', () => {
    const page = new DOMParser().parseFromString(renderShell(), 'text/html');
    const exit = page.getElementById('focus-exit') as HTMLButtonElement;
    expect(exit.firstElementChild?.getAttribute('class')).toBe('icon icon-minimize');
    expect(exit.textContent).toBe(STRINGS.en.focusExit);
    expect(exit.hasAttribute('aria-label')).toBe(false);
    // The Focus button it reverses still leads with maximize.
    expect(page.querySelector('#focus-toggle > svg')?.getAttribute('class')).toBe(
      'icon icon-maximize',
    );
  });

  // A margin, not display:flex on the pill: a display on .focus-exit would
  // beat the UA's [hidden]{display:none} and leave the pill on screen outside
  // focus mode. The icon keeps the base 1em size, the pill's own type.
  it('spaces the icon from the words without touching the pill’s display', () => {
    const css = layoutCss();
    expect(css).toContain('.focus-exit > .icon { margin-inline-end: 0.35em; }');
    expect(css).not.toMatch(/\.focus-exit \{[^}]*display:/);
  });

  it('shows the iconed pill in focus mode and a locale switch keeps the icon', async () => {
    await boot();
    expect(exitPill().hidden).toBe(true);

    (document.getElementById('focus-toggle') as HTMLButtonElement).click();
    expect(exitPill().hidden).toBe(false);
    expect(exitPill().textContent).toBe(STRINGS.en.focusExit);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(exitPill().textContent).toBe(STRINGS.he.focusExit);
  });

  it('leaves the shown pill axe-clean (WCAG A/AA)', async () => {
    await boot();
    (document.getElementById('focus-toggle') as HTMLButtonElement).click();
    // Real timers for axe's own scheduling; the pill is already shown.
    vi.useRealTimers();

    const results = await axe.run(document.getElementById('focus-exit') as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
