// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0026 slice 2 (the tasks screen's view header), its pure half — direct
 * unit coverage for `web/task-view.ts`'s URL view state. The client wiring
 * (the Tasks card's Status filter) is covered by task-view-filter.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { SEVERITIES, TASK_SOURCES, TASK_STATUSES } from '@autopilot/store';
import {
  groupTasksForView,
  parseTaskDisplay,
  parseTaskView,
  taskDisplayProperties,
  taskDisplaySearch,
  taskDisplayShows,
  taskFocusKey,
  taskFocusValues,
  taskMatchesView,
  taskViewKey,
  taskViewSearch,
  taskViewValues,
  type TaskDisplayState,
  type TaskViewGroup,
  type TaskViewState,
  type TaskViewTask,
} from '../../src/web/task-view.js';

const PLAIN: TaskViewState = { group: 'none', status: [], severity: [], source: [] };

interface Row extends TaskViewTask {
  readonly id: string;
}

const ROWS: readonly Row[] = [
  { id: 'a', status: 'queued', severity: 'low', source: 'self' },
  { id: 'b', status: 'done', severity: 'critical', source: 'inbox' },
  { id: 'c', status: 'queued', severity: null, source: 'github' },
  { id: 'd', status: 'in_progress', severity: 'critical', source: 'self' },
];

describe('taskViewValues', () => {
  it("holds exactly the store's vocabularies, plus `none` where a task may carry no value", () => {
    expect([...taskViewValues('status')].sort()).toEqual([...TASK_STATUSES].sort());
    expect([...taskViewValues('severity')].sort()).toEqual([...SEVERITIES, 'none'].sort());
    expect([...taskViewValues('source')].sort()).toEqual([...TASK_SOURCES, 'none'].sort());
  });

  it("orders status like the board's columns and severity reds first", () => {
    expect(taskViewValues('status')).toEqual([
      'queued',
      'in_progress',
      'needs_approval',
      'done',
      'deferred',
    ]);
    expect(taskViewValues('severity')).toEqual(['critical', 'high', 'medium', 'low', 'none']);
  });
});

describe('taskViewKey', () => {
  it('reads a missing severity or source as none', () => {
    expect(taskViewKey({ status: 'queued' }, 'severity')).toBe('none');
    expect(taskViewKey({ status: 'queued', severity: null, source: null }, 'source')).toBe('none');
    expect(taskViewKey({ status: 'done', severity: 'high', source: 'repo' }, 'status')).toBe(
      'done',
    );
  });
});

describe('parseTaskView', () => {
  it('reads the plain view from an empty or foreign query', () => {
    expect(parseTaskView('')).toEqual(PLAIN);
    expect(parseTaskView('?tab=runtime')).toEqual(PLAIN);
  });

  it('reads a grouping and comma-separated filters, leading ? optional', () => {
    expect(parseTaskView('?group=severity&status=queued,done&source=self')).toEqual({
      group: 'severity',
      status: ['queued', 'done'],
      severity: [],
      source: ['self'],
    });
    expect(parseTaskView('group=source').group).toBe('source');
    expect(parseTaskView('?group=Focus').group).toBe('focus');
  });

  it('accepts repeated keys, stray spaces, any case and duplicates, returning canonical order', () => {
    const view = parseTaskView('?status=DONE&status=queued, done&severity=Low,%20critical');
    expect(view.status).toEqual(['queued', 'done']);
    expect(view.severity).toEqual(['critical', 'low']);
  });

  it('drops an unknown grouping and unknown filter values instead of throwing', () => {
    const view = parseTaskView('?group=dimension&status=gone,queued&severity=');
    expect(view).toEqual({ group: 'none', status: ['queued'], severity: [], source: [] });
  });
});

describe('taskViewSearch', () => {
  it('writes nothing for the plain view, so the plain board keeps its plain URL', () => {
    expect(taskViewSearch(PLAIN, '')).toBe('');
    expect(taskViewSearch(PLAIN, '?group=status&status=done')).toBe('');
  });

  it('writes the grouping and filters with literal commas', () => {
    const view: TaskViewState = {
      group: 'severity',
      status: ['queued', 'in_progress'],
      severity: [],
      source: ['self'],
    };
    expect(taskViewSearch(view, '')).toBe('?group=severity&status=queued,in_progress&source=self');
  });

  it('keeps every foreign query parameter, encoded commas in them included', () => {
    const view: TaskViewState = { ...PLAIN, severity: ['high'] };
    const search = taskViewSearch(view, '?tab=runtime&note=a%2Cb&severity=low');
    expect(search).toBe('?tab=runtime&note=a,b&severity=high');
    expect(new URLSearchParams(search).get('note')).toBe('a,b');
  });

  it('round-trips through parseTaskView', () => {
    const view: TaskViewState = {
      group: 'source',
      status: ['needs_approval'],
      severity: ['critical', 'none'],
      source: [],
    };
    expect(parseTaskView(taskViewSearch(view, '?tab=runtime'))).toEqual(view);
  });
});

describe('taskMatchesView', () => {
  it('passes every task through the plain view', () => {
    expect(ROWS.every((row) => taskMatchesView(row, PLAIN))).toBe(true);
  });

  it('keeps a task only when every non-empty filter lists its value', () => {
    const view: TaskViewState = { ...PLAIN, status: ['queued'], source: ['self', 'github'] };
    expect(ROWS.filter((row) => taskMatchesView(row, view)).map((row) => row.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('matches an unrated task with the none severity', () => {
    const view: TaskViewState = { ...PLAIN, severity: ['none'] };
    expect(ROWS.filter((row) => taskMatchesView(row, view)).map((row) => row.id)).toEqual(['c']);
  });
});

describe('groupTasksForView', () => {
  const ids = (groups: readonly TaskViewGroup<Row>[]): string[][] =>
    groups.map((g) => [g.key, ...g.tasks.map((t) => t.id)]);

  it('keeps a flat view as one `all` group, and no group for no tasks', () => {
    expect(ids(groupTasksForView(ROWS, 'none'))).toEqual([['all', 'a', 'b', 'c', 'd']]);
    expect(groupTasksForView([], 'none')).toEqual([]);
  });

  it('groups in vocabulary order, skips empty groups and keeps board order inside each', () => {
    expect(ids(groupTasksForView(ROWS, 'status'))).toEqual([
      ['queued', 'a', 'c'],
      ['in_progress', 'd'],
      ['done', 'b'],
    ]);
    expect(ids(groupTasksForView(ROWS, 'severity'))).toEqual([
      ['critical', 'b', 'd'],
      ['low', 'a'],
      ['none', 'c'],
    ]);
  });

  it('never drops a task whose value the vocabulary does not know yet', () => {
    const rows: Row[] = [...ROWS, { id: 'e', status: 'blocked' }];
    expect(ids(groupTasksForView(rows, 'status')).at(-1)).toEqual(['blocked', 'e']);
  });

  it('does not mutate the input list', () => {
    const rows = ROWS.slice();
    groupTasksForView(rows, 'source');
    expect(rows).toEqual(ROWS);
  });

  it('groups by focus: what to work first at the top, board order inside each group', () => {
    const rows: Row[] = [
      { id: 'q-low', status: 'queued', severity: 'low' },
      { id: 'done', status: 'done', severity: 'critical' },
      { id: 'ask', status: 'needs_approval', severity: 'high' },
      { id: 'q-crit', status: 'queued', severity: 'critical' },
      { id: 'later', status: 'deferred' },
      { id: 'lock', status: 'in_progress', severity: 'low', focus: true },
      { id: 'fly-high', status: 'in_progress', severity: 'high' },
      { id: 'q-none', status: 'queued', severity: null },
    ];
    expect(ids(groupTasksForView(rows, 'focus'))).toEqual([
      ['focused', 'lock'],
      ['needs_approval', 'ask'],
      ['urgent', 'q-crit', 'fly-high'],
      ['next', 'q-low', 'q-none'],
      ['deferred', 'later'],
      ['done', 'done'],
    ]);
  });

  it('never drops a task from the focus grouping either', () => {
    const rows: Row[] = [...ROWS, { id: 'e', status: 'blocked', focus: true }];
    expect(ids(groupTasksForView(rows, 'focus')).at(-1)).toEqual(['blocked', 'e']);
  });
});

describe('the focus grouping', () => {
  it('orders its groups by what to work first, the status words where a group is one status', () => {
    expect(taskFocusValues()).toEqual([
      'focused',
      'needs_approval',
      'urgent',
      'next',
      'deferred',
      'done',
    ]);
    const closed = taskViewValues('status').filter((s) => s !== 'queued' && s !== 'in_progress');
    expect(closed.every((s) => taskFocusValues().includes(s))).toBe(true);
  });

  it('puts an open task under the focus lock first, whatever its severity', () => {
    expect(taskFocusKey({ status: 'queued', severity: 'low', focus: true })).toBe('focused');
    expect(taskFocusKey({ status: 'in_progress', severity: 'critical', focus: true })).toBe(
      'focused',
    );
  });

  it('splits the rest of the open queue into reds (critical, high) and the rest', () => {
    expect(taskFocusKey({ status: 'queued', severity: 'critical' })).toBe('urgent');
    expect(taskFocusKey({ status: 'in_progress', severity: 'high' })).toBe('urgent');
    expect(taskFocusKey({ status: 'queued', severity: 'medium' })).toBe('next');
    expect(taskFocusKey({ status: 'in_progress', severity: null, focus: false })).toBe('next');
    expect(taskFocusKey({ status: 'queued' })).toBe('next');
  });

  it('files a task no flight can work yet by its status, a stale focus flag or not', () => {
    expect(taskFocusKey({ status: 'needs_approval', severity: 'critical' })).toBe('needs_approval');
    expect(taskFocusKey({ status: 'done', severity: 'high', focus: true })).toBe('done');
    expect(taskFocusKey({ status: 'deferred' })).toBe('deferred');
  });
});

describe('display options', () => {
  const SHOW_ALL: TaskDisplayState = { hide: [] };

  it("lists the row's informational properties in row order, never its warnings", () => {
    expect(taskDisplayProperties()).toEqual(['source', 'severity', 'dimension', 'cost']);
  });

  it('shows every property from an empty or foreign query', () => {
    expect(parseTaskDisplay('')).toEqual(SHOW_ALL);
    expect(parseTaskDisplay('?group=status&status=done')).toEqual(SHOW_ALL);
  });

  it('reads ?hide= in any case, repeated or comma-separated, into row order', () => {
    expect(parseTaskDisplay('?hide=COST&hide=source, cost').hide).toEqual(['source', 'cost']);
    expect(parseTaskDisplay('hide=dimension').hide).toEqual(['dimension']);
  });

  it('drops a property it does not know, and never hides a warning', () => {
    expect(parseTaskDisplay('?hide=runaway,budget,severity,').hide).toEqual(['severity']);
  });

  it('writes nothing when every property shows, so the plain board keeps its plain URL', () => {
    expect(taskDisplaySearch(SHOW_ALL, '')).toBe('');
    expect(taskDisplaySearch(SHOW_ALL, '?hide=cost')).toBe('');
  });

  it('writes ?hide= with literal commas beside the view filters, keeping every other parameter', () => {
    const display: TaskDisplayState = { hide: ['severity', 'cost'] };
    expect(taskDisplaySearch(display, '?group=source&status=queued,done&tab=runtime')).toBe(
      '?group=source&status=queued,done&tab=runtime&hide=severity,cost',
    );
  });

  it('leaves the view filters alone, and the view writer leaves ?hide= alone', () => {
    const search = taskDisplaySearch({ hide: ['dimension'] }, '?severity=high');
    expect(parseTaskView(search).severity).toEqual(['high']);
    const refiltered = taskViewSearch({ ...PLAIN, status: ['queued'] }, search);
    expect(parseTaskDisplay(refiltered).hide).toEqual(['dimension']);
  });

  it('round-trips through parseTaskDisplay', () => {
    const display: TaskDisplayState = { hide: ['source', 'dimension'] };
    expect(parseTaskDisplay(taskDisplaySearch(display, '?tab=runtime'))).toEqual(display);
  });

  it('shows a property unless the display hides it', () => {
    const display: TaskDisplayState = { hide: ['cost'] };
    expect(taskDisplayShows(display, 'cost')).toBe(false);
    expect(taskDisplayShows(display, 'severity')).toBe(true);
    expect(taskDisplayProperties().every((p) => taskDisplayShows(SHOW_ALL, p))).toBe(true);
  });
});

describe('embedding via .toString()', () => {
  it('runs from its own source alone, the way shell.ts embeds client helpers', () => {
    const fns = [
      taskViewValues,
      taskViewKey,
      taskFocusValues,
      taskFocusKey,
      parseTaskView,
      taskViewSearch,
      taskMatchesView,
      groupTasksForView,
      taskDisplayProperties,
      parseTaskDisplay,
      taskDisplaySearch,
      taskDisplayShows,
    ];
    const source = fns.map((fn) => fn.toString()).join('\n');
    const names = fns.map((fn) => fn.name).join(', ');
    const embedded = new Function(source + '\nreturn { ' + names + ' };')() as {
      parseTaskView: typeof parseTaskView;
      taskViewSearch: typeof taskViewSearch;
      taskMatchesView: typeof taskMatchesView;
      groupTasksForView: typeof groupTasksForView;
      parseTaskDisplay: typeof parseTaskDisplay;
      taskDisplaySearch: typeof taskDisplaySearch;
      taskDisplayShows: typeof taskDisplayShows;
    };
    const view = embedded.parseTaskView('?group=status&severity=critical');
    expect(embedded.taskViewSearch(view, '')).toBe('?group=status&severity=critical');
    const kept = ROWS.filter((row) => embedded.taskMatchesView(row, view));
    expect(embedded.groupTasksForView(kept, view.group).map((g) => g.key)).toEqual([
      'in_progress',
      'done',
    ]);
    const focus = embedded.parseTaskView('?group=focus');
    expect(embedded.groupTasksForView(ROWS, focus.group).map((g) => g.key)).toEqual([
      'urgent',
      'next',
      'done',
    ]);
    const display = embedded.parseTaskDisplay('?hide=cost,source');
    expect(embedded.taskDisplaySearch(display, '')).toBe('?hide=source,cost');
    expect(embedded.taskDisplayShows(display, 'severity')).toBe(true);
  });
});
