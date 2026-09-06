// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Firing Replay playback controls' i18n (board web-msnsndki-dz3vn1): a
 * drilled-open firing's "▶ Step through" toggle and the Prev / Next / Exit
 * bar it opens (`web/features/firing-timeline.ts`) still said "‹ Prev" /
 * "Next ›" / "Exit replay" and explained themselves with English-only tips
 * and aria-labels regardless of the active locale, even after the "Per-firing
 * trace" heading above them was translated.
 *
 * This pins the tags that close that gap: each button's visible text rides
 * `[data-i18n]`, its concise aria-label `[data-i18n-aria]`, and its full
 * data-tip `[data-i18n-tip]` — the Exit button's text and aria-label share
 * ONE key since the D1 attribute-payload audit already made them identical.
 * The "Step N of M" position label keeps only a tip tag: it is an aria-live
 * status region whose announced text is `replayNav()`'s own composed string
 * (`web/replay-nav.ts`), so no text sweep may touch it. The English text is
 * byte-identical to what the controls said before this slice. Drives the
 * REAL client bundle in jsdom against a mocked /api/state, same harness as
 * firing-replay-nav.test.ts.
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

const REPLAY_KEYS = [
  'replayStart',
  'replayStartAria',
  'replayStartTip',
  'replayPrev',
  'replayPrevAria',
  'replayPrevTip',
  'replayPositionTip',
  'replayNext',
  'replayNextAria',
  'replayNextTip',
  'replayExit',
  'replayExitTip',
];

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

async function openFiring(): Promise<void> {
  boot();
  await vi.advanceTimersByTimeAsync(1);
  click('[data-firing-toggle="f1"]');
  await vi.advanceTimersByTimeAsync(1);
}

