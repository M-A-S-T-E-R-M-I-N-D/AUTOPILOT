// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The per-firing trace row's step-cost line (`shell.ts`'s `actRow()`,
 * rendered only in the reasoning drill-down — the "Per-firing trace" list a
 * drilled-open firing shows) carried a hardcoded English tip ("Model and
 * token usage billed for this step") and an aria-label built by concatenating
 * a fixed "step cost: " prefix onto the live model/token text in plain
 * JavaScript, both untouched while every other field around it (the sentence,
 * the tool/target aria prefixes) had already been swept by earlier i18n
 * slices (board web-msnsndki-dz3vn1).
 *
 * This pins the `[data-i18n-tip]` tag on the fixed tip and the
 * `[data-i18n-aria-template]`/`[data-i18n-name]` tag on the aria prefix — the
 * same `{name}`-template shape `cardActivityAria`/`liveToolAria` already
 * established — so a locale switch flips both in place instead of waiting
 * for the row to next rebuild. Drives the REAL client bundle in jsdom against
 * a mocked /api/state, same harness as firing-replay-i18n.test.ts.
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
      tool: 'Edit',
      target: 'src/a.ts',
      kind: 'file',
      phase: 'do',
      at: 1,
      firingId: 'f1',
      model: 'claude-sonnet-5',
      tokensIn: 120,
      tokensOut: 45,
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const STEP_COST_TEXT = 'claude-sonnet-5 · 165 tok';

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

async function openFiring(): Promise<void> {
  boot();
  await vi.advanceTimersByTimeAsync(1);
  q('[data-firing-toggle="f1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(1);
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function he(key: string): string {
  return STRINGS.he[key as StringKey];
}

function metaEl(): HTMLElement {
  return q('.act-meta');
}

describe('per-firing trace step-cost meta i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('both keys exist in every locale, and the Hebrew table actually translates', () => {
    for (const key of ['actMetaTip', 'actMetaAria']) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
      }
      expect(he(key), key).not.toBe(STRINGS.en[key as StringKey]);
    }
    expect(STRINGS.en.actMetaAria).toContain('{name}');
    expect(STRINGS.he.actMetaAria).toContain('{name}');
  });

  it('tags the step-cost line with its tip and aria-template keys, English byte-identical to before', async () => {
    await openFiring();

    const meta = metaEl();
    expect(meta.textContent).toBe(STEP_COST_TEXT);
    expect(meta.getAttribute('data-tip')).toBe('Model and token usage billed for this step');
    expect(meta.getAttribute('data-i18n-tip')).toBe('actMetaTip');
    expect(meta.getAttribute('data-i18n-aria-template')).toBe('actMetaAria');
    expect(meta.getAttribute('data-i18n-name')).toBe(STEP_COST_TEXT);
    expect(meta.getAttribute('aria-label')).toBe('step cost: ' + STEP_COST_TEXT);
  });

  it('switching to Hebrew flips the tip and aria prefix in place, with no re-render in between', async () => {
    await openFiring();

    clickLocale('he');

    const meta = metaEl();
    expect(meta.getAttribute('data-tip')).toBe(STRINGS.he.actMetaTip);
    expect(meta.getAttribute('aria-label')).toBe(
      STRINGS.he.actMetaAria.replaceAll('{name}', STEP_COST_TEXT),
    );
    // The Hebrew table actually translates rather than mirroring English.
    expect(STRINGS.he.actMetaTip).not.toBe(STRINGS.en.actMetaTip);
    expect(STRINGS.he.actMetaAria).not.toBe(STRINGS.en.actMetaAria);
  });

  it('a saved Hebrew locale paints the row in Hebrew when it is first built', async () => {
    localStorage.setItem('ap-locale', 'he');
    await openFiring();

    expect(document.documentElement.lang).toBe('he');
    const meta = metaEl();
    expect(meta.getAttribute('data-tip')).toBe(STRINGS.he.actMetaTip);
    expect(meta.getAttribute('aria-label')).toBe(
      STRINGS.he.actMetaAria.replaceAll('{name}', STEP_COST_TEXT),
    );
  });
});
