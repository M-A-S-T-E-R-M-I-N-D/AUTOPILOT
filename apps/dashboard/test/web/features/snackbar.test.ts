// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE SNACKBAR (epic 0031): one transient surface for an interaction's
 * outcome, in one place, announced politely, gone on its own — and never
 * mid-read. Booted through the real bundle under jsdom, with fake timers so
 * the dismissal laws are measured rather than waited for.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../../src/web/shell.js';
import { coreFeatureModulesJs } from '../../../src/web/chunks.js';
import { layoutCss } from '../../../src/web/layout-css.js';
import {
  SNACK_MAX,
  SNACK_TIMEOUT_MS,
  SNACK_ERROR_TIMEOUT_MS,
} from '../../../src/web/features/snackbar.js';

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

/** Boots the real bundle and returns a raiser bound to its own `snack`. */
function boot(): (call: string) => void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => STATE,
  })) as unknown as typeof fetch;
  const js = clientJs();
  return (call: string) => {
    new Function(js + '\n' + call)();
  };
}

const host = (): HTMLElement => document.getElementById('snackbar-host') as HTMLElement;
const snacks = (): HTMLElement[] => Array.from(host().querySelectorAll('.snack'));

describe('the snackbar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('rides the core chunk and the shell renders one polite host', () => {
    expect(coreFeatureModulesJs()).toContain('function snack(text, kind, action) {');
    const page = renderShell();
    expect(page.split('id="snackbar-host"').length - 1).toBe(1);
    // A plain live-region container: aria-label on a nameless div is prohibited
    // (axe: aria-prohibited-attr), and the snacks announce themselves.
    expect(page).toContain('id="snackbar-host" aria-live="polite" aria-atomic="false"');
  });

  it('raises one sentence with a dismiss, and takes no layout from the page', () => {
    const raise = boot();
    raise("snack('rolled 3 lanes', 'ok');");
    expect(snacks()).toHaveLength(1);
    const node = snacks()[0]!;
    expect(node.className).toBe('snack snack-ok');
    expect(node.querySelector('.snack-text')?.textContent).toBe('rolled 3 lanes');
    expect(node.querySelector('.snack-close')?.getAttribute('aria-label')).toBe(
      STRINGS.en.snackDismiss,
    );
    // Epic 0025 (icon system): the close button carries a stroke icon, not a
    // baked-in ✕ glyph.
    expect(node.querySelector('.snack-close svg.icon-x')).not.toBeNull();
    expect(node.querySelector('.snack-close')?.textContent).toBe('');
    // The host is a fixed overlay that only its snacks can be clicked through.
    const css = layoutCss();
    expect(css).toContain('.snackbar-host { position: fixed;');
    expect(css).toContain('pointer-events: none;');
    expect(css).toContain('.snack { pointer-events: auto;');
  });

  it('a failure interrupts; everything else waits its turn', () => {
    const raise = boot();
    raise("snack('all good', 'ok');");
    raise("snack('it broke', 'err');");
    expect(snacks()[0]!.hasAttribute('role')).toBe(false);
    expect(snacks()[1]!.getAttribute('role')).toBe('alert');
  });

  it('leaves on its own — a failure lingers longer', () => {
    const raise = boot();
    raise("snack('short', 'ok');");
    raise("snack('long', 'err');");
    vi.advanceTimersByTime(SNACK_TIMEOUT_MS + 10);
    expect(snacks().map((s) => s.textContent)).toHaveLength(1);
    vi.advanceTimersByTime(SNACK_ERROR_TIMEOUT_MS - SNACK_TIMEOUT_MS + 10);
    expect(snacks()).toHaveLength(0);
  });

  it('never leaves mid-read: the pointer and the keyboard hold it open', () => {
    const raise = boot();
    raise("snack('hold me', 'ok');");
    const node = snacks()[0]!;
    node.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(SNACK_TIMEOUT_MS * 3);
    expect(snacks()).toHaveLength(1);
    node.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(SNACK_TIMEOUT_MS + 10);
    expect(snacks()).toHaveLength(0);
  });

  it('stacks at most three — the oldest goes, never a wall', () => {
    const raise = boot();
    for (let i = 0; i < SNACK_MAX + 2; i++) raise(`snack('note ${i}', '');`);
    expect(snacks()).toHaveLength(SNACK_MAX);
    expect(snacks()[0]!.textContent).toContain('note 2');
  });

  it('the close button ends it, and Escape ends the one holding focus', () => {
    const raise = boot();
    raise("snack('by button', 'ok');");
    (snacks()[0]!.querySelector('.snack-close') as HTMLButtonElement).click();
    expect(snacks()).toHaveLength(0);

    raise("snack('by escape', 'ok');");
    (snacks()[0]!.querySelector('.snack-close') as HTMLButtonElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(snacks()).toHaveLength(0);
  });

  it('carries at most one action, which runs and dismisses', () => {
    const raise = boot();
    (globalThis as unknown as { __ran: boolean }).__ran = false;
    raise(
      "snack('queued', 'ok', { label: 'Open the board', run: function () { globalThis.__ran = true; } });",
    );
    const action = snacks()[0]!.querySelector('.snack-action') as HTMLButtonElement;
    expect(action.textContent).toBe('Open the board');
    action.click();
    expect((globalThis as unknown as { __ran: boolean }).__ran).toBe(true);
    expect(snacks()).toHaveLength(0);
  });

  it('carries its words in both locales', () => {
    for (const key of ['snackDismiss', 'luckyRolled', 'luckyHandToPilot'] as const) {
      expect(STRINGS.en[key]).toBeTruthy();
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
    }
  });
});
