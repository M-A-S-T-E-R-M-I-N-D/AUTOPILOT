// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The flight log's "Show all (N)" / "Show fewer" toggle (board
 * web-msnsndki-dz3vn1, the slice after the "Load older firings" button
 * beneath it): its visible text and the tip that doubles as its accessible
 * name — composed by the spliced `flightLogMoreMeta()` helper
 * (`web/flight-log-rows.ts`) as English concatenations around the live
 * row count and the compact window. Invisible to `pnpm i18n:untagged`,
 * stuck in English under the Hebrew locale.
 *
 * The helper stays spliced into the bundle via `.toString()` (its own test
 * pins the English default), so like `flightProgressOf` and `replayNav`
 * before it the bundle's `tr()` is INJECTED as an extra parameter rather than
 * imported, and the helper hands back the keys and the `{n}`/`{compact}` args
 * it used so `flightLogNode` can tag the button as a template — text via
 * `data-i18n-template`, tip AND accessible name via the tip/aria template
 * twins, the live counts riding a `data-i18n-args` map — for `translateDom()`
 * to re-fill in place on a locale switch. The button is rebuilt from state on
 * every render (the section's signature carries the open flag), so each
 * render tags whichever open/closed key pair matches the CURRENT state, the
 * same reasoning the "Load older firings" button follows for its busy label.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const HEBREW_LETTER = /\p{Script=Hebrew}/u;

function firing(id: string, at: number) {
  return {
    id,
    item: 'web-abc123',
    kind: 'fix',
    sha: null,
    shipped: true,
    gateResult: null,
    cost: 0.01,
    tokensIn: 10,
    tokensOut: 5,
    turns: 2,
    commitSubject: 'fix: ' + id,
    at,
  };
}

/** Ten rows — over the 8-row compact window, so the toggle renders. */
const LOG = Array.from({ length: 10 }, (_, i) => firing('f' + (10 - i), 10 - i));

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 1,
  totalBytes: 10,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: true,
  firings: 10,
  shipped: 10,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 10,
  flightLog: LOG,
  flightLogHasMore: false,
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 10,
    shipped: 10,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  ) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

function toggle(): HTMLButtonElement {
  return document.querySelector('[data-flightlog-all="p1"]') as HTMLButtonElement;
}

const ARGS = { n: 10, compact: 8 };

describe('flight log "Show all (N)" / "Show fewer" toggle i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('paints the collapsed state in English by default, tagged as a template with the live counts', async () => {
    await boot();
    const btn = toggle();

    expect(btn.textContent).toBe('Show all (10)');
    expect(btn.getAttribute('data-tip')).toBe(
      'Reveal all 10 locally-held firings, not just the most recent 8',
    );
    // The tip IS the accessible name.
    expect(btn.getAttribute('aria-label')).toBe(btn.getAttribute('data-tip'));

    expect(btn.getAttribute('data-i18n-template')).toBe('flightLogShowAll');
    expect(btn.getAttribute('data-i18n-tip-template')).toBe('flightLogShowAllTip');
    expect(btn.getAttribute('data-i18n-aria-template')).toBe('flightLogShowAllTip');
    expect(JSON.parse(btn.getAttribute('data-i18n-args') || '{}')).toEqual(ARGS);
  });

  it('switching to Hebrew re-fills the text, tip, and accessible name in place, counts intact', async () => {
    await boot();
    const btn = toggle();

    switchToHebrew();

    expect(toggle()).toBe(btn);
    expect(btn.textContent).toBe(STRINGS.he.flightLogShowAll.replace('{n}', '10'));
    const heTip = STRINGS.he.flightLogShowAllTip.replace('{n}', '10').replace('{compact}', '8');
    expect(btn.getAttribute('data-tip')).toBe(heTip);
    expect(btn.getAttribute('aria-label')).toBe(heTip);
    expect(HEBREW_LETTER.test(btn.textContent || '')).toBe(true);
    expect(btn.textContent).toContain('10');
  });

  it('opening the log rebuilds the button in the "Show fewer" state with the open keys', async () => {
    await boot();
    toggle().click();
    await vi.advanceTimersByTimeAsync(10);
    const open = toggle();

    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(open.textContent).toBe('Show fewer');
    expect(open.getAttribute('data-tip')).toBe('Collapse back to the most recent 8 firings');
    expect(open.getAttribute('aria-label')).toBe(open.getAttribute('data-tip'));
    expect(open.getAttribute('data-i18n-template')).toBe('flightLogShowFewer');
    expect(open.getAttribute('data-i18n-tip-template')).toBe('flightLogShowFewerTip');
    expect(open.getAttribute('data-i18n-aria-template')).toBe('flightLogShowFewerTip');

    switchToHebrew();
    expect(open.textContent).toBe(STRINGS.he.flightLogShowFewer);
    expect(open.getAttribute('data-tip')).toBe(
      STRINGS.he.flightLogShowFewerTip.replace('{compact}', '8'),
    );
    expect(open.getAttribute('aria-label')).toBe(open.getAttribute('data-tip'));
  });

  it('a page that boots in Hebrew paints the toggle in Hebrew at birth', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot();
    const btn = toggle();

    expect(btn.textContent).toBe(STRINGS.he.flightLogShowAll.replace('{n}', '10'));
    expect(btn.getAttribute('aria-label')).toBe(
      STRINGS.he.flightLogShowAllTip.replace('{n}', '10').replace('{compact}', '8'),
    );
  });

  it('keeps the Hebrew rows native and slot-complete — real Hebrew, every {slot} the English carries', () => {
    for (const key of [
      'flightLogShowAll',
      'flightLogShowAllTip',
      'flightLogShowFewer',
      'flightLogShowFewerTip',
    ] as const) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
      expect(HEBREW_LETTER.test(STRINGS.he[key])).toBe(true);
      for (const slot of STRINGS.en[key].match(/\{[a-z]+\}/g) || []) {
        expect(STRINGS.he[key]).toContain(slot);
      }
    }
  });

  it('injects the bundle tr() into the spliced helper instead of composing English inline', () => {
    const js = clientJs();
    expect(js).toContain(
      'flightLogMoreMeta(!!openFlightLogAll[c.id], displayRows.length, FLIGHTLOG_COMPACT_ROWS, tr)',
    );
  });
});
