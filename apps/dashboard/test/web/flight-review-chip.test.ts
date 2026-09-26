// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The commit-time review's chip on the flight log row (docs/BACKLOG-999.md
 * §L C5, board ap-mui3cjp9-3). The engine reviews every gate-passed firing's
 * diff and the API carries the result on each row (`FlightEntry.review`), but
 * until this chip nothing on screen said so: a finding the reviewer raised
 * sat in the firing record where only a log dig could reach it.
 *
 * A row whose review flagged something carries a "N flagged" chip with a
 * search icon; its tip names the most severe finding. A clean review, a
 * skipped one and a firing that was never reviewed carry no chip. The text,
 * tip and aria-label each wrap live values, so all three ride
 * `translateDom()`'s template sweeps with `{n}` and `{top}` from a
 * `data-i18n-args` map — the guard-denial chip's shape
 * (`flight-guard-chip-i18n.test.ts`). Drives the REAL client bundle in jsdom
 * against a mocked /api/state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

function row(id: string, at: number, review: unknown): Record<string, unknown> {
  return {
    id,
    shipped: true,
    item: null,
    completion: null,
    commitSubject: 'fix: row ' + id,
    cost: 0.1,
    sha: 'sha' + id,
    at,
    kind: 'fix',
    gateResult: 'passed',
    review,
  };
}

const TWO_TOP = '[high] src/a.ts: The retry loop never ends.';
const ONE_TOP = '[medium] The subject hides a rename.';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 5,
  shipped: 5,
  cost: 0.5,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  tasks: [],
  // Newest first: two flagged reviews with different counts (so {n} and {top}
  // are pinned per chip), then the three rows that must stay chip-less.
  flightLog: [
    row('f5', 10, {
      status: 'reviewed',
      model: 'haiku',
      costUsd: 0.01,
      findings: [
        { severity: 'high', file: 'src/a.ts', problem: 'The retry loop never ends.' },
        { severity: 'low', file: null, problem: 'A test name overclaims.' },
      ],
    }),
    row('f4', 8, {
      status: 'reviewed',
      model: 'haiku',
      costUsd: 0.01,
      findings: [{ severity: 'medium', file: null, problem: 'The subject hides a rename.' }],
    }),
    row('f3', 6, { status: 'reviewed', model: 'haiku', costUsd: 0.01, findings: [] }),
    row('f2', 4, { status: 'skipped', reason: 'no diff text to review' }),
    row('f1', 2, null),
  ],
  activity: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 5,
    shipped: 5,
    openFindings: 0,
    cost: 0.5,
  },
  projects: [PROJECT],
  empty: false,
};

const KEYS = ['flightReviewChip', 'flightReviewChipTip', 'flightReviewChipAria'];

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

/** The flight log's review chips, newest firing first. */
function reviewChips(): HTMLElement[] {
  const found = Array.from(
    document.querySelectorAll<HTMLElement>('.flightlog .flight-head .flight-review-chip'),
  );
  expect(found).toHaveLength(2);
  return found;
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function he(key: string): string {
  return STRINGS.he[key as StringKey];
}

function fill(template: string, n: number, top: string): string {
  return template.split('{n}').join(String(n)).split('{top}').join(top);
}

function expectChipEnglish(chip: HTMLElement, n: number, top: string): void {
  expect(chip.querySelector('svg.icon-search')).not.toBeNull();
  expect(chip.textContent).toBe(n + ' flagged');
  expect(chip.getAttribute('data-tip')).toBe(
    "An independent reviewer read this firing's diff after the gate passed and flagged " +
      n +
      ' possible problem(s) — advisory only, the gate verdict stands. Most severe: ' +
      top,
  );
  expect(chip.getAttribute('aria-label')).toBe(
    'commit review flagged ' + n + " possible problem(s) in this firing's diff",
  );
  // Keyboard-reachable: a member of the row head's roving group
  // (wireRoving('.flight-head [tabindex]')), so 0 or -1 depending on focus.
  expect(chip.getAttribute('tabindex')).toMatch(/^(0|-1)$/);
  expect(chip.getAttribute('data-i18n-template')).toBe('flightReviewChip');
  expect(chip.getAttribute('data-i18n-tip-template')).toBe('flightReviewChipTip');
  expect(chip.getAttribute('data-i18n-aria-template')).toBe('flightReviewChipAria');
  expect(chip.getAttribute('data-i18n-args')).toBe(JSON.stringify({ n, top }));
}

function expectChipHebrew(chip: HTMLElement, n: number, top: string): void {
  expect(chip.querySelector('svg.icon-search')).not.toBeNull();
  expect(chip.textContent).toBe(fill(he('flightReviewChip'), n, top));
  expect(chip.getAttribute('data-tip')).toBe(fill(he('flightReviewChipTip'), n, top));
  expect(chip.getAttribute('aria-label')).toBe(fill(he('flightReviewChipAria'), n, top));
}

describe('commit-review chip on the flight log row (board ap-mui3cjp9-3)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every key exists in every locale, keeps its slots, and the Hebrew table actually translates', () => {
    for (const key of KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toContain('{n}');
      }
      expect(he(key), key).not.toBe(STRINGS.en[key as StringKey]);
    }
    for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
      expect(STRINGS[locale]['flightReviewChipTip' as StringKey]).toContain('{top}');
    }
  });

  it('only a review that flagged something earns a chip, tagged for the template sweeps', async () => {
    await render();

    const [two, one] = reviewChips();
    expectChipEnglish(two as HTMLElement, 2, TWO_TOP);
    expectChipEnglish(one as HTMLElement, 1, ONE_TOP);
  });

  it('switching to Hebrew flips text, tip and aria-label in place, the count and finding kept', async () => {
    await render();

    clickLocale('he');

    const [two, one] = reviewChips();
    expectChipHebrew(two as HTMLElement, 2, TWO_TOP);
    expectChipHebrew(one as HTMLElement, 1, ONE_TOP);
  });

  it('switching back to English restores the exact English text', async () => {
    await render();
    clickLocale('he');
    clickLocale('en');

    const [two, one] = reviewChips();
    expectChipEnglish(two as HTMLElement, 2, TWO_TOP);
    expectChipEnglish(one as HTMLElement, 1, ONE_TOP);
  });
});
