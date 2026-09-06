// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The guard-denial chip's i18n (board web-msnsndki-dz3vn1) — the "🛡️ N
 * blocked" chip a firing carries when the containment/read-hygiene guard
 * denied one of its tool calls, built from `web/anomaly.ts`'s pure
 * `guardDenialChipMeta` by BOTH the flight log row (`shell.ts`) and the
 * per-firing trace row (`features/firing-timeline.ts`). The "slice of <task>"
 * slice (`flight-log-slice-chip-i18n.test.ts`) left it for later: its text,
 * tip and aria-label each wrap the live denial count, so no fixed-text sweep
 * could paint any of the three and the chip kept rendering English in Hebrew
 * after every fixed chip around it flipped — on both surfaces at once.
 *
 * The chip rides `translateDom()`'s three template sweeps with its count as
 * an `{n}` slot filled from a `data-i18n-args` map (the `flightGroupCostTip`
 * shape): the text (`flightGuardChip`), the tip (`flightGuardChipTip`) and
 * the aria-label (`flightGuardChipAria`). The English text is byte-identical
 * to what `guardDenialChipMeta` said before this slice. Drives the REAL
 * client bundle in jsdom against a mocked /api/state, the same harness as
 * `firing-timeline-chips.test.ts` (whose fixture renders both surfaces).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
  firings: 2,
  shipped: 2,
  cost: 0.42,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  tasks: [],
  // Newest first: two firings the guard bounced, with different counts so the
  // {n} slot is pinned per chip rather than by coincidence. Each firing's
  // activity carries its firingId so the per-firing trace renders a row for
  // it too — four chips in all, two per surface.
  flightLog: [
    {
      id: 'f2',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'fix: bounced twice',
      cost: 0.2,
      sha: 'sha0002',
      at: 6,
      kind: 'fix',
      gateResult: 'passed',
      guardDenials: 2,
    },
    {
      id: 'f1',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'fix: bounced once',
      cost: 0.22,
      sha: 'sha0001',
      at: 4,
      kind: 'fix',
      gateResult: 'passed',
      guardDenials: 1,
    },
  ],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 6, firingId: 'f2' },
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 5, firingId: 'f2' },
    { tool: 'Edit', target: 'src/c.ts', kind: 'file', phase: 'do', at: 4, firingId: 'f1' },
    { tool: 'Read', target: 'src/d.ts', kind: 'file', phase: 'orient', at: 3, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 2,
    shipped: 2,
    openFindings: 0,
    cost: 0.42,
  },
  projects: [PROJECT],
  empty: false,
};

const KEYS = ['flightGuardChip', 'flightGuardChipTip', 'flightGuardChipAria'];

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

/** The two flight-log chips, newest firing first. */
function logChips(): HTMLElement[] {
  const found = Array.from(
    document.querySelectorAll<HTMLElement>('.flightlog .flight-head .flight-guard-chip'),
  );
  expect(found).toHaveLength(2);
  return found;
}

/** The two per-firing trace chips, newest firing first. */
function traceChips(): HTMLElement[] {
  const found = Array.from(
    document.querySelectorAll<HTMLElement>('.firing-timeline .flight-guard-chip'),
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

function fill(template: string, n: number): string {
  return template.split('{n}').join(String(n));
}

function expectChipEnglish(chip: HTMLElement, n: number): void {
  expect(chip.textContent).toBe('🛡️ ' + n + ' blocked');
  expect(chip.getAttribute('data-tip')).toBe(
    'The containment/read-hygiene guard denied ' +
      n +
      ' tool call(s) during this firing — it tried to step outside its boundary and was stopped.',
  );
  expect(chip.getAttribute('aria-label')).toBe(
    'guard blocked ' + n + ' tool call(s) this firing (containment / read-hygiene)',
  );
  expect(chip.getAttribute('data-i18n-template')).toBe('flightGuardChip');
  expect(chip.getAttribute('data-i18n-tip-template')).toBe('flightGuardChipTip');
  expect(chip.getAttribute('data-i18n-aria-template')).toBe('flightGuardChipAria');
  expect(chip.getAttribute('data-i18n-args')).toBe(JSON.stringify({ n }));
  // Every string on it wraps the live count — no fixed-text tags.
  expect(chip.hasAttribute('data-i18n')).toBe(false);
  expect(chip.hasAttribute('data-i18n-tip')).toBe(false);
  expect(chip.hasAttribute('data-i18n-aria')).toBe(false);
}

function expectChipHebrew(chip: HTMLElement, n: number): void {
  expect(chip.textContent).toBe(fill(he('flightGuardChip'), n));
  expect(chip.getAttribute('data-tip')).toBe(fill(he('flightGuardChipTip'), n));
  expect(chip.getAttribute('aria-label')).toBe(fill(he('flightGuardChipAria'), n));
}

function expectSurfaceEnglish(chips: HTMLElement[]): void {
  const [twice, once] = chips;
  expectChipEnglish(twice as HTMLElement, 2);
  expectChipEnglish(once as HTMLElement, 1);
}

function expectSurfaceHebrew(chips: HTMLElement[]): void {
  const [twice, once] = chips;
  expectChipHebrew(twice as HTMLElement, 2);
  expectChipHebrew(once as HTMLElement, 1);
}

describe('guard-denial chip i18n on the flight log and the per-firing trace (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every key exists in every locale, keeps its {n} slot, and the Hebrew table actually translates', () => {
    for (const key of KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toContain('{n}');
      }
      expect(he(key), key).not.toBe(STRINGS.en[key as StringKey]);
    }
  });

  it("tags the flight log's chips with the three template keys and the count as args, English byte-identical", async () => {
    await render();

    expectSurfaceEnglish(logChips());
  });

  it("tags the per-firing trace's chips the same way", async () => {
    await render();

    expectSurfaceEnglish(traceChips());
  });

  it('switching to Hebrew flips text, tip and aria-label in place on both surfaces, the counts kept', async () => {
    await render();

    clickLocale('he');

    expectSurfaceHebrew(logChips());
    expectSurfaceHebrew(traceChips());
  });

  it('switching back to English restores the exact pre-i18n text on both surfaces', async () => {
    await render();
    clickLocale('he');
    clickLocale('en');

    expectSurfaceEnglish(logChips());
    expectSurfaceEnglish(traceChips());
  });

  it('a saved Hebrew locale paints both surfaces in Hebrew at build, before any switch', async () => {
    localStorage.setItem('ap-locale', 'he');
    await render();

    expect(document.documentElement.lang).toBe('he');
    expectSurfaceHebrew(logChips());
    expectSurfaceHebrew(traceChips());
  });
});
