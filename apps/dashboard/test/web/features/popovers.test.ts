// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MASTHEAD POPOVERS (epic 0029 slice 6): light dismiss (outside pointer,
 * Escape), a choice closes (theme, language — not settings), and on hover
 * devices hover opens temporarily while a click pins. Booted through the
 * real bundle under jsdom; `matchMedia` is stubbed per test because jsdom
 * has none (which the client reads as "cannot hover").
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../../src/web/shell.js';
import { coreFeatureModulesJs } from '../../../src/web/chunks.js';

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
  vi.useRealTimers();
});

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

function boot(hover: boolean): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => STATE,
  })) as unknown as typeof fetch;
  (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    matches: hover && q === '(hover: hover)',
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  new Function(clientJs())();
}

const details = (id: string): HTMLDetailsElement =>
  document.getElementById(id) as HTMLDetailsElement;
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('masthead popovers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rides the core chunk and names every masthead popover', () => {
    expect(coreFeatureModulesJs()).toContain('function popoverInit() {');
    const html = renderShell();
    for (const id of [
      'theme-menu',
      'lang-menu',
      'settings-menu',
      'notify',
      'connect',
      'version-menu',
    ])
      expect(html, id).toMatch(new RegExp(`<details[^>]*id="${id}"[^>]*name="masthead-popover"`));
  });

  it('law 1 — a pointer down outside closes every open popover; Escape closes and refocuses the summary', async () => {
    boot(false);
    const theme = details('theme-menu');
    theme.open = true;
    await settle();
    expect(theme.hasAttribute('data-pinned')).toBe(true);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(theme.open).toBe(false);
    expect(theme.hasAttribute('data-pinned')).toBe(false);

    const settings = details('settings-menu');
    settings.open = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(settings.open).toBe(false);
    expect(document.activeElement).toBe(settings.querySelector('summary'));
  });

  it('a pointer down inside an open popover leaves it open', () => {
    boot(false);
    const settings = details('settings-menu');
    settings.open = true;
    (settings.querySelector('[data-pref]') as HTMLElement).dispatchEvent(
      new Event('pointerdown', { bubbles: true }),
    );
    expect(settings.open).toBe(true);
  });

  it('law 2 — choosing a theme or a language closes its popover; a settings choice does not', () => {
    boot(false);
    const theme = details('theme-menu');
    theme.open = true;
    (theme.querySelector('[data-theme-btn="light"]') as HTMLButtonElement).click();
    expect(theme.open).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');

    const lang = details('lang-menu');
    lang.open = true;
    (lang.querySelector('[data-lang-btn]') as HTMLButtonElement).click();
    expect(lang.open).toBe(false);

    const settings = details('settings-menu');
    settings.open = true;
    (
      settings.querySelector('[data-pref="text"][data-pref-value="lg"]') as HTMLButtonElement
    ).click();
    expect(settings.open).toBe(true);
  });

  it('law 3 — on a hover device, entering opens temporarily, leaving closes after the grace, a summary click pins', async () => {
    vi.useFakeTimers();
    boot(true);
    const theme = details('theme-menu');
    theme.dispatchEvent(new Event('mouseenter'));
    expect(theme.open).toBe(true);
    expect(theme.hasAttribute('data-hover')).toBe(true);
    await vi.runOnlyPendingTimersAsync();
    expect(theme.hasAttribute('data-pinned')).toBe(false);

    theme.dispatchEvent(new Event('mouseleave'));
    expect(theme.open).toBe(true);
    vi.advanceTimersByTime(300);
    expect(theme.open).toBe(false);

    theme.dispatchEvent(new Event('mouseenter'));
    expect(theme.open).toBe(true);
    (theme.querySelector('summary') as HTMLElement).click();
    expect(theme.open).toBe(true);
    expect(theme.hasAttribute('data-pinned')).toBe(true);
    expect(theme.hasAttribute('data-hover')).toBe(false);
    theme.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(300);
    expect(theme.open).toBe(true);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(theme.open).toBe(false);
  });

  it('without hover, entering does nothing — touch and keyboard keep the native details', () => {
    boot(false);
    const theme = details('theme-menu');
    theme.dispatchEvent(new Event('mouseenter'));
    expect(theme.open).toBe(false);
  });
});
