// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The flight log rows' cost / real-cost / happened-ago tips' i18n (board
 * web-msnsndki-dz3vn1) — the "flight log's other chips" the auto-fixed-chip
 * slice (`firing-row-chips-i18n.test.ts`) named as still English. Every
 * flight-log row carries a cost chip and a happened-ago chip (plus a
 * real-cost chip when the firing recorded one), each with a hover tip
 * `shell.ts` hands `flightCostAgoMeta()` as a bare literal — "Total spend
 * for this firing" / "When this firing happened" on a flat row, "Spend for
 * this slice" / "When this slice happened" on a slice-run group's member
 * rows — and the collapsed group head's own "When the most recent slice
 * happened" from `flightGroupHeadMeta()`. All of them kept rendering English
 * in Hebrew after the trace row's count/started-ago tips beside them were
 * translated.
 *
 * Only the tips carry a key: the chips' visible text ("$0.20", "2m ago",
 * "real $0.05") and their aria-labels ("cost: $0.20", "happened 2m ago")
 * are composed from live values and stay as-is, the same only-the-tip
 * shape `firingCountTip` / `firingStartedTip` use. The group head's cost
 * tip ("Total spend across all N slices") is composed too and stays
 * untagged — pinned here so a later template slice is a deliberate change.
 * The English text is byte-identical to what each surface said before this
 * slice. Drives the REAL client bundle in jsdom against a mocked
 * /api/state, same harness as `firing-row-chips-i18n.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  // Newest first: one flat firing with a recorded real cost, then a run of
  // two slices of the same open task that collapses into one group row.
  flightLog: [
    { id: 'f1', at: 3, cost: 0.2, realCostUsd: 0.05, turns: 1, sha: 'abc1234' },
    {
      id: 'f2',
      at: 2,
      cost: 0.1,
      realCostUsd: 0.02,
      turns: 1,
      sha: 'bcd2345',
      completion: 'slice',
      item: 't1',
    },
    { id: 'f3', at: 1, cost: 0.1, turns: 1, sha: 'cde3456', completion: 'slice', item: 't1' },
  ],
  tasks: [],
  activity: [],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const TIP_KEYS = [
  'flightCostTip',
  'flightAgoTip',
  'flightRealCostTip',
  'flightSliceCostTip',
  'flightSliceAgoTip',
  'flightGroupAgoTip',
];

const FLAT_COST_TIP = 'Total spend for this firing';
const FLAT_AGO_TIP = 'When this firing happened';
const REAL_COST_TIP =
  'Real cost: this spend apportioned by your subscription share, not API list-price';
const SLICE_COST_TIP = 'Spend for this slice';
const SLICE_AGO_TIP = 'When this slice happened';
const GROUP_AGO_TIP = 'When the most recent slice happened';

const FLAT_ROW = '.flight:not(.flight-group) > .flight-head';
const GROUP_HEAD = '.flight-group > .flight-head';
const MEMBER = '.flight-group-member';

function boot(state: unknown = STATE): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => state,
  })) as unknown as typeof fetch;
  new Function(clientJs())();
}

function q(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  expect(node, selector).not.toBeNull();
  return node as HTMLElement;
}

async function render(state: unknown = STATE): Promise<void> {
  boot(state);
  await vi.advanceTimersByTimeAsync(1);
}

/** Opens the slice-run group row (its headline button) so its member rows render. */
async function openGroup(): Promise<void> {
  q(`${GROUP_HEAD} .flight-item`).click();
  await vi.advanceTimersByTimeAsync(100);
  q(MEMBER);
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function he(key: string): string {
  return STRINGS.he[key as StringKey];
}

function expectTip(selector: string, tip: string, key: string): void {
  const node = q(selector);
  expect(node.getAttribute('data-tip')).toBe(tip);
  expect(node.getAttribute('data-i18n-tip')).toBe(key);
  // The chip's text is a composed value — no [data-i18n] on it.
  expect(node.hasAttribute('data-i18n')).toBe(false);
}

function expectAllEnglish(): void {
  expectTip(`${FLAT_ROW} .flight-cost`, FLAT_COST_TIP, 'flightCostTip');
  expectTip(`${FLAT_ROW} .flight-real-cost`, REAL_COST_TIP, 'flightRealCostTip');
  expectTip(`${FLAT_ROW} .flight-ago`, FLAT_AGO_TIP, 'flightAgoTip');
  expectTip(`${GROUP_HEAD} .flight-ago`, GROUP_AGO_TIP, 'flightGroupAgoTip');
  expectTip(`${MEMBER} .flight-cost`, SLICE_COST_TIP, 'flightSliceCostTip');
  expectTip(`${MEMBER} .flight-real-cost`, REAL_COST_TIP, 'flightRealCostTip');
  expectTip(`${MEMBER} .flight-ago`, SLICE_AGO_TIP, 'flightSliceAgoTip');
}

function expectAllHebrew(): void {
  expect(q(`${FLAT_ROW} .flight-cost`).getAttribute('data-tip')).toBe(he('flightCostTip'));
  expect(q(`${FLAT_ROW} .flight-real-cost`).getAttribute('data-tip')).toBe(he('flightRealCostTip'));
  expect(q(`${FLAT_ROW} .flight-ago`).getAttribute('data-tip')).toBe(he('flightAgoTip'));
  expect(q(`${GROUP_HEAD} .flight-ago`).getAttribute('data-tip')).toBe(he('flightGroupAgoTip'));
  expect(q(`${MEMBER} .flight-cost`).getAttribute('data-tip')).toBe(he('flightSliceCostTip'));
  expect(q(`${MEMBER} .flight-real-cost`).getAttribute('data-tip')).toBe(he('flightRealCostTip'));
  expect(q(`${MEMBER} .flight-ago`).getAttribute('data-tip')).toBe(he('flightSliceAgoTip'));
}

describe('flight log cost/real-cost/ago tips i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every tip key exists in every locale, and the Hebrew table actually translates', () => {
    for (const key of TIP_KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
      }
      expect(he(key), key).not.toBe(STRINGS.en[key as StringKey]);
    }
  });

  it("tags a flat row's cost, real-cost and ago tips, English byte-identical to before", async () => {
    await render();

    expectTip(`${FLAT_ROW} .flight-cost`, FLAT_COST_TIP, 'flightCostTip');
    expectTip(`${FLAT_ROW} .flight-real-cost`, REAL_COST_TIP, 'flightRealCostTip');
    expectTip(`${FLAT_ROW} .flight-ago`, FLAT_AGO_TIP, 'flightAgoTip');
  });

  it("tags the collapsed group head's ago tip; its composed cost tip rides the template sweep instead", async () => {
    await render();

    expectTip(`${GROUP_HEAD} .flight-ago`, GROUP_AGO_TIP, 'flightGroupAgoTip');
    // The composed cost tip carries no fixed-text key — it is a {n} template
    // (flight-log-sha-group-cost-i18n.test.ts covers its flip).
    const groupCost = q(`${GROUP_HEAD} .flight-cost`);
    expect(groupCost.getAttribute('data-tip')).toBe('Total spend across all 2 slices');
    expect(groupCost.hasAttribute('data-i18n-tip')).toBe(false);
    expect(groupCost.getAttribute('data-i18n-tip-template')).toBe('flightGroupCostTip');
  });

  it("tags an opened group's member rows with the slice-worded keys", async () => {
    await render();
    await openGroup();

    expectTip(`${MEMBER} .flight-cost`, SLICE_COST_TIP, 'flightSliceCostTip');
    expectTip(`${MEMBER} .flight-real-cost`, REAL_COST_TIP, 'flightRealCostTip');
    expectTip(`${MEMBER} .flight-ago`, SLICE_AGO_TIP, 'flightSliceAgoTip');
  });

  it('switching to Hebrew flips every tip in place, no re-render between', async () => {
    await render();
    await openGroup();

    clickLocale('he');

    expectAllHebrew();
  });

  it('switching back to English restores the exact pre-i18n text', async () => {
    await render();
    await openGroup();
    clickLocale('he');
    clickLocale('en');

    expectAllEnglish();
  });

  it('a saved Hebrew locale paints the tips in Hebrew at build, before any switch', async () => {
    localStorage.setItem('ap-locale', 'he');
    await render();
    await openGroup();

    expect(document.documentElement.lang).toBe('he');
    expectAllHebrew();
  });
});

describe('an unpriced firing in the flight log (epic 0036)', () => {
  // A Codex or Gemini run reports no price; its metrics row stores 0, so the
  // chip read "$0.00", as if the run had been free.
  const UNPRICED_STATE = {
    ...STATE,
    projects: [
      {
        ...PROJECT,
        flightLog: [
          { id: 'u1', at: 3, cost: 0, costUnpriced: true, turns: 1, sha: 'abc1234' },
          {
            id: 'u2',
            at: 2,
            cost: 0,
            costUnpriced: true,
            turns: 1,
            sha: 'bcd2345',
            completion: 'slice',
            item: 't1',
          },
          { id: 'u3', at: 1, cost: 0.1, turns: 1, sha: 'cde3456', completion: 'slice', item: 't1' },
        ],
      },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a flat row's cost chip says unpriced, never $0.00", async () => {
    await render(UNPRICED_STATE);

    const chip = q(`${FLAT_ROW} .flight-cost`);
    expect(chip.textContent).toBe('unpriced');
    expect(chip.getAttribute('aria-label')).toBe('cost: unpriced, no price was reported');
    expectTip(`${FLAT_ROW} .flight-cost`, FLAT_COST_TIP, 'flightCostTip');
  });

  it("a slice group's unpriced member says so, beside its priced sibling's cost", async () => {
    await render(UNPRICED_STATE);
    await openGroup();

    const members = [...document.querySelectorAll<HTMLElement>(`${MEMBER} .flight-cost`)];
    expect(members.map((m) => m.textContent)).toEqual(['unpriced', '$0.10']);
  });

  it("a slice group's head names its unpriced slice beside the priced total", async () => {
    await render(UNPRICED_STATE);

    const head = q(`${GROUP_HEAD} .flight-cost`);
    expect(head.textContent).toBe('$0.10 + 1 unpriced');
    expect(head.getAttribute('aria-label')).toBe('total cost: $0.10, 1 unpriced left out');
    expect(q(`${GROUP_HEAD} .flight-item`).getAttribute('data-tip')).toBe(
      '2 firings advanced "t1", still open — total $0.10 + 1 unpriced',
    );
  });

  it("a flat row's opened detail line says unpriced, never $0.00", async () => {
    await render(UNPRICED_STATE);
    q(`${FLAT_ROW} .flight-item`).click();
    await vi.advanceTimersByTimeAsync(100);

    const line = q('.flight-detail p.muted').textContent ?? '';
    expect(line).toContain('unpriced');
    expect(line).not.toContain('$0.00');
  });
});
