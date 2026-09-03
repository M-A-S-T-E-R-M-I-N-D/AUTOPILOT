// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The CONNECT popover's three GitHub write endpoints — sync (`POST
 * /api/github-sync/execute`), report-upstream issue (`POST
 * /api/github-issue/execute`), and contribute-upstream PR (`POST
 * /api/github-pr/execute`) — validation, CSRF guard, and all three handlers
 * (epic 0002 "shell decomposition" — split from `server.ts`, mirroring the
 * `ask.ts` extraction; the server shell wires each into its router with its
 * own rate limiter since each shells a distinct `gh`/`git` command).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RepoVisibility } from '@autopilot/engine';
import type { RateLimiter } from './rate-limit.js';
import { clientKey, sendJson, readBody, MAX_BODY_BYTES } from './http-util.js';
import type { GithubSyncExecuteResult } from '../github/execute.js';
import type { GithubIssueExecuteResult } from '../github/issue-execute.js';
import type { GithubPrExecuteResult } from '../github/pr-execute.js';

// Guards POST /api/github-sync/execute — heavier-than-a-quota-spend: a real
// `gh repo create`/`git push` per request, not just a read.
export const GITHUB_SYNC_RATE_LIMIT = 5;
export const GITHUB_SYNC_RATE_WINDOW_MS = 60_000;
// Guards POST /api/github-issue/execute — same heavier-than-a-quota-spend
// reasoning as GITHUB_SYNC's limiter: a real `gh issue create` per request.
export const GITHUB_ISSUE_RATE_LIMIT = 5;
export const GITHUB_ISSUE_RATE_WINDOW_MS = 60_000;
// Guards POST /api/github-pr/execute — same heavier-than-a-quota-spend
// reasoning as GITHUB_ISSUE's limiter: a real `gh repo fork`/`git push`/`gh
// pr create` sequence per request, not just a read.
export const GITHUB_PR_RATE_LIMIT = 5;
export const GITHUB_PR_RATE_WINDOW_MS = 60_000;

/** The project page's "Sync to GitHub" EXECUTE action (injected; runs a real
 *  `gh repo create --source --push` or re-sync `git push` — see
 *  `github/execute.ts`). `null` means an unknown project id. */
export type GithubSyncExecuteApi = (
  projectId: string,
  visibility: RepoVisibility,
) => Promise<GithubSyncExecuteResult | null>;

/** The CONNECT popover's "report to upstream" EXECUTE action (injected; runs
 *  a real `gh issue create --repo <upstream>` against the operator's own
 *  authenticated `gh` — see `github/issue-execute.ts`). Operator-global, not
 *  project-scoped — unlike {@link GithubSyncExecuteApi} it never resolves
 *  `null` for an unknown id, because there is no project id. */
export type GithubIssueExecuteApi = (
  title: string,
  body: string,
) => Promise<GithubIssueExecuteResult>;

/** The CONNECT popover's "contribute upstream" EXECUTE action (injected;
 *  forks the upstream repo, pushes the project's current branch, then runs
 *  `gh pr create` against the operator's own authenticated `gh` — see
 *  `github/pr-execute.ts`). `null` means an unknown project id, same
 *  convention as {@link GithubSyncExecuteApi}. `issueNumber` is the epic
 *  0007 pool-client round trip's delivery leg — see `handleGithubPrExecute`. */
export type GithubPrExecuteApi = (
  projectId: string,
  title: string,
  body: string,
  issueNumber?: number,
) => Promise<GithubPrExecuteResult | null>;

/**
 * The GITHUB SYNC EXECUTE endpoint (`POST /api/github-sync/execute`, body
 * `{project, visibility?}`). State-changing — runs a real `gh repo create
 * --source --push` (first sync) or `git push` (re-sync) against the
 * operator's own authenticated `gh`/`git` — so it is a CSRF-guarded JSON
 * POST like every other write, and separately rate-limited (same
 * heavier-than-a-quota-spend reasoning as `handleReleaseExecute`). `visibility`
 * defaults to `'private'` when omitted — the project page's default action —
 * and is otherwise validated strictly against `'private' | 'public'` (400 on
 * anything else) rather than passed through unchecked: `'public'` is the
 * epic's confirm-guarded second choice, so a malformed value must never
 * silently fall through to a public repo. A failed command is not a server
 * error: it is reported via `ok`/`details` (409, same "refused vs succeeded"
 * convention as release execute). 404 only for an unknown project or an
 * unwired API.
 */
