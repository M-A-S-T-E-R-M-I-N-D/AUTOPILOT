// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * KEEPER triage ritual's HTTP wiring (BOARD web-mss50i9u-ldv513, "PLATFORM
 * 3/7" — the HTTP half; the pure decision core plus its own fetch/apply
 * wiring shipped first, in `issue-triage.ts`). Gathers {@link
 * runIssueTriageRitual}'s real inputs for a given project — its still-open
 * board tasks (`recentTasks`, the same "open" statuses `fly.ts`'s own
 * reconciliation sweep reads, widened to include `needs_approval` since a
 * proposal awaiting the operator's yes/no is still live work an incoming
 * issue could duplicate) and its backlog file's titles (onboarding's
 * `detectBacklogPath` + `backlog.ts`'s `parseBacklogTitles`, the same
 * best-effort read `fly.ts`'s own `readBacklogTitles` does) — then runs the
 * ritual through the injectable `CliExec` `connection/cli-probe.ts` uses.
 * Labeling/commenting/task-creation are visible to others, so this is
 * exposed over HTTP the same CSRF-guarded, rate-limited preview/execute pair
 * `release/execute.ts` + `server.ts`'s `handleReleaseExecute` use —
 * `GET /api/issue-triage` (preview: fetch + plan only, no `gh` mutation, no
 * store write) and `POST /api/issue-triage/execute` (the real run). The
 * dashboard UI panel/button that calls those endpoints lives in
 * `web/issue-triage-panel.ts` + `web/shell.ts`'s `issueTriageSection` —
 * closing the gap this file used to flag as deferred, the same way
 * `pr-review-panel.ts` closed it for KEEPER review.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, listProjects, recentTasks, type Store } from '@autopilot/store';
import { readFsSnapshot, detectBacklogPath } from '@autopilot/onboarding';
import { realCliExec, type CliExec } from '../connection/cli-probe.js';
import { parseBacklogTitles } from './backlog.js';
import {
  fetchOpenIssues,
  planIssueTriageBatch,
  runIssueTriageRitual,
  type ExistingTitle,
  type IssueTriagePlan,
  type IssueTriageRitualResult,
} from './issue-triage.js';

/** Statuses that count as "still open" dedup candidates — `queued`/
 *  `in_progress` (the same pair `fly.ts`'s reconciliation sweep treats as
 *  open) plus `needs_approval`: a self-mined proposal awaiting the
 *  operator's yes/no is still live work an incoming issue could duplicate. */
const OPEN_STATUSES = new Set(['queued', 'in_progress', 'needs_approval']);

/** Read-only: `projectId`'s still-open board tasks as dedup candidates for
 *  {@link planIssueTriage}. */
function openBoardTitles(store: Store, projectId: string): readonly ExistingTitle[] {
  return recentTasks(store.db, projectId)
    .filter((t) => OPEN_STATUSES.has(t.status))
    .map((t) => ({ id: t.id, title: t.title }));
}

/** Read-only: `rootPath`'s backlog file titles (onboarding's detected
 *  BACKLOG*.md/TODO.md), or `[]` when the project has none or it's
 *  unreadable — same best-effort stance `fly.ts`'s `readBacklogTitles` takes. */
function readProjectBacklogTitles(rootPath: string): readonly string[] {
  const backlogPath = detectBacklogPath(readFsSnapshot(rootPath));
  if (!backlogPath) return [];
  try {
    return parseBacklogTitles(readFileSync(join(rootPath, backlogPath), 'utf8'));
  } catch {
    return [];
  }
}

/** `null` means the project id is unknown — the same 404 convention
 *  `release/execute.ts`'s `ReleaseExecuteApi` uses. */
export type IssueTriagePreviewApi = (
  projectId: string,
) => Promise<readonly IssueTriagePlan[] | null>;

/** Build the KEEPER TRIAGE preview API against the real store + real `gh` —
 *  the production wiring `main.ts` injects into the server. Read-only: lists
 *  open issues and plans a decision for each, never labels/comments/creates
 *  a board task. */
export function createIssueTriagePreviewApi(
  dbPath: string,
  exec: CliExec = realCliExec,
): IssueTriagePreviewApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const issues = await fetchOpenIssues(exec);
      const boardTasks = openBoardTitles(store, projectId);
      const backlogTitles = readProjectBacklogTitles(project.root_path);
      return planIssueTriageBatch(issues, boardTasks, backlogTitles);
    } finally {
      store.close();
    }
  };
}

/** `null` means the project id is unknown — same convention as {@link
 *  IssueTriagePreviewApi}. */
export type IssueTriageExecuteApi = (projectId: string) => Promise<IssueTriageRitualResult | null>;

/** Build the KEEPER TRIAGE execute API against the real store + real `gh` —
 *  the production wiring `main.ts` injects into the server. */
export function createIssueTriageExecuteApi(
  dbPath: string,
  exec: CliExec = realCliExec,
): IssueTriageExecuteApi {
  return async (projectId) => {
    const store = openStore(dbPath);
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const boardTasks = openBoardTitles(store, projectId);
      const backlogTitles = readProjectBacklogTitles(project.root_path);
      return await runIssueTriageRitual(exec, store, projectId, boardTasks, backlogTitles);
    } finally {
      store.close();
    }
  };
}
