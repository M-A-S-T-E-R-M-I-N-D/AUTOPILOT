// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Keeper queue's act
 * button. Each queue row ends with one exit action proxied to the panel's own
 * button (a task's approve, a PR's Apply, a pool issue's Claim, a backlog
 * row's confirm done, the wisdom banner's ratify), and every one of those
 * leads with a stroke icon now. The queue copied only the words, so the same
 * action read as an icon-led button in its panel and bare words in the queue
 * that leads the Keeper subject.
 *
 * The act button leads with the icon of the button it presses, copied shape
 * for shape, so the two read as one action; a panel button with no leading
 * icon still gives bare words. The icon is decorative, so the act's name
 * stays its words. `subject-nav.ts` rides `/panels.js`, so core does not grow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [{ dir: 'src', files: 3 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 6,
  shipped: 1,
  cost: 9,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.16,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [{ id: 't2', title: 'self-proposed', status: 'needs_approval' }],
  anomalies: [],
  soulReviewed: true,
  soulProposed: null,
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 6, shipped: 1, openFindings: 0, cost: 9 },
  projects: [PROJECT],
  empty: false,
};

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const approve = (): HTMLButtonElement =>
  document.querySelector('[data-task-approve="t2"]') as HTMLButtonElement;

function act(): HTMLButtonElement {
  const rows = document.querySelectorAll('#keeper-queue .keeper-queue-item');
  expect(rows).toHaveLength(1);
  return rows[0]!.querySelector('.keeper-queue-act') as HTMLButtonElement;
}

/** The act leads with the approve button's own `check`, drawn shape for
 *  shape, decorative, and is named by the approve button's words. */
function expectIconed(lang: 'en' | 'he'): void {
  const b = act();
  const first = b.firstElementChild;
  expect(first).not.toBeNull();
  expect(first!.tagName.toLowerCase()).toBe('svg');
  expect(first!.getAttribute('class')).toBe('icon icon-check');
  expect(first!.getAttribute('aria-hidden')).toBe('true');
  expect(first!.getAttribute('focusable')).toBe('false');
  expect([...first!.children].map((c) => c.tagName.toLowerCase())).toEqual(
    ICON_SHAPES['check']!.map(([tag]) => tag),
  );
  expect(first!.outerHTML).toBe(approve().firstElementChild!.outerHTML);
  expect(b.querySelectorAll('svg')).toHaveLength(1);
  expect(b.textContent).toBe(STRINGS[lang].taskApprove);
  expect(b.hasAttribute('aria-label')).toBe(false);
}

describe('the Keeper queue’s act button leads with its panel button’s icon (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('an approval row’s act leads with the check its approve button draws', async () => {
    await boot();
    expect(approve().firstElementChild!.getAttribute('class')).toBe('icon icon-check');
    expectIconed('en');
  });

  it('a click on the icon still presses the panel’s own button', async () => {
    await boot();
    let pressed = 0;
    approve().addEventListener('click', () => pressed++);
    act().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(pressed).toBe(1);
  });

  it('a Hebrew switch repaints the words beside the same icon, and back', async () => {
    await boot();

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    document.dispatchEvent(new CustomEvent('ap:subjects-changed'));
    expectIconed('he');

    await vi.advanceTimersByTimeAsync(6000);
    expectIconed('he');

    (document.querySelector('[data-lang-btn="en"]') as HTMLButtonElement).click();
    document.dispatchEvent(new CustomEvent('ap:subjects-changed'));
    expectIconed('en');
  });

  it('a panel button with no leading icon still gives bare words', async () => {
    await boot();
    approve().firstElementChild!.remove();
    // The queue rebuilds only when an item's words change; forget its last
    // render so the next one reads the iconless button.
    delete (document.getElementById('keeper-queue') as HTMLElement).dataset['sig'];
    document.dispatchEvent(new CustomEvent('ap:subjects-changed'));
    expect(act().querySelectorAll('svg')).toHaveLength(0);
    expect(act().textContent).toBe(STRINGS.en.taskApprove);
  });

  it('spaces the icon from its words', () => {
    expect(layoutCss()).toContain('.keeper-queue-act > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the queue axe-clean (WCAG A/AA)', async () => {
    await boot();
    expectIconed('en');

    vi.useRealTimers();
    const results = await axe.run(document.getElementById('keeper-queue') as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
