// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the project page's
 * "Contribute upstream" form. Its summary heads with `git-pull-request` and
 * the GitHub sync button beside it leads with `cloud-upload`, but the submit
 * that runs the fork, the push and `gh pr create` was bare words.
 *
 * "Open pull request" leads with the summary's own `git-pull-request`, since
 * it opens the pull request the summary names; nothing is newly vendored. The
 * icon is decorative, so the button's name stays its tip. The locale sweep
 * keeps a leading icon beside a tagged text node, and a submit only disables
 * the button, so the icon survives a switch and a run. Executes the ACTUAL
 * client bundle (`clientJs()`) in jsdom, the convention
 * `connect-report-form-icons.test.ts` uses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

// Every boot re-registers the client's document/window listeners; strip them
// after each test so a stale bundle's delegate never answers a later submit.
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
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown) => {
    // A pull request stays in flight, so its busy state can be read.
    if (String(url).includes('/api/github-pr/execute')) return new Promise<Response>(() => {});
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const submitBtn = (): HTMLButtonElement =>
  document.querySelector('.github-pr button[type="submit"]') as HTMLButtonElement;

/** The submit leads with the decorative `git-pull-request`, drawn shape for
 *  shape from the vendored data, and keeps its tip as its name. */
function expectIconed(b: HTMLButtonElement): void {
  expect(b).not.toBeNull();
  const first = b.firstElementChild;
  expect(first).not.toBeNull();
  expect(first!.tagName.toLowerCase()).toBe('svg');
  expect(first!.getAttribute('class')).toBe('icon icon-git-pull-request');
  expect(first!.getAttribute('aria-hidden')).toBe('true');
  expect(first!.getAttribute('focusable')).toBe('false');
  expect([...first!.children].map((c) => c.tagName.toLowerCase())).toEqual(
    ICON_SHAPES['git-pull-request']!.map(([tag]) => tag),
  );
  expect(b.querySelectorAll('svg')).toHaveLength(1);
  expect(b.getAttribute('aria-label')).toBe(b.getAttribute('data-tip'));
}

function switchTo(lang: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${lang}"]`) as HTMLButtonElement).click();
}

describe('the Contribute upstream form’s Open pull request leads with git-pull-request (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads the submit with the summary’s git-pull-request, its words and tag unchanged', async () => {
    await boot();

    expectIconed(submitBtn());
    expect(submitBtn().textContent).toBe(STRINGS.en.openPullRequest);
    expect(submitBtn().getAttribute('data-i18n')).toBe('openPullRequest');
    const summaryIcon = document.querySelector('.github-pr-summary svg');
    expect(summaryIcon?.getAttribute('class')).toBe('icon icon-git-pull-request');
  });

  it('a locale switch rewrites the words and keeps the icon', async () => {
    await boot();

    switchTo('he');
    expect(submitBtn().textContent).toBe(STRINGS.he.openPullRequest);
    expectIconed(submitBtn());

    // A fleet tick re-renders the page and sweeps [data-i18n] again.
    await vi.advanceTimersByTimeAsync(6000);
    expect(submitBtn().textContent).toBe(STRINGS.he.openPullRequest);
    expectIconed(submitBtn());

    switchTo('en');
    expect(submitBtn().textContent).toBe(STRINGS.en.openPullRequest);
    expectIconed(submitBtn());
  });

  it('a submit in flight only disables the button, which keeps its icon and words', async () => {
    await boot();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (document.querySelector('.github-pr-title') as HTMLInputElement).value = 'Fix the chart';

    const form = document.querySelector('[data-github-pr-form="p1"]') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(1);

    expect(submitBtn().disabled).toBe(true);
    expect(submitBtn().textContent).toBe(STRINGS.en.openPullRequest);
    expectIconed(submitBtn());
  });

  it('spaces the icon from its words', () => {
    expect(layoutCss()).toContain('.github-pr button > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the open form axe-clean (WCAG A/AA)', async () => {
    await boot();
    const section = document.querySelector('.github-pr') as HTMLElement;
    (section.querySelector('details.github-pr-details') as HTMLDetailsElement).open = true;

    vi.useRealTimers();
    const results = await axe.run(section, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
