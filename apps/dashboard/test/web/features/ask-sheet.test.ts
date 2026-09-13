// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ASK SHEET (epic 0026 slice 3): the floating button opens Ask as a
 * sheet by MOVING the search/ask section into it — every id-bound handler
 * keeps working — and puts it back exactly where it stood on close; the
 * subject tag is lifted while it lives in the sheet; the state survives a
 * reload for the session; Escape closes only from inside the sheet.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../../src/web/shell.js';
import { coreFeatureModulesJs } from '../../../src/web/chunks.js';
import { layoutCss } from '../../../src/web/layout-css.js';

// Every boot() re-registers the client's document/window listeners (document.write
// keeps them, as browsers do); a delegated click handled by N stale copies toggles N
// times. Track what the client attaches and strip it after each test — the same
// discipline project-page.test.ts and app-shell.test.ts use.
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

function boot(project?: string): void {
  document.open();
  document.write(renderShell(project));
  document.close();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => STATE,
  })) as unknown as typeof fetch;
  new Function(clientJs())();
}

const fab = (): HTMLButtonElement => document.getElementById('ask-fab') as HTMLButtonElement;
const sheet = (): HTMLElement => document.getElementById('ask-sheet') as HTMLElement;
const bar = (): HTMLElement => document.getElementById('searchbar') as HTMLElement;

describe('the Ask sheet', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('rides the core chunk; the shell renders the button and the empty sheet on both pages', () => {
    expect(coreFeatureModulesJs()).toContain('function askSheetOpen(');
    for (const page of [undefined, 'demo']) {
      const html = renderShell(page);
      expect(html).toContain('id="ask-fab"');
      expect(html).toContain('aria-controls="ask-sheet"');
      expect(html).toContain('id="ask-sheet"');
      expect(html).toContain('aria-modal="false"');
      expect(html).toContain('id="ask-sheet-body"');
      expect(html).toContain('data-i18n-aria="askFab"');
    }
  });

  it('opens by moving the search/ask section into the sheet, lifting its subject, and focusing the question', () => {
    boot('demo');
    const before = bar();
    const nextSibling = before.nextElementSibling;
    expect(before.getAttribute('data-subject')).toBe('fleet');

    fab().click();

    expect(sheet().hidden).toBe(false);
    expect(fab().getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('ask-sheet-body')?.contains(bar())).toBe(true);
    expect(bar()).toBe(before);
    expect(bar().hasAttribute('data-subject')).toBe(false);
    expect(bar().hidden).toBe(false);
    expect(document.documentElement.getAttribute('data-ask-sheet')).toBe('open');
    expect(document.activeElement?.id).toBe('search-q');
    expect(sessionStorage.getItem('ap-ask-sheet')).toBe('open');

    (document.getElementById('ask-sheet-close') as HTMLButtonElement).click();

    expect(sheet().hidden).toBe(true);
    expect(bar().nextElementSibling).toBe(nextSibling);
    expect(bar().getAttribute('data-subject')).toBe('fleet');
    expect(document.documentElement.hasAttribute('data-ask-sheet')).toBe(false);
    expect(document.activeElement).toBe(fab());
    expect(sessionStorage.getItem('ap-ask-sheet')).toBeNull();
  });

  it('Escape closes only from inside the sheet', () => {
    boot();
    fab().click();
    expect(sheet().hidden).toBe(false);

    fab().focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sheet().hidden).toBe(false);

    (document.getElementById('search-q') as HTMLInputElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sheet().hidden).toBe(true);
  });

  it('remembers an open sheet for the session', () => {
    sessionStorage.setItem('ap-ask-sheet', 'open');
    boot('demo');
    expect(sheet().hidden).toBe(false);
    expect(document.getElementById('ask-sheet-body')?.contains(bar())).toBe(true);
  });

  it('the stylesheet places the button bottom trailing, the sheet beside the page from lg and below it before', () => {
    const css = layoutCss();
    expect(css).toContain('.ask-fab { position: fixed;');
    expect(css).toContain('.ask-sheet { position: fixed;');
    expect(css).toMatch(/@media \(min-width: 64rem\) \{[^}]*\.ask-sheet \{/);
    expect(css).toContain('html[data-ask-sheet="open"] .ritual-pill');
  });

  it('carries its words in both locales', () => {
    for (const key of ['askFab', 'askFabTip', 'askSheetTitle', 'askSheetClose'] as const) {
      expect(STRINGS.en[key]).toBeTruthy();
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
    }
  });
});
