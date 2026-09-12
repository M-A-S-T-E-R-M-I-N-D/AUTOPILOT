// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * LANE HALF-STEP GUARD — the post-push verdict ritual's addendum (board
 * web-mtq2cubl-e5z0ae): a mid-flight push of the flight branch onto `main`
 * once shipped a lane's HALF-STEP — several slices of a multi-firing task
 * whose board row still read `in_progress`, synced back into the flight
 * branch by the sibling's own firings and then carried to `main` by a
 * landing that had no idea the unit was unfinished.
 *
 * The existing LANDING guards could not see it. `landing/overlap.ts` reads
 * GIT alone — sibling branches with unlanded commits — and once a lane's
 * commits are synced INTO the branch being landed they are no longer a
 * sibling's unlanded work, they are simply part of the diff. The board
 * (`tasks.status = 'in_progress'`) is the only place that still knows the
 * unit is open, and the store's own ship ledger (`metrics.item` + `sha` /
 * `head_after` / `commit_subject`, the same un-fakeable record SLICE-RELAY's
 * `shippedSlicesByTask` reads) is what ties those open tasks to specific
 * commits. This module joins the two against the landing diff:
 *
 *   in_progress task  ⨝  its shipped-slice commits  ⨝  commits ahead of base
 *
 * and names every open task whose slices this landing would carry — with
 * the files those slices touch, so the operator sees exactly which
 * half-step is about to ship. `detectLaneHalfSteps` is pure (no store, no
 * git) so the matching is unit-testable in isolation; `gatherLaneHalfSteps`
 * is the store-backed wrapper the LANDING preview (`read/project-detail.ts`)
 * and the landing ritual (`control/land-watchdog.ts`) both call.
 *
 * "Refuse (or warn loudly)": the automatic ritual REFUSES (there is no human
 * in that loop to warn, and an auto-land that ships a known half-step is
 * exactly the incident), the manual EXECUTE path WARNS via the preview — an
 * operator may knowingly land a half-step, a daemon may not. A stale
 * `in_progress` claim from a dead lane cannot wedge the ritual forever:
 * `releaseStaleClaims` (store `DEFAULT_STALE_CLAIM_MS`, 24h) returns such a
 * task to `queued`, and this guard only ever looks at `in_progress`.
 */

import type { CommitWithFiles } from '@autopilot/engine';
import type { Store } from '@autopilot/store';

/** A board task still open on a lane (or, `assignee: null`, moved to
 *  `in_progress` by an operator with no lane holding it). */
export interface InProgressLaneTask {
  readonly id: string;
  readonly title: string;
  readonly assignee: string | null;
}

/** One prior firing's ship record for a task — the `metrics` row's three
 *  commit identities: the self-reported METRICS `sha` (short), the engine-
 *  observed `head_after` (full), and the recorded `commit_subject`. Any one
 *  of them may be null on an old or partial row; matching tolerates that. */
export interface ShippedSliceRef {
  readonly taskId: string;
  readonly sha: string | null;
  readonly headAfter: string | null;
  readonly commitSubject: string | null;
}

/** One open task whose shipped slices sit in the landing diff. */
export interface LaneHalfStepWarning {
  readonly taskId: string;
  readonly title: string;
  readonly assignee: string | null;
  /** Short SHAs of the diff commits attributed to this task, diff order. */
  readonly commits: readonly string[];
  /** Every file those commits touch, de-duplicated, first-seen order. */
  readonly files: readonly string[];
}

/** Shortest SHA prefix a match may rest on — git's own abbreviation floor
 *  for `%h`, so a stored short SHA and a diff commit's short SHA compare
 *  prefix-wise in either direction without a 4-character coincidence ever
 *  counting. */
const MIN_SHA_PREFIX = 7;

