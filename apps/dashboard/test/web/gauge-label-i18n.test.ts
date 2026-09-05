// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fleet card's gauge label (`shell.ts`'s `cardGauge()`: the "N open
 * findings" count and the last-activity timestamp above every card's
 * severity gauge) carries two hover/focus tips — "Unresolved review findings
 * for this project — see the breakdown below" and "When this project last
 * had any activity" — plus a "last activity: <when>" screen-reader prefix,
 * all still plain English after the Tasks and Inbox forms beside them were
 * translated (board web-msnsndki-dz3vn1). Built with DOM calls the
 * `pnpm i18n:untagged` scanner cannot see, like every other card section.
 * This pins the tagging contract for the two tips (keys in every locale,
 * English defaults matching `STRINGS.en`, a Hebrew switch translating both
 * via `translateDom()`'s `[data-i18n-tip]` sweep) and the `tr()`-at-build-time
 * route for the aria prefix, whose `{name}` slot carries the live timestamp.
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
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 4,
  shipped: 3,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.75,
  openFindings: 3,
  gauge: { critical: 1, high: 1, medium: 0, low: 1 },
  lastActivityAt: 1,
  activity: [],
  flightLog: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 4,
    shipped: 3,
    openFindings: 3,
    cost: 0.42,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

function gaugeSpans(): { findings: HTMLElement; activity: HTMLElement } {
  const spans = Array.from(document.querySelectorAll<HTMLElement>('.card-gauge .gauge-label span'));
  expect(spans.length).toBe(2);
  return { findings: spans[0] as HTMLElement, activity: spans[1] as HTMLElement };
}

function expectKeyInEveryLocale(key: string | null): void {
  expect(key).toBeTruthy();
  for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
    expect(STRINGS[locale][key as StringKey]).toBeTruthy();
  }
}

describe('fleet card gauge-label i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags both gauge-label tips with STRINGS keys present in every locale, English defaults intact', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const { findings, activity } = gaugeSpans();
    expect(findings.getAttribute('data-i18n-tip')).toBe('cardFindingsTip');
    expect(activity.getAttribute('data-i18n-tip')).toBe('cardActivityTip');
    expectKeyInEveryLocale(findings.getAttribute('data-i18n-tip'));
    expectKeyInEveryLocale(activity.getAttribute('data-i18n-tip'));
    expectKeyInEveryLocale('cardActivityAria');

    // English defaults still match the STRINGS.en entries the tags point at.
    expect(findings.getAttribute('data-tip')).toBe(STRINGS.en.cardFindingsTip);
    expect(activity.getAttribute('data-tip')).toBe(STRINGS.en.cardActivityTip);
    // The findings span's accessible name stays its own visible count.
    expect(findings.getAttribute('aria-label')).toBe(findings.textContent);
    // The activity span's aria prefix comes from the template, with the live
    // timestamp in its {name} slot.
    expect(STRINGS.en.cardActivityAria).toContain('{name}');
    expect(activity.getAttribute('aria-label')).toBe(
      STRINGS.en.cardActivityAria.replaceAll('{name}', activity.textContent ?? ''),
    );
  });

  it('switching to Hebrew translates both tips in place via the [data-i18n-tip] sweep', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const { findings, activity } = gaugeSpans();
    expect(findings.getAttribute('data-tip')).toBe(STRINGS.he.cardFindingsTip);
    expect(activity.getAttribute('data-tip')).toBe(STRINGS.he.cardActivityTip);
    // The Hebrew table actually translates rather than mirroring English.
    expect(STRINGS.he.cardFindingsTip).not.toBe(STRINGS.en.cardFindingsTip);
    expect(STRINGS.he.cardActivityTip).not.toBe(STRINGS.en.cardActivityTip);
    expect(STRINGS.he.cardActivityAria).not.toBe(STRINGS.en.cardActivityAria);
    expect(STRINGS.he.cardActivityAria).toContain('{name}');
  });

  it('a saved Hebrew locale paints the activity aria prefix in Hebrew when the card is built', async () => {
    localStorage.setItem('ap-locale', 'he');
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const { activity } = gaugeSpans();
    expect(document.documentElement.lang).toBe('he');
    expect(activity.getAttribute('aria-label')).toBe(
      STRINGS.he.cardActivityAria.replaceAll('{name}', activity.textContent ?? ''),
    );
  });
});
