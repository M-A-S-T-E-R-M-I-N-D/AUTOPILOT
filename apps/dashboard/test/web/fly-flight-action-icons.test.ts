// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Flight console's
 * per-flight actions. Every KEEPER and Pool execute button leads with an icon
 * of what it does, but each live flight row's Pause, Stop, Cancel (a queued
 * folder) and Resume (a paused one) were bare words.
 *
 * Pause leads with the `circle-pause` the fleet card's status pill draws for
 * a paused project, and Stop with a newly vendored `circle-stop` beside it;
 * Cancel takes the dismiss pair's `x` and Resume the replay toggle's `play`.
 * Each icon is decorative, so a button's name stays its aria-label, which
 * names the folder. The row is rebuilt on every state change, so no busy
 * swap can drop the icon. Drives the REAL client bundle in jsdom, the way
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

const FLIGHTS = [
  {
    running: true,
    folder: '/work/a',
    firings: 1,
    paused: false,
    queued: false,
    startedAt: NOW,
    totalBudgetUsd: null,
    pid: 1,
  },
  {
    running: false,
    folder: '/work/b',
    firings: null,
    paused: false,
    queued: true,
    startedAt: null,
    totalBudgetUsd: null,
    pid: null,
  },
  {
    running: false,
    folder: '/work/c',
    firings: 1,
    paused: true,
    queued: false,
    startedAt: null,
    totalBudgetUsd: null,
    pid: null,
  },
];

async function boot(): Promise<Element[]> {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    if (href.includes('/api/fly')) {
      return { ok: true, json: async () => ({ flights: FLIGHTS }) } as unknown as Response;
    }
    return { ok: true, json: async () => FLEET_STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  const rows = Array.from(document.querySelectorAll('.fly-flight'));
  expect(rows).toHaveLength(3);
  return rows;
}

type ActionKey = 'pause' | 'stop' | 'cancel' | 'resume';

function expectLeadingIcon(
  button: Element | null | undefined,
  icon: string,
  key: ActionKey,
  folder: string,
): void {
  expect(button, key).not.toBeNull();
  const svg = button?.firstElementChild;
  expect(svg?.tagName.toLowerCase(), key).toBe('svg');
  expect(svg?.getAttribute('class'), key).toBe('icon icon-' + icon);
  expect(svg?.getAttribute('aria-hidden'), key).toBe('true');
  // A vendored shape, not an empty box: the name must be in icons.ts.
  expect(ICON_SHAPES[icon], icon).toBeDefined();
  expect(svg?.children.length, icon).toBe(ICON_SHAPES[icon]?.length);
  expect(button?.querySelectorAll('svg'), key).toHaveLength(1);
  expect(button?.textContent, key).toBe(STRINGS.en[key]);
  expect(button?.getAttribute('aria-label'), key).toBe(STRINGS.en[key] + ': ' + folder);
}

describe('the Flight console’s per-flight actions lead with vendored icons (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    document.open();
    document.write(renderShell());
    document.close();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a flying row leads Pause with circle-pause and Stop with circle-stop', async () => {
    const [flying] = await boot();

    expectLeadingIcon(
      flying?.querySelector('.fly-flight-pause'),
      'circle-pause',
      'pause',
      '/work/a',
    );
    expectLeadingIcon(flying?.querySelector('.fly-flight-stop'), 'circle-stop', 'stop', '/work/a');
  });

  it('a queued row leads Cancel with the dismiss pair’s x', async () => {
    const [, queued] = await boot();

    expectLeadingIcon(queued?.querySelector('.fly-flight-stop'), 'x', 'cancel', '/work/b');
  });

  it('a paused row leads Resume with the replay toggle’s play', async () => {
    const [, , paused] = await boot();

    expectLeadingIcon(paused?.querySelector('.fly-flight-resume'), 'play', 'resume', '/work/c');
  });

  it('keeps every icon through a poll tick that changes nothing', async () => {
    const rows = await boot();
    await vi.advanceTimersByTimeAsync(5000);

    expect(document.querySelectorAll('.fly-flight-actions button > svg.icon')).toHaveLength(4);
    expect(document.querySelectorAll('.fly-flight')).toHaveLength(rows.length);
  });

  it('leaves the iconed rows axe-clean (WCAG A/AA)', async () => {
    await boot();
    // Real timers for axe's own scheduling; the rows are already painted.
    vi.useRealTimers();

    const results = await axe.run(document.querySelector('.fly-flights') as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it('sits each icon a gap before its words, like the execute buttons', () => {
    expect(layoutCss()).toContain(
      '.fly-flight-actions button > .icon { margin-inline-end: 0.35em; }',
    );
  });
});
