// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The live worker card's action line (`shell.ts`'s `liveWorkerCard()`: the
 * most recent tool call and the target it touched) carried two hover/focus
 * tips — "the most recent tool call this firing made" and "the file,
 * command, or target that tool call touched" — plus "tool: <name>" /
 * "target: <name>" screen-reader prefixes, all still plain English after the
 * fleet card's gauge label beside it was translated (board
 * web-msnsndki-dz3vn1). The gauge slice named these as the next targets and
 * the missing piece: an aria-label whose text wraps a live value has no
 * static key a `[data-i18n-aria]` sweep can paint, so the gauge's own
 * "last activity: <when>" prefix was painted once via `tr()` and only caught
 * up on a mid-session switch when its section next rebuilt.
 *
 * This pins the `[data-i18n-aria-template]` sweep that closes both gaps: a
 * `{name}` template key plus the element's own `data-i18n-name` value, the
 * `aria-label` twin of `translateDom()`'s `[data-i18n-template]` text sweep.
 * A locale switch now flips the tool/target prefixes AND the gauge's
 * activity prefix in place, with no re-render in between.
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
    {
      tool: 'Bash',
      target: 'pnpm run test',
      kind: 'command',
      phase: 'gate',
      at: 1,
      firingId: 'f1',
      model: 'claude-sonnet-5',
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

function actionSpans(): { tool: HTMLElement; target: HTMLElement } {
  const tool = document.querySelector<HTMLElement>('.act-tool');
  const target = document.querySelector<HTMLElement>('.act-target');
  expect(tool).not.toBeNull();
  expect(target).not.toBeNull();
  return { tool: tool as HTMLElement, target: target as HTMLElement };
}

function activitySpan(): HTMLElement {
  const spans = Array.from(document.querySelectorAll<HTMLElement>('.card-gauge .gauge-label span'));
  expect(spans.length).toBe(2);
  return spans[1] as HTMLElement;
}

function expectKeyInEveryLocale(key: string | null): void {
  expect(key).toBeTruthy();
  for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
    expect(STRINGS[locale][key as StringKey]).toBeTruthy();
  }
}

describe('live worker card action-line i18n via the aria-template sweep (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags both action spans with tip and aria-template keys present in every locale, English defaults intact', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const { tool, target } = actionSpans();
    expect(tool.getAttribute('data-i18n-tip')).toBe('liveToolTip');
    expect(tool.getAttribute('data-i18n-aria-template')).toBe('liveToolAria');
    expect(tool.getAttribute('data-i18n-name')).toBe('Bash');
    expect(target.getAttribute('data-i18n-tip')).toBe('liveTargetTip');
    expect(target.getAttribute('data-i18n-aria-template')).toBe('liveTargetAria');
    expect(target.getAttribute('data-i18n-name')).toBe('pnpm run test');
    for (const key of ['liveToolTip', 'liveToolAria', 'liveTargetTip', 'liveTargetAria']) {
      expectKeyInEveryLocale(key);
    }

    // English defaults still match the STRINGS.en entries the tags point at,
    // and the aria prefixes still read exactly as live-worker-tooltips.test.ts
    // pins them.
    expect(tool.getAttribute('data-tip')).toBe(STRINGS.en.liveToolTip);
    expect(target.getAttribute('data-tip')).toBe(STRINGS.en.liveTargetTip);
    expect(STRINGS.en.liveToolAria).toContain('{name}');
    expect(STRINGS.en.liveTargetAria).toContain('{name}');
    expect(tool.getAttribute('aria-label')).toBe('tool: Bash');
    expect(target.getAttribute('aria-label')).toBe('target: pnpm run test');
  });

  it('switching to Hebrew flips both tips and both aria prefixes in place, with no re-render in between', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const { tool, target } = actionSpans();
    expect(tool.getAttribute('data-tip')).toBe(STRINGS.he.liveToolTip);
    expect(target.getAttribute('data-tip')).toBe(STRINGS.he.liveTargetTip);
    expect(tool.getAttribute('aria-label')).toBe(
      STRINGS.he.liveToolAria.replaceAll('{name}', 'Bash'),
    );
    expect(target.getAttribute('aria-label')).toBe(
      STRINGS.he.liveTargetAria.replaceAll('{name}', 'pnpm run test'),
    );
    // The Hebrew table actually translates rather than mirroring English.
    expect(STRINGS.he.liveToolTip).not.toBe(STRINGS.en.liveToolTip);
    expect(STRINGS.he.liveTargetTip).not.toBe(STRINGS.en.liveTargetTip);
    expect(STRINGS.he.liveToolAria).not.toBe(STRINGS.en.liveToolAria);
    expect(STRINGS.he.liveTargetAria).not.toBe(STRINGS.en.liveTargetAria);
    expect(STRINGS.he.liveToolAria).toContain('{name}');
    expect(STRINGS.he.liveTargetAria).toContain('{name}');
  });

  it('the same sweep closes the gauge label gap: the last-activity aria prefix flips on a mid-session switch', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const activity = activitySpan();
    const when = activity.textContent ?? '';
    expect(activity.getAttribute('data-i18n-aria-template')).toBe('cardActivityAria');
    expect(activity.getAttribute('data-i18n-name')).toBe(when);
    expect(activity.getAttribute('aria-label')).toBe(
      STRINGS.en.cardActivityAria.replaceAll('{name}', when),
    );

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(activitySpan().getAttribute('aria-label')).toBe(
      STRINGS.he.cardActivityAria.replaceAll('{name}', when),
    );
  });

  it('a saved Hebrew locale paints the tool/target aria prefixes in Hebrew when the card is built', async () => {
    localStorage.setItem('ap-locale', 'he');
    boot();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.documentElement.lang).toBe('he');
    const { tool, target } = actionSpans();
    expect(tool.getAttribute('aria-label')).toBe(
      STRINGS.he.liveToolAria.replaceAll('{name}', 'Bash'),
    );
    expect(target.getAttribute('aria-label')).toBe(
      STRINGS.he.liveTargetAria.replaceAll('{name}', 'pnpm run test'),
    );
  });
});
