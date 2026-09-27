// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0026 "the tasks screen" slice 2 (board web-mtywp82m-zodn7z): the
 * display options' control. `web/task-view.ts` already reads and writes
 * `?hide=`; this is the Tasks card's "Show" fieldset that sets it. Linear's
 * split holds: filters narrow the list, display options change what a row
 * shows — so a hidden property drops its chip from every row and never hides
 * a row, never shows the "Showing n of m" note, never costs the reorder
 * controls. The row's warnings (runaway, budget risk) are not options.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

// Two rows that between them draw every display property and a warning:
// d1 carries a source chip, a severity, a dimension and a burn; d2 carries
// a source chip and the runaway warning.
const TASKS = [
  {
    id: 'd1',
    title: 'Split the shell module',
    status: 'queued',
    source: 'self',
    severity: 'high',
    dimension: 'test_coverage',
    focus: false,
    priority: null,
    at: 1,
  },
  {
    id: 'd2',
    title: 'Triage the dropped note',
    status: 'queued',
    source: 'inbox',
    severity: null,
    dimension: null,
    focus: false,
    priority: null,
    at: 1,
    isRunaway: true,
    cumulativeCostUsd: 12,
    firingCount: 4,
  },
];

const FIRING = {
  id: 'f-1',
  item: 'd1',
  kind: 'feat',
  sha: 'abc1234',
  shipped: true,
  gateResult: 'passed',
  cost: 0.5,
  tokensIn: 1,
  tokensOut: 1,
  turns: 1,
  durationMs: 60000,
  commitSubject: null,
  completion: 'slice',
  failedCheck: null,
  died: null,
  at: 1,
};

function makeState() {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 0,
      needsYou: 0,
      firings: 1,
      shipped: 1,
      openFindings: 0,
      cost: 0.5,
    },
    projects: [
      {
        id: 'p1',
        slug: 'alpha',
        name: 'Alpha',
        status: 'idle',
        createdAt: 1,
        fileCount: 2,
        totalBytes: 100,
        languages: [],
        topDirs: [],
        hotFiles: [],
        gate: null,
        backedUp: false,
        firings: 1,
        shipped: 1,
        cost: 0.5,
        tokensIn: 1,
        tokensOut: 1,
        shipRate: 1,
        openFindings: 0,
        gauge: { critical: 0, high: 0, medium: 0, low: 0 },
        lastActivityAt: null,
        flightLog: [FIRING],
        activity: [],
        tasks: TASKS,
      },
    ],
    empty: false,
  };
}

