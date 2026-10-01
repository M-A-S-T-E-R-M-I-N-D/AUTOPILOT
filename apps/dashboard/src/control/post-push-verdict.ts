// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * POST-PUSH VERDICT RITUAL, slice 1 (operator ask 2026-09-06, board
 * web-mtpbmay4-94ii65; docs/ROADMAP.md "Now flying" #3): the harness
 * currently only READS CI status to decide whether it's safe to land
 * (`landing/execute.ts`'s pre-land e2e guard, via `ci-status.ts`). Nothing
 * yet watches what happens to CI AFTER a landing — a red run just sits
 * there until a human notices. This slice is the pure decision at the
 * center of that ritual: given the post-land CI conclusion for the branch
 * just landed, either record success or produce the evidence task a red
 * conclusion must file. Wiring this into the actual post-land polling loop
 * (where/when to re-check `gh run list` until the run concludes) is
 * deliberately deferred to a follow-up slice — that needs a live timing
 * design (poll cadence, timeout, which workflow(s) to watch), not just a
 * decision function, and doing both in one firing risks neither being safe.
 *
 * Escalation-mode follow-up (board web-mtpbmazh-3en467): filing the evidence
 * task above is the `'board'` mode — a human still has to pick it up. `'fly'`
 * mode (below) additionally spawns a single-lane fix firing scoped to that
 * SAME task via `AUTOPILOT_FLEET_TASK_SCOPE`, reusing `flight-watchdog.ts`'s
 * own idle-folder gate so it can never overlap a flight already running
 * against the target. The decision stays pure here for the same reason
 * slice 1's does; `post-push-watch.ts`'s trigger is what actually reads the
 * project's live status and calls the real `spawnFlight`.
 */

import type { WorkflowRunStatus } from './ci-status.js';
import {
  createTask,
  setTaskStatus,
  type CreateTaskInput,
  type ProjectRow,
  type Store,
} from '@autopilot/store';
import { FLYABLE_STATUSES } from './flight-watchdog.js';

export interface PostPushVerdictContext {
  readonly projectId: string;
  /** The branch that was just landed to (the base branch, e.g. `main`). */
  readonly branch: string;
  /** Short or full SHA of the commit that landed — included in the filed
   *  task's title so the operator knows exactly which landing went red. */
  readonly sha: string;
}

export type PostPushVerdictResult =
  | { readonly kind: 'recorded'; readonly workflow: string; readonly detail: string }
  | { readonly kind: 'remediate'; readonly branch: string; readonly task: CreateTaskInput };

/** Title prefix `filePostPushVerdictTask` dedups on, scoped to the branch —
 *  a second red conclusion for the SAME branch while the first evidence task
 *  is still open must not stack a duplicate; a red on a DIFFERENT branch is
 *  a distinct incident and gets its own task. */
function titlePrefix(branch: string): string {
  return `CI RED after landing ${branch} →`;
}

/**
 * The post-push verdict for one workflow's CI conclusion: green (or any
 * non-failing conclusion — `status.ok`) is simply recorded, a failing
 * conclusion produces the `CreateTaskInput` for an evidence-rich remediation
 * task. Pure — never touches the store or the network itself, so it's
 * trivially unit-testable against a fabricated `WorkflowRunStatus`.
 */
export function decidePostPushVerdict(
  status: WorkflowRunStatus,
  context: PostPushVerdictContext,
  nowMs: number = Date.now(),
): PostPushVerdictResult {
  if (status.ok) {
    return { kind: 'recorded', workflow: status.workflow, detail: status.detail };
  }
  const shortSha = context.sha.slice(0, 7);
  const title =
    `${titlePrefix(context.branch)} ${shortSha}: ${status.workflow} — ${status.detail}`.slice(
      0,
      300,
    );
  return {
    kind: 'remediate',
    branch: context.branch,
    task: {
      id: `ap-${nowMs.toString(36)}-ci-red`,
      projectId: context.projectId,
      title,
      body: `Post-push verdict ritual: landing ${shortSha} onto ${context.branch} came back red on ${status.workflow} (${status.detail}). Filed automatically — no auto-remediation attempted yet. This task closes by itself once a later landing onto ${context.branch} comes back green.`,
      severity: 'high',
      // No `dimension` value in the schema's allow-list (accessibility /
      // cybersecurity / ux / human_interaction / learnings / information /
      // data / priorities — `packages/store/src/schema.ts`) actually fits a
      // CI-red finding, and `dimension` is nullable — omitted rather than
      // forced into an ill-fitting bucket or a value the CHECK constraint
      // would silently reject (see the PROPOSALS note on fly.ts's own
      // `dimension: 'process'`, which hits exactly that silent rejection).
      source: 'self',
      createdAt: nowMs,
    },
  };
}

/**
 * Files the evidence task for a `remediate` verdict — a no-op (`false`,
 * never throws) for a `recorded` verdict, when the project already has an
 * open evidence task for the SAME branch (dedup, mirrors `fly.ts`'s
 * STRANDED SYNC-BACK escalation), or if the write itself fails. Best-effort
 * by design: a post-push verdict must never be the thing that crashes the
 * ritual watching it.
 */
export function filePostPushVerdictTask(store: Store, verdict: PostPushVerdictResult): boolean {
  if (verdict.kind !== 'remediate') return false;
  try {
    const open = store.db
      .prepare(
        "SELECT COUNT(*) c FROM tasks WHERE project_id = ? AND status IN ('queued','in_progress','needs_approval') AND title LIKE ?",
      )
      .get(verdict.task.projectId, `${titlePrefix(verdict.branch)}%`) as {
      c: number;
    };
    if (open.c > 0) return false;
    return createTask(store, verdict.task);
  } catch {
    return false;
  }
}

/**
 * A GREEN LANDING CLOSES THE RED IT OUTLIVED (2026-09-30): the watch filed
 * a CI-red task and nothing ever closed it. `ap-muno081m-ci-red` named
 * eb525b6's red e2e run (stale project-page baselines); dee8eb32 re-captured
 * them and four landings came back green, yet the task held the top of the
 * board for ten hours — the seventh stale red a firing had to refute by hand.
 *
 * A `success` run on the same branch, created after the red task was filed,
 * now closes it: the branch only moves forward (no force-push), so a push
 * made after the red was known contains the red commit, and its green run is
 * the proof the failure no longer reproduces. A run created before the filing
 * (an earlier landing's run concluding late) proves nothing about the red,
 * and neither does a skipped or neutral one, or a green run of another
 * workflow. The branch matches literally (`instr`, not `LIKE`: an `_` in a
 * branch name is no wildcard here). A red {@link holdSupersededCiRedTasks}
 * holds (`deferred`) closes the same way. Returns how many it closed;
 * best-effort like the filing, never throws.
 */
export function closeSupersededCiRedTasks(
  store: Store,
  projectId: string,
  branch: string,
  status: WorkflowRunStatus,
  nowMs: number,
): number {
  if (status.conclusion !== 'success' || status.createdAtMs === null) return 0;
  try {
    const prefix = `${titlePrefix(branch)} `;
    const workflow = `: ${status.workflow} — `;
    const open = store.db
      .prepare(
        `SELECT id FROM tasks
          WHERE project_id = ? AND status IN ('queued','in_progress','needs_approval','deferred')
            AND instr(title, ?) = 1 AND instr(title, ?) > 0 AND created_at < ?`,
      )
      .all(projectId, prefix, workflow, status.createdAtMs) as { id: string }[];
    return open.filter((t) => setTaskStatus(store, t.id, 'done', nowMs)).length;
  } catch {
    return 0;
  }
}

/** The title start that names one landing's red: `CI RED after landing
 *  <branch> → <short sha>:`. */
function ownTitlePrefix(branch: string, sha: string): string {
  return `${titlePrefix(branch)} ${sha.slice(0, 7)}:`;
}

/**
 * A NEWER LANDING HOLDS THE RED IT IS ABOUT TO RE-JUDGE (2026-10-01): the
 * green close above arrives only when the next landing's run concludes,
 * ten to twenty minutes after its push — and the fleet launches the moment
 * the landing returns. Round 52's fleet-4 claimed `ap-muostm93-ci-red`
 * (022a827's stale baseline red) two minutes after 220199f8 was pushed,
 * refuted it, and its second firing claimed it again: $2.16 and a whole lane
 * on a red the run in flight closed at minute 26.
 *
 * So the moment a landing onto `branch` is pushed, every workable CI-red task
 * for that branch that names an OLDER commit is deferred — out of every pick
 * queue, the reason appended to its body — until that landing's run rules:
 * green closes it ({@link closeSupersededCiRedTasks} reads deferred rows
 * too), red files the fresh evidence task and retires the held one
 * ({@link retireHeldCiRedTasks}), and a timed-out watch leaves it held for
 * the next landing. A task naming this very commit is left alone: it IS
 * this landing's verdict. Returns how many it held; never throws.
 */
export function holdSupersededCiRedTasks(
  store: Store,
  projectId: string,
  branch: string,
  sha: string,
  nowMs: number,
): number {
  try {
    const open = store.db
      .prepare(
        `SELECT id FROM tasks
          WHERE project_id = ? AND status IN ('queued','in_progress')
            AND instr(title, ?) = 1 AND instr(title, ?) = 0`,
      )
      .all(projectId, `${titlePrefix(branch)} `, ownTitlePrefix(branch, sha)) as {
      id: string;
    }[];
    const note = store.db.prepare(`UPDATE tasks SET body = COALESCE(body, '') || ? WHERE id = ?`);
    let held = 0;
    for (const t of open) {
      if (!setTaskStatus(store, t.id, 'deferred', nowMs)) continue;
      note.run(
        `\n\nHeld: landing ${sha.slice(0, 7)} onto ${branch} was pushed after this red; its run rules on it — green closes this task, red files a fresh one.`,
        t.id,
      );
      held += 1;
    }
    return held;
  } catch {
    return 0;
  }
}

/**
 * A red conclusion retires the reds this landing held: the task just filed
 * for THIS commit (or the one still open that deduped it) is the live
 * evidence now, and an older held red would only send a lane to a commit
 * the branch has already moved past. Returns how many it retired; never
 * throws.
 */
export function retireHeldCiRedTasks(
  store: Store,
  projectId: string,
  branch: string,
  sha: string,
  nowMs: number,
): number {
  try {
    const held = store.db
      .prepare(
        `SELECT id FROM tasks
          WHERE project_id = ? AND status = 'deferred'
            AND instr(title, ?) = 1 AND instr(title, ?) = 0`,
      )
      .all(projectId, `${titlePrefix(branch)} `, ownTitlePrefix(branch, sha)) as {
      id: string;
    }[];
    return held.filter((t) => setTaskStatus(store, t.id, 'done', nowMs)).length;
  } catch {
    return 0;
  }
}

/**
 * `AUTOPILOT_CI_REMEDIATION` escalation mode (slice 2 follow-up, board
 * web-mtpbmazh-3en467): `'board'` (default) only files the evidence task
 * above; `'fly'` additionally launches a single-lane fix firing scoped to
 * that task. Any other or unset value falls back to `'board'` — fail
 * closed, so a typo'd env var can never surprise-launch a flight.
 */
export type CiRemediationMode = 'board' | 'fly';

export function ciRemediationMode(env: NodeJS.ProcessEnv = process.env): CiRemediationMode {
  return env['AUTOPILOT_CI_REMEDIATION'] === 'fly' ? 'fly' : 'board';
}

/**
 * Whether a filed remediation task should ALSO spawn a single-lane fix
 * flight: only in `'fly'` mode, only when a NEW task was actually just filed
 * (`taskFiled` — a dedup no-op means there is nothing new to fix, see
 * `filePostPushVerdictTask`'s own dedup above), and only when the target
 * folder is idle — the SAME `FLYABLE_STATUSES` gate `flight-watchdog.ts`
 * uses to decide "safe to (re)launch", so an auto-remediation flight can
 * never overlap one already running against that folder (a project mid-
 * flight reports `'flying'`, never a flyable status).
 */
export function shouldSpawnRemediationFlight(
  mode: CiRemediationMode,
  taskFiled: boolean,
  projectStatus: ProjectRow['status'] | null,
): boolean {
  return mode === 'fly' && taskFiled && FLYABLE_STATUSES.has(projectStatus);
}
