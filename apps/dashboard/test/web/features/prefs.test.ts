// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * DISPLAY & ACCESSIBILITY PREFERENCES (epic 0029 slice 1): a preference is
 * an attribute on <html> the stylesheet reads; a default carries none; saved
 * in one key and applied at boot; Reset returns a page byte-identical to a
 * fresh one; the phosphor row shows only under the terminal theme.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../../src/web/shell.js';
import { coreFeatureModulesJs } from '../../../src/web/chunks.js';
import { layoutCss } from '../../../src/web/layout-css.js';
import { PREF_CHOICES } from '../../../src/web/features/prefs.js';

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
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => STATE,
  })) as unknown as typeof fetch;
  new Function(clientJs())();
}

const html = (): HTMLElement => document.documentElement;
const btn = (pref: string, value: string): HTMLButtonElement =>
  document.querySelector(`[data-pref="${pref}"][data-pref-value="${value}"]`) as HTMLButtonElement;

describe('display & accessibility preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rides the core chunk; the shell renders the Settings popover with every choice', () => {
    expect(coreFeatureModulesJs()).toContain('function applyPrefs(');
    const page = renderShell();
    expect(page).toContain('id="settings-menu"');
    expect(page).toContain('name="masthead-popover"');
    for (const [pref, values] of Object.entries(PREF_CHOICES)) {
      for (const value of values) {
        expect(page, `${pref}=${value}`).toContain(
          `data-pref="${pref}" data-pref-value="${value}"`,
        );
      }
    }
    expect(page).toContain('id="prefs-reset"');
  });

  it('a fresh page carries no preference attribute; a choice sets one, marks the button, and persists', () => {
    boot();
    for (const pref of Object.keys(PREF_CHOICES))
      expect(html().hasAttribute(`data-${pref}`)).toBe(false);
    expect(btn('text', 'md').getAttribute('aria-pressed')).toBe('true');

    btn('text', 'lg').click();
    expect(html().getAttribute('data-text')).toBe('lg');
    expect(btn('text', 'lg').getAttribute('aria-pressed')).toBe('true');
    expect(btn('text', 'md').getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem('ap-prefs') ?? '{}').text).toBe('lg');

    btn('density', 'relaxed').click();
    btn('motion', 'reduce').click();
    btn('font', 'mono').click();
    expect(html().getAttribute('data-density')).toBe('relaxed');
    expect(html().getAttribute('data-motion')).toBe('reduce');
    expect(html().getAttribute('data-font')).toBe('mono');
  });

  it('applies the saved preferences at boot and ignores garbage', () => {
    localStorage.setItem(
      'ap-prefs',
      JSON.stringify({ text: 'xl', font: 'nope', density: 'compact', junk: 1 }),
    );
    boot();
    expect(html().getAttribute('data-text')).toBe('xl');
    expect(html().hasAttribute('data-font')).toBe(false);
    expect(html().getAttribute('data-density')).toBe('compact');

    localStorage.setItem('ap-prefs', 'not json');
    boot();
    expect(html().hasAttribute('data-text')).toBe(false);
  });

  it('Reset returns every attribute to its default and forgets the key', () => {
    localStorage.setItem(
      'ap-prefs',
      JSON.stringify({ text: 'sm', motion: 'reduce', phosphor: 'amber' }),
    );
    boot();
    expect(html().getAttribute('data-phosphor')).toBe('amber');

    (document.getElementById('prefs-reset') as HTMLButtonElement).click();

    for (const pref of Object.keys(PREF_CHOICES))
      expect(html().hasAttribute(`data-${pref}`)).toBe(false);
    expect(localStorage.getItem('ap-prefs')).toBeNull();
    expect(btn('text', 'md').getAttribute('aria-pressed')).toBe('true');
  });

  it('the stylesheet reads every attribute: text scale, font, density, motion, and the terminal-only phosphor row', () => {
    const css = layoutCss();
    expect(css).toContain('html[data-text="sm"] { font-size: 93.75%; }');
    expect(css).toContain('html[data-text="xl"] { font-size: 125%; }');
    expect(css).toContain('html[data-font="mono"] { --font-sans: var(--font-mono); }');
    expect(css).toMatch(/html\[data-density="compact"\] \{ --space-1:/);
    expect(css).toMatch(/html\[data-density="relaxed"\] \{ --space-1:/);
    expect(css).toContain('html[data-motion="reduce"] *,');
    expect(css).toContain('.pref-terminal { display: none; }');
    expect(css).toContain('html[data-theme="terminal"] .pref-terminal { display: block; }');
    expect(css).toMatch(/html\[data-theme="terminal"\]\[data-phosphor="amber"\] \{/);
    // Epic 0029 slice 7: the hue rule rotates the chromatic tokens from their base twins…
    expect(css).toContain(
      'html[data-hue] { --color-surface: oklch(from var(--color-surface-base) l c calc(h + var(--hue-rot)));',
    );
    expect(css).toContain(
      '--color-accent: oklch(from var(--color-accent-base) l c calc(h + var(--hue-rot)));',
    );
    // …and leaves the semantic colours their meaning.
    const hueBlock = css.slice(
      css.indexOf('html[data-hue] {'),
      css.indexOf('}', css.indexOf('html[data-hue] {')),
    );
    for (const kept of [
      '--color-danger',
      '--color-success',
      '--color-warning',
      '--color-sev-critical',
    ])
      expect(hueBlock, kept).not.toContain(kept);
  });

  it('hue: the range rotates the design; 0 is the theme as designed; Reset clears it', () => {
    boot();
    const range = document.getElementById('pref-hue') as HTMLInputElement;
    expect(html().hasAttribute('data-hue')).toBe(false);
    range.value = '120';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(html().getAttribute('data-hue')).toBe('120');
    expect(html().style.getPropertyValue('--hue-rot')).toBe('120deg');
    expect((document.getElementById('pref-hue-out') as HTMLElement).textContent).toBe('120°');
    expect(JSON.parse(localStorage.getItem('ap-prefs') ?? '{}').hue).toBe(120);

    (document.getElementById('prefs-reset') as HTMLButtonElement).click();
    expect(html().hasAttribute('data-hue')).toBe(false);
    expect(html().style.getPropertyValue('--hue-rot')).toBe('');
    expect(range.value).toBe('0');
  });

  it('hue: a saved value applies at boot; out-of-range and garbage values are ignored', () => {
    localStorage.setItem('ap-prefs', JSON.stringify({ hue: 300 }));
    boot();
    expect(html().getAttribute('data-hue')).toBe('300');
    expect((document.getElementById('pref-hue') as HTMLInputElement).value).toBe('300');
    for (const bad of [400, -1, 12.5, 'red']) {
      localStorage.setItem('ap-prefs', JSON.stringify({ hue: bad }));
      boot();
      expect(html().hasAttribute('data-hue'), String(bad)).toBe(false);
    }
  });

  it('carries its words in both locales', () => {
    for (const key of [
      'settingsNav',
      'prefText',
      'prefFont',
      'prefDensity',
      'prefMotion',
      'prefPhosphor',
      'prefHue',
      'prefHueAria',
      'prefsReset',
    ] as const) {
      expect(STRINGS.en[key]).toBeTruthy();
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
    }
  });
});
