// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure selection-context math for the Ask sheet (epic 0026 slice 3: the
 * sheet "carries the current selection as context — about this task"). The
 * selection is the board's own: the rows whose boxes are checked, the same
 * set the "N selected" line counts and the palette's bulk actions reach. The
 * view context already names the page, the focused task and the operator's
 * recent actions (web/operator-actions.ts); this names the selected rows, so
 * "why is this one stuck?" reaches the model with the task it means.
 *
 * `web/shell.ts` embeds this module's compiled source into the generated
 * client via `.toString()`, the way it embeds operator-actions.ts, so the
 * browser and the tests run the same function.
 */

/** How many selected titles ride in the Ask view context — a Ctrl+A over a
 *  long board names the first few and counts the rest, so the prompt stays
 *  small however large the selection grows. */
export const ASK_SELECTION_TITLE_CAP = 5;

/** The Ask view-context suffix for the selected task titles, in list order —
 *  empty string (nothing to append) when no row is selected. Past `cap`
 *  titles it names the first `cap` and counts the rest. */
export function selectedTasksViewText(titles: readonly string[], cap: number): string {
  if (titles.length === 0) return '';
  const named = titles.slice(0, Math.max(1, cap));
  const rest = titles.length - named.length;
  const head = titles.length === 1 ? 'selected task: ' : 'selected tasks (' + titles.length + '): ';
  return head + named.join('; ') + (rest > 0 ? '; and ' + rest + ' more' : '');
}
