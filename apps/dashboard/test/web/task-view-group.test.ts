// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0026 "the tasks screen" slice 2 (board web-mtywp82m-zodn7z): the
 * grouping control. `web/task-view.ts` already reads and writes `?group=` and
 * splits tasks into groups; this is the Tasks card's "Group" fieldset that
 * sets it, and the counted heads the list draws over each group. Linear keeps
 * grouping with the display options, after the filters: grouping changes how
 * the list is laid out, never which tasks it holds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

function task(id: string, status: string, severity: string | null, source: string, focus = false) {
  return { id, title: 'Task ' + id, status, severity, source, focus, priority: null, at: 1 };
}

// Board order g1..g4. By severity: high (g1, g3), low (g4), unrated (g2).
// By status: queued (g1, g2), in progress (g3), done (g4). By source: inbox
// (g2, g4), dashboard (g3), proposed (g1).
const TASKS = [
  task('g1', 'queued', 'high', 'self'),
  task('g2', 'queued', null, 'inbox'),
  task('g3', 'in_progress', 'high', 'dashboard'),
  task('g4', 'done', 'low', 'inbox'),
];

function makeState(tasks: readonly ReturnType<typeof task>[]) {
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
        shipRate: 0,
        openFindings: 0,
        gauge: { critical: 0, high: 0, medium: 0, low: 0 },
        lastActivityAt: null,
        flightLog: [],
        activity: [],
        tasks,
      },
    ],
    empty: false,
  };
}

