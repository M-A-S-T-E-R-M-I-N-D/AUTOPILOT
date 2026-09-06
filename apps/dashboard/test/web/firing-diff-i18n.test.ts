// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The trace row's diff toggle and loading/empty placeholders' i18n (board
 * web-msnsndki-dz3vn1) — the slice `firing-replay-i18n.test.ts` named as
 * still English: a drilled-open firing's "View diff" / "Hide diff" toggle
 * (`web/features/firing-timeline.ts`) and the three muted placeholders in
 * the same row — "Loading full trace…" while the trace fetch is in flight,
 * "Loading diff…" while the diff fetch is, and "No diff available for this
 * firing." once it answered with nothing — kept rendering English regardless
 * of the active locale after the Prev / Next / Exit bar beside them was
 * translated.
 *
 * This pins the tags that close that gap: the toggle's visible text and its
 * concise aria-label share ONE state-aware key (`diffView` / `diffHide`, the
 * `replayExit` shape — the D1 attribute-payload audit already made them
 * identical), its full data-tip rides the matching `diffViewTip` /
 * `diffHideTip`, and each placeholder carries its own `[data-i18n]`. The
 * English text is byte-identical to what the row said before this slice,
 * and the tip keys' English entries are pinned equal to `diffToggleTip()`'s
 * own literals (`web/diff-view.ts`, still the spliced default) so the two
 * cannot drift. Drives the REAL client bundle in jsdom against a mocked
 * /api/state, same harness as `firing-replay-i18n.test.ts`; the trace fetch
 * never resolves and the diff fetch resolves on demand, so each placeholder
 * is on screen when asserted.
 *
 * Both click handlers render BEFORE they set their loading flag, so a
 * loading placeholder first appears on the NEXT state-driven render — in the
 * live app the next SSE tick or poll answering with fresh state. jsdom has
 * no EventSource, so the client polls; the /api/state mock bumps a total on
 * every answer and `openDiff()` waits one poll so that render has happened.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { diffToggleTip } from '../../src/web/diff-view.js';

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
  flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1, sha: 'abc1234' }],
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

const DIFF_KEYS = [
  'diffView',
  'diffHide',
  'diffViewTip',
  'diffHideTip',
  'traceLoading',
  'diffLoading',
  'diffEmpty',
];

/** shell.ts's REFRESH_MS — the no-EventSource polling fallback jsdom takes. */
const POLL_MS = 3000;

let resolveDiff: ((page: unknown) => void) | null = null;
let stateAnswers = 0;

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  resolveDiff = null;
  stateAnswers = 0;
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    // The trace fetch never lands, so "Loading full trace…" stays on screen.
    if (url.startsWith('/api/firing-activity')) return new Promise<Response>(() => {});
    // The diff fetch lands only when a test says so — "Loading diff…" first,
    // then whatever page the test resolves it with.
    if (url.startsWith('/api/firing-diff')) {
      return new Promise<Response>((resolve) => {
        resolveDiff = (page) =>
          resolve({ ok: true, json: async () => page } as unknown as Response);
      });
    }
    // Every state answer differs from the last, so a poll never short-circuits
    // on renderFleet()'s unchanged-signature check.
    stateAnswers += 1;
    const state = { ...STATE, totals: { ...STATE.totals, cost: stateAnswers } };
    return { ok: true, json: async () => state } as unknown as Response;
  }) as unknown as typeof fetch;
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

/** Opens the diff and lets one poll land, so the row has re-rendered with both
 *  fetches in flight and both loading placeholders on screen. */
async function openDiff(): Promise<void> {
  await openFiring();
  click('[data-diff-toggle="f1"]');
  await vi.advanceTimersByTimeAsync(POLL_MS);
}

