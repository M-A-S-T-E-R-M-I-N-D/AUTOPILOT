// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE TERMINAL HUD (epic 0029 slice 3): a floating bar under the terminal
 * theme offering scanlines and glow as preferences, plus a dismiss that is
 * itself a preference (`web/features/prefs.ts`'s `hud` boolean) — so the
 * same "Reset to defaults" that clears text/font/density/motion/phosphor
 * also un-dismisses the HUD. Terminal-only visibility and the scanline/glow
 * effects are CSS, gated the same way `.pref-terminal` already is.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
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

function boot(): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      generatedAt: 1,
      totals: {
        projects: 0,
        flying: 0,
        needsYou: 0,
        firings: 0,
        shipped: 0,
        openFindings: 0,
        cost: 0,
      },
      projects: [],
      empty: true,
    }),
  })) as unknown as typeof fetch;
  new Function(clientJs())();
}

const html = (): HTMLElement => document.documentElement;
const btn = (pref: string, value: string): HTMLButtonElement =>
  document.querySelector(`[data-pref="${pref}"][data-pref-value="${value}"]`) as HTMLButtonElement;

describe('the terminal HUD (epic 0029 slice 3)', () => {
  it('the shell renders the HUD bar with a scanlines row, a glow row, and a dismiss button', () => {
    const page = renderShell();
    expect(page).toContain('id="terminal-hud"');
    expect(page).toContain('id="terminal-hud-close"');
    expect(page).toContain('data-pref="scanlines" data-pref-value="off"');
    expect(page).toContain('data-pref="scanlines" data-pref-value="on"');
    expect(page).toContain('data-pref="glow" data-pref-value="off"');
    expect(page).toContain('data-pref="glow" data-pref-value="on"');
  });

  it('dismissing sets the hud preference and persists it', () => {
    localStorage.clear();
    boot();
    expect(html().hasAttribute('data-hud')).toBe(false);

    (document.getElementById('terminal-hud-close') as HTMLButtonElement).click();

    expect(html().getAttribute('data-hud')).toBe('hidden');
    expect(JSON.parse(localStorage.getItem('ap-prefs') ?? '{}').hud).toBe(true);
  });

  it('scanlines and glow toggle like any other preference and persist', () => {
    localStorage.clear();
    boot();
    expect(html().hasAttribute('data-scanlines')).toBe(false);
    expect(html().hasAttribute('data-glow')).toBe(false);

    btn('scanlines', 'on').click();
    btn('glow', 'on').click();

    expect(html().getAttribute('data-scanlines')).toBe('on');
    expect(html().getAttribute('data-glow')).toBe('on');
    const saved = JSON.parse(localStorage.getItem('ap-prefs') ?? '{}');
    expect(saved.scanlines).toBe('on');
    expect(saved.glow).toBe('on');
  });

  it('Reset to defaults un-dismisses the HUD and clears scanlines/glow, same as every other row', () => {
    localStorage.setItem('ap-prefs', JSON.stringify({ hud: true, scanlines: 'on', glow: 'on' }));
    boot();
    expect(html().getAttribute('data-hud')).toBe('hidden');
    expect(html().getAttribute('data-scanlines')).toBe('on');
    expect(html().getAttribute('data-glow')).toBe('on');

    (document.getElementById('prefs-reset') as HTMLButtonElement).click();

    expect(html().hasAttribute('data-hud')).toBe(false);
    expect(html().hasAttribute('data-scanlines')).toBe(false);
    expect(html().hasAttribute('data-glow')).toBe(false);
    expect(localStorage.getItem('ap-prefs')).toBeNull();
  });

  it('a saved dismissal applies at boot; garbage is ignored', () => {
    localStorage.setItem('ap-prefs', JSON.stringify({ hud: 'yes' }));
    boot();
    expect(html().hasAttribute('data-hud')).toBe(false);

    localStorage.setItem('ap-prefs', JSON.stringify({ hud: true }));
    boot();
    expect(html().getAttribute('data-hud')).toBe('hidden');
  });

  it('the stylesheet shows the HUD only under the terminal theme, hides it once dismissed, and gates the scanline/glow effects the same way', () => {
    const css = layoutCss();
    expect(css).toContain('.terminal-hud { display: none; }');
    expect(css).toContain('html[data-theme="terminal"]:not([data-hud="hidden"]) .terminal-hud {');
    expect(css).toContain('html[data-theme="terminal"][data-scanlines="on"] body::after {');
    expect(css).toContain('html[data-theme="terminal"][data-glow="on"]');
  });

  it('carries its words in both locales', () => {
    for (const key of [
      'terminalHudAria',
      'terminalHudLabel',
      'terminalHudScanlines',
      'terminalHudScanlinesOff',
      'terminalHudScanlinesOn',
      'terminalHudGlow',
      'terminalHudGlowOff',
      'terminalHudGlowOn',
      'terminalHudDismiss',
      'terminalHudDismissTip',
    ] as const) {
      expect(STRINGS.en[key]).toBeTruthy();
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
    }
  });
});
