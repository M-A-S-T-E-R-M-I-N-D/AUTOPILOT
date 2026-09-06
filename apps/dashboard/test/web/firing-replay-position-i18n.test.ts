// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Firing Replay's "Step N of M" position label's i18n (board
 * web-msnsndki-dz3vn1) — the one control the playback-controls slice
 * (`firing-replay-i18n.test.ts`) left English: an aria-live status region
 * whose announced text `web/replay-nav.ts`'s `replayNav()` composed as a
 * bare English literal, so it kept saying "Step 1 of 3" between a Hebrew
 * "‹ Prev" and "Next ›".
 *
 * Two slots (`{step}` and `{total}`), so it takes the flight-progress route:
 * the bundle's `tr` is injected into the spliced helper (the label is painted
 * in the active locale at build), and the element carries
 * `data-i18n-template="replayPosition"` plus a `data-i18n-args` JSON map —
 * the DOM twin of `tr()`'s substitution map, new to `translateDom()`'s
 * template sweep here — so a mid-session switch flips it in place. The
 * sweep only writes on a real change so an identical repaint never
 * re-announces the live region. The English text is byte-identical to what
 * the label said before this slice. Drives the REAL client bundle in jsdom
 * against a mocked /api/state, same harness as `firing-replay-i18n.test.ts`.
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
  flightLog: [],
  tasks: [],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 3, firingId: 'f1' },
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 2, firingId: 'f1' },
    { tool: 'Grep', target: 'TODO', kind: 'search', phase: 'orient', at: 1, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const POSITION_KEYS = ['replayPosition', 'replayNoSteps'];

const LABEL = '.replay-nav-label';

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

function q(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  expect(node, selector).not.toBeNull();
  return node as HTMLElement;
}

function click(selector: string): void {
  q(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

async function enterReplay(): Promise<void> {
  boot();
  await vi.advanceTimersByTimeAsync(1);
  click('[data-firing-toggle="f1"]');
  await vi.advanceTimersByTimeAsync(1);
  click('[data-replay-start="f1"]');
  await vi.advanceTimersByTimeAsync(1);
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function he(key: string): string {
  return STRINGS.he[key as StringKey];
}

/** The Hebrew label for a step — the table's template with both slots filled. */
function hePosition(step: number, total: number): string {
  return he('replayPosition')
    .split('{step}')
    .join(String(step))
    .split('{total}')
    .join(String(total));
}

function expectTagged(step: number, total: number): void {
  const label = q(LABEL);
  expect(label.getAttribute('data-i18n-template')).toBe('replayPosition');
  expect(JSON.parse(label.getAttribute('data-i18n-args') as string)).toEqual({ step, total });
  // Still an aria-live status: no aria-label, and no plain text/aria sweep
  // tag that could paint a fixed string over the composed position.
  expect(label.getAttribute('role')).toBe('status');
  expect(label.getAttribute('aria-live')).toBe('polite');
  expect(label.getAttribute('aria-label')).toBeNull();
  expect(label.hasAttribute('data-i18n')).toBe(false);
  expect(label.hasAttribute('data-i18n-aria')).toBe(false);
}

describe('Firing Replay "Step N of M" position label i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every position key exists in every locale, keeps both slots, and the Hebrew table actually translates', () => {
    for (const key of POSITION_KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
      }
      expect(he(key), key).not.toBe(STRINGS.en[key as StringKey]);
    }
    for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
      expect(STRINGS[locale].replayPosition).toContain('{step}');
      expect(STRINGS[locale].replayPosition).toContain('{total}');
    }
  });

  it('tags the label as a two-slot template with its live step/total args, English text byte-identical to before', async () => {
    await enterReplay();

    expect(q(LABEL).textContent).toBe('Step 1 of 3');
    expectTagged(1, 3);
    // The tip tag the playback-controls slice added is untouched.
    expect(q(LABEL).getAttribute('data-i18n-tip')).toBe('replayPositionTip');
  });

  it('switching to Hebrew flips the label in place, no re-render between', async () => {
    await enterReplay();

    clickLocale('he');

    expect(q(LABEL).textContent).toBe(hePosition(1, 3));
    expect(q(LABEL).getAttribute('data-tip')).toBe(he('replayPositionTip'));
  });

  it('stepping in Hebrew rebuilds the label in Hebrew with the new step, args kept in sync', async () => {
    await enterReplay();
    clickLocale('he');

    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    expect(q(LABEL).textContent).toBe(hePosition(2, 3));
    expectTagged(2, 3);
  });

  it('switching back to English restores the exact pre-i18n text', async () => {
    await enterReplay();
    clickLocale('he');
    clickLocale('en');

    expect(q(LABEL).textContent).toBe('Step 1 of 3');
  });

  it('a saved Hebrew locale paints the label in Hebrew at build, before any switch', async () => {
    localStorage.setItem('ap-locale', 'he');
    await enterReplay();

    expect(document.documentElement.lang).toBe('he');
    expect(q(LABEL).textContent).toBe(hePosition(1, 3));
    expectTagged(1, 3);
  });

  it('an identical repaint leaves the live region untouched — the sweep only writes on a real change', async () => {
    await enterReplay();
    const label = q(LABEL);
    const before = label.firstChild;

    // A same-locale sweep (what every renderFleet() tick runs) must not
    // replace the text node, which would re-announce the unchanged position.
    clickLocale('en');

    expect(q(LABEL)).toBe(label);
    expect(label.firstChild).toBe(before);
    expect(label.textContent).toBe('Step 1 of 3');
  });
});