function shaMatches(recorded: string | null, shortSha: string): boolean {
  if (recorded === null) return false;
  const a = recorded.trim().toLowerCase();
  const b = shortSha.trim().toLowerCase();
  if (a.length < MIN_SHA_PREFIX || b.length < MIN_SHA_PREFIX) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** Whether one diff commit belongs to `task`: its subject carries the task
 *  id (the `(<task-id>)` suffix / `(BOARD <task-id>)` marker board-linked
 *  commits are written with), or the store's ship ledger recorded it — by
 *  either SHA identity or the exact commit subject (SHAs change under a
 *  cherry-pick/reland; the subject survives). */
function commitBelongsToTask(
  commit: CommitWithFiles,
  task: InProgressLaneTask,
  slices: readonly ShippedSliceRef[],
): boolean {
  if (commit.subject.includes(task.id)) return true;
  return slices.some(
    (s) =>
      shaMatches(s.sha, commit.shortSha) ||
      shaMatches(s.headAfter, commit.shortSha) ||
      (s.commitSubject !== null && s.commitSubject !== '' && s.commitSubject === commit.subject),
  );
}

/**
 * Pure join: every `in_progress` task with at least one commit in
 * `diffCommits` (the commits this landing would carry into base), with the
 * matching commits and their files. Tasks with no commit in the diff are
 * simply absent — an open task whose slices already landed, or that has not
 * shipped anything yet, is not a half-step this landing would ship.
 */
export function detectLaneHalfSteps(
  diffCommits: readonly CommitWithFiles[],
  tasks: readonly InProgressLaneTask[],
  slices: readonly ShippedSliceRef[],
): readonly LaneHalfStepWarning[] {
  const warnings: LaneHalfStepWarning[] = [];
  for (const task of tasks) {
    const own = slices.filter((s) => s.taskId === task.id);
    const hits = diffCommits.filter((c) => commitBelongsToTask(c, task, own));
    if (hits.length === 0) continue;
    warnings.push({
      taskId: task.id,
      title: task.title,
      assignee: task.assignee,
      commits: hits.map((c) => c.shortSha),
      files: [...new Set(hits.flatMap((c) => c.files))],
    });
  }
  return warnings;
}

/** Every `in_progress` task of a project — lane-held or operator-moved. */
export function readInProgressLaneTasks(store: Store, projectId: string): InProgressLaneTask[] {
  return store.db
    .prepare(
      `SELECT id, title, assignee FROM tasks
        WHERE project_id = ? AND status = 'in_progress'
        ORDER BY updated_at DESC, id ASC`,
    )
    .all(projectId) as InProgressLaneTask[];
}

/** The ship ledger rows for `taskIds` — every shipped firing that claimed
 *  one of them as its METRICS item, oldest first (`id ASC`, the same
 *  insertion-order rule `shippedSlicesByTask` uses: same-millisecond firings
 *  can share a `created_at`). */
export function readShippedSlices(
  store: Store,
  projectId: string,
  taskIds: readonly string[],
): ShippedSliceRef[] {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => '?').join(', ');
  return store.db
    .prepare(
      `SELECT item AS taskId, sha, head_after AS headAfter, commit_subject AS commitSubject
         FROM metrics
        WHERE project_id = ? AND shipped = 1 AND item IN (${placeholders})
        ORDER BY id ASC`,
    )
    .all(projectId, ...taskIds) as ShippedSliceRef[];
}

/**
 * Store-backed {@link detectLaneHalfSteps}: reads the project's open tasks
 * and their ship ledger off `store` (which may be read-only — this never
 * writes) and joins them against `diffCommits`. Degrades to `[]` on any
 * store error, the same never-wedge-the-ritual posture `landing/overlap.ts`
 * takes: a guard that cannot read its evidence must not block a landing on
 * a guess, and the preview simply shows no warning rather than failing.
 */
export function gatherLaneHalfSteps(
  store: Store,
  projectId: string,
  diffCommits: readonly CommitWithFiles[],
): readonly LaneHalfStepWarning[] {
  if (diffCommits.length === 0) return [];
  try {
    const tasks = readInProgressLaneTasks(store, projectId);
    if (tasks.length === 0) return [];
    const slices = readShippedSlices(
      store,
      projectId,
      tasks.map((t) => t.id),
    );
    return detectLaneHalfSteps(diffCommits, tasks, slices);
  } catch {
    return [];
  }
}
