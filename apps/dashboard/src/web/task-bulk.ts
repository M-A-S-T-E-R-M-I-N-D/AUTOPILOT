// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The tasks screen's bulk actions — epic 0026 slice 4 ("bulk actions from the
 * palette on a selection"), its pure half. Slice 1 built the selection (`x`,
 * Shift+`j`/`k`, Ctrl/Cmd-A, the "N selected" line); this module decides what
 * each action does to it: which selected rows it reaches, the one request per
 * row, and whether it asks first. Linear's rule: the palette acts on the
 * selection, and offers only the actions some selected row can take.
 *
 * A bulk action is each row's OWN button pressed once per row, never a new
 * write path: approve and reject reach a proposal (`needs_approval`), done and
 * delete reach every other open task, exactly as the row draws its buttons in
 * `shell.ts`. Each request is the one that button posts — there is no bulk
 * endpoint, and none is needed. Only delete asks first, as the row's delete
 * button does: it removes real planning state, while a rejected proposal
 * loses nothing the operator wrote.
 *
 * It acts on what the list shows. The caller passes the rows the view keeps,
 * in board order; a selected id the filters hide, or one a tick has since
 * removed, is not acted on — the "N selected" line counts the same visible
 * boxes, so the count the operator reads is the count the action reaches.
 *
 * Pure and DOM-free, written to be embedded via `.toString()` like
 * `task-view.ts`: no module consts, and {@link planTaskBulk} needs
 * {@link taskBulkReaches} embedded beside it ({@link taskBulkChoices} needs
 * both, and {@link taskBulkActions}). The command palette
 * (`features/subject-nav.ts`) embeds all four and sends the plan.
 */

/** A bulk action — one of the row's own buttons. */
export type TaskBulkAction = 'approve' | 'reject' | 'done' | 'delete';

/** The fields a bulk action reads off each task entry. */
export interface TaskBulkTask {
  readonly id: string;
  readonly status: string;
}

/** One POST, the same one the row's own button sends. */
export interface TaskBulkRequest {
  readonly path: '/api/task/status' | '/api/task/delete';
  readonly body: { readonly id: string; readonly status?: 'queued' | 'done' };
}

/** What one action does to a selection. */
export interface TaskBulkPlan {
  readonly action: TaskBulkAction;
  /** One request per reached row, in board order. */
  readonly requests: readonly TaskBulkRequest[];
  /** Selected shown rows the action does not reach, in board order. */
  readonly skipped: readonly string[];
  /** Whether to confirm before sending — delete only, as the row's delete button. */
  readonly confirm: boolean;
}

/** An action the palette can offer, and how many selected rows it reaches. */
export interface TaskBulkChoice {
  readonly action: TaskBulkAction;
  readonly count: number;
}

/** The actions in the order the palette lists them: a proposal's decision
 *  first (approve, reject), then an open task's (done, delete). */
export function taskBulkActions(): readonly TaskBulkAction[] {
  return ['approve', 'reject', 'done', 'delete'];
}

/**
 * Whether `action` reaches `task` — whether the row draws that button. A
 * proposal (`needs_approval`) carries approve and reject; any other task that
 * is still open (not `done`, not `deferred`) carries done and delete, a status
 * the vocabulary does not know yet included, as the row treats it.
 */
export function taskBulkReaches(task: TaskBulkTask, action: TaskBulkAction): boolean {
  if (action === 'approve' || action === 'reject') return task.status === 'needs_approval';
  return task.status !== 'needs_approval' && task.status !== 'done' && task.status !== 'deferred';
}

/**
 * Plans `action` over the `selected` ids among `tasks` (the rows the list
 * shows, in board order). Each reached row gets the request its own button
 * posts; each selected row it does not reach is named in `skipped`, so the
 * wiring can say "2 of 5". A selected id with no shown row is ignored, and a
 * repeated id counts once.
 */
export function planTaskBulk(
  tasks: readonly TaskBulkTask[],
  selected: readonly string[],
  action: TaskBulkAction,
): TaskBulkPlan {
  const requests: TaskBulkRequest[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.id) || !selected.includes(task.id)) continue;
    seen.add(task.id);
    if (!taskBulkReaches(task, action)) skipped.push(task.id);
    else if (action === 'approve') {
      requests.push({ path: '/api/task/status', body: { id: task.id, status: 'queued' } });
    } else if (action === 'done') {
      requests.push({ path: '/api/task/status', body: { id: task.id, status: 'done' } });
    } else requests.push({ path: '/api/task/delete', body: { id: task.id } });
  }
  return { action, requests, skipped, confirm: action === 'delete' };
}

/**
 * The actions the palette offers for a selection, in {@link taskBulkActions}
 * order, each with how many selected rows it reaches. An action no selected
 * row can take is left out, so an empty selection offers nothing.
 */
export function taskBulkChoices(
  tasks: readonly TaskBulkTask[],
  selected: readonly string[],
): TaskBulkChoice[] {
  const choices: TaskBulkChoice[] = [];
  for (const action of taskBulkActions()) {
    const count = planTaskBulk(tasks, selected, action).requests.length;
    if (count) choices.push({ action, count });
  }
  return choices;
}
