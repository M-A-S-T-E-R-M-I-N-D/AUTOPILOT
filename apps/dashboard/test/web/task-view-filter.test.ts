// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0026 "the tasks screen" slice 2 (board web-mtywp82m-zodn7z), the first
 * wiring of `web/task-view.ts` into the Tasks card: a Status filter in the
 * view header. The view lives in the URL (`?status=queued,done`), so a
 * filtered board survives a reload and a shared link opens filtered. A box
 * rewrites the query string and rebuilds the list; the column heads count what
 * is shown; a note says how much is hidden and why the reorder controls are
 * gone — `/api/task/reorder` takes the order the list shows, and a filtered
 * list would post a partial one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

function task(id: string, title: string, status: string, severity: string | null = null) {
  return {
    id,
    title,
    status,
    source: 'dashboard',
    severity,
    dimension: null,
    focus: false,
    priority: null,
    at: 1,
  };
}

function makeState() {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 0,
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
        status: 'idle',
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
        lastActivityAt: null,
        flightLog: [],
        activity: [],
        tasks: [
          task('t1', 'Wire up the retry queue', 'queued', 'high'),
          task('t2', 'Tidy the webhook names', 'queued'),
          task('t3', 'Rename the webhook payload', 'needs_approval'),
          task('t4', 'Old cleanup task', 'done', 'high'),
        ],
      },
    ],
    empty: false,
  };
}

async function boot(search = '', state = makeState()): Promise<ReturnType<typeof makeState>> {
  history.replaceState(null, '', '/p/p1' + search);
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  return state;
}

const shownIds = () =>
  Array.from(document.querySelectorAll('.tasks .task')).map((row) =>
    row.getAttribute('data-task-id'),
  );

function box(value: string): HTMLInputElement {
  const found = document.querySelector(`[data-task-filter="status"][value="${value}"]`);
  if (!(found instanceof HTMLInputElement)) throw new Error(`no status box for ${value}`);
  return found;
}

async function tick(value: string): Promise<void> {
  box(value).click();
  await vi.advanceTimersByTimeAsync(1);
}

const note = () => document.querySelector('.board-filter-note') as HTMLElement | null;

const showing = (lang: 'en' | 'he', n: number, total: number) =>
  STRINGS[lang].boardFilterShowing.replace('{n}', String(n)).replace('{total}', String(total));

describe('task view filter (epic 0026 slice 2: the Status filter in the URL)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    history.replaceState(null, '', '/');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the header carries a labelled Status fieldset with one unchecked box per status', async () => {
    await boot();

    const fieldset = document.querySelector('fieldset.board-filter') as HTMLFieldSetElement;
    expect(fieldset).not.toBeNull();
    const legend = fieldset.querySelector('legend') as HTMLElement;
    expect(legend.textContent).toBe(STRINGS.en.boardFilterStatus);
    expect(legend.getAttribute('data-i18n')).toBe('boardFilterStatus');
    const boxes = Array.from(
      fieldset.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][data-task-filter="status"]',
      ),
    );
    expect(boxes.map((b) => b.value)).toEqual([
      'queued',
      'in_progress',
      'needs_approval',
      'done',
      'deferred',
    ]);
    expect(boxes.some((b) => b.checked)).toBe(false);
    // Each box is named by its own <label>, the status word the pill shows.
    expect(box('needs_approval').closest('label')?.textContent).toBe(
      STRINGS.en.taskStatusNeedsApproval,
    );
    expect(shownIds()).toEqual(['t1', 't2', 't3', 't4']);
    expect(note()).toBeNull();
  });

  it('a link with ?status= opens the board filtered, its boxes checked', async () => {
    await boot('?status=done,queued');

    expect(shownIds()).toEqual(['t1', 't2', 't4']);
    expect(box('queued').checked).toBe(true);
    expect(box('done').checked).toBe(true);
    expect(box('needs_approval').checked).toBe(false);
  });

  it('ticking a box writes the view into the query string and rebuilds the list to match', async () => {
    await boot();

    await tick('needs_approval');
    expect(location.search).toBe('?status=needs_approval');
    expect(shownIds()).toEqual(['t3']);

    await tick('queued');
    // The vocabulary's order, not the order of the clicks.
    expect(location.search).toBe('?status=queued,needs_approval');
    expect(shownIds()).toEqual(['t1', 't2', 't3']);
    expect(location.pathname).toBe('/p/p1');
  });

  it('keyboard focus stays on the box it toggled through the rebuild', async () => {
    await boot();

    box('done').focus();
    await tick('done');

    expect(document.activeElement).toBe(box('done'));
    expect(box('done').checked).toBe(true);
  });

  it('unticking the last box gives back the plain URL and the whole board', async () => {
    await boot('?status=done');

    await tick('done');

    expect(location.search).toBe('');
    expect(shownIds()).toEqual(['t1', 't2', 't3', 't4']);
    expect(note()).toBeNull();
  });

  it('a filtered board says how much it shows and drops the reorder controls it cannot post', async () => {
    await boot('?status=queued');

    expect(note()?.textContent).toContain(showing('en', 2, 4));
    expect(document.querySelectorAll('.tasks [data-task-move]')).toHaveLength(0);
    expect(document.querySelectorAll('.tasks .task[draggable="true"]')).toHaveLength(0);

    await tick('queued');
    expect(document.querySelectorAll('.tasks [data-task-move]')).toHaveLength(4);
    expect(document.querySelectorAll('.tasks .task[draggable="true"]')).toHaveLength(2);
  });

  it('the column heads count the rows the filter shows', async () => {
    await boot('?status=queued,done');

    const counts = Array.from(document.querySelectorAll('.board-column-count')).map(
      (c) => c.textContent,
    );
    expect(counts).toEqual(['2', '0', '1']);
  });

  it('Clear drops every filter — a hand-typed severity too — and keeps the other parameters', async () => {
    await boot('?keep=1&severity=high&status=queued');

    // No box for severity yet, but the URL's filter still applies.
    expect(shownIds()).toEqual(['t1']);
    const clear = note()?.querySelector('button[data-task-filter-clear]') as HTMLButtonElement;
    expect(clear.textContent).toBe(STRINGS.en.boardFilterClear);
    clear.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(location.search).toBe('?keep=1');
    expect(shownIds()).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('a filter that matches nothing still leaves the way back', async () => {
    await boot('?status=deferred');

    expect(shownIds()).toEqual([]);
    expect(note()?.textContent).toContain(showing('en', 0, 4));
    expect(note()?.querySelector('button[data-task-filter-clear]')).not.toBeNull();
  });

  it('the legend, the box labels and the note follow a locale switch', async () => {
    await boot('?status=queued');

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(document.querySelector('fieldset.board-filter legend')?.textContent).toBe(
      STRINGS.he.boardFilterStatus,
    );
    expect(box('queued').closest('label')?.textContent).toBe(STRINGS.he.taskStatusQueued);
    expect(note()?.textContent).toContain(showing('he', 2, 4));
    expect(note()?.querySelector('button')?.textContent).toBe(STRINGS.he.boardFilterClear);
  });
});
