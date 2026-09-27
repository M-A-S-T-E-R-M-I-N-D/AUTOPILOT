// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * STRANDED-WORK TASKS CLOSE THEMSELVES (board ap-muk395cb-strand, 2026-09-27).
 * A flight whose final sync-back refuses files an inbox task naming the lane
 * branch (fly.ts). Nothing ever closed one: when a later flight's sync-back,
 * or the operator's hand merge, landed the parked commits, the task stayed
 * open, and once approved onto the board it outranked every real task. Both
 * strand tasks at the top of the fleet's board had already landed, one lane
 * branch with no commit past the flight branch at all.
 *
 * The task now names the head it stranded, and the flight-start self-heal
 * closes each open strand task whose head is an ancestor of the flight
 * branch. That one test holds for both ways a head strands: a conflicted lane
 * keeps its commits on its branch until a sync-back takes them, and a
 * withheld head is moved to a rescue ref at the next launch, so its task
 * stays open until someone merges that ref. A task filed before the head was
 * recorded names none and stays with the operator.
 */

import { setTaskStatus, type ReconciledTask, type Store } from '@autopilot/store';

const STRAND_TITLE_PREFIX = 'STRANDED SYNC-BACK: flight ended with its commits parked on ';

/** Long enough that no two commits in the repository share it. */
const STRANDED_HEAD_LENGTH = 12;

const STRANDED_HEAD =
  /^STRANDED SYNC-BACK: flight ended with its commits parked on \S+ at ([0-9a-f]{12,40}) — /;

/**
 * The inbox task's title. The branch still follows the fixed prefix, so the
 * one-task-per-branch dedup in fly.ts matches old and new titles alike; an
 * unread head (`''`) is left out rather than recorded as a guess.
 */
export function strandTaskTitle(branch: string, head: string, details: string): string {
  const at = head === '' ? '' : ` at ${head.slice(0, STRANDED_HEAD_LENGTH)}`;
  return `${STRAND_TITLE_PREFIX}${branch}${at} — ${details}`;
}

/** The head a strand task's title names, or `null` when it names none. */
export function strandedHeadOf(title: string): string | null {
  return STRANDED_HEAD.exec(title)?.[1] ?? null;
}

/**
 * Close every open strand task of the project whose stranded head
 * `isLanded` confirms, and return the ones closed. Idempotent; a task that
 * names no head is never passed to `isLanded`.
 */
export function closeLandedStrandTasks(
  store: Store,
  projectId: string,
  isLanded: (head: string) => boolean,
  updatedAt: number,
): readonly ReconciledTask[] {
  const open = store.db
    .prepare(
      "SELECT id, title FROM tasks WHERE project_id = ? AND status IN ('queued','in_progress','needs_approval') AND title LIKE 'STRANDED SYNC-BACK:%' ORDER BY id",
    )
    .all(projectId) as ReconciledTask[];
  const closed: ReconciledTask[] = [];
  for (const task of open) {
    const head = strandedHeadOf(task.title);
    if (head === null || !isLanded(head)) continue;
    if (setTaskStatus(store, task.id, 'done', updatedAt)) closed.push(task);
  }
  return closed;
}
