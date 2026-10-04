// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the CONNECT popover's
 * "Report a bug or request a feature upstream" form. The right-click "Report
 * from here" dialog's Compose with AI leads with `sparkles` and its Execute
 * with `flag`, but this form's own Compose and its submit, the same two steps
 * of the same composer, were bare words.
 *
 * Compose leads with that dialog's `sparkles`, since it hands the note to the
 * same model to rewrite; the submit leads with its `flag`, since it files the
 * report, and reads "Open GitHub issue" or that dialog's "Execute" by target.
 * Nothing is newly vendored, and both are server-printed markup the locale
 * sweep keeps a leading icon in. The target swap used to replace the submit's
 * whole `textContent` and left its `data-i18n` on `openGithubIssue`, so the
 * next sweep put "Open GitHub issue" back over a non-issue target's Execute;
 * it now retags the key and goes through `setSweptText()`, so the words hold
 * and the icon stays. Each icon is decorative, so a button's name stays its
 * words. Executes the ACTUAL client bundle (`clientJs()`) in jsdom, the
 * convention `search-ask-button-icons.test.ts` uses.
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

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown) => {
    // A compose stays in flight, so its busy state can be read.
    if (String(url).includes('/api/report/compose')) return new Promise<Response>(() => {});
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const composeBtn = (): HTMLButtonElement =>
  document.getElementById('gh-issue-compose') as HTMLButtonElement;
const submitBtn = (): HTMLButtonElement =>
  document.querySelector('#gh-issue-form button[type="submit"]') as HTMLButtonElement;

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

function chooseTarget(action: string): void {
  const select = document.getElementById('gh-issue-action') as HTMLSelectElement;
  select.value = action;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('the CONNECT report form’s Compose and submit lead with stroke icons (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads Compose with sparkles and the submit with flag, their words unchanged', async () => {
    await boot();

    expectIconed(composeBtn(), 'sparkles');
    expectIconed(submitBtn(), 'flag');
    expect(composeBtn().textContent).toBe(STRINGS.en.reportComposeButton);
    expect(submitBtn().textContent).toBe(STRINGS.en.openGithubIssue);
  });

  it('a locale switch rewrites both buttons’ words and keeps both icons', async () => {
    await boot();

    switchTo('he');
    expect(composeBtn().textContent).toBe(STRINGS.he.reportComposeButton);
    expect(submitBtn().textContent).toBe(STRINGS.he.openGithubIssue);
    expectIconed(composeBtn(), 'sparkles');
    expectIconed(submitBtn(), 'flag');

    switchTo('en');
    expect(composeBtn().textContent).toBe(STRINGS.en.reportComposeButton);
    expect(submitBtn().textContent).toBe(STRINGS.en.openGithubIssue);
    expectIconed(composeBtn(), 'sparkles');
    expectIconed(submitBtn(), 'flag');
  });

  it('a non-issue target reads Execute beside the same flag, and the sweep keeps it', async () => {
    await boot();

    chooseTarget('pool-offer');
    expect(submitBtn().textContent).toBe(STRINGS.en.reportExecute);
    expect(submitBtn().getAttribute('data-i18n')).toBe('reportExecute');
    expectIconed(submitBtn(), 'flag');

    // Fleet ticks and a locale switch both sweep [data-i18n].
    await vi.advanceTimersByTimeAsync(6000);
    expect(submitBtn().textContent).toBe(STRINGS.en.reportExecute);
    switchTo('he');
    expect(submitBtn().textContent).toBe(STRINGS.he.reportExecute);
    expectIconed(submitBtn(), 'flag');

    chooseTarget('issue');
    expect(submitBtn().textContent).toBe(STRINGS.he.openGithubIssue);
    expect(submitBtn().getAttribute('data-i18n')).toBe('openGithubIssue');
    expectIconed(submitBtn(), 'flag');
  });

  it('a compose in flight only disables Compose, which keeps its icon and words', async () => {
    await boot();
    (document.getElementById('gh-issue-note') as HTMLTextAreaElement).value = 'the chart is blank';

    composeBtn().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);

    expect(composeBtn().disabled).toBe(true);
    expect(composeBtn().textContent).toBe(STRINGS.en.reportComposeButton);
    expectIconed(composeBtn(), 'sparkles');
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain('#gh-issue-form button > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the report form axe-clean (WCAG A/AA)', async () => {
    await boot();
    (document.getElementById('connect') as HTMLDetailsElement).open = true;
    const form = document.getElementById('gh-issue-form') as HTMLElement;
    (form.closest('details.gh-report') as HTMLDetailsElement).open = true;

    vi.useRealTimers();
    const results = await axe.run(form, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