async function boot(search = ''): Promise<void> {
  history.replaceState(null, '', '/p/p1' + search);
  document.open();
  document.write(renderShell('p1'));
  document.close();
  const state = makeState();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

// Each display property's chip, as the row draws it.
const CHIPS = {
  source: '.chip-proposed, .chip-inbox, .chip-backlog',
  severity: '.chip[class*="sev-"]',
  dimension: '.chip[aria-label^="Dimension: "]',
  cost: '.chip-burn',
} as const;

const chipCount = (property: keyof typeof CHIPS) =>
  document.querySelectorAll(
    CHIPS[property]
      .split(', ')
      .map((chip) => '.tasks .task ' + chip)
      .join(', '),
  ).length;

const displayFieldset = () =>
  document.querySelector('fieldset.board-display') as HTMLFieldSetElement | null;

function box(property: string): HTMLInputElement {
  const found = document.querySelector(`[data-task-display][value="${property}"]`);
  if (!(found instanceof HTMLInputElement)) throw new Error(`no display box for ${property}`);
  return found;
}

async function toggle(property: string): Promise<void> {
  box(property).click();
  await vi.advanceTimersByTimeAsync(1);
}

const shownIds = () =>
  Array.from(document.querySelectorAll('.tasks .task')).map((row) =>
    row.getAttribute('data-task-id'),
  );

describe('task view display options (epic 0026 slice 2: the Show control over ?hide=)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    history.replaceState(null, '', '/');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a labelled Show fieldset follows the three filters, one checked box per row property', async () => {
    await boot();

    const fieldset = displayFieldset() as HTMLFieldSetElement;
    expect(fieldset).not.toBeNull();
    // Apart from the filters: it is not one of them, and it comes after them.
    expect(fieldset.classList.contains('board-filter')).toBe(false);
    const filters = Array.from(document.querySelectorAll('fieldset.board-filter'));
    expect(filters).toHaveLength(3);
    const source = filters[2] as HTMLFieldSetElement;
    expect(
      source.compareDocumentPosition(fieldset) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const legend = fieldset.querySelector('legend') as HTMLElement;
    expect(legend.textContent).toBe(STRINGS.en.boardDisplayShow);
    expect(legend.getAttribute('data-i18n')).toBe('boardDisplayShow');
    const boxes = Array.from(fieldset.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(boxes.map((b) => b.getAttribute('data-task-display'))).toEqual(Array(4).fill('show'));
    expect(boxes.map((b) => b.value)).toEqual(['source', 'severity', 'dimension', 'cost']);
    expect(boxes.every((b) => b.checked)).toBe(true);
    // A display box is never read as a filter box.
    expect(boxes.some((b) => b.hasAttribute('data-task-filter'))).toBe(false);
    expect(box('source').closest('label')?.textContent).toBe(STRINGS.en.boardDisplaySource);
    expect(box('severity').closest('label')?.textContent).toBe(STRINGS.en.boardDisplaySeverity);
    expect(box('dimension').closest('label')?.textContent).toBe(STRINGS.en.boardDisplayDimension);
    expect(box('cost').closest('label')?.textContent).toBe(STRINGS.en.boardDisplayCost);
    // Every property shows on the plain board.
    expect([
      chipCount('source'),
      chipCount('severity'),
      chipCount('dimension'),
      chipCount('cost'),
    ]).toEqual([2, 1, 1, 1]);
  });

  it('unticking a box writes ?hide= and drops that chip from every row', async () => {
    await boot();

    await toggle('source');
    expect(location.search).toBe('?hide=source');
    expect(chipCount('source')).toBe(0);
    expect(chipCount('severity')).toBe(1);

    await toggle('cost');
    // Row order, not the order of the clicks.
    expect(location.search).toBe('?hide=source,cost');
    expect(chipCount('cost')).toBe(0);
    expect(chipCount('dimension')).toBe(1);
    expect(box('source').checked).toBe(false);
    expect(box('cost').checked).toBe(false);
    expect(location.pathname).toBe('/p/p1');
  });

  it('a link with ?hide= opens with those chips gone and their boxes unticked', async () => {
    await boot('?hide=severity,dimension');

    expect(chipCount('severity')).toBe(0);
    expect(chipCount('dimension')).toBe(0);
    expect(chipCount('source')).toBe(2);
    expect(chipCount('cost')).toBe(1);
    expect(box('severity').checked).toBe(false);
    expect(box('dimension').checked).toBe(false);
    expect(box('source').checked).toBe(true);
  });

  it('ticking the last hidden property back gives back the plain URL', async () => {
    await boot('?hide=cost');

    await toggle('cost');

    expect(location.search).toBe('');
    expect(chipCount('cost')).toBe(1);
  });

  it('hiding every property never hides the runaway warning', async () => {
    await boot('?hide=source,severity,dimension,cost');

    expect(document.querySelectorAll('.tasks .task .chip-runaway')).toHaveLength(1);
  });

  it('a display option is not a filter: every row stays, no note, the reorder controls stay', async () => {
    await boot('?hide=source,cost');

    expect(shownIds()).toEqual(['d1', 'd2']);
    expect(document.querySelector('.board-filter-note')).toBeNull();
    expect(document.querySelectorAll('.tasks [data-task-move]')).toHaveLength(4);
  });

  it('filters and display options write beside each other, and Clear keeps ?hide=', async () => {
    await boot('?hide=dimension');

    (
      document.querySelector('[data-task-filter="severity"][value="high"]') as HTMLInputElement
    ).click();
    await vi.advanceTimersByTimeAsync(1);
    expect(location.search).toBe('?hide=dimension&severity=high');
    expect(shownIds()).toEqual(['d1']);
    expect(chipCount('dimension')).toBe(0);

    (document.querySelector('button[data-task-filter-clear]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);
    expect(location.search).toBe('?hide=dimension');
    expect(shownIds()).toEqual(['d1', 'd2']);
    expect(box('dimension').checked).toBe(false);
  });

  it('keyboard focus stays on the box it toggled through the rebuild', async () => {
    await boot();

    box('severity').focus();
    await toggle('severity');

    expect(document.activeElement).toBe(box('severity'));
    expect(box('severity').checked).toBe(false);
  });

  it('the legend and the box labels follow a locale switch', async () => {
    await boot();

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(displayFieldset()?.querySelector('legend')?.textContent).toBe(
      STRINGS.he.boardDisplayShow,
    );
    expect(box('dimension').closest('label')?.textContent).toBe(STRINGS.he.boardDisplayDimension);
    expect(box('cost').closest('label')?.textContent).toBe(STRINGS.he.boardDisplayCost);
  });
});
