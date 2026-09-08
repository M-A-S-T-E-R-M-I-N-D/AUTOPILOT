// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The live worker card's fixation-warning chip (`shell.ts`'s
 * `liveWorkerCard()`, built from `live-progress.ts`'s
 * `orientFixationChipMeta`, board web-msnsndki-dz3vn1): the last of the
 * card's own lines still in plain English after the tool/target and
 * label/phase/task/count/turns/progress slices — flagged explicitly in
 * `packages/tokens/src/strings.ts`'s changelog as "a later slice" alongside
 * the office map's shared `OFFICE_TIPS`.
 *
 * This pins that the chip's tip and aria-label — two distinct sentences, so
 * unlike `consoleLinesAria` they can't share one key between the two
 * attributes — ride `[data-i18n-tip-template]`/`[data-i18n-aria-template]`,
 * with the singular/plural key chosen by `turnsSeen` at the call site and
 * `{n}` filling from `data-i18n-args`, the same shape
 * `flight-console.ts`'s line-count aria already established.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { ORIENT_FIXATION_TURN_THRESHOLD } from '../../src/shared/live-firing.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = 1_700_000_000_000;

function orientTurns(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    tool: 'Read',
    target: 'src/file-' + i + '.ts',
    kind: 'file',
    phase: 'orient',
    at: NOW - (count - i) * 1_000,
    firingId: 'f1',
    // A distinct model per row (mirrors live-firing-parity.test.ts's own
    // orientTurns()) — countTurns() collapses adjacent tool calls sharing the
    // same model/token usage into one turn, which would silently sink
    // turnsSeen below ORIENT_FIXATION_TURN_THRESHOLD and skip the chip.
    model: 'sonnet-' + i,
  }));
}

function stateWith(activity: Record<string, unknown>[]) {
  return {
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
    projects: [
      {
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
        activity,
        flightLog: [
          { id: 'p1:firing-1', durationMs: 100_000 },
          { id: 'p1:firing-2', durationMs: 60_000 },
        ],
        tasks: [],
      },
    ],
    empty: false,
  };
}

function boot(state: ReturnType<typeof stateWith>): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

function q(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  expect(node, selector).not.toBeNull();
  return node as HTMLElement;
}

function expectKeyInEveryLocale(key: string): void {
  for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
    expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
  }
  expect(STRINGS.he[key as StringKey]).not.toBe(STRINGS.en[key as StringKey]);
}

describe('live worker card fixation chip i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every template key exists in every locale, Hebrew actually differs, both carry {n}', () => {
    for (const key of [
      'orientFixationTipSingular',
      'orientFixationTipPlural',
      'orientFixationAriaSingular',
      'orientFixationAriaPlural',
    ]) {
      expectKeyInEveryLocale(key);
      expect(STRINGS.en[key as StringKey]).toContain('{n}');
      expect(STRINGS.he[key as StringKey]).toContain('{n}');
    }
  });

  it('a plural turn count tags the chip with the Plural keys, English default byte-identical', async () => {
    boot(stateWith(orientTurns(ORIENT_FIXATION_TURN_THRESHOLD)));
    await vi.advanceTimersByTimeAsync(1);

    const chip = q('.live-orient-fixation');
    expect(chip.getAttribute('data-i18n-tip-template')).toBe('orientFixationTipPlural');
    expect(chip.getAttribute('data-i18n-aria-template')).toBe('orientFixationAriaPlural');
    expect(chip.getAttribute('data-i18n-args')).toBe(
      JSON.stringify({ n: ORIENT_FIXATION_TURN_THRESHOLD }),
    );
    expect(chip.getAttribute('data-tip')).toBe(
      STRINGS.en.orientFixationTipPlural.replace('{n}', String(ORIENT_FIXATION_TURN_THRESHOLD)),
    );
    expect(chip.getAttribute('aria-label')).toBe(
      STRINGS.en.orientFixationAriaPlural.replace('{n}', String(ORIENT_FIXATION_TURN_THRESHOLD)),
    );
  });

  it('switching to Hebrew flips the chip tip and aria-label in place', async () => {
    boot(stateWith(orientTurns(ORIENT_FIXATION_TURN_THRESHOLD)));
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const chip = q('.live-orient-fixation');
    expect(chip.getAttribute('data-tip')).toBe(
      STRINGS.he.orientFixationTipPlural.replace('{n}', String(ORIENT_FIXATION_TURN_THRESHOLD)),
    );
    expect(chip.getAttribute('aria-label')).toBe(
      STRINGS.he.orientFixationAriaPlural.replace('{n}', String(ORIENT_FIXATION_TURN_THRESHOLD)),
    );
  });

  it('a saved Hebrew locale paints the chip in Hebrew at build', async () => {
    localStorage.setItem('ap-locale', 'he');
    boot(stateWith(orientTurns(ORIENT_FIXATION_TURN_THRESHOLD)));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.documentElement.lang).toBe('he');
    const chip = q('.live-orient-fixation');
    expect(chip.getAttribute('data-tip')).toBe(
      STRINGS.he.orientFixationTipPlural.replace('{n}', String(ORIENT_FIXATION_TURN_THRESHOLD)),
    );
    expect(chip.getAttribute('aria-label')).toBe(
      STRINGS.he.orientFixationAriaPlural.replace('{n}', String(ORIENT_FIXATION_TURN_THRESHOLD)),
    );
  });
});
