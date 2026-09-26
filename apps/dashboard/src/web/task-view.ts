// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The tasks screen's view state — epic 0026 slice 2 ("view header: grouping,
 * filters, display options in the URL"), its pure half. Linear's rule: a view
 * lives in the URL, so a grouped, filtered board survives reload, back/forward
 * and copy-paste sharing. It rides the query string (`?group=severity&status=
 * queued,in_progress`), not the hash — `features/subject-nav.ts` already owns
 * `location.hash` for in-page anchors — and `/p/<id>` keeps serving one page.
 *
 * Pure and DOM-free. Nothing calls this yet (zero bundle bytes, zero page
 * change): wiring the view header into `shell.ts`'s Tasks card is the next
 * slice, the same split `tab-route.ts` made. When it is wired, embed the
 * functions via `.toString()` like `task-queue.ts`'s — which is why every
 * vocabulary sits inside {@link taskViewValues} rather than a module const,
 * and why {@link taskMatchesView}/{@link groupTasksForView} need
 * {@link taskViewKey} and {@link taskViewValues} embedded beside them.
 * Display options (show/hide row properties) are not modelled yet.
 */

/** The three task properties the view header groups and filters by. */
export type TaskViewProperty = 'status' | 'severity' | 'source';

/** A view's grouping: one of the properties, or a flat list. */
export type TaskGroupBy = 'none' | TaskViewProperty;

/** A tasks-screen view. Each filter lists the values it keeps, in
 *  {@link taskViewValues} order; an empty list filters nothing. */
export interface TaskViewState {
  readonly group: TaskGroupBy;
  readonly status: readonly string[];
  readonly severity: readonly string[];
  readonly source: readonly string[];
}

/** The fields a view reads off each task entry. */
export interface TaskViewTask {
  readonly status: string;
  readonly severity?: string | null;
  readonly source?: string | null;
}

/** One group of {@link groupTasksForView}'s result: its key (a
 *  {@link taskViewValues} value, or `all` for a flat list) and its tasks in
 *  board order. The group head's count is `tasks.length`. */
export interface TaskViewGroup<T extends TaskViewTask> {
  readonly key: string;
  readonly tasks: readonly T[];
}

/**
 * A property's known values in display order — the order groups appear in and
 * filters are written in. Status follows the board's columns (queued, in
 * flight, needs you, done); severity clears reds first. `none` is the bucket
 * for a task with no severity or source. Mirrors the store's `TASK_STATUSES`,
 * `SEVERITIES` and `TASK_SOURCES` (a test pins the match) rather than
 * importing them: the store is Node-only.
 */
export function taskViewValues(property: TaskViewProperty): readonly string[] {
  switch (property) {
    case 'status':
      return ['queued', 'in_progress', 'needs_approval', 'done', 'deferred'];
    case 'severity':
      return ['critical', 'high', 'medium', 'low', 'none'];
    case 'source':
      return ['inbox', 'repo', 'backlog', 'chat', 'dashboard', 'self', 'github', 'none'];
  }
}

/** The value a task shows for `property` — `none` when it has no severity or
 *  source, so an unrated task still lands in a group and can be filtered. */
export function taskViewKey(task: TaskViewTask, property: TaskViewProperty): string {
  if (property === 'status') return task.status;
  const value = property === 'severity' ? task.severity : task.source;
  return value || 'none';
}

/**
 * Reads a view out of `location.search`. Stale-safe like `tabIdFromHash`: an
 * unknown group reads as `none`, unknown filter values are dropped, and a
 * filter may be comma-separated, repeated (`?status=done&status=queued`) or
 * hand-typed in any case — it always comes back in {@link taskViewValues}
 * order without duplicates, so equal views compare equal.
 */
export function parseTaskView(search: string): TaskViewState {
  const params = new URLSearchParams(search);
  const kept = (property: TaskViewProperty): string[] => {
    const asked = params
      .getAll(property)
      .join(',')
      .split(',')
      .map((value) => value.trim().toLowerCase());
    return taskViewValues(property).filter((value) => asked.includes(value));
  };
  const group = (params.get('group') || '').trim().toLowerCase();
  return {
    group: group === 'status' || group === 'severity' || group === 'source' ? group : 'none',
    status: kept('status'),
    severity: kept('severity'),
    source: kept('source'),
  };
}

/**
 * The `location.search` value (leading `?` included, or `''` when nothing is
 * left) that addresses `view`, written over `search` so any other query
 * parameter survives. A default — no grouping, an empty filter — is removed
 * rather than written, so the plain board keeps its plain URL. Commas stay
 * literal: the vocabulary never contains one, and `status=queued,done` reads
 * better in a shared link than `%2C`.
 */
export function taskViewSearch(view: TaskViewState, search: string): string {
  const params = new URLSearchParams(search);
  if (view.group === 'none') params.delete('group');
  else params.set('group', view.group);
  for (const property of ['status', 'severity', 'source'] as const) {
    const values = view[property];
    if (values.length) params.set(property, values.join(','));
    else params.delete(property);
  }
  const query = params.toString().replace(/%2C/gi, ',');
  return query ? '?' + query : '';
}

/** Whether `task` passes every filter of `view` — each non-empty filter must
 *  list the task's {@link taskViewKey} for that property. */
export function taskMatchesView(task: TaskViewTask, view: TaskViewState): boolean {
  for (const property of ['status', 'severity', 'source'] as const) {
    const values = view[property];
    if (values.length && !values.includes(taskViewKey(task, property))) return false;
  }
  return true;
}

/**
 * Splits `tasks` into the view's groups: known values first in
 * {@link taskViewValues} order, then any value the vocabulary does not know
 * yet in first-seen order (a new status never makes a task vanish). Empty
 * groups are left out; tasks keep their board order inside each group. A flat
 * view (`none`) is one group keyed `all`, or no group for no tasks.
 */
export function groupTasksForView<T extends TaskViewTask>(
  tasks: readonly T[],
  group: TaskGroupBy,
): TaskViewGroup<T>[] {
  if (group === 'none') return tasks.length ? [{ key: 'all', tasks: tasks.slice() }] : [];
  const buckets = new Map<string, T[]>();
  for (const key of taskViewValues(group)) buckets.set(key, []);
  for (const task of tasks) {
    const key = taskViewKey(task, group);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(task);
    else buckets.set(key, [task]);
  }
  const groups: TaskViewGroup<T>[] = [];
  for (const [key, members] of buckets) {
    if (members.length) groups.push({ key, tasks: members });
  }
  return groups;
}
