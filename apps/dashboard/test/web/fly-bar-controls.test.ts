// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE FLY BAR'S TWO BUTTONS (operator, 2026-09-14: "why did the lucky button
 * disappear? there must be two buttons"). The phone-collapse slice put
 * browse, the budget mode, firings, $/firing, lanes AND Lucky inside a
 * <details>, and unwrapped it on desktop with `display: contents` — which
 * does not work: a closed <details> keeps hiding its content whatever its
 * own display is, so six controls vanished at every width. The row now
 * carries Lucky and Fire always; the manual settings sit behind one gear
 * that flips a plain [hidden] and remembers the choice.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

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

function boot(): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown) => ({
    ok: true,
    json: async () =>
      String(url).includes('/api/fly')
        ? { running: false, flights: [], maxTurnsPerFiring: 120 }
        : STATE,
  })) as unknown as typeof fetch;
  new Function(clientJs())();
}

const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

describe('the Fly bar keeps two buttons and hides only its settings', () => {
  it('Lucky and Fire are in the row itself, never inside the collapsible settings', () => {
    const html = renderShell();
    const form = html.slice(html.indexOf('id="fly-form"'), html.indexOf('id="fly-status"'));
    const options = form.slice(form.indexOf('id="fly-options"'), form.indexOf('id="fly-lucky"'));
    expect(options).not.toContain('id="fly-lucky"');
    expect(options).not.toContain('id="fly-go"');
    expect(form.indexOf('id="fly-options"')).toBeLessThan(form.indexOf('id="fly-lucky"'));
    expect(form.indexOf('id="fly-lucky"')).toBeLessThan(form.indexOf('id="fly-go"'));
  });

  it('the settings are a plain hidden container with a labelled toggle — never a <details>', () => {
    const html = renderShell();
    expect(html).toContain('<div class="fly-options" id="fly-options" hidden>');
    expect(html).not.toContain('class="fly-options-summary"');
    expect(html).toContain('id="fly-options-toggle"');
    expect(html).toContain('aria-controls="fly-options"');
    expect(html).toContain('data-i18n-aria="flyOptionsAria"');
  });

  it('every manual field lives in the settings container', () => {
    boot();
    const options = byId('fly-options');
    for (const id of ['fly-browse-btn', 'fly-mode', 'fly-firings', 'fly-budget', 'fly-lanes'])
      expect(options.contains(byId(id)), id).toBe(true);
    for (const id of ['fly-lucky', 'fly-go']) expect(options.contains(byId(id)), id).toBe(false);
  });

  it('the gear shows and hides the settings, and the choice survives a reload', () => {
    localStorage.clear();
    boot();
    const toggle = byId('fly-options-toggle');
    expect(byId('fly-options').hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    expect(byId('fly-options').hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(localStorage.getItem('ap-fly-options')).toBe('open');

    boot();
    expect(byId('fly-options').hidden).toBe(false);
    expect(byId('fly-options-toggle').getAttribute('aria-expanded')).toBe('true');

    byId('fly-options-toggle').click();
    expect(byId('fly-options').hidden).toBe(true);
    expect(localStorage.getItem('ap-fly-options')).toBe('closed');
  });

  it('the stylesheet never unwraps the settings with display:contents (the vanishing bug)', () => {
    const css = layoutCss();
    expect(css).toContain('.fly-options[hidden] { display: none; }');
    expect(css).not.toContain('.fly-options, .fly-options-body { display: contents; }');
    expect(css).not.toContain('.fly-options-summary');
  });
});
