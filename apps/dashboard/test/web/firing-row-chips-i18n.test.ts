// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The trace row's count / started-ago tips and the auto-fixed chip's i18n
 * (board web-msnsndki-dz3vn1) — the slice `firing-diff-i18n.test.ts` named
 * as still English: a per-firing trace row's "Tool calls and activity
 * recorded for this firing" and "When this firing started" hover tips
 * (`web/features/firing-timeline.ts`), and the "🔧 auto-fixed" chip a
 * formatting-rescued firing carries — its visible text, its full tip, and
 * its screen-reader aria-label — kept rendering English regardless of the
 * active locale after the row's replay controls and diff toggle beside them
 * were translated.
 *
 * The same chip, built from the same three literals, sits on the flight
 * log's rows (`shell.ts`'s `flightLogSection()`), so ONE set of keys tags
 * both surfaces — a rescued firing reads the same in both lists in either
 * locale. The count and started-ago labels themselves ("3 actions", "2m
 * ago") are `firingTimelineRowMeta()`'s own composed strings and stay as-is;
 * only their tips carry a key. The English text is byte-identical to what
 * each surface said before this slice. Drives the REAL client bundle in
 * jsdom against a mocked /api/state, same harness as
 * `firing-diff-i18n.test.ts`.
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
  flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1, sha: 'abc1234', autoformatRescued: true }],
  tasks: [],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 1, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const CHIP_KEYS = [
  'firingCountTip',
  'firingStartedTip',
  'autoFixed',
  'autoFixedTip',
  'autoFixedAria',
];

const AUTO_FIXED_TEXT = '🔧 auto-fixed';
const AUTO_FIXED_TIP =
  'The gate failed a formatting check; mechanical remediation fixed it automatically and this firing shipped clean instead of reverting.';
const AUTO_FIXED_ARIA =
  'auto-fixed: formatting was mechanically remediated before this firing shipped';

const TRACE_CHIP = '.firing-toggle .flight-autoformat-chip';
const LOG_CHIP = '.flight-head .flight-autoformat-chip';

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

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function he(key: string): string {
  return STRINGS.he[key as StringKey];
}

function expectChipTagged(chip: HTMLElement): void {
  expect(chip.textContent).toBe(AUTO_FIXED_TEXT);
  expect(chip.getAttribute('data-i18n')).toBe('autoFixed');
  expect(chip.getAttribute('data-tip')).toBe(AUTO_FIXED_TIP);
  expect(chip.getAttribute('data-i18n-tip')).toBe('autoFixedTip');
  expect(chip.getAttribute('aria-label')).toBe(AUTO_FIXED_ARIA);
  expect(chip.getAttribute('data-i18n-aria')).toBe('autoFixedAria');
}

function expectChipHebrew(chip: HTMLElement): void {
  expect(chip.textContent).toBe(he('autoFixed'));
  expect(chip.getAttribute('data-tip')).toBe(he('autoFixedTip'));
  expect(chip.getAttribute('aria-label')).toBe(he('autoFixedAria'));
}

describe('trace row count/started tips + auto-fixed chip i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every chip key exists in every locale, and the Hebrew table actually translates', () => {
    for (const key of CHIP_KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
      }
      expect(he(key), key).not.toBe(STRINGS.en[key as StringKey]);
    }
  });

  it("tags the trace row's count and started-ago tips, English byte-identical to before", async () => {
    await render();

    const count = q('.firing-toggle .firing-count');
    expect(count.getAttribute('data-tip')).toBe('Tool calls and activity recorded for this firing');
    expect(count.getAttribute('data-i18n-tip')).toBe('firingCountTip');
    // The label itself is a composed count — no [data-i18n] on it.
    expect(count.hasAttribute('data-i18n')).toBe(false);

    const ago = q('.firing-toggle .firing-ago');
    expect(ago.getAttribute('data-tip')).toBe('When this firing started');
    expect(ago.getAttribute('data-i18n-tip')).toBe('firingStartedTip');
    expect(ago.hasAttribute('data-i18n')).toBe(false);
  });

  it("tags the trace row's auto-fixed chip: text, tip, and aria-label each carry a key", async () => {
    await render();

    expectChipTagged(q(TRACE_CHIP));
  });

  it("tags the flight log row's auto-fixed chip with the same three keys", async () => {
    await render();

    expectChipTagged(q(LOG_CHIP));
  });

  it('switching to Hebrew flips both chips and both tips in place, no re-render between', async () => {
    await render();

    clickLocale('he');

    expect(q('.firing-toggle .firing-count').getAttribute('data-tip')).toBe(he('firingCountTip'));
    expect(q('.firing-toggle .firing-ago').getAttribute('data-tip')).toBe(he('firingStartedTip'));
    expectChipHebrew(q(TRACE_CHIP));
    expectChipHebrew(q(LOG_CHIP));
  });

  it('switching back to English restores the exact pre-i18n text', async () => {
    await render();
    clickLocale('he');
    clickLocale('en');

    expect(q('.firing-toggle .firing-count').getAttribute('data-tip')).toBe(
      'Tool calls and activity recorded for this firing',
    );
    expect(q('.firing-toggle .firing-ago').getAttribute('data-tip')).toBe(
      'When this firing started',
    );
    expectChipTagged(q(TRACE_CHIP));
    expectChipTagged(q(LOG_CHIP));
  });

  it('a saved Hebrew locale paints the tips and chips in Hebrew at build, before any switch', async () => {
    localStorage.setItem('ap-locale', 'he');
    await render();

    expect(document.documentElement.lang).toBe('he');
    expect(q('.firing-toggle .firing-count').getAttribute('data-tip')).toBe(he('firingCountTip'));
    expect(q('.firing-toggle .firing-ago').getAttribute('data-tip')).toBe(he('firingStartedTip'));
    expectChipHebrew(q(TRACE_CHIP));
    expectChipHebrew(q(LOG_CHIP));
  });
});
