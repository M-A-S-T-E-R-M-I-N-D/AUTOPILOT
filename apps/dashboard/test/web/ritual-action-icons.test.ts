// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the ritual scrim's one
 * button. The busy scrim leads each gate step with the PR check strip's
 * circle family, but the button under it, "Minimize" while the write runs
 * and "Close" once it settles, was bare words.
 *
 * Minimize leads with the `minimize` the Exit focus pill draws, the same
 * four corners pulled in, since it folds the scrim down to its corner pill.
 * Close leads with the `x` the What's new Close and the tour's Skip draw,
 * since it puts the settled scrim away. Nothing is newly vendored. The icon
 * is decorative, so the button's name stays its words, and the paint swaps
 * the icon with the words, so the button never draws both or neither.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

type FetchMock = ReturnType<typeof vi.fn>;
type RitualFetch = (kind: string, url: string, init?: unknown, opts?: unknown) => Promise<unknown>;

const ritualFetch = (...args: Parameters<RitualFetch>): Promise<unknown> =>
  (globalThis as unknown as { ritualFetch: RitualFetch }).ritualFetch(...args);

function jsonResponse(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone() {
      return res;
    },
  };
  return res;
}

async function boot(locale?: 'he'): Promise<FetchMock> {
  document.open();
  document.write(renderShell(''));
  document.close();
  const fetchMock = vi.fn(async () =>
    jsonResponse(200, { generatedAt: 1, totals: {}, projects: [], empty: true }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  new Function(clientJs() + ';\nglobalThis.ritualFetch = ritualFetch;')();
  await vi.advanceTimersByTimeAsync(1);
  if (locale)
    (document.querySelector('[data-lang-btn="' + locale + '"]') as HTMLButtonElement).click();
  return fetchMock;
}

/** Opens a ritual whose request never settles, so the scrim stays running. */
function openRunning(fetchMock: FetchMock): void {
  fetchMock.mockImplementationOnce(() => new Promise(() => {}));
  void ritualFetch('release', '/api/release/execute', { method: 'POST' }, { subject: 'demo' });
}

/** Opens a ritual that fails, so the scrim stays up, settled, until closed. */
async function openFailed(fetchMock: FetchMock): Promise<void> {
  fetchMock.mockImplementationOnce(async () => jsonResponse(429, { error: 'Too many requests' }));
  await ritualFetch('claim', '/api/pool-client/execute', { method: 'POST' });
  await vi.advanceTimersByTimeAsync(0);
}

const action = (): HTMLButtonElement =>
  document.querySelector('.ritual-minimize') as HTMLButtonElement;
const scrim = (): HTMLElement => document.getElementById('ritual-scrim') as HTMLElement;

/** The icon leads the button, decorative, and the button's words, which are
 *  also its accessible name, stay its whole text. */
function expectLeadIcon(b: HTMLButtonElement, icon: string, words: string): void {
  const svg = b.firstElementChild;
  expect(svg?.tagName.toLowerCase()).toBe('svg');
  expect(svg?.getAttribute('class')).toBe('icon icon-' + icon);
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelectorAll('path, rect, circle, line, polyline').length).toBeGreaterThan(0);
  expect(b.querySelectorAll('svg')).toHaveLength(1);
  expect(b.textContent).toBe(words);
  expect(b.hasAttribute('aria-label')).toBe(false);
}

describe('the ritual scrim’s Minimize and Close lead with vendored icons (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads Minimize with minimize while the write runs', async () => {
    openRunning(await boot());

    expect(scrim().hidden).toBe(false);
    expectLeadIcon(action(), 'minimize', STRINGS.en.ritualMinimize);
  });

  it('swaps to Close led by x once the write settles, and still closes the scrim', async () => {
    await openFailed(await boot());

    expect(scrim().getAttribute('data-ritual-state')).toBe('failed');
    expectLeadIcon(action(), 'x', STRINGS.en.ritualClose);
    action().click();
    expect(scrim().hidden).toBe(true);
  });

  it('brings minimize back for the next ritual on the same scrim', async () => {
    const fetchMock = await boot();
    await openFailed(fetchMock);
    action().click();

    openRunning(fetchMock);
    expect(scrim().hidden).toBe(false);
    expectLeadIcon(action(), 'minimize', STRINGS.en.ritualMinimize);
  });

  it('paints the Hebrew words beside the same icons', async () => {
    const fetchMock = await boot('he');
    await openFailed(fetchMock);
    expectLeadIcon(action(), 'x', STRINGS.he.ritualClose);
    action().click();

    openRunning(fetchMock);
    expectLeadIcon(action(), 'minimize', STRINGS.he.ritualMinimize);
  });

  it('spaces the icon from its words', () => {
    expect(layoutCss()).toContain('.ritual-minimize > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the running scrim axe-clean with the icon drawn (WCAG A/AA)', async () => {
    openRunning(await boot());
    expect(action().querySelector('svg')).not.toBeNull();
    // axe schedules its own checks on timers.
    vi.useRealTimers();

    const results = await axe.run(scrim(), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