export async function handleGithubSyncExecute(
  req: IncomingMessage,
  res: ServerResponse,
  api: GithubSyncExecuteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'github sync execute unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many GitHub sync requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let project: string;
  let visibility: RepoVisibility;
  try {
    const parsed = JSON.parse(raw) as { project?: unknown; visibility?: unknown };
    project = String(parsed.project ?? '');
    if (parsed.visibility === undefined) {
      visibility = 'private';
    } else if (parsed.visibility === 'private' || parsed.visibility === 'public') {
      visibility = parsed.visibility;
    } else {
      send(400, { error: 'visibility must be "private" or "public"' });
      return;
    }
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    const result = await api(project, visibility);
    if (!result) {
      send(404, { error: 'unknown project' });
      return;
    }
    send(result.ok ? 200 : 409, result);
  } catch (error) {
    send(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'github sync execute failed',
    });
  }
}

/**
 * The CONNECT popover's "report to upstream" EXECUTE endpoint (`POST
 * /api/github-issue/execute`, body `{title, body?}`). State-changing — runs
 * a real `gh issue create --repo <upstream>` against the operator's own
 * authenticated `gh` — so it is a CSRF-guarded JSON POST like every other
 * write, and separately rate-limited (same heavier-than-a-quota-spend
 * reasoning as `handleGithubSyncExecute`). `title` is required (400 when
 * empty/missing/non-string) since `gh issue create` refuses an empty title;
 * `body` defaults to `''` when omitted. A failed command is not a server
 * error: it is reported via `ok`/`details` (409, same "refused vs succeeded"
 * convention as github sync execute). 404 only for an unwired API.
 */
export async function handleGithubIssueExecute(
  req: IncomingMessage,
  res: ServerResponse,
  api: GithubIssueExecuteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'github issue execute unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many GitHub issue requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let title: string;
  let body: string;
  try {
    const parsed = JSON.parse(raw) as { title?: unknown; body?: unknown };
    title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    body = typeof parsed.body === 'string' ? parsed.body : '';
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (title.length === 0) {
    send(400, { error: 'a non-empty title is required' });
    return;
  }
  try {
    const result = await api(title, body);
    send(result.ok ? 200 : 409, result);
  } catch (error) {
    send(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'github issue execute failed',
    });
  }
}

/**
 * The CONNECT popover's "contribute upstream" EXECUTE endpoint (`POST
 * /api/github-pr/execute`, body `{project, title, body?, issueNumber?}`).
 * State-changing — forks the upstream repo, pushes the project's current
 * branch, then runs `gh pr create` against the operator's own authenticated
 * `gh` — so it is a CSRF-guarded JSON POST like every other write, and
 * separately rate-limited (same heavier-than-a-quota-spend reasoning as
 * `handleGithubIssueExecute`). `title` is required (400 when
 * empty/missing/non-string), same as github issue execute; `body` defaults
 * to `''` when omitted. `issueNumber` is the epic 0007 pool-client round
 * trip's delivery leg — optional, but when present must be a positive
 * integer (400 otherwise) since it becomes a `Closes #<n>` trailer on the
 * PR body (`packages/engine`'s `planGithubPr`). A failed command is not a
 * server error: it is reported via `ok`/`details` (409, same "refused vs
 * succeeded" convention as the other GitHub execute endpoints). 404 for an
 * unknown project or an unwired API.
 */
export async function handleGithubPrExecute(
  req: IncomingMessage,
  res: ServerResponse,
  api: GithubPrExecuteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'github pr execute unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many GitHub PR requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let project: string;
  let title: string;
  let body: string;
  let issueNumber: number | undefined;
  try {
    const parsed = JSON.parse(raw) as {
      project?: unknown;
      title?: unknown;
      body?: unknown;
      issueNumber?: unknown;
    };
    project = String(parsed.project ?? '');
    title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    body = typeof parsed.body === 'string' ? parsed.body : '';
    issueNumber = typeof parsed.issueNumber === 'number' ? parsed.issueNumber : undefined;
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  if (title.length === 0) {
    send(400, { error: 'a non-empty title is required' });
    return;
  }
  if (issueNumber !== undefined && (!Number.isInteger(issueNumber) || issueNumber <= 0)) {
    send(400, { error: 'issueNumber must be a positive integer' });
    return;
  }
  try {
    const result = await api(project, title, body, issueNumber);
    if (!result) {
      send(404, { error: 'unknown project' });
      return;
    }
    send(result.ok ? 200 : 409, result);
  } catch (error) {
    send(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'github pr execute failed',
    });
  }
}
