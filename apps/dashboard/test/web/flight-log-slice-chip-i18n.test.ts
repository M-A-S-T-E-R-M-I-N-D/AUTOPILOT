// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The flight log's "slice of <task>" chip i18n (board web-msnsndki-dz3vn1) —
 * the chip the sha/group-cost slice (`flight-log-sha-group-cost-i18n.test.ts`)
 * left for later because it carries TWO live values: its visible text wraps
 * the task title truncated at 40 chars ("slice of <short>") while its hover
 * tip ("Part of a multi-firing task, still open: <title>") and aria-label
 * ("slice of <title>") wrap the full one. Every isolated slice firing (no
 * run partner to collapse into a group row) shows one, and all three of its
 * strings kept rendering English in Hebrew after every fixed chip around it
 * flipped.
 *
 * The chip rides `translateDom()`'s three template sweeps at once: the text
 * (`[data-i18n-template]`, `flightSliceChip`, its `{short}` slot filled from
 * a `data-i18n-args` map), the tip (`[data-i18n-tip-template]`,
 * `flightSliceChipTip`) and the aria-label (`[data-i18n-aria-template]`,
 * `flightSliceChipAria`) — the latter two reading the full title from the
 * chip's `data-i18n-name`. The English text is byte-identical to what the
 * chip said before this slice. Drives the REAL client bundle in jsdom against
 * a mocked /api/state, same harness as the sha/group-cost test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const LONG_TITLE = 'A very long task title that definitely exceeds forty characters';
const LONG_SHORT = LONG_TITLE.slice(0, 40) + '…';
const BRIEF_TITLE = 'Track telemetry drift';

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
  // Newest first: two isolated slices of two DIFFERENT open tasks — no run
  // partner, so neither collapses into a group row and each renders its own
  // "slice of <task>" chip. The newest task's title overflows the 40-char
  // text cutoff; the older one fits.
  flightLog: [
    { id: 'f1', at: 2, cost: 0.2, turns: 1, completion: 'slice', item: 't-long' },
    { id: 'f2', at: 1, cost: 0.1, turns: 1, completion: 'slice', item: 't-brief' },
  ],
  tasks: [
    { id: 't-long', title: LONG_TITLE, status: 'in_progress' },
    { id: 't-brief', title: BRIEF_TITLE, status: 'in_progress' },
  ],
  activity: [],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const KEYS = ['flightSliceChip', 'flightSliceChipTip', 'flightSliceChipAria'];

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

async function render(): Promise<void> {
  boot();
  await vi.advanceTimersByTimeAsync(1);
}

function chips(): HTMLElement[] {
  const found = Array.from(document.querySelectorAll<HTMLElement>('.flight-slice-chip'));
  expect(found).toHaveLength(2);
  return found;
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

function expectChipEnglish(chip: HTMLElement, title: string, short: string): void {
  expect(chip.textContent).toBe('slice of ' + short);
  expect(chip.getAttribute('data-tip')).toBe('Part of a multi-firing task, still open: ' + title);
  expect(chip.getAttribute('aria-label')).toBe('slice of ' + title);
  expect(chip.getAttribute('data-i18n-template')).toBe('flightSliceChip');
  expect(chip.getAttribute('data-i18n-tip-template')).toBe('flightSliceChipTip');
  expect(chip.getAttribute('data-i18n-aria-template')).toBe('flightSliceChipAria');
  expect(chip.getAttribute('data-i18n-name')).toBe(title);
  expect(chip.getAttribute('data-i18n-args')).toBe(JSON.stringify({ short }));
  // Every string on it wraps a live value — no fixed-text tags.
  expect(chip.hasAttribute('data-i18n')).toBe(false);
  expect(chip.hasAttribute('data-i18n-tip')).toBe(false);
  expect(chip.hasAttribute('data-i18n-aria')).toBe(false);
}

function expectChipHebrew(chip: HTMLElement, title: string, short: string): void {
  expect(chip.textContent).toBe(fill(he('flightSliceChip'), { short }));
  expect(chip.getAttribute('data-tip')).toBe(fill(he('flightSliceChipTip'), { name: title }));
  expect(chip.getAttribute('aria-label')).toBe(fill(he('flightSliceChipAria'), { name: title }));
}

function expectAllEnglish(): void {
  const [long, brief] = chips();
  expectChipEnglish(long as HTMLElement, LONG_TITLE, LONG_SHORT);
  expectChipEnglish(brief as HTMLElement, BRIEF_TITLE, BRIEF_TITLE);
}

function expectAllHebrew(): void {
  const [long, brief] = chips();
  expectChipHebrew(long as HTMLElement, LONG_TITLE, LONG_SHORT);
  expectChipHebrew(brief as HTMLElement, BRIEF_TITLE, BRIEF_TITLE);
}

describe('flight log "slice of <task>" chip i18n (board web-msnsndki-dz3vn1)', () => {
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
    const slot = {
      flightSliceChip: '{short}',
      flightSliceChipTip: '{name}',
      flightSliceChipAria: '{name}',
    };
    for (const [key, placeholder] of Object.entries(slot)) {
      expect(STRINGS.en[key as StringKey], `en.${key}`).toContain(placeholder);
      expect(he(key), `he.${key}`).toContain(placeholder);
    }
  });

  it("tags an overflowing title's chip: truncated text via {short} args, full title via data-i18n-name, English byte-identical", async () => {
    await render();

    const [long] = chips();
    expectChipEnglish(long as HTMLElement, LONG_TITLE, LONG_SHORT);
  });

  it('a title that fits the cutoff carries itself as both the {short} arg and the name', async () => {
    await render();

    const [, brief] = chips();
    expectChipEnglish(brief as HTMLElement, BRIEF_TITLE, BRIEF_TITLE);
  });

  it('switching to Hebrew flips the text, tip and aria-label in place, the titles kept', async () => {
    await render();

    clickLocale('he');

    expectAllHebrew();
  });

  it('switching back to English restores the exact pre-i18n text', async () => {
    await render();
    clickLocale('he');
    clickLocale('en');

    expectAllEnglish();
  });

  it('a saved Hebrew locale paints them in Hebrew at build, before any switch', async () => {
    localStorage.setItem('ap-locale', 'he');
    await render();

    expect(document.documentElement.lang).toBe('he');
    expectAllHebrew();
  });
});
