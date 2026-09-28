// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0026 "the tasks screen" slice 1 (board web-mtywp82m-zodn7z): the
 * detail as a SPLIT PANE beside the list from `lg` — Material 3's
 * list-detail canonical layout from the expanded window class. In the list
 * presentation at `(min-width: 64rem)` the open row's read-only detail
 * leaves its row for an `aside.task-pane` right after the list, headed by
 * the task's title; one row is open at a time there (opening another closes
 * the first), and closing the row empties the pane. The title stays the
 * row's disclosure button and its `aria-controls` keeps resolving, since
 * the detail keeps its id wherever it sits. Below `lg`, and in the columns
 * presentation (where a row is already a card), the detail stays under its
 * row exactly as before; the view toggle and a breakpoint change carry an
 * open detail between the two places without a rebuild. The pane is a
 * named `section` (a region landmark), not an `aside`: the detail is the
 * selection's main content, and axe wants a complementary landmark at the
 * top level, never inside the card's article.
 *
 * jsdom has no matchMedia, so the pane never engages in the older detail
 * tests; this file stubs one and flips it per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

// Every boot re-registers the bundle's document listeners; a stale handler
// from an earlier test would race the current one on every click (see
// a11y.test.ts for the original diagnosis). Track and strip them.
const trackedDocumentListeners: Array<
  [
    type: string,
    listener: EventListenerOrEventListenerObject,
    options: boolean | AddEventListenerOptions | undefined,
  ]
> = [];
const nativeDocumentAddEventListener = document.addEventListener.bind(document);
document.addEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => {
  trackedDocumentListeners.push([type, listener, options]);
  return nativeDocumentAddEventListener(type, listener, options);
}) as typeof document.addEventListener;

const LG = '(min-width: 64rem)';
let wide = false;
let mqListeners: Array<[query: string, fn: () => void]> = [];
const realMatchMedia = window.matchMedia;

function crossBreakpoint(nowWide: boolean): void {
  wide = nowWide;
  for (const [query, fn] of mqListeners) if (query === LG) fn();
}

function task(id: string, title: string, status: string, body?: string) {
  return {
    id,
    title,
    status,
    source: 'dashboard',
    severity: null,
    dimension: null,
    focus: false,
    priority: null,
    at: 1,
    ...(body ? { body } : {}),
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
        // A named primary language, or the card's language chip carries an
        // aria-label of "undefined" and the axe scan below fails on it.
        primaryLanguage: 'typescript',
        languages: [{ language: 'typescript', files: 2, bytes: 100 }],
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
          task(
            't1',
            'Wire up the retry queue',
            'queued',
            'Persist the attempt count with the job.',
          ),
          task('t2', 'Rename the webhook payload', 'needs_approval'),
          task('t3', 'Old cleanup task', 'done'),
        ],
      },
    ],
    empty: false,
  };
}

