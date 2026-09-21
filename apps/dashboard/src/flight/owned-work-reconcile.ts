// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0033 slice 1 INGEST (docs/epics/0033-owned-work.md §3): the missing
 * edge between a GitHub-side claim and the board. `flight/pool-client.ts`'s
 * `claimAndQueuePoolIssueTask` already does this correctly for its own claim
 * path (the dashboard's Contributor-pool panel); this reconciler covers the
 * path the epic measured as silent — `/claim` (`.github/workflows/claim.yml`)
 * and a maintainer assigning an issue to the operator directly write GitHub
 * state and nothing else. `gh issue list --assignee @me` is the only source
 * of truth GitHub gives for "assigned to me", and nothing read it.
 *
 * {@link fetchAssignedIssues} is the read (same injectable `CliExec` every
 * other fetcher in this directory uses); {@link planOwnedWorkReconcile} is
 * the pure core — upsert a `claim-contract.ts`-marked board task at the
 * existing content-addressed {@link issueTaskId} for every newly-assigned
 * issue (idempotent: re-running an already-ingested issue changes nothing),
 * refocus one whose task exists but lost focus some other way, and release
 * (un-focus, never delete) one GitHub no longer says is assigned to the
 * operator — the reverse edge the epic calls "equally required". The
 * contract marker stays on a released task: the fleet must still never
 * auto-close an issue it once saw claimed (out of scope §12), only stop
 * treating it as focused, public-first work.
 *
 * {@link reconcileOwnedWork} composes fetch + plan with the actual
 * `createTask`/`setTaskFocus` writes, the same "pure core, then a ritual
 * that applies it" shape `issue-triage.ts`'s `runIssueTriageRitual` uses.
 * HTTP/cadence wiring (a preview/execute pair, the OWNED WORK section and
 * masthead count of slice 2) is deliberately deferred — this ships the
 * reconcile itself as a correct, independently-testable unit first.
 */

import { createTask, setTaskFocus, type CreateTaskInput, type Store } from '@autopilot/store';
import type { CliExec } from '../connection/cli-probe.js';
import { issueTaskId } from './issue-triage.js';
import { issueNumberFromTaskId } from './mirror-pass.js';
import { claimContractBody, isHumanClosedTask } from './claim-contract.js';
import { fetchViewerLogin } from './pr-review.js';

/** One open issue GitHub reports as assigned to the viewer — the subset
 *  `gh issue list --assignee @me --json number,title,url` emits. */
export interface AssignedIssue {
  readonly number: number;
  readonly title: string;
  readonly url: string;
}

/** `gh issue list` entries — untrusted process output, parsed defensively
 *  rather than trusted as already shaped like {@link AssignedIssue}. */
interface RawAssignedIssue {
  readonly number?: unknown;
  readonly title?: unknown;
  readonly url?: unknown;
}

/** A task board needs a bounded title; capped defensively the same way
 *  `issue-triage.ts`'s `ISSUE_TASK_TITLE_CHARS` bounds its own. */
const OWNED_WORK_TITLE_CHARS = 200;

/**
 * Lists every open issue GitHub says is assigned to the calling identity via
 * `gh issue list --assignee @me`, run through the injectable `exec` — the
 * same `CliExec` shape every other fetcher in this directory uses
 * (`contributor-issue-list.ts`'s `fetchContributorFacingIssues`,
 * `issue-triage.ts`'s `fetchOpenIssues`). Returns `[]` on a non-zero exit or
 * unparseable/non-array stdout rather than throwing. Entries missing a
 * numeric `number`, string `title`, or string `url` are dropped rather than
 * passed through malformed.
 */
export async function fetchAssignedIssues(exec: CliExec): Promise<AssignedIssue[]> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'list',
    '--assignee',
    '@me',
    '--state',
    'open',
    '--json',
    'number,title,url',
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as RawAssignedIssue[])
    .filter(
      (raw) =>
        typeof raw.number === 'number' &&
        typeof raw.title === 'string' &&
        typeof raw.url === 'string',
    )
    .map((raw) => ({
      number: raw.number as number,
      title: raw.title as string,
      url: raw.url as string,
    }));
}

/** The subset of a board task {@link planOwnedWorkReconcile} needs —
 *  `@autopilot/store`'s `recentTasks` row (`TaskSummaryRow`), narrowed to
 *  the fields the decision actually reads. */
export interface OwnedWorkBoardTask {
  readonly id: string;
  readonly body: string | null;
  readonly focus: number;
  readonly status: string;
}

/** A task in either of these statuses is settled — never re-focused by this
 *  reconcile, matching `mutate.ts`'s `setTaskFocus` guard, which already
 *  refuses to force focus back onto a closed task. */
const CLOSED_STATUSES = new Set(['done', 'deferred']);

