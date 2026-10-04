// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the right-click "Report
 * from here" dialog's Compose with AI and Preview. The dialog's title, its
 * menu item and its Execute all lead with `flag`, but the two buttons that
 * come before Execute were bare words.
 *
 * Compose with AI hands the note to a model to rewrite, so it takes the
 * `sparkles` the board's "proposed" chip draws on a task the model wrote
 * itself. Preview lays the capture out as the plan it would run, what gets
 * filed where, so it takes the `list-tree` the per-firing trace heads its
 * step list with. Nothing is newly vendored, and each icon is decorative, so
 * a button's name stays its words. The dialog is built fresh on every open,
 * so a Hebrew page paints the Hebrew words beside the same icons. Executes
 * the ACTUAL client bundle (`clientJs()`) in jsdom, the convention
 * `report-execute-button-icon.test.ts` uses for this dialog.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

const PLAN = {
  ok: true,
  action: 'issue',
  title: 't',
  body: 'b',
  commands: [],
  summary: 'files a bug issue',
};

const BUTTONS = [
  ['.report-compose', 'sparkles', 'reportComposeAi'],
  ['.report-preview', 'list-tree', 'reportPreview'],
] as const satisfies readonly (readonly [string, string, StringKey])[];

// Each bundle eval registers the dialog's contextmenu/keydown/mousedown
// delegates on `document` again, and document.open()/close() keeps them, so
// a stale delegate would answer a later test's right-click.
let restoreListeners: () => void = () => {};

function trackDocumentListeners(): void {
  const added: Array<
    [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]
  > = [];
  const original = document.addEventListener.bind(document);
  document.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    added.push([type, listener, options]);
    return original(type, listener, options);
  }) as typeof document.addEventListener;
  restoreListeners = () => {
    for (const [type, listener, options] of added) {
      document.removeEventListener(type, listener, options);
    }
    document.addEventListener = original;
  };
}

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/** Boots the shell (in Hebrew when asked) and opens the report dialog on a
 *  plain element. `compose` answers the compose POST (a throw walks the
 *  failed-request path); a preview resolves PLAN. */
async function openDialog(
  locale: 'en' | 'he',
  compose: () => Response = () => json({}),
): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/report/compose') return compose();
    if (url === '/api/report-from-here') return json({ plan: PLAN });
    return json(STATE);
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  if (locale === 'he') {
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(document.documentElement.lang).toBe('he');
  }
  const target = document.createElement('div');
  document.body.appendChild(target);
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  (document.querySelector('.report-ctx-menu-item') as HTMLButtonElement).click();
  expect(document.querySelector('.report-dialog')).not.toBeNull();
}

function button(selector: string): HTMLButtonElement {
  const b = document.querySelector(selector);
  expect(b).not.toBeNull();
  return b as HTMLButtonElement;
}

/** The button leads with the one named decorative icon; its words, which
 *  are also its accessible name, follow it. */
function expectIconButton(
  selector: string,
  icon: string,
  key: StringKey,
  locale: 'en' | 'he',
): void {
  const b = button(selector);
  const svg = b.firstElementChild;
  expect(svg?.tagName.toLowerCase()).toBe('svg');
  expect(svg?.getAttribute('class')).toBe('icon icon-' + icon);
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelectorAll('path, line, circle, polyline, rect').length).toBeGreaterThan(0);
  expect(b.querySelectorAll('svg')).toHaveLength(1);
  expect(b.textContent).toBe(STRINGS[locale][key]);
  expect(b.hasAttribute('aria-label')).toBe(false);
}

describe('the report dialog’s Compose with AI and Preview lead with vendored icons (epic 0025 slice 2)', () => {
  beforeEach(() => {
    localStorage.removeItem('ap-locale');
    vi.useFakeTimers();
    trackDocumentListeners();
  });
  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync().catch(() => undefined);
    vi.useRealTimers();
    restoreListeners();
    vi.restoreAllMocks();
    // applyLocale() persists a Hebrew switch (ADR 0012).
    localStorage.clear();
    delete (window as { __autopilotReportCapture?: unknown }).__autopilotReportCapture;
  });

  for (const [selector, icon, key] of BUTTONS) {
    it(`${key} draws ${icon} before its words, which stay its name`, async () => {
      await openDialog('en');

      expectIconButton(selector, icon, key, 'en');
    });
  }

  it('paints the Hebrew words beside the same icons on a Hebrew page', async () => {
    await openDialog('he');

    for (const [selector, icon, key] of BUTTONS) expectIconButton(selector, icon, key, 'he');
  });

  it('Compose with AI keeps its icon through a compose and a failed request', async () => {
    await openDialog('en', () =>
      json({ ok: true, title: 'A title', body: 'A body', action: 'issue' }),
    );
    const desc = document.querySelector('.report-desc') as HTMLTextAreaElement;
    desc.value = 'the chart is empty';
    const compose = button('.report-compose');
    compose.click();

    expect(compose.disabled).toBe(true);
    expectIconButton('.report-compose', 'sparkles', 'reportComposeAi', 'en');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.report-compose-status')?.className).toContain(
      'report-compose-ok',
    );
    expect(compose.disabled).toBe(false);
    expectIconButton('.report-compose', 'sparkles', 'reportComposeAi', 'en');

    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    compose.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.report-compose-status')?.className).toContain(
      'report-compose-fail',
    );
    expect(compose.disabled).toBe(false);
    expectIconButton('.report-compose', 'sparkles', 'reportComposeAi', 'en');
  });

  it('Preview keeps its icon once the plan it resolves is on screen', async () => {
    await openDialog('en');
    const preview = button('.report-preview');
    preview.click();

    expect(preview.disabled).toBe(true);
    expectIconButton('.report-preview', 'list-tree', 'reportPreview', 'en');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.report-execute')).not.toBeNull();
    expect(preview.disabled).toBe(false);
    expectIconButton('.report-preview', 'list-tree', 'reportPreview', 'en');
  });

  it('sits each icon a gap before the words, like the Execute beside them', () => {
    expect(layoutCss()).toContain(
      '.report-preview > .icon, .report-compose > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the dialog axe-clean with both icons drawn (WCAG A/AA)', async () => {
    await openDialog('en');
    const dialog = document.querySelector('.report-dialog') as Element;
    // axe schedules its own checks on timers.
    vi.useRealTimers();

    const results = await axe.run(dialog, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