async function boot(state = makeState()): Promise<ReturnType<typeof makeState>> {
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

const card = () => document.querySelector('[data-board-view]') as HTMLElement;
const list = () => document.querySelector('ul.tasks') as HTMLElement;
const pane = () => document.querySelector('.task-pane') as HTMLElement;
const row = (id: string) => document.querySelector(`.task[data-task-id="${id}"]`) as HTMLElement;
const titleOf = (id: string) => row(id).querySelector('.task-title') as HTMLElement;
const detailOf = (id: string) => document.getElementById(`task-detail-${id}`) as HTMLElement;
const toggle = () => document.querySelector('[data-board-view-toggle]') as HTMLButtonElement;

function expectInPane(id: string): void {
  expect(detailOf(id).parentElement).toBe(pane());
  expect(detailOf(id).hidden).toBe(false);
  expect(pane().hidden).toBe(false);
  expect(titleOf(id).getAttribute('aria-expanded')).toBe('true');
  expect(titleOf(id).getAttribute('aria-controls')).toBe(detailOf(id).id);
  expect(row(id).querySelector('.task-detail')).toBeNull();
}

function expectInRow(id: string, open: boolean): void {
  expect(detailOf(id).parentElement).toBe(row(id));
  expect(detailOf(id).hidden).toBe(!open);
  expect(titleOf(id).getAttribute('aria-expanded')).toBe(String(open));
}

describe('task row detail as a split pane (epic 0026 slice 1, from lg)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ap-board-view', 'list');
    wide = true;
    mqListeners = [];
    (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
      get matches() {
        return query === LG ? wide : false;
      },
      addEventListener: (_type: string, fn: () => void) => {
        mqListeners.push([query, fn]);
      },
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    (window as unknown as { matchMedia: unknown }).matchMedia = realMatchMedia;
    while (trackedDocumentListeners.length) {
      const [type, listener, options] = trackedDocumentListeners.pop()!;
      document.removeEventListener(type, listener, options);
    }
  });

  it('draws a hidden, labelled pane right after the list, empty while no row is open', async () => {
    await boot();

    expect(pane().tagName).toBe('SECTION');
    expect(list().nextElementSibling).toBe(pane());
    expect(pane().parentElement).toBe(card());
    expect(pane().hidden).toBe(true);
    expect(pane().getAttribute('aria-label')).toBe(STRINGS.en.taskPane);
    expect(pane().getAttribute('data-i18n-aria')).toBe('taskPane');
    expect(pane().querySelector('.task-detail')).toBeNull();
    for (const id of ['t1', 't2', 't3']) expectInRow(id, false);
  });

  it('opening a row moves its detail into the pane, headed by the task title', async () => {
    await boot();

    titleOf('t1').click();

    expectInPane('t1');
    const head = pane().querySelector('.task-pane-title') as HTMLElement;
    expect(head.textContent).toBe('Wire up the retry queue');
    expect(pane().firstElementChild).toBe(head);
    expect(detailOf('t1').querySelector('.task-detail-body')?.textContent).toBe(
      'Persist the attempt count with the job.',
    );
    expectInRow('t2', false);
  });

  it('Enter on the row opens it into the pane the same way', async () => {
    await boot();

    titleOf('t2').focus();
    const notCancelled = titleOf('t2').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );

    expect(notCancelled).toBe(false);
    expectInPane('t2');
  });

  it('one row is open at a time there: opening another closes the first', async () => {
    await boot();

    titleOf('t1').click();
    titleOf('t2').click();

    expectInPane('t2');
    expectInRow('t1', false);
    expect(pane().querySelectorAll('.task-detail')).toHaveLength(1);
    expect((pane().querySelector('.task-pane-title') as HTMLElement).textContent).toBe(
      'Rename the webhook payload',
    );
  });

  it('closing the open row returns its detail and hides the pane', async () => {
    await boot();

    titleOf('t1').click();
    titleOf('t1').click();

    expectInRow('t1', false);
    expect(pane().hidden).toBe(true);
    expect(pane().querySelector('.task-detail')).toBeNull();
  });

  it('an open pane survives the list being rebuilt on the next changed tick', async () => {
    const state = await boot();

    titleOf('t1').click();
    const before = pane();
    state.totals.firings = 2;
    await vi.advanceTimersByTimeAsync(3000);

    expect(pane()).not.toBe(before);
    expectInPane('t1');
    expectInRow('t2', false);
  });

  it('below lg the detail stays under its row and the pane stays hidden', async () => {
    wide = false;
    await boot();

    titleOf('t1').click();

    expectInRow('t1', true);
    expect(pane().hidden).toBe(true);
  });

  it('in the columns presentation a row is already a card, so its detail stays inside it', async () => {
    localStorage.setItem('ap-board-view', 'columns');
    await boot();

    titleOf('t1').click();

    expect(card().getAttribute('data-board-view')).toBe('columns');
    expectInRow('t1', true);
    expect(pane().hidden).toBe(true);
  });

  it('the view toggle carries an open detail between the pane and its row', async () => {
    await boot();
    titleOf('t1').click();
    expectInPane('t1');

    toggle().click();
    expect(card().getAttribute('data-board-view')).toBe('columns');
    expectInRow('t1', true);
    expect(pane().hidden).toBe(true);

    toggle().click();
    expect(card().getAttribute('data-board-view')).toBe('list');
    expectInPane('t1');
  });

  it('crossing lg moves an open detail without a rebuild, and keeps only the newest of several', async () => {
    wide = false;
    await boot();
    titleOf('t1').click();
    titleOf('t2').click();
    expectInRow('t1', true);
    expectInRow('t2', true);

    crossBreakpoint(true);
    expectInPane('t2');
    expectInRow('t1', false);

    crossBreakpoint(false);
    expectInRow('t2', true);
    expect(pane().hidden).toBe(true);
  });

  it("the pane's name translates on a locale switch; the task title inside does not", async () => {
    await boot();
    titleOf('t1').click();

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(pane().getAttribute('aria-label')).toBe(STRINGS.he.taskPane);
    expect((pane().querySelector('.task-pane-title') as HTMLElement).textContent).toBe(
      'Wire up the retry queue',
    );
  });

  it('is axe-clean with a detail open in the pane', async () => {
    await boot();
    titleOf('t1').click();
    expectInPane('t1');
    vi.useRealTimers();

    const results = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations.map((v) => [v.id, v.nodes.map((n) => n.html)])).toEqual([]);
  });
});
