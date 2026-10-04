// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the fleet card's Remove
 * button. The task row's delete draws the vendored `trash-2`, and Start over
 * and Sync to GitHub lead with their own strokes, but the one button that
 * drops a whole project from the dashboard was bare words.
 *
 * It leads with the same `trash-2` now, decorative, so the button's name stays
 * its aria-label. Its busy "Removing…" and the restored "Remove" swap through
 * `setTaggedLabel()`, as Start over's do: the icon survives a refused delete,
 * and the `data-i18n` tag moves with the words, so a sweep mid-request repaints
 * the busy label instead of the idle one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

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

type DeleteReply = 'refuse' | 'hang';

async function boot(deleteReply: DeleteReply = 'refuse'): Promise<HTMLButtonElement> {
  document.open();
  document.write(renderShell(''));
  document.close();
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(async (url: unknown) => {
    if (String(url).startsWith('/api/project/delete')) {
      if (deleteReply === 'hang') return new Promise<Response>(() => {});
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  const button = document.querySelector('[data-remove="p1"]') as HTMLButtonElement;
  expect(button).not.toBeNull();
  return button;
}

function expectTrashButton(
  button: HTMLButtonElement,
  key: 'removeCard' | 'removing',
  locale: 'en' | 'he',
): void {
  const svg = button.firstElementChild;
  expect(svg?.getAttribute('class')).toBe('icon icon-trash-2');
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelectorAll('path, line').length).toBeGreaterThan(0);
  expect(button.querySelectorAll('svg')).toHaveLength(1);
  expect(button.getAttribute('data-i18n')).toBe(key);
  expect(button.textContent).toBe(STRINGS[locale][key]);
}

function pressRemove(button: HTMLButtonElement): void {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('the fleet card’s Remove button leads with trash-2 (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    // applyLocale() persists a Hebrew switch (ADR 0012).
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('draws the task row delete’s trash-2 before its words, keeping its own name', async () => {
    const button = await boot();

    expectTrashButton(button, 'removeCard', 'en');
    expect(button.getAttribute('aria-label')).toBe('Remove Alpha');
  });

  it('keeps the icon beside Hebrew words, tick after tick', async () => {
    const button = await boot();
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expectTrashButton(button, 'removeCard', 'he');
    await vi.advanceTimersByTimeAsync(5000);
    expectTrashButton(
      document.querySelector('[data-remove="p1"]') as HTMLButtonElement,
      'removeCard',
      'he',
    );
  });

  it('keeps the icon and tags the busy words while the delete is in flight', async () => {
    const button = await boot('hang');
    pressRemove(button);

    expect(button.disabled).toBe(true);
    expectTrashButton(button, 'removing', 'en');
  });

  it('repaints the busy words, not the idle ones, when the locale switches mid-request', async () => {
    const button = await boot('hang');
    pressRemove(button);
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expectTrashButton(button, 'removing', 'he');
  });

  it('restores the idle words and keeps the icon when the delete is refused', async () => {
    const button = await boot('refuse');
    pressRemove(button);
    await vi.advanceTimersByTimeAsync(1);

    expect(button.disabled).toBe(false);
    expectTrashButton(button, 'removeCard', 'en');
  });

  it('sits the icon a gap before the words, like Start over', () => {
    expect(layoutCss()).toContain('.card-remove > .icon { margin-inline-end: 0.35em; }');
  });
});
