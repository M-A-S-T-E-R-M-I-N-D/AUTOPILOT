// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A CONVERGENCE RED IS THE FLEET'S NEXT TASK (2026-09-25).
 *
 * A convergence red used to be an alarm row and nothing else: fourteen in
 * three days (2026-09-22..24), each carried into the landing, which refused
 * it after twenty minutes of gate — a debrief citing unreachable commits, a
 * scan hung on stdin. Filed on the shared board at high severity, the next
 * free firing repairs it while the flight is still up.
 *
 * One open task per failing check and branch. A crash (no verdict) or a lane
 * that could not be fast-forwarded is not a red anyone can fix in code, so
 * neither is filed.
 */

import { createTask, type Store } from '@autopilot/store';

export interface ConvergenceRedTaskInput {
  readonly projectId: string;
  readonly targetBranch: string;
  readonly check: string;
  readonly mergeDetails: string;
  readonly outputTail?: string | undefined;
  readonly now: number;
}

/** The title a red files under — also the dedupe key. */
export function convergenceRedTaskTitle(check: string, targetBranch: string): string {
  return `CONVERGENCE RED: ${check} fails on ${targetBranch} — make it pass before landing`;
}

/** True for a red a firing can act on: a real verdict on the merged head. */
export function isFixableConvergenceRed(check: string): boolean {
  return !check.includes('(crashed') && !check.startsWith('lane fast-forward');
}

/** Characters of the failing command's output carried into the task body. */
const BODY_TAIL_CHARS = 2000;

/**
 * Files the task, unless the red is not fixable in code or an open task for
 * the same check already exists. Returns what happened, for the flight log.
 */
export function fileConvergenceRedTask(
  store: Store,
  input: ConvergenceRedTaskInput,
  warn?: (message: string) => void,
): 'filed' | 'already-open' | 'not-fixable' | 'refused' {
  if (!isFixableConvergenceRed(input.check)) return 'not-fixable';
  const title = convergenceRedTaskTitle(input.check, input.targetBranch);
  const open = store.db
    .prepare(
      `SELECT 1 FROM tasks WHERE project_id = ? AND title = ?
         AND status IN ('queued', 'in_progress', 'needs_approval')`,
    )
    .get(input.projectId, title);
  if (open !== undefined) return 'already-open';
  const tail = input.outputTail?.slice(-BODY_TAIL_CHARS);
  const filed = createTask(
    store,
    {
      id: `ap-${input.now.toString(36)}-convred`,
      projectId: input.projectId,
      title,
      body: tail ? `${input.mergeDetails}\n\n${tail}` : input.mergeDetails,
      severity: 'high',
      source: 'self',
      createdAt: input.now,
    },
    warn,
  );
  return filed ? 'filed' : 'refused';
}
