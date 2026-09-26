// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0026 slice 2 (the tasks screen's view header), its pure half — direct
 * unit coverage for `web/task-view.ts`'s URL view state, before any client
 * wiring exists (see the module header for why nothing calls it yet).
 */

import { describe, it, expect } from 'vitest';
import { SEVERITIES, TASK_SOURCES, TASK_STATUSES } from '@autopilot/store';
import {
  groupTasksForView,
  parseTaskView,
  taskMatchesView,
  taskViewKey,
  taskViewSearch,
  taskViewValues,
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
});

describe('embedding via .toString()', () => {
  it('runs from its own source alone, the way shell.ts embeds client helpers', () => {
    const fns = [
      taskViewValues,
      taskViewKey,
      parseTaskView,
      taskViewSearch,
      taskMatchesView,
      groupTasksForView,
    ];
    const source = fns.map((fn) => fn.toString()).join('\n');
    const names = fns.map((fn) => fn.name).join(', ');
    const embedded = new Function(source + '\nreturn { ' + names + ' };')() as {
      parseTaskView: typeof parseTaskView;
      taskViewSearch: typeof taskViewSearch;
      taskMatchesView: typeof taskMatchesView;
      groupTasksForView: typeof groupTasksForView;
    };
    const view = embedded.parseTaskView('?group=status&severity=critical');
    expect(embedded.taskViewSearch(view, '')).toBe('?group=status&severity=critical');
    const kept = ROWS.filter((row) => embedded.taskMatchesView(row, view));
    expect(embedded.groupTasksForView(kept, view.group).map((g) => g.key)).toEqual([
      'in_progress',
      'done',
    ]);
  });
});
