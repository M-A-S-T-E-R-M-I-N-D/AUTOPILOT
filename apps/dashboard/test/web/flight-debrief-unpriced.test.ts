// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The FLIGHT DEBRIEF panel's spend chip over firings that reported no price
 * (epic 0036). A Codex or Gemini run reports none, and the metrics column
 * stores that as 0, so the chip summed such a flight's ships as free: one
 * $2.00 Claude ship beside two Codex ships read "$2.00". The flight log's
 * entries carry `costUnpriced` (`read/source.ts`'s `recordsNoPrice`), and the
 * chip now counts them beside the priced total. Drives the REAL client bundle
 * in jsdom against a mocked /api/state + /api/landing, the
 * landing-social-debrief.test.ts harness, with a saved Hebrew locale and an
 * axe pass over the panel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const waitFor = <T>(probe: () => T | Promise<T>): Promise<T> =>
  vi.waitFor(probe, { timeout: 5000 });

const firing = (cost: number, costUnpriced: boolean, shipped = true) => ({
  shipped,
  gateResult: shipped ? null : 'reverted',
  died: null,
  cost,
  costUnpriced,
  durationMs: 100,
  guardDenials: 0,
  autoformatRescued: false,
});

const MIXED = [firing(2, false), firing(0, true), firing(0, true, false)];
const ALL_UNPRICED = [firing(0, true), firing(0, true)];

const LANDING = {
  branch: 'autopilot/flight',
  base: 'main',
  commits: [{ shortSha: 'a1b2c3d', subject: 'feat: x', files: ['a.ts'] }],
  diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
  overlaps: [],
};

function boot(flightLog: readonly unknown[]): void {
  const project = {
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
    backedUp: false,
    firings: flightLog.length,
    shipped: 1,
    cost: 2,
    tokensIn: 0,
    tokensOut: 0,
    shipRate: 1,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: 1,
    flightLog,
    activity: [],
    tasks: [],
  };
  const state = {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: flightLog.length,
      shipped: 1,
      openFindings: 0,
      cost: 2,
    },
    projects: [project],
    empty: false,
  };
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/landing')) {
      return { ok: true, json: async () => ({ landing: LANDING }) } as unknown as Response;
    }
    return { ok: true, json: async () => state } as unknown as Response;
  });
  new Function(clientJs())();
}

/** The debrief's spend chip: the third of its stat chips. */
function spendChip(): HTMLElement {
  const chips = document.querySelectorAll<HTMLElement>('.flight-debrief-chips .chip');
  expect(chips.length).toBe(4);
  return chips[2] as HTMLElement;
}

describe('FLIGHT DEBRIEF spend chip over unpriced firings, rendered', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts the unpriced firings beside the priced total, and says why on hover/focus', async () => {
    boot(MIXED);
    await waitFor(() => spendChip());
    const chip = spendChip();
    expect(chip.textContent).toBe('$2.00 + 2 unpriced');
    expect(chip.getAttribute('data-tip')).toBe(STRINGS.en.flightDebriefTotalSpendUnpricedTip);
    expect(chip.getAttribute('aria-label')).toBe('total spend: $2.00 + 2 unpriced');
  });

  it('a flight with no priced firing reads its unpriced count, never $0.00', async () => {
    boot(ALL_UNPRICED);
    await waitFor(() => spendChip());
    expect(spendChip().textContent).toBe('2 unpriced');
  });

  it('a saved Hebrew locale paints the chip in Hebrew when it is first built', async () => {
    localStorage.setItem('ap-locale', 'he');
    boot(MIXED);
    await waitFor(() => spendChip());
    expect(spendChip().textContent).toBe(
      STRINGS.he.flightDebriefTotalSpendPartlyUnpriced
        .replace('{amount}', '$2.00')
        .replace('{count}', '2'),
    );
  });

  it('is axe-clean', async () => {
    boot(MIXED);
    await waitFor(() => spendChip());
    const results = await axe.run(spendChip().closest('.flight-debrief') as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
