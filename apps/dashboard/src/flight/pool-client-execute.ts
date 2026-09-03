// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The pool client's HTTP wiring (BOARD web-mss50iaf-fckmbj, "PLATFORM 6/7" —
 * the HTTP half; the pure decision core plus its own fetch/apply wiring
 * shipped first, in `pool-client.ts`). Mirrors `pr-review-execute.ts`'s
 * shape: project-agnostic (a co-pilot claims for their own gh identity, not
 * a stored project's `root_path`), preview and execute both re-fetch the
 * open pool fresh via `gh` on every call rather than trusting anything
 * cached. The preview additionally resolves the caller's own gh identity
 * ({@link fetchViewerLogin}) so the browse list can show which issues are
 * actually claimable for THIS viewer, not just which are unclaimed. Claiming
 * is visible to others (an assignee + a comment land on the real upstream
 * issue), so it is exposed the same CSRF-guarded, rate-limited preview/
 * execute pair `pr-review-execute.ts` + `server.ts`'s `handlePrReviewExecute`
 * use — `GET /api/pool-client` (preview: fetch + plan only, no `gh`
 * mutation) and `POST /api/pool-client/execute` (the real claim). The
 * dashboard UI panel that calls those endpoints lives in
 * `web/pool-client-panel.ts` + `web/shell.ts`'s inline pool-client section,
 * the same split `pr-review-panel.ts` uses for KEEPER PR review.
 *
 * The "fly locally" leg's HTTP half (epic 0007 slice 6's remaining open
 * item): execute now accepts an optional `projectId` — when the caller picks
 * one of their own registered projects, {@link claimAndQueuePoolIssueTask}
 * also queues a `source: 'github'` board task there, the same `dbPath`-open/
 * `listProjects`-lookup/`store.close()` shape `issue-triage-execute.ts`'s
 * `createIssueTriageExecuteApi` uses. No `projectId` (or one that doesn't
 * resolve to a known project) falls back to a plain claim with
 * `taskQueued: false` — claiming the issue itself never depends on a valid
 * project id, only the local queue does.
 */

import { openStore, listProjects, type Store } from '@autopilot/store';
import { realCliExec, type CliExec } from '../connection/cli-probe.js';
import { fetchViewerLogin } from './pr-review.js';
import {
  fetchPoolIssues,
  planPoolBrowseBatch,
  claimPoolIssue,
  claimAndQueuePoolIssueTask,
  type PoolBrowseEntry,
  type ClaimAndQueuePoolIssueResult,
} from './pool-client.js';

/** The pool client's browse preview (injected; reads only, shells to `gh
 *  issue list` + `gh api user` on demand) — every open pool issue paired
 *  with the claim-or-skip decision for the caller's own gh identity. */
export type PoolClientPreviewApi = () => Promise<readonly PoolBrowseEntry[]>;

/** Build the pool client preview API against the real `gh` CLI — the
 *  production wiring `main.ts` injects into the server. Fetches the open
 *  pool and the caller's own gh identity in parallel, same shape {@link
 *  claimPoolIssue} composes for the write side. */
export function createPoolClientPreviewApi(exec: CliExec = realCliExec): PoolClientPreviewApi {
  return async () => {
    const [issues, claimant] = await Promise.all([fetchPoolIssues(exec), fetchViewerLogin(exec)]);
    return planPoolBrowseBatch(issues, claimant);
  };
}

/** The pool client claim action for one issue number, optionally also
 *  queuing a local board task on `projectId` (injected; assigns + comments
 *  via `gh` for a claimable issue — see `pool-client.ts`'s {@link
 *  claimPoolIssue}/{@link claimAndQueuePoolIssueTask}). Always resolves — an
 *  issue outside the open pool or an unresolved viewer identity both plan a
 *  `'skip'` with zero commands run rather than a 404, since {@link
 *  claimPoolIssue} is total over its inputs; `taskQueued` is `false` whenever
 *  no `projectId` was given, matching the "queueing is opt-in" contract. */
export type PoolClientExecuteApi = (
  issueNumber: number,
  projectId?: string,
) => Promise<ClaimAndQueuePoolIssueResult>;

/** Resolves `projectId` against the store at `dbPath`, `undefined` when it
 *  is missing or names no known project — the same `listProjects`-lookup
 *  `issue-triage-execute.ts`'s APIs use ahead of a project-scoped read/write. */
function resolveKnownProjectId(store: Store, projectId: string | undefined): string | undefined {
  if (projectId === undefined) return undefined;
  return listProjects(store.db).some((p) => p.id === projectId) ? projectId : undefined;
}

/** Build the pool client execute API against the real store + real `gh` CLI —
 *  the production wiring `main.ts` injects into the server. Opens the store
 *  only when a `projectId` was actually passed, so a plain claim (the common
 *  case today) never pays for a store open it doesn't need. */
export function createPoolClientExecuteApi(
  dbPath: string,
  exec: CliExec = realCliExec,
): PoolClientExecuteApi {
  return async (issueNumber, projectId) => {
    if (projectId === undefined) {
      const result = await claimPoolIssue(issueNumber, exec);
      return { ...result, taskQueued: false };
    }
    const store = openStore(dbPath);
    try {
      const knownProjectId = resolveKnownProjectId(store, projectId);
      if (knownProjectId === undefined) {
        const result = await claimPoolIssue(issueNumber, exec);
        return { ...result, taskQueued: false };
      }
      return await claimAndQueuePoolIssueTask(issueNumber, knownProjectId, exec, store);
    } finally {
      store.close();
    }
  };
}