async function enterReplay(): Promise<void> {
  await openFiring();
  click('[data-replay-start="f1"]');
  await vi.advanceTimersByTimeAsync(1);
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function he(key: string): string {
  return STRINGS.he[key as StringKey];
}

describe('Firing Replay playback controls i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every replay key exists in every locale, and the Hebrew table actually translates', () => {
    for (const key of REPLAY_KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
      }
      expect(he(key), key).not.toBe(STRINGS.en[key as StringKey]);
    }
  });

  it('tags the "Step through" toggle, English text/aria/tip byte-identical to the pre-i18n control', async () => {
    await openFiring();

    const toggle = q('[data-replay-start="f1"]');
    expect(toggle.textContent).toBe('▶ Step through');
    expect(toggle.getAttribute('data-i18n')).toBe('replayStart');
    expect(toggle.getAttribute('aria-label')).toBe('Step through');
    expect(toggle.getAttribute('data-i18n-aria')).toBe('replayStartAria');
    expect(toggle.getAttribute('data-tip')).toBe(
      'Replay this firing one action at a time with Prev and Next controls',
    );
    expect(toggle.getAttribute('data-i18n-tip')).toBe('replayStartTip');
  });

  it('tags Prev, Next and Exit the same way; Exit shares one key for its text and aria-label', async () => {
    await enterReplay();

    const prev = q('[data-replay-prev="f1"]');
    expect(prev.textContent).toBe('‹ Prev');
    expect(prev.getAttribute('data-i18n')).toBe('replayPrev');
    expect(prev.getAttribute('aria-label')).toBe('Previous action');
    expect(prev.getAttribute('data-i18n-aria')).toBe('replayPrevAria');
    expect(prev.getAttribute('data-tip')).toBe('Step back to the previous action in this replay');
    expect(prev.getAttribute('data-i18n-tip')).toBe('replayPrevTip');

    const next = q('[data-replay-next="f1"]');
    expect(next.textContent).toBe('Next ›');
    expect(next.getAttribute('data-i18n')).toBe('replayNext');
    expect(next.getAttribute('aria-label')).toBe('Next action');
    expect(next.getAttribute('data-i18n-aria')).toBe('replayNextAria');
    expect(next.getAttribute('data-tip')).toBe('Advance to the next action in this replay');
    expect(next.getAttribute('data-i18n-tip')).toBe('replayNextTip');

    const exit = q('[data-replay-exit="f1"]');
    expect(exit.textContent).toBe('Exit replay');
    expect(exit.getAttribute('data-i18n')).toBe('replayExit');
    expect(exit.getAttribute('aria-label')).toBe('Exit replay');
    expect(exit.getAttribute('data-i18n-aria')).toBe('replayExit');
    expect(exit.getAttribute('data-tip')).toBe('Leave playback and show the full trace list');
    expect(exit.getAttribute('data-i18n-tip')).toBe('replayExitTip');
  });

  it('the "Step N of M" live region gets only a tip tag — its announced text is never swept', async () => {
    await enterReplay();

    const label = q('.replay-nav-label');
    expect(label.textContent).toBe('Step 1 of 3');
    expect(label.getAttribute('data-tip')).toBe(
      'Your position in this replay — Left and Right arrow keys also step',
    );
    expect(label.getAttribute('data-i18n-tip')).toBe('replayPositionTip');
    expect(label.hasAttribute('data-i18n')).toBe(false);
    expect(label.hasAttribute('data-i18n-aria')).toBe(false);
    expect(label.getAttribute('aria-label')).toBeNull();
  });

  it('switching to Hebrew flips every control in place, with no re-render in between', async () => {
    await enterReplay();

    clickLocale('he');

    const prev = q('[data-replay-prev="f1"]');
    expect(prev.textContent).toBe(he('replayPrev'));
    expect(prev.getAttribute('aria-label')).toBe(he('replayPrevAria'));
    expect(prev.getAttribute('data-tip')).toBe(he('replayPrevTip'));
    // Still the first step — the button's disabled state never follows the locale.
    expect((prev as HTMLButtonElement).disabled).toBe(true);

    const next = q('[data-replay-next="f1"]');
    expect(next.textContent).toBe(he('replayNext'));
    expect(next.getAttribute('aria-label')).toBe(he('replayNextAria'));
    expect(next.getAttribute('data-tip')).toBe(he('replayNextTip'));

    const exit = q('[data-replay-exit="f1"]');
    expect(exit.textContent).toBe(he('replayExit'));
    expect(exit.getAttribute('aria-label')).toBe(he('replayExit'));
    expect(exit.getAttribute('data-tip')).toBe(he('replayExitTip'));

    const label = q('.replay-nav-label');
    expect(label.getAttribute('data-tip')).toBe(he('replayPositionTip'));
    expect(label.textContent).toBe('Step 1 of 3');
  });

  it('the controls keep working in Hebrew — Next still steps and the Exit button still leaves replay', async () => {
    await enterReplay();
    clickLocale('he');

    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    expect(q('.replay-nav-label').textContent).toBe('Step 2 of 3');
    // The rebuilt bar lands in Hebrew — renderFleet()'s own sweep, not the switch.
    expect(q('[data-replay-next="f1"]').textContent).toBe(he('replayNext'));

    click('[data-replay-exit="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.replay-nav')).toBeNull();
    expect(q('[data-replay-start="f1"]').textContent).toBe(he('replayStart'));
    expect(q('[data-replay-start="f1"]').getAttribute('aria-label')).toBe(he('replayStartAria'));
  });

  it('switching back to English restores the exact pre-i18n text', async () => {
    await enterReplay();
    clickLocale('he');
    clickLocale('en');

    expect(q('[data-replay-prev="f1"]').textContent).toBe('‹ Prev');
    expect(q('[data-replay-next="f1"]').getAttribute('aria-label')).toBe('Next action');
    expect(q('[data-replay-exit="f1"]').getAttribute('data-tip')).toBe(
      'Leave playback and show the full trace list',
    );
  });

  it('a saved Hebrew locale paints the controls in Hebrew at build, before any switch', async () => {
    localStorage.setItem('ap-locale', 'he');
    await enterReplay();

    expect(document.documentElement.lang).toBe('he');
    expect(q('[data-replay-prev="f1"]').textContent).toBe(he('replayPrev'));
    expect(q('[data-replay-next="f1"]').getAttribute('data-tip')).toBe(he('replayNextTip'));
    expect(q('[data-replay-exit="f1"]').getAttribute('aria-label')).toBe(he('replayExit'));
  });
});
