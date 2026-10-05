// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the fly bar's Fire, Pause
 * and Stop. Each Flight console row's Pause and Stop lead with an icon, and
 * the Pool's Fly button with the `send` the rail's Fly link draws, but the
 * fly bar's own Fire, the primary launch on every page, was bare words, and
 * so were the single-flight Pause and Stop beside it.
 *
 * Fire leads with that `send`, since it launches the same kind of flight; it
 * keeps it while its label reads "Flying…", "Queued…" or "Resume", since each
 * state still names a launch of the typed folder. Pause and Stop take the
 * Flight console's `circle-pause` and `circle-stop`. Nothing is newly
 * vendored, and each icon is decorative, so a button's name stays its words.
 * `setGoLabel()` used to replace Fire's whole `textContent` on every state
 * change; it goes through `setSweptText()` now, so the icon survives every
 * swap and a locale switch. Drives the REAL client bundle in jsdom, the way
 * multi-flight-cards.test.ts does.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

const NOW = 1_700_000_000_000;

const FLEET_STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [] as unknown[],
  empty: true,
};

const LIVE_FLIGHT = {
  running: true,
  folder: '/work/a',
  firings: 2,
  paused: false,
  startedAt: NOW,
  totalBudgetUsd: null,
  pid: 1,
};

/** `/api/fly` answers with whatever `status.current` holds at the time, so a
 *  test can change the state the next poll tick paints. */
async function boot(status: { current: Record<string, unknown> }): Promise<void> {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    if (href.includes('/api/fly')) {
      return { ok: true, json: async () => status.current } as unknown as Response;
    }
    return { ok: true, json: async () => FLEET_STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const byId = (id: string): HTMLButtonElement => document.getElementById(id) as HTMLButtonElement;

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

describe('the fly bar’s Fire, Pause and Stop lead with vendored icons (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    localStorage.clear();
    document.open();
    document.write(renderShell());
    document.close();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads Fire with send, Pause with circle-pause and Stop with circle-stop', async () => {
    await boot({ current: { running: false } });

    expectIconed(byId('fly-go'), 'send');
    expect(byId('fly-go').textContent).toBe(STRINGS.en.flyIt);
    expectIconed(byId('fly-pause'), 'circle-pause');
    expect(byId('fly-pause').textContent).toBe(STRINGS.en.pause);
    expectIconed(byId('fly-stop'), 'circle-stop');
    expect(byId('fly-stop').textContent).toBe(STRINGS.en.stop);
  });

  it('keeps Fire’s icon through its Flying… and Resume labels and back to Fire', async () => {
    const status: { current: Record<string, unknown> } = {
      current: { running: true, folder: '/work/a', firings: 2 },
    };
    await boot(status);

    expect(byId('fly-go').textContent).toBe(STRINGS.en.flying);
    expect(byId('fly-go').getAttribute('data-i18n')).toBe('flying');
    expectIconed(byId('fly-go'), 'send');
    // The single-flight Pause and Stop show while it runs, icons and all.
    expect(byId('fly-pause').hidden).toBe(false);
    expect(byId('fly-stop').hidden).toBe(false);
    expectIconed(byId('fly-pause'), 'circle-pause');
    expectIconed(byId('fly-stop'), 'circle-stop');

    status.current = { running: false, paused: true, folder: '/work/a' };
    await vi.advanceTimersByTimeAsync(3000);
    expect(byId('fly-go').textContent).toBe(STRINGS.en.resume);
    expectIconed(byId('fly-go'), 'send');

    status.current = { running: false };
    await vi.advanceTimersByTimeAsync(3000);
    expect(byId('fly-go').textContent).toBe(STRINGS.en.flyIt);
    expect(byId('fly-go').getAttribute('data-i18n')).toBe('flyIt');
    expectIconed(byId('fly-go'), 'send');
  });

  it('keeps Fire’s icon through a queued folder’s Queued… label', async () => {
    await boot({
      current: {
        flights: [{ ...LIVE_FLIGHT, running: false, queued: true, startedAt: null, pid: null }],
      },
    });
    (document.getElementById('fly-folder') as HTMLInputElement).value = '/work/a';
    await vi.advanceTimersByTimeAsync(3000);

    expect(byId('fly-go').disabled).toBe(true);
    expect(byId('fly-go').textContent).toBe(STRINGS.en.queued);
    expectIconed(byId('fly-go'), 'send');
  });

  it('a locale switch rewrites the words beside the same icons, mid-flight too', async () => {
    await boot({ current: { flights: [LIVE_FLIGHT] } });
    (document.getElementById('fly-folder') as HTMLInputElement).value = '/work/a';
    await vi.advanceTimersByTimeAsync(3000);
    expect(byId('fly-go').textContent).toBe(STRINGS.en.flying);

    switchTo('he');
    expect(byId('fly-go').textContent).toBe(STRINGS.he.flying);
    expect(byId('fly-pause').textContent).toBe(STRINGS.he.pause);
    expect(byId('fly-stop').textContent).toBe(STRINGS.he.stop);
    expectIconed(byId('fly-go'), 'send');
    expectIconed(byId('fly-pause'), 'circle-pause');
    expectIconed(byId('fly-stop'), 'circle-stop');

    // The next poll tick repaints the same state in the active locale.
    await vi.advanceTimersByTimeAsync(3000);
    expect(byId('fly-go').textContent).toBe(STRINGS.he.flying);
    expectIconed(byId('fly-go'), 'send');
  });

  it('an idle poll tick rewrites nothing in Fire', async () => {
    await boot({ current: { running: false } });
    const before = byId('fly-go').innerHTML;
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(byId('fly-go'), {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
    });

    await vi.advanceTimersByTimeAsync(3000);
    records.push(...observer.takeRecords());
    observer.disconnect();

    expect(records).toEqual([]);
    expect(byId('fly-go').innerHTML).toBe(before);
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain(
      '#fly-go > .icon, #fly-pause > .icon, #fly-stop > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the fly bar axe-clean with all three showing (WCAG A/AA)', async () => {
    await boot({ current: { running: true, folder: '/work/a', firings: 2 } });
    const bar = document.getElementById('flightbar') as HTMLElement;
    expect(bar.hidden).toBe(false);
    expect(byId('fly-pause').hidden).toBe(false);

    vi.useRealTimers();
    const results = await axe.run(document.getElementById('fly-form') as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
