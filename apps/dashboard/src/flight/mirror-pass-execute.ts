// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MIRROR PASS reconcile ritual's read-only preview wiring (EPIC 0019 S3,
 * board `web-mtrh1hlh-62l41b` — VERDICT `ap-mtsg3nc0-3` slice (a): "the
 * smallest slice that turns 'pure planner' into 'something a firing can
 * actually run and see output from'"). `mirror-pass.ts` holds four
 * independent pure-planner derivations but composed none of them into a
 * runnable pass; this file composes derivations 1/4 and 2/4 —
 * {@link planMirrorPassBatch}'s reconcile ("board task done ⇒ close linked
 * issue with the landing SHA") and {@link planMirrorPassLandingNoteBatch}'s
 * landing-note dedup ("landed commits get landed-in comments" for a task
 * whose issue was already closed some other way) — both named directly by
 * `docs/epics/0019-github-steward.md`. The remaining two derivations
 * (version/counts/link drift, stale-claim reaper) and the mutating execute
 * path are each their own slice per the VERDICT's split — not attempted
 * here.
 *
 * Same shape as `issue-triage-execute.ts`'s `createIssueTriagePreviewApi`:
 * gather real inputs for a project (its `github-<n>` board tasks, each
 * paired with the most recent landing SHA `@autopilot/store`'s `metrics`
 * table recorded for it) and run them through the injectable `CliExec`
 * `connection/cli-probe.ts` uses. Read-only — never calls `gh` to change
 * anything, never writes to the store.
 */

import { openStore, listProjects, type Store } from '@autopilot/store';
import { realCliExec, type CliExec } from '../connection/cli-probe.js';
import {
  planMirrorPassBatch,
  fetchMirrorPassIssueStates,
  planMirrorPassLandingNoteBatch,
  fetchMirrorPassIssueComments,
  type MirrorPassTaskCandidate,
  type MirrorPassPlan,
  type MirrorPassLandingNotePlan,
} from './mirror-pass.js';

/** One `github-<n>` task row as the `tasks` table stores it — just enough
 *  to build a {@link MirrorPassTaskCandidate}; validated defensively same as
 *  every other raw-SQL row cast in this codebase. */
interface RawGithubTaskRow {
  readonly id: string;
  readonly status: string;
}

const TASK_STATUSES = new Set<MirrorPassTaskCandidate['status']>([
  'queued',
  'in_progress',
  'done',
  'needs_approval',
  'deferred',
]);

/** Read-only: every `github-<n>` task on `projectId`'s board, each paired
 *  with the most recent shipped landing SHA `metrics.item` recorded for it
 *  (see `mirror-pass.ts`'s {@link MirrorPassTaskCandidate} docstring) — the
 *  candidate pool {@link planMirrorPassBatch} reconciles against real issue
 *  state. A task whose status isn't one of {@link TASK_STATUSES} (schema
 *  drift, never expected on a migrated store) is dropped rather than passed
 *  through with a guessed status.
 */
function mirrorPassTaskCandidates(
  store: Store,
  projectId: string,
): readonly MirrorPassTaskCandidate[] {
  const rows = store.db
    .prepare("SELECT id, status FROM tasks WHERE project_id = ? AND id LIKE 'github-%'")
    .all(projectId) as RawGithubTaskRow[];
  const landedShaStmt = store.db.prepare(
    `SELECT sha FROM metrics
      WHERE project_id = ? AND item = ? AND shipped = 1 AND sha IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
  );
  return rows
    .filter((row): row is RawGithubTaskRow & { status: MirrorPassTaskCandidate['status'] } =>
      TASK_STATUSES.has(row.status as MirrorPassTaskCandidate['status']),
    )
    .map((row) => ({
      id: row.id,
      status: row.status,
      landedSha: (landedShaStmt.get(projectId, row.id) as { sha: string } | undefined)?.sha ?? null,
    }));
}

/** `null` means the project id is unknown — same convention as
 *  `issue-triage-execute.ts`'s `IssueTriagePreviewApi`. */
export type MirrorPassPreviewApi = (projectId: string) => Promise<readonly MirrorPassPlan[] | null>;

/**
 * Build the MIRROR PASS reconcile preview API against the real store + real
 * `gh` — the production wiring a caller (`main.ts`) injects into the
 * server. Read-only: fetches every `github-<n>` task's real issue state and
 * plans a reconcile finding for each, never posts a comment or changes an
 * issue's open/closed state.
 */
export function createMirrorPassPreviewApi(
  dbPath: string,
  exec: CliExec = realCliExec,
): MirrorPassPreviewApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const tasks = mirrorPassTaskCandidates(store, projectId);
      const issuesByNumber = await fetchMirrorPassIssueStates(exec, tasks);
      return planMirrorPassBatch(tasks, issuesByNumber);
    } finally {
      store.close();
    }
  };
}

/** `null` means the project id is unknown — same convention as
 *  {@link MirrorPassPreviewApi}. */
export type MirrorPassLandingNotePreviewApi = (
  projectId: string,
) => Promise<readonly MirrorPassLandingNotePlan[] | null>;

/**
 * Build the MIRROR PASS landing-note preview API (derivation 2/4) against
 * the real store + real `gh` — same production wiring as
 * {@link createMirrorPassPreviewApi}, composing
 * {@link planMirrorPassLandingNoteBatch} instead of {@link
 * planMirrorPassBatch}. Read-only: fetches every task's issue state, then —
 * only for the issues that actually need the check — their existing
 * comments, and never posts one itself.
 */
export function createMirrorPassLandingNotePreviewApi(
  dbPath: string,
  exec: CliExec = realCliExec,
): MirrorPassLandingNotePreviewApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const tasks = mirrorPassTaskCandidates(store, projectId);
      const issuesByNumber = await fetchMirrorPassIssueStates(exec, tasks);
      const commentsByIssueNumber = await fetchMirrorPassIssueComments(exec, tasks, issuesByNumber);
      return planMirrorPassLandingNoteBatch(tasks, issuesByNumber, commentsByIssueNumber);
    } finally {
      store.close();
    }
  };
}
