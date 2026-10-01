// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * HTML's content model for <button>: phrasing content, but no interactive-
 * content descendant and NO descendant with the tabindex attribute. axe's
 * nested-interactive rule only flags WIDGET-role descendants, so a plain
 * tabindex span nested inside a button slips past every axe sweep in this
 * suite — which is exactly how the per-firing trace row shipped as a <button>
 * wrapping six roving tabindex fields (board ap-mupzhat7-0, fixed in
 * firing-timeline.ts; its own regression test lives in
 * firing-trace-roving-tabindex.test.ts).
 *
 * This file guards the CLASS, not the one row: it drives the REAL client
 * bundle in jsdom against a mocked /api/state — fleet page and project page,
 * with a firing row, a flight-log row and a task row OPEN so their disclosure
 * controls and drill-downs are in the scan — and asserts that no <button> on
 * either page nests a focusable descendant.
 *
 * One known debt is pinned rather than hidden: the flight-log row heads
 * (`button.flight-head`, shell.ts flightGroupRow and flightLogNode) still nest
 * their dot/headline/cost/ago fields as tabindex spans — the same shape the
 * firing row had. The ratchet below fails the moment that fix lands, with the
 * instruction to delete the carve-out, so the guard tightens to zero instead
 * of the exception quietly outliving its reason.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  githubRepo: 'acme/widgets',
  firings: 2,
  shipped: 2,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  tasks: [
    {
      id: 't1',
      title: 'Wire up the retry queue',
      status: 'open',
      severity: 'high',
      dimension: 'reliability',
      focus: true,
    },
    {
      id: 'github-7',
      title: 'Document the webhook payload',
      status: 'in_progress',
      severity: null,
      dimension: null,
      focus: false,
      source: 'github',
    },
  ],
  flightLog: [
    {
      id: 'f2',
      shipped: true,
      item: 't1',
      completion: 'slice',
      commitSubject: 'fix: bounced off the boundary, then auto-fixed',
      cost: 0.2,
      sha: 'sha0002',
      at: Date.now() - 10_000,
      kind: 'fix',
      gateResult: 'passed',
      guardDenials: 2,
      autoformatRescued: true,
    },
    {
      id: 'f1',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'fix: clean firing, no notable events',
      cost: 0.22,
      sha: 'sha0001',
      at: Date.now() - 20_000,
      kind: 'fix',
      gateResult: 'passed',
      guardDenials: 0,
      autoformatRescued: false,
    },
  ],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 6, firingId: 'f2' },
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 5, firingId: 'f2' },
    { tool: 'Edit', target: 'src/c.ts', kind: 'file', phase: 'do', at: 4, firingId: 'f1' },
    { tool: 'Read', target: 'src/d.ts', kind: 'file', phase: 'orient', at: 3, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 2,
    shipped: 2,
    openFindings: 0,
    cost: 0.42,
  },
  projects: [PROJECT],
  empty: false,
};

/** Everything the button content model forbids as a descendant: anything
 *  carrying tabindex, plus the interactive-content elements. */
const FORBIDDEN_INSIDE_BUTTON =
  '[tabindex], a[href], button, input, select, textarea, iframe, ' +
  '[contenteditable]:not([contenteditable="false"])';

/** The one pinned debt — see the file comment. Delete with the flight-log fix. */
const KNOWN_DEBT = 'button.flight-head';

function label(el: Element): string {
  const cls = el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : '';
  const tab = el.hasAttribute('tabindex') ? `[tabindex="${el.getAttribute('tabindex')}"]` : '';
  return el.tagName.toLowerCase() + cls + tab;
}

/** Every (button → nested focusable) pair on the page, readable. */
function nestedFocusables(): Array<{ button: Element; nested: string }> {
  return Array.from(document.querySelectorAll('button')).flatMap((button) =>
    Array.from(button.querySelectorAll(FORBIDDEN_INSIDE_BUTTON)).map((nested) => ({
      button,
      nested: `${label(button)} > ${label(nested)}`,
    })),
  );
}

function offendersOutsideKnownDebt(): string[] {
  return nestedFocusables()
    .filter(({ button }) => !button.matches(KNOWN_DEBT))
    .map(({ nested }) => nested);
}

async function boot(project?: string): Promise<void> {
  document.open();
  document.write(renderShell(project));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

async function click(selector: string): Promise<void> {
  const el = document.querySelector(selector) as HTMLElement | null;
  expect(el, selector).not.toBeNull();
  // A real, CANCELABLE click: the task-title handler claims its click with
  // preventDefault so a second listener cannot flip the detail back, and a
  // hand-built MouseEvent without `cancelable` defeats that guard (jsdom keeps
  // an earlier test's document listeners alive across document.open()).
  el!.click();
  await vi.advanceTimersByTimeAsync(1);
}

describe('no <button> on the dashboard nests focusable content (HTML button content model)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the fleet page, cards painted', async () => {
    await boot();

    // The scan must see real cards, not an empty shell.
    expect(document.querySelectorAll('.card').length).toBe(1);
    expect(document.querySelectorAll('button').length).toBeGreaterThan(10);

    expect(offendersOutsideKnownDebt()).toEqual([]);
  });

  it('the project page with a firing row, a flight-log row and a task row OPEN', async () => {
    await boot('p1');
    expect(document.querySelector('#fleet.project-mode')).not.toBeNull();

    // Open the busy firing's trace: its drill-down (replay nav, diff toggle)
    // joins the scan alongside the headline button that now IS the control.
    await click('[data-firing-toggle="f2"]');
    expect(document.querySelector('[data-firing-toggle="f2"]')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
    // Open a flight-log row and a task row's read-only detail the same way.
    await click('[data-flight-row="f2"]');
    expect(document.querySelector('[data-flight-row="f2"]')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
    await click('.task[data-task-id="t1"] .task-title');
    expect((document.getElementById('task-detail-t1') as HTMLElement).hidden).toBe(false);

    expect(document.querySelectorAll('.firing-timeline .firing-toggle').length).toBe(2);
    expect(document.querySelectorAll('.task').length).toBe(2);

    expect(offendersOutsideKnownDebt()).toEqual([]);
  });

  it('the pinned debt is still real — delete the KNOWN_DEBT carve-out with the flight-log fix', async () => {
    await boot('p1');

    // The ratchet: the moment the flight-log row heads stop nesting tabindex
    // spans, this fails on purpose, and the fix is to drop KNOWN_DEBT above so
    // the two scans guard the whole dashboard with no exception.
    const debt = nestedFocusables().filter(({ button }) => button.matches(KNOWN_DEBT));
    expect(
      debt.length,
      'flight-log heads no longer nest focusables: remove KNOWN_DEBT',
    ).toBeGreaterThan(0);
    for (const { nested } of debt) expect(nested).toMatch(/^button\.flight-head > span\./);
  });
});
