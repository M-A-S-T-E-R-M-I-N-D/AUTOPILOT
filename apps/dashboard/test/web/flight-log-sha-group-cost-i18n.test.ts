// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The flight log's commit-sha chip and the slice-run group head's cost tip
 * i18n (board web-msnsndki-dz3vn1) — two of the "helper-composed" chips the
 * cost/ago-tips slice (`flight-log-cost-ago-i18n.test.ts`) left for a later
 * template slice. Every flight-log row with a recorded commit carries a sha
 * chip whose tip ("Commit: <sha>") and aria-label ("commit <sha>") wrap the
 * live sha, and the collapsed group head's cost tip ("Total spend across all
 * N slices") wraps the live slice count — none had a fixed string a plain
 * `data-i18n-tip` sweep could paint, so all of them kept rendering English in
 * Hebrew after every fixed tip around them was translated.
 *
 * The tips ride a `[data-i18n-tip-template]` sweep, the `data-tip` twin of
 * `translateDom()`'s `[data-i18n-aria-template]`: the sha chip carries its
 * value as `data-i18n-name` (filling `{name}` in both its tip and aria
 * templates), the group head's cost tip carries its count as a
 * `data-i18n-args` JSON map (filling `{n}`). The chips' visible text (the
 * short sha, "$0.20") stays composed and untagged. The English text is
 * byte-identical to what each surface said before this slice. Drives the
 * REAL client bundle in jsdom against a mocked /api/state, same harness as
 * `flight-log-cost-ago-i18n.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const FLAT_SHA = 'abc1234def5678';
const MEMBER_SHA = 'bcd2345efa6789';

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
  // Newest first: one flat firing with a commit, then a run of two slices of
  // the same open task that collapses into one group row (the newest member
  // carries a commit; the oldest has none, so its row renders no sha chip).
  flightLog: [
    { id: 'f1', at: 3, cost: 0.2, turns: 1, sha: FLAT_SHA },
    { id: 'f2', at: 2, cost: 0.1, turns: 1, sha: MEMBER_SHA, completion: 'slice', item: 't1' },
    { id: 'f3', at: 1, cost: 0.1, turns: 1, completion: 'slice', item: 't1' },
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

const KEYS = ['flightShaTip', 'flightShaAria', 'flightGroupCostTip'];

const FLAT_ROW = '.flight:not(.flight-group) > .flight-head';
const GROUP_HEAD = '.flight-group > .flight-head';
const MEMBER = '.flight-group-member';

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => STATE,
  })) as unknown as typeof fetch;
  new Function(clientJs())();
}

function q(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  expect(node, selector).not.toBeNull();
  return node as HTMLElement;
}

async function render(): Promise<void> {
  boot();
  await vi.advanceTimersByTimeAsync(1);
}

/** Opens the slice-run group row so its member rows render. */
async function openGroup(): Promise<void> {
  q(GROUP_HEAD).click();
  await vi.advanceTimersByTimeAsync(100);
  q(MEMBER);
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function he(key: string): string {
  return STRINGS.he[key as StringKey];
}

function fill(template: string, subs: Record<string, string | number>): string {
  return Object.keys(subs).reduce(
    (text, key) => text.split(`{${key}}`).join(String(subs[key])),
    template,
  );
}

function expectShaChipEnglish(selector: string, sha: string): void {
  const chip = q(selector);
  expect(chip.textContent).toBe(sha.slice(0, 7));
  expect(chip.getAttribute('data-tip')).toBe('Commit: ' + sha);
  expect(chip.getAttribute('aria-label')).toBe('commit ' + sha);
  expect(chip.getAttribute('data-i18n-tip-template')).toBe('flightShaTip');
  expect(chip.getAttribute('data-i18n-aria-template')).toBe('flightShaAria');
  expect(chip.getAttribute('data-i18n-name')).toBe(sha);
  // The short sha is a composed value — no [data-i18n] on it.
  expect(chip.hasAttribute('data-i18n')).toBe(false);
}

function expectShaChipHebrew(selector: string, sha: string): void {
  const chip = q(selector);
  expect(chip.textContent).toBe(sha.slice(0, 7));
  expect(chip.getAttribute('data-tip')).toBe(fill(he('flightShaTip'), { name: sha }));
  expect(chip.getAttribute('aria-label')).toBe(fill(he('flightShaAria'), { name: sha }));
}

function expectGroupCostEnglish(): void {
  const cost = q(`${GROUP_HEAD} .flight-cost`);
  expect(cost.getAttribute('data-tip')).toBe('Total spend across all 2 slices');
  expect(cost.getAttribute('data-i18n-tip-template')).toBe('flightGroupCostTip');
  expect(cost.getAttribute('data-i18n-args')).toBe('{"n":2}');
  expect(cost.hasAttribute('data-i18n-tip')).toBe(false);
  expect(cost.hasAttribute('data-i18n')).toBe(false);
  // The aria-label ("total cost: $0.20") is composed from the live sum and
  // stays as-is.
  expect(cost.getAttribute('aria-label')).toBe('total cost: $0.20');
}

function expectGroupCostHebrew(): void {
  const cost = q(`${GROUP_HEAD} .flight-cost`);
  expect(cost.getAttribute('data-tip')).toBe(fill(he('flightGroupCostTip'), { n: 2 }));
  expect(cost.getAttribute('aria-label')).toBe('total cost: $0.20');
}

function expectAllEnglish(): void {
  expectShaChipEnglish(`${FLAT_ROW} .flight-sha`, FLAT_SHA);
  expectShaChipEnglish(`${MEMBER} .flight-sha`, MEMBER_SHA);
  expectGroupCostEnglish();
}

function expectAllHebrew(): void {
  expectShaChipHebrew(`${FLAT_ROW} .flight-sha`, FLAT_SHA);
  expectShaChipHebrew(`${MEMBER} .flight-sha`, MEMBER_SHA);
  expectGroupCostHebrew();
}

describe('flight log sha chip + group head cost tip i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every key exists in every locale, keeps its slot, and the Hebrew table actually translates', () => {
    for (const key of KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
      }
      expect(he(key), key).not.toBe(STRINGS.en[key as StringKey]);
    }
    const slot = { flightShaTip: '{name}', flightShaAria: '{name}', flightGroupCostTip: '{n}' };
    for (const [key, placeholder] of Object.entries(slot)) {
      expect(STRINGS.en[key as StringKey], `en.${key}`).toContain(placeholder);
      expect(he(key), `he.${key}`).toContain(placeholder);
    }
  });

  it("tags a flat row's sha chip with its tip and aria templates, English byte-identical to before", async () => {
    await render();

    expectShaChipEnglish(`${FLAT_ROW} .flight-sha`, FLAT_SHA);
  });

  it("tags the collapsed group head's composed cost tip with its template and {n} args", async () => {
    await render();

    expectGroupCostEnglish();
  });

  it("tags an opened group's member sha chip; a member without a commit renders no chip", async () => {
    await render();
    await openGroup();

    expectShaChipEnglish(`${MEMBER} .flight-sha`, MEMBER_SHA);
    expect(document.querySelectorAll(`${MEMBER} .flight-sha`)).toHaveLength(1);
  });

  it('switching to Hebrew flips every tip and aria-label in place, the live values kept', async () => {
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

  it('a saved Hebrew locale paints them in Hebrew at build, before any switch', async () => {
    localStorage.setItem('ap-locale', 'he');
    await render();
    await openGroup();

    expect(document.documentElement.lang).toBe('he');
    expectAllHebrew();
  });
});