/** {@link planOwnedWorkReconcile}'s outcome: writes for a caller to apply,
 *  never applied here — pure. */
export interface OwnedWorkReconcilePlan {
  /** New board tasks for an issue newly assigned to the operator, with no
   *  existing row at its content-addressed {@link issueTaskId} yet. */
  readonly upserts: readonly CreateTaskInput[];
  /** Existing tasks that need FOCUS (re)asserted — already on the board for
   *  a still-assigned issue but not currently focused (e.g. a KEEPER-triaged
   *  task the operator was later assigned on GitHub). */
  readonly refocus: readonly string[];
  /** Existing contract-marked, focused tasks GitHub no longer says are
   *  assigned to the operator — the reverse edge. Un-focused, never
   *  deleted: work already done against it stays visible, and the contract
   *  marker stays too, so the fleet still never closes it unilaterally. */
  readonly release: readonly string[];
}

/**
 * The reconcile's pure decision core (docs/epics/0033-owned-work.md §3).
 * Idempotent by construction: an issue already carrying its {@link
 * issueTaskId} task neither re-creates nor re-bodies it — only a
 * missing-focus task gets `refocus` — so a second call against unchanged
 * inputs plans nothing at all (the section's "a second pass changes
 * nothing" acceptance criterion). `release` only ever names a task whose id
 * parses as a GitHub issue task ({@link issueNumberFromTaskId}) and that
 * still carries the claim contract marker — a dashboard/self/inbox/backlog
 * task is never a candidate no matter its focus state.
 */
export function planOwnedWorkReconcile(
  assigned: readonly AssignedIssue[],
  existingTasks: readonly OwnedWorkBoardTask[],
  claimant: string,
  projectId: string,
  now: number,
): OwnedWorkReconcilePlan {
  const existingById = new Map(existingTasks.map((t) => [t.id, t]));
  const assignedIds = new Set(assigned.map((issue) => issueTaskId(issue.number)));

  const upserts: CreateTaskInput[] = [];
  const refocus: string[] = [];
  for (const issue of assigned) {
    const id = issueTaskId(issue.number);
    const existing = existingById.get(id);
    if (!existing) {
      upserts.push({
        id,
        projectId,
        title: issue.title.slice(0, OWNED_WORK_TITLE_CHARS),
        body: claimContractBody(issue.number, issue.url, { claimant }),
        source: 'github',
        createdAt: now,
      });
    } else if (existing.focus === 0 && !CLOSED_STATUSES.has(existing.status)) {
      refocus.push(id);
    }
  }

  const release: string[] = [];
  for (const task of existingTasks) {
    if (task.focus === 0) continue;
    if (issueNumberFromTaskId(task.id) === null) continue;
    if (!isHumanClosedTask(task)) continue;
    if (assignedIds.has(task.id)) continue;
    release.push(task.id);
  }

  return { upserts, refocus, release };
}

/** One {@link reconcileOwnedWork} pass's outcome — how many writes of each
 *  kind actually landed, for a caller to log/report. */
export interface OwnedWorkReconcileResult {
  readonly plan: OwnedWorkReconcilePlan;
  readonly created: number;
  readonly focused: number;
  readonly released: number;
}

const EMPTY_PLAN: OwnedWorkReconcilePlan = { upserts: [], refocus: [], release: [] };

/**
 * Composes {@link fetchAssignedIssues} + `pr-review.ts`'s `fetchViewerLogin`
 * + {@link planOwnedWorkReconcile} with the actual `createTask`/
 * `setTaskFocus` writes — the same "pure core, then a ritual that applies
 * it" shape `issue-triage.ts`'s `runIssueTriageRitual` uses. When the
 * viewer's login can't be resolved (`gh` unauthenticated), plans and writes
 * nothing rather than guessing a claimant — the claim contract exists to
 * name who holds it.
 */
export async function reconcileOwnedWork(
  exec: CliExec,
  store: Store,
  projectId: string,
  existingTasks: readonly OwnedWorkBoardTask[],
  now: () => number = Date.now,
): Promise<OwnedWorkReconcileResult> {
  const claimant = await fetchViewerLogin(exec);
  if (!claimant) {
    return { plan: EMPTY_PLAN, created: 0, focused: 0, released: 0 };
  }

  const assigned = await fetchAssignedIssues(exec);
  const plan = planOwnedWorkReconcile(assigned, existingTasks, claimant, projectId, now());

  let created = 0;
  for (const input of plan.upserts) {
    if (createTask(store, input)) {
      created += 1;
      setTaskFocus(store, input.id, true, now());
    }
  }

  let focused = 0;
  for (const id of plan.refocus) {
    if (setTaskFocus(store, id, true, now())) focused += 1;
  }

  let released = 0;
  for (const id of plan.release) {
    if (setTaskFocus(store, id, false, now())) released += 1;
  }

  return { plan, created, focused, released };
}
