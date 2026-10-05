// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the minimised Getting
 * started ladder's social half. Folded, the ladder keeps one strip line: how
 * far along, and whether the social half is open or one press away. Its head
 * leads every control with an icon (compass, clock, arrow-left) and each step
 * it folds away draws one, but the strip's "Go social: connect GitHub" button
 * and its "GitHub connected — social unlocked" line were bare words.
 *
 * The button leads with the `key-round` the ladder's own Connect GitHub step
 * draws, since it is that step, one press away; the line leads with
 * `lock-open`, since it says the social half is unlocked. Nothing is newly
 * vendored. Each icon is decorative, so the button's name stays its words.
 * The ladder's client half draws both once at init with the `obIcon()` its
 * steps' marks use, splicing `lock-open` beside their shapes; the locale
 * sweep keeps a leading icon and the strip only toggles `hidden`, so a
 * Hebrew switch rewrites only the words and a repaint keeps both. Drives
 * the REAL client bundle in jsdom, the way onboarding-minimized.test.ts
 * does.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';
import { ONBOARDING_STEPS } from '../../src/web/onboarding.js';
import { LADDER_ICONS } from '../../src/web/features/onboarding.js';

const FLOWN_PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'registered',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 3,
  shipped: 1,
  cost: 1,
  tokensIn: 100,
  tokensOut: 50,
  shipRate: 0.33,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
  anomalies: [],
};

function state(projects: unknown[]) {
  return {
    generatedAt: 1,
    totals: {
      projects: projects.length,
      flying: 0,
      needsYou: 0,
      firings: 3,
      shipped: 1,
      openFindings: 0,
      cost: 1,
    },
    projects,
    empty: projects.length === 0,
  };
}

const ALL_MARKS = {
  'add-sample': 1,
  'read-back': 1,
  'connect-github': 1,
  'publish-finding': 1,
  'submit-fix': 1,
};

async function boot(projects: unknown[]): Promise<void> {
  document.open();
  document.write(renderShell());
  document.close();
  const payload = state(projects);
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }) as Response);
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const social = (): HTMLButtonElement =>
  document.getElementById('ob-strip-social') as HTMLButtonElement;
const socialOn = (): HTMLElement => document.getElementById('ob-strip-social-on') as HTMLElement;
const minimize = (): HTMLButtonElement =>
  document.getElementById('ob-minimize') as HTMLButtonElement;

/** The element leads with the named decorative icon, drawn shape for shape
 *  from the vendored data, and reads as its words alone. */
function expectLeadingIcon(el: HTMLElement, name: string, words: string): void {
  const first = el.firstElementChild;
  expect(first).not.toBeNull();
  expect(first!.tagName.toLowerCase()).toBe('svg');
  expect(first!.getAttribute('class')).toBe('icon icon-' + name);
  expect(first!.getAttribute('aria-hidden')).toBe('true');
  expect(first!.getAttribute('focusable')).toBe('false');
  expect([...first!.children].map((c) => [c.tagName.toLowerCase(), c.getAttribute('d')])).toEqual(
    ICON_SHAPES[name]!.map(([tag, attrs]) => [tag, attrs['d'] ?? null]),
  );
  expect(el.querySelectorAll('svg')).toHaveLength(1);
  expect(el.textContent).toBe(words);
  expect(el.hasAttribute('aria-label')).toBe(false);
}

describe('the minimised ladder’s social half leads with vendored icons (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('splices both icons beside the steps’ own shapes, shape for shape', () => {
    expect(LADDER_ICONS['key-round']).toEqual(ICON_SHAPES['key-round']);
    expect(LADDER_ICONS['lock-open']).toEqual(ICON_SHAPES['lock-open']);
  });

  it('Go social leads with key-round, decorative, named by its words', async () => {
    localStorage.setItem('ap-ob-collapsed', '1');
    await boot([]);

    expect(social().hidden).toBe(false);
    expectLeadingIcon(social(), 'key-round', STRINGS.en.obSocialOff);
    expect(social().getAttribute('data-i18n')).toBe('obSocialOff');
  });

  it('draws the icon of the Connect GitHub step it stands for', async () => {
    await boot([]);
    const step = ONBOARDING_STEPS.find((s) => s.id === 'connect-github');
    expect(step?.icon).toBe('key-round');
    const mark = document.querySelector('.ob-step[data-step="connect-github"] .ob-step-mark svg');
    expect(mark).not.toBeNull();
    expect([...mark!.children].map((c) => [c.tagName.toLowerCase(), c.getAttribute('d')])).toEqual(
      [...social().querySelector('svg')!.children].map((c) => [
        c.tagName.toLowerCase(),
        c.getAttribute('d'),
      ]),
    );
  });

  it('the social-unlocked line leads with lock-open once GitHub is connected', async () => {
    localStorage.setItem('ap-ob-marks', JSON.stringify(ALL_MARKS));
    await boot([FLOWN_PROJECT]);

    expect(socialOn().hidden).toBe(false);
    expect(social().hidden).toBe(true);
    expectLeadingIcon(socialOn(), 'lock-open', STRINGS.en.obSocialOn);
    expect(socialOn().getAttribute('data-i18n')).toBe('obSocialOn');
  });

  it('a Hebrew switch rewrites the words beside the same icons, and back', async () => {
    localStorage.setItem('ap-ob-collapsed', '1');
    await boot([]);
    const he = document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement;
    expect(he).not.toBeNull();

    he.click();
    expectLeadingIcon(social(), 'key-round', STRINGS.he.obSocialOff);
    expectLeadingIcon(socialOn(), 'lock-open', STRINGS.he.obSocialOn);

    (document.querySelector('[data-lang-btn="en"]') as HTMLButtonElement).click();
    expectLeadingIcon(social(), 'key-round', STRINGS.en.obSocialOff);
    expectLeadingIcon(socialOn(), 'lock-open', STRINGS.en.obSocialOn);
  });

  it('expanding and minimising again repaints the strip with both icons kept', async () => {
    localStorage.setItem('ap-ob-collapsed', '1');
    await boot([]);

    minimize().click();
    minimize().click();
    await vi.advanceTimersByTimeAsync(1);

    expect(social().hidden).toBe(false);
    expectLeadingIcon(social(), 'key-round', STRINGS.en.obSocialOff);
    expectLeadingIcon(socialOn(), 'lock-open', STRINGS.en.obSocialOn);
  });

  it('a click on the icon still opens the Connect popover', async () => {
    localStorage.setItem('ap-ob-collapsed', '1');
    await boot([]);

    (social().querySelector('svg') as SVGElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect((document.getElementById('connect') as HTMLDetailsElement).open).toBe(true);
  });

  it('spaces each icon from its words, like the head’s icon-led buttons', () => {
    expect(layoutCss()).toContain(
      '.ob-strip-social > .icon, .ob-strip-social-on > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the minimised ladder axe-clean (WCAG A/AA), with and without GitHub', async () => {
    const opts = {
      runOnly: {
        type: 'tag' as const,
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
      rules: { 'color-contrast': { enabled: false } },
    };
    localStorage.setItem('ap-ob-collapsed', '1');
    await boot([]);
    vi.useRealTimers();
    let results = await axe.run(document.getElementById('onboarding') as HTMLElement, opts);
    expect(results.violations.map((v) => v.id)).toEqual([]);

    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('ap-ob-marks', JSON.stringify(ALL_MARKS));
    await boot([FLOWN_PROJECT]);
    vi.useRealTimers();
    results = await axe.run(document.getElementById('onboarding') as HTMLElement, opts);
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
