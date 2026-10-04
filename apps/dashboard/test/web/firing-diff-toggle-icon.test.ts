// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the per-firing trace's diff
 * toggle. Its row's Step through leads with `play`, and the Versions panel's
 * What changed (the same `.diff-toggle` class) leads with `git-compare`, but a
 * drilled-open firing's "View diff" / "Hide diff" was bare words.
 *
 * It leads with the same `git-compare` now: both toggles open the patch a
 * commit shipped against the one before it, so one meaning keeps one stroke
 * and nothing is newly vendored. The icon is decorative, so the button's name
 * stays its aria-label. The row is rebuilt on every render and the locale
 * sweep goes through `setSweptText()`, so neither a click nor a switch drops
 * the icon. Drives the REAL client bundle in jsdom against a mocked
 * /api/state, the `firing-diff-i18n.test.ts` harness.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

// Every boot re-registers the client's document/window listeners; strip them
// after each test so a stale bundle's delegate never answers a later click.
type Tracked = [EventTarget, string, EventListenerOrEventListenerObject, unknown];
const trackedListeners: Tracked[] = [];
for (const target of [document, window] as EventTarget[]) {
  const native = target.addEventListener.bind(target);
  target.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: unknown,
  ) => {
    trackedListeners.push([target, type, listener, options]);
    return native(type, listener, options as AddEventListenerOptions | undefined);
  }) as typeof target.addEventListener;
}
afterEach(() => {
  for (const [target, type, listener, options] of trackedListeners.splice(0)) {
    target.removeEventListener(type, listener, options as EventListenerOptions | undefined);
  }
});

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
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
  lastActivityAt: 1,
  flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1, sha: 'abc1234' }],
  tasks: [],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 1, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const PATCH = ['diff --git a/src/a.ts b/src/a.ts', '-old', '+new'].join('\n');

let stateAnswers = 0;

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  stateAnswers = 0;
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.startsWith('/api/firing-activity')) {
      return { ok: true, json: async () => ({ entries: PROJECT.activity }) } as unknown as Response;
    }
    if (url.startsWith('/api/firing-diff')) {
      return { ok: true, json: async () => ({ patch: PATCH }) } as unknown as Response;
    }
    // Every state answer differs from the last, so a poll never short-circuits
    // on renderFleet()'s unchanged-signature check.
    stateAnswers += 1;
    const state = { ...STATE, totals: { ...STATE.totals, cost: stateAnswers } };
    return { ok: true, json: async () => state } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

function toggle(): HTMLButtonElement {
  const node = document.querySelector<HTMLButtonElement>('[data-diff-toggle="f1"]');
  expect(node, 'the diff toggle').not.toBeNull();
  return node as HTMLButtonElement;
}

function click(selector: string): void {
  const node = document.querySelector(selector);
  expect(node, selector).not.toBeNull();
  node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

async function openFiring(): Promise<void> {
  boot();
  await vi.advanceTimersByTimeAsync(1);
  click('[data-firing-toggle="f1"]');
  await vi.advanceTimersByTimeAsync(1);
}

async function openDiff(): Promise<void> {
  await openFiring();
  click('[data-diff-toggle="f1"]');
  await vi.advanceTimersByTimeAsync(1);
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

/** The toggle's first child is the decorative git-compare stroke, drawn whole. */
function expectLeadingIcon(button: HTMLElement): void {
  const icon = button.firstElementChild;
  expect(icon?.tagName).toBe('svg');
  expect(icon?.classList.contains('icon')).toBe(true);
  expect(icon?.classList.contains('icon-git-compare')).toBe(true);
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect(icon?.getAttribute('focusable')).toBe('false');
  expect(icon?.children).toHaveLength(ICON_SHAPES['git-compare']!.length);
  expect(button.querySelectorAll('svg')).toHaveLength(1);
}

describe('the per-firing diff toggle leads with a vendored icon (epic 0025)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reuses the Versions toggle’s git-compare — nothing newly vendored', () => {
    expect(ICON_SHAPES['git-compare']).toBeDefined();
    expect(layoutCss()).toContain('.diff-toggle > .icon');
  });

  it('the closed toggle leads with git-compare; its name stays "View diff"', async () => {
    await openFiring();

    const button = toggle();
    expectLeadingIcon(button);
    expect(button.textContent).toBe('View diff');
    expect(button.getAttribute('aria-label')).toBe('View diff');
    expect(button.getAttribute('data-i18n')).toBe('diffView');
  });

  it('the open toggle keeps the icon after the click rebuilds the row', async () => {
    await openDiff();

    const button = toggle();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expectLeadingIcon(button);
    expect(button.textContent).toBe('Hide diff');
    expect(document.querySelector('.firing-diff')).not.toBeNull();
  });

  it('a locale switch repaints the words beside the icon, not over it', async () => {
    await openDiff();

    clickLocale('he');
    expectLeadingIcon(toggle());
    expect(toggle().textContent).toBe(STRINGS.he.diffHide);

    click('[data-diff-toggle="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    expectLeadingIcon(toggle());
    expect(toggle().textContent).toBe(STRINGS.he.diffView);

    clickLocale('en');
    expectLeadingIcon(toggle());
    expect(toggle().textContent).toBe('View diff');
  });

  it('a saved Hebrew locale paints the iconed toggle at build', async () => {
    localStorage.setItem('ap-locale', 'he');
    await openFiring();

    expectLeadingIcon(toggle());
    expect(toggle().textContent).toBe(STRINGS.he.diffView);
  });

  it('leaves the open trace axe-clean (WCAG A/AA)', async () => {
    await openDiff();
    // Real timers for axe's own scheduling; the row is already painted.
    vi.useRealTimers();

    const results = await axe.run(document.querySelector('.firing-timeline') as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