async function settleEmptyDiff(): Promise<void> {
  expect(resolveDiff, 'the diff fetch was started').not.toBeNull();
  resolveDiff!({ patch: null });
  await vi.advanceTimersByTimeAsync(1);
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function he(key: string): string {
  return STRINGS.he[key as StringKey];
}

describe('trace row diff toggle + placeholders i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every diff key exists in every locale, and the Hebrew table actually translates', () => {
    for (const key of DIFF_KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
      }
      expect(he(key), key).not.toBe(STRINGS.en[key as StringKey]);
    }
  });

  it("the tip keys' English entries are diffToggleTip()'s own literals — the two cannot drift", () => {
    expect(STRINGS.en.diffViewTip).toBe(diffToggleTip(false));
    expect(STRINGS.en.diffHideTip).toBe(diffToggleTip(true));
  });

  it('tags the closed toggle: text and aria-label share diffView, the tip rides diffViewTip', async () => {
    await openFiring();

    const toggle = q('[data-diff-toggle="f1"]');
    expect(toggle.textContent).toBe('View diff');
    expect(toggle.getAttribute('data-i18n')).toBe('diffView');
    expect(toggle.getAttribute('aria-label')).toBe('View diff');
    expect(toggle.getAttribute('data-i18n-aria')).toBe('diffView');
    expect(toggle.getAttribute('data-tip')).toBe(
      "Show this firing's code diff — the git commit patch it shipped",
    );
    expect(toggle.getAttribute('data-i18n-tip')).toBe('diffViewTip');
  });

  it('tags the open toggle with the diffHide pair instead', async () => {
    await openDiff();

    const toggle = q('[data-diff-toggle="f1"]');
    expect(toggle.textContent).toBe('Hide diff');
    expect(toggle.getAttribute('data-i18n')).toBe('diffHide');
    expect(toggle.getAttribute('aria-label')).toBe('Hide diff');
    expect(toggle.getAttribute('data-i18n-aria')).toBe('diffHide');
    expect(toggle.getAttribute('data-tip')).toBe('Hide this diff');
    expect(toggle.getAttribute('data-i18n-tip')).toBe('diffHideTip');
  });

  it('tags the loading and empty placeholders, English text byte-identical to before', async () => {
    await openDiff();

    const trace = q('.firing-trace-loading');
    expect(trace.textContent).toBe('Loading full trace…');
    expect(trace.getAttribute('data-i18n')).toBe('traceLoading');

    const diffLoading = q('[data-i18n="diffLoading"]');
    expect(diffLoading.textContent).toBe('Loading diff…');
    expect(diffLoading.classList.contains('firing-trace-loading')).toBe(true);

    await settleEmptyDiff();

    expect(document.querySelector('[data-i18n="diffLoading"]')).toBeNull();
    const empty = q('.firing-diff-empty');
    expect(empty.textContent).toBe('No diff available for this firing.');
    expect(empty.getAttribute('data-i18n')).toBe('diffEmpty');
  });

  it('switching to Hebrew flips the toggle and both placeholders in place, no re-render between', async () => {
    await openDiff();

    clickLocale('he');

    const toggle = q('[data-diff-toggle="f1"]');
    expect(toggle.textContent).toBe(he('diffHide'));
    expect(toggle.getAttribute('aria-label')).toBe(he('diffHide'));
    expect(toggle.getAttribute('data-tip')).toBe(he('diffHideTip'));
    expect(q('.firing-trace-loading').textContent).toBe(he('traceLoading'));
    expect(q('[data-i18n="diffLoading"]').textContent).toBe(he('diffLoading'));

    await settleEmptyDiff();
    // The rebuilt row lands in Hebrew — renderFleet()'s own sweep, not the switch.
    expect(q('.firing-diff-empty').textContent).toBe(he('diffEmpty'));
  });

  it('the toggle keeps working in Hebrew — a click still closes the diff and repaints as diffView', async () => {
    await openDiff();
    clickLocale('he');

    click('[data-diff-toggle="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    const toggle = q('[data-diff-toggle="f1"]');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toBe(he('diffView'));
    expect(toggle.getAttribute('aria-label')).toBe(he('diffView'));
    expect(toggle.getAttribute('data-tip')).toBe(he('diffViewTip'));
    expect(document.querySelector('[data-i18n="diffLoading"]')).toBeNull();
  });

  it('switching back to English restores the exact pre-i18n text', async () => {
    await openDiff();
    clickLocale('he');
    clickLocale('en');

    expect(q('[data-diff-toggle="f1"]').textContent).toBe('Hide diff');
    expect(q('[data-diff-toggle="f1"]').getAttribute('data-tip')).toBe('Hide this diff');
    expect(q('.firing-trace-loading').textContent).toBe('Loading full trace…');
    expect(q('[data-i18n="diffLoading"]').textContent).toBe('Loading diff…');
  });

  it('a saved Hebrew locale paints the toggle and placeholders in Hebrew at build, before any switch', async () => {
    localStorage.setItem('ap-locale', 'he');
    await openDiff();

    expect(document.documentElement.lang).toBe('he');
    expect(q('[data-diff-toggle="f1"]').textContent).toBe(he('diffHide'));
    expect(q('[data-diff-toggle="f1"]').getAttribute('data-tip')).toBe(he('diffHideTip'));
    expect(q('.firing-trace-loading').textContent).toBe(he('traceLoading'));
    expect(q('[data-i18n="diffLoading"]').textContent).toBe(he('diffLoading'));
  });
});