async function boot(search = '', tasks = TASKS): Promise<void> {
  history.replaceState(null, '', '/p/p1' + search);
  document.open();
  document.write(renderShell('p1'));
  document.close();
  const state = makeState(tasks);
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const groupFieldset = () =>
  document.querySelector('fieldset.board-group') as HTMLFieldSetElement | null;

function radio(value: string): HTMLInputElement {
  const found = document.querySelector(`[data-task-group][value="${value}"]`);
  if (!(found instanceof HTMLInputElement)) throw new Error(`no group radio for ${value}`);
  return found;
}

async function choose(value: string): Promise<void> {
  radio(value).click();
  await vi.advanceTimersByTimeAsync(1);
}

/** The list as drawn: `#word count` for a group head, the task id for a row. */
const listed = () =>
  Array.from(document.querySelectorAll('ul.tasks > li')).map((li) =>
    li.classList.contains('task-group')
      ? '#' + (li.textContent ?? '').trim().replace(/\s+/g, ' ')
      : li.getAttribute('data-task-id'),
  );

describe('task view grouping (epic 0026 slice 2: the Group control over ?group=)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    history.replaceState(null, '', '/');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a labelled Group fieldset sits between the filters and Show: one radio per grouping, none checked first', async () => {
    await boot();

    const fieldset = groupFieldset() as HTMLFieldSetElement;
    expect(fieldset).not.toBeNull();
    expect(fieldset.classList.contains('board-filter')).toBe(false);
    const filters = Array.from(document.querySelectorAll('fieldset.board-filter'));
    expect(filters).toHaveLength(3);
    expect(
      (filters[2] as Node).compareDocumentPosition(fieldset) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const show = document.querySelector('fieldset.board-display') as Node;
    expect(fieldset.compareDocumentPosition(show) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const legend = fieldset.querySelector('legend') as HTMLElement;
    expect(legend.textContent).toBe(STRINGS.en.boardGroup);
    expect(legend.getAttribute('data-i18n')).toBe('boardGroup');
    const radios = Array.from(fieldset.querySelectorAll<HTMLInputElement>('input'));
    expect(radios.map((r) => r.type)).toEqual(Array(5).fill('radio'));
    expect(radios.map((r) => r.value)).toEqual(['none', 'status', 'severity', 'source', 'focus']);
    // One native radio group: arrow keys move within it, one Tab stop.
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(radio('none').name).not.toBe('');
    expect(radios.map((r) => r.checked)).toEqual([true, false, false, false, false]);
    expect(radios.some((r) => r.hasAttribute('data-task-filter'))).toBe(false);
    expect(radio('none').closest('label')?.textContent).toBe(STRINGS.en.boardGroupNone);
    expect(radio('status').closest('label')?.textContent).toBe(STRINGS.en.boardGroupStatus);
    expect(radio('severity').closest('label')?.textContent).toBe(STRINGS.en.boardGroupSeverity);
    expect(radio('source').closest('label')?.textContent).toBe(STRINGS.en.boardGroupSource);
    expect(radio('focus').closest('label')?.textContent).toBe(STRINGS.en.boardGroupFocus);
    // The plain board draws no group head.
    expect(listed()).toEqual(['g1', 'g2', 'g3', 'g4']);
  });

  it('choosing Severity writes ?group= and draws a counted head over each group, reds first', async () => {
    await boot();

    await choose('severity');

    expect(location.search).toBe('?group=severity');
    expect(location.pathname).toBe('/p/p1');
    expect(listed()).toEqual([
      '#' + STRINGS.en.taskSeverityHigh + ' 2',
      'g1',
      'g3',
      '#' + STRINGS.en.taskSeverityLow + ' 1',
      'g4',
      '#' + STRINGS.en.taskSeverityNone + ' 1',
      'g2',
    ]);
    expect(radio('severity').checked).toBe(true);
    expect(radio('none').checked).toBe(false);
  });

  it('each head is a level-4 heading whose word carries its i18n key and whose count is its own span', async () => {
    await boot('?group=severity');

    const head = document.querySelector('ul.tasks > li.task-group') as HTMLLIElement;
    // A list item, never a row: j/k, x, Ctrl+A and the bulk actions read .task.
    expect(head.classList.contains('task')).toBe(false);
    expect(head.querySelector('[data-task-select]')).toBeNull();
    const heading = head.querySelector('h4') as HTMLHeadingElement;
    expect(heading).not.toBeNull();
    const word = heading.querySelector('[data-i18n]') as HTMLElement;
    expect(word.getAttribute('data-i18n')).toBe('taskSeverityHigh');
    expect(word.textContent).toBe(STRINGS.en.taskSeverityHigh);
    expect(heading.querySelector('.task-group-count')?.textContent).toBe('2');
  });

  it('a link with ?group=status opens grouped in board-column order, its radio checked', async () => {
    await boot('?group=status');

    expect(listed()).toEqual([
      '#' + STRINGS.en.taskStatusQueued + ' 2',
      'g1',
      'g2',
      '#' + STRINGS.en.taskStatusInProgress + ' 1',
      'g3',
      '#' + STRINGS.en.taskStatusDone + ' 1',
      'g4',
    ]);
    expect(radio('status').checked).toBe(true);
  });

  it('choosing Focus writes ?group=focus and puts what to work first at the top', async () => {
    await boot('', [
      task('f1', 'queued', 'low', 'inbox'),
      task('f2', 'needs_approval', 'high', 'self'),
      task('f3', 'queued', 'critical', 'dashboard'),
      task('f4', 'in_progress', 'low', 'inbox', true),
      task('f5', 'in_progress', 'high', 'self'),
      task('f6', 'deferred', null, 'backlog'),
      task('f7', 'done', 'critical', 'inbox'),
    ]);

    await choose('focus');

    expect(location.search).toBe('?group=focus');
    // The focus lock, then the operator's decision, then the open queue reds
    // first — board order inside each — then what waits and what is done.
    expect(listed()).toEqual([
      '#' + STRINGS.en.taskFocusFocused + ' 1',
      'f4',
      '#' + STRINGS.en.taskStatusNeedsApproval + ' 1',
      'f2',
      '#' + STRINGS.en.taskFocusUrgent + ' 2',
      'f3',
      'f5',
      '#' + STRINGS.en.taskFocusNext + ' 1',
      'f1',
      '#' + STRINGS.en.taskStatusDeferred + ' 1',
      'f6',
      '#' + STRINGS.en.taskStatusDone + ' 1',
      'f7',
    ]);
    expect(radio('focus').checked).toBe(true);
    const words = Array.from(
      document.querySelectorAll('ul.tasks > li.task-group h4 [data-i18n]'),
    ).map((word) => word.getAttribute('data-i18n'));
    expect(words).toEqual([
      'taskFocusFocused',
      'taskStatusNeedsApproval',
      'taskFocusUrgent',
      'taskFocusNext',
      'taskStatusDeferred',
      'taskStatusDone',
    ]);
  });

  it('the Focus radio and its head words follow a locale switch', async () => {
    await boot('?group=focus');

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(radio('focus').closest('label')?.textContent).toBe(STRINGS.he.boardGroupFocus);
    expect(document.querySelector('ul.tasks > li.task-group h4 [data-i18n]')?.textContent).toBe(
      STRINGS.he.taskFocusUrgent,
    );
  });

  it('choosing None gives back the plain URL and the flat list', async () => {
    await boot('?group=source');
    expect(listed()[0]).toBe('#' + STRINGS.en.taskSourceInbox + ' 2');

    await choose('none');

    expect(location.search).toBe('');
    expect(listed()).toEqual(['g1', 'g2', 'g3', 'g4']);
  });

  it('a grouped list is a list: no reorder, no drag, no columns toggle, no filter note', async () => {
    await boot();
    expect(document.querySelectorAll('.tasks [data-task-move]').length).toBeGreaterThan(0);

    await choose('status');

    // Reordering posts the order the list shows, and a grouped list is not
    // the board's order.
    expect(document.querySelectorAll('.tasks [data-task-move]')).toHaveLength(0);
    expect(document.querySelectorAll('.tasks .task[draggable="true"]')).toHaveLength(0);
    const card = document.querySelector('ul.tasks')?.closest('[data-board-view]') as HTMLElement;
    expect(card.getAttribute('data-board-view')).toBe('list');
    expect(document.querySelector('[data-board-view-toggle]')).toBeNull();
    expect(document.querySelector('.board-filter-note')).toBeNull();
  });

  it('grouping keeps every filter, heads count what the filter shows, and Clear keeps ?group=', async () => {
    await boot('?group=source&severity=high');

    expect(listed()).toEqual([
      '#' + STRINGS.en.taskSourceDashboard + ' 1',
      'g3',
      '#' + STRINGS.en.taskSourceSelf + ' 1',
      'g1',
    ]);

    await choose('status');
    expect(location.search).toBe('?group=status&severity=high');

    (document.querySelector('button[data-task-filter-clear]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);
    expect(location.search).toBe('?group=status');
    expect(listed()).toHaveLength(7);
  });

  it('the closed history stays capped in board order; a head still counts its whole group', async () => {
    // Seventeen done rows, two past the fifteen the history shows at first:
    // d16 and d17 are the high ones the cap leaves out.
    const done = Array.from({ length: 17 }, (_, n) =>
      task('d' + String(n + 1).padStart(2, '0'), 'done', n < 15 ? 'low' : 'high', 'inbox'),
    );
    await boot('?group=severity', [task('q1', 'queued', 'high', 'self'), ...done]);

    expect(listed()).toEqual([
      '#' + STRINGS.en.taskSeverityHigh + ' 3',
      'q1',
      '#' + STRINGS.en.taskSeverityLow + ' 15',
      ...done.slice(0, 15).map((t) => t.id),
    ]);
    expect(document.querySelector('[data-task-history-more]')).not.toBeNull();
  });

  it('j walks from the last row of one group to the first row of the next, over its head', async () => {
    await boot('?group=severity');

    const title = (id: string) =>
      document.querySelector(`.task[data-task-id="${id}"] .task-title`) as HTMLElement;
    // g4 closes the "low" group and g2 opens "unrated"; the flat list ends at g4.
    title('g4').focus();
    title('g4').dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));

    expect(document.activeElement).toBe(title('g2'));
  });

  it('keyboard focus stays on the radio it chose through the rebuild', async () => {
    await boot();

    radio('source').focus();
    await choose('source');

    expect(document.activeElement).toBe(radio('source'));
    expect(radio('source').checked).toBe(true);
  });

  it('the legend, the radio labels and the head words follow a locale switch', async () => {
    await boot('?group=severity');

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(groupFieldset()?.querySelector('legend')?.textContent).toBe(STRINGS.he.boardGroup);
    expect(radio('severity').closest('label')?.textContent).toBe(STRINGS.he.boardGroupSeverity);
    expect(document.querySelector('ul.tasks > li.task-group h4 [data-i18n]')?.textContent).toBe(
      STRINGS.he.taskSeverityHigh,
    );
  });
});
