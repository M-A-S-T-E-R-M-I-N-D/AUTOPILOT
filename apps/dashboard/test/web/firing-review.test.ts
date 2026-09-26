// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The commit-time review on the firing detail view (docs/BACKLOG-999.md C5,
 * board ap-mui7mo5i-1). The engine records `FiringRecord.review`, and
 * `read/source.ts` puts it on each flight-log row as `FlightEntry.review`,
 * but until this slice no screen showed it. A drilled-open firing in the
 * per-firing trace (`web/features/firing-timeline.ts`) now leads with one
 * summary line — the model and finding count, "no findings", or why the
 * review was skipped — and a list of the findings under it.
 *
 * The summary is a `{model}`/`{n}`/`{reason}` template riding
 * `data-i18n-args`, so a locale switch repaints it in place; the findings
 * are the reviewer's own words and stay as written. Drives the REAL client
 * bundle in jsdom against a mocked /api/state, same harness as
 * `firing-diff-i18n.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const AXE_OPTIONS: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

const REVIEW_KEYS = ['reviewFindings', 'reviewClean', 'reviewSkipped', 'reviewTip'];

const TWO_FINDINGS = {
  status: 'reviewed',
  model: 'haiku',
  costUsd: 0.001,
  findings: [
    { severity: 'high', file: 'src/a.ts', problem: 'The retry loop never stops on a 4xx.' },
    { severity: 'low', file: null, problem: 'The subject does not mention the new flag.' },
  ],
};

function projectWith(review: unknown) {
  return {
    id: 'p1',
    slug: 'alpha',
    name: 'Alpha',
    status: 'flying',
    createdAt: 1,
    fileCount: 2,
    totalBytes: 100,
    primaryLanguage: 'TypeScript',
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
    flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1, sha: 'abc1234', review }],
    tasks: [],
    activity: [
      { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 1, firingId: 'f1' },
    ],
  };
}

function boot(review: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  const state = {
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
    projects: [projectWith(review)],
    empty: false,
  };
  globalThis.fetch = vi.fn(async (input: unknown) => {
    // The trace fetch never lands; the drill-down keeps the state's entries.
    if (String(input).startsWith('/api/firing-activity')) return new Promise<Response>(() => {});
    return { ok: true, json: async () => state } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

async function openFiring(review: unknown): Promise<void> {
  boot(review);
  await vi.advanceTimersByTimeAsync(1);
  document
    .querySelector('[data-firing-toggle="f1"]')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(1);
}

function head(): HTMLElement {
  const node = document.querySelector<HTMLElement>('.firing-review-head');
  expect(node, '.firing-review-head').not.toBeNull();
  return node as HTMLElement;
}

describe('commit review on the firing detail view (board ap-mui7mo5i-1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every review key exists in every locale, and the Hebrew table actually translates', () => {
    for (const key of REVIEW_KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
      }
      expect(STRINGS.he[key as StringKey], key).not.toBe(STRINGS.en[key as StringKey]);
    }
  });

  it('shows nothing while the firing row is closed', async () => {
    boot(TWO_FINDINGS);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('[data-firing-toggle="f1"]')).not.toBeNull();
    expect(document.querySelector('.firing-review')).toBeNull();
  });

  it('leads the drill-down with the model and finding count, then lists each finding', async () => {
    await openFiring(TWO_FINDINGS);

    const summary = head();
    expect(summary.textContent).toBe('Commit review (haiku): 2 finding(s)');
    expect(summary.getAttribute('data-i18n-template')).toBe('reviewFindings');
    expect(JSON.parse(summary.getAttribute('data-i18n-args')!)).toEqual({ model: 'haiku', n: 2 });
    expect(summary.getAttribute('data-tip')).toBe(STRINGS.en.reviewTip);
    expect(summary.getAttribute('data-i18n-tip')).toBe('reviewTip');

    const list = document.querySelector('.firing-review ul')!;
    expect(list.getAttribute('aria-labelledby')).toBe(summary.id);
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(2);
    const firstChip = items[0]!.querySelector('.chip')!;
    expect(firstChip.classList.contains('sev-high')).toBe(true);
    expect(firstChip.textContent).toBe('high');
    expect(items[0]!.querySelector('code')!.textContent).toBe('src/a.ts');
    expect(items[0]!.textContent).toContain('The retry loop never stops on a 4xx.');
    expect(items[1]!.querySelector('code')).toBeNull();
    expect(items[1]!.textContent).toContain('The subject does not mention the new flag.');
  });

  it('says "no findings" for a clean review, with no empty list under it', async () => {
    await openFiring({ status: 'reviewed', model: 'haiku', costUsd: null, findings: [] });

    expect(head().textContent).toBe('Commit review (haiku): no findings');
    expect(head().getAttribute('data-i18n-template')).toBe('reviewClean');
    expect(document.querySelector('.firing-review ul')).toBeNull();
  });

  it('says why a skipped review was skipped', async () => {
    await openFiring({ status: 'skipped', reason: 'the reviewer failed: cli gone' });

    expect(head().textContent).toBe('Commit review skipped: the reviewer failed: cli gone');
    expect(head().getAttribute('data-i18n-template')).toBe('reviewSkipped');
    expect(JSON.parse(head().getAttribute('data-i18n-args')!)).toEqual({
      reason: 'the reviewer failed: cli gone',
    });
  });

  it('shows no review block for a firing that was never reviewed', async () => {
    await openFiring(null);

    expect(document.querySelector('[data-firing-toggle="f1"]')!.getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(document.querySelector('.firing-review')).toBeNull();
  });

  it("renders the reviewer's words as text, never as markup", async () => {
    await openFiring({
      status: 'reviewed',
      model: '<b>m</b>',
      costUsd: null,
      findings: [{ severity: 'critical', file: '<i>f</i>', problem: '<img src=x onerror="1">' }],
    });

    const block = document.querySelector('.firing-review')!;
    expect(block.querySelector('img, b, i')).toBeNull();
    expect(head().textContent).toBe('Commit review (<b>m</b>): 1 finding(s)');
    expect(block.querySelector('li')!.textContent).toContain('<img src=x onerror="1">');
  });

  it('the summary is one keyboard Tab stop that carries the tip', async () => {
    await openFiring(TWO_FINDINGS);

    const summary = head();
    expect(summary.getAttribute('tabindex')).toBe('0');
    summary.focus();
    expect(document.activeElement).toBe(summary);
    expect(document.querySelectorAll('.firing-review [tabindex]')).toHaveLength(1);
  });

  it('switching to Hebrew repaints the summary and its tip in place', async () => {
    await openFiring(TWO_FINDINGS);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(head().textContent).toBe(
      STRINGS.he.reviewFindings.split('{model}').join('haiku').split('{n}').join('2'),
    );
    expect(head().getAttribute('data-tip')).toBe(STRINGS.he.reviewTip);
  });

  it('the open drill-down with its review is axe-clean', async () => {
    await openFiring(TWO_FINDINGS);

    vi.useRealTimers();
    const results = await axe.run(document, AXE_OPTIONS);
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
