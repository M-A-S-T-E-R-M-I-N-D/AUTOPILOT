// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `GET /api/versions?project=<id>` — one project's MYTH, LEGACY and flight
 * log (board ap-mui2h3s1-1, slice 2; the timeline is `read/versions.ts`).
 * `GET /api/versions/diff?project=<id>&from=<sha>&to=<sha>` — what changed
 * between two of those versions (slice 3).
 * `POST /api/versions/restore` `{project, sha}` — the one write: creates a
 * new branch at `sha` in the project's repository (slice 5; the write is
 * `flight/version-restore.ts`, deliberately not this read-only module).
 * The two reads are on demand rather than polled: both run git.
 *
 * `{ versions: null }` means the dashboard does not know that project. A
 * thrown read answers 503. It must not answer with an empty timeline, because
 * an empty timeline means "never locked", and a restore screen that shows a
 * locked repo as never locked hides its restore floor.
 *
 * `{ diff: null }` means an unknown project or a diff git could not read. A
 * `from` or `to` that is not a full commit id is refused with 400 before any
 * reader runs.
 *
 * The restore endpoint is state-changing, so — same shape as
 * `/api/landing/execute` — it is a CSRF-guarded (`application/json`-only)
 * JSON POST, separately rate-limited, and reports a refused restore
 * (malformed sha, unknown version, git failure) via `ok:false` in a 409
 * rather than as a server error; 404 only for an unwired API or unknown
 * project, 400 only for a request shape git never even sees.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, readBody, MAX_BODY_BYTES, clientKey } from './http-util.js';
import { isCommitSha, type VersionDiff, type VersionsTimeline } from '../read/versions.js';
import type { RestoreOutcome } from '../flight/version-restore.js';
import type { RateLimiter } from './rate-limit.js';

/** The project's timeline, or null when no project has that id. */
export type VersionsApi = (
  projectId: string,
) => VersionsTimeline | null | Promise<VersionsTimeline | null>;

/** The diff between two of the project's versions, or null when it cannot be read. */
export type VersionDiffApi = (
  projectId: string,
  from: string,
  to: string,
) => VersionDiff | null | Promise<VersionDiff | null>;

/** Restores `sha` in the project it names — null when no project has that
 *  id, else the outcome (`ok:false` for a refused restore, never a throw for
 *  an ordinary refusal). */
export type VersionRestoreApi = (
  projectId: string,
  sha: string,
) => RestoreOutcome | null | Promise<RestoreOutcome | null>;

type Send = (status: number, body: unknown) => void;

/** The request's query once it is a GET naming a project; null after answering otherwise. */
function projectQuery(
  req: IncomingMessage,
  send: Send,
): { project: string; params: URLSearchParams } | null {
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return null;
  }
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const project = params.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return null;
  }
  return { project, params };
}

export async function handleVersions(
  req: IncomingMessage,
  res: ServerResponse,
  api: VersionsApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send: Send = (status, body) => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'versions unavailable' });
    return;
  }
  const query = projectQuery(req, send);
  if (query === null) return;
  try {
    send(200, { versions: await api(query.project) });
  } catch {
    send(503, { error: 'versions read failed' });
  }
}

export async function handleVersionDiff(
  req: IncomingMessage,
  res: ServerResponse,
  api: VersionDiffApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send: Send = (status, body) => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'version diff unavailable' });
    return;
  }
  const query = projectQuery(req, send);
  if (query === null) return;
  const from = query.params.get('from') ?? '';
  const to = query.params.get('to') ?? '';
  if (!isCommitSha(from) || !isCommitSha(to)) {
    send(400, { error: 'from and to must be full commit ids' });
    return;
  }
  try {
    send(200, { diff: await api(query.project, from, to) });
  } catch {
    send(503, { error: 'version diff read failed' });
  }
}

export async function handleVersionRestore(
  req: IncomingMessage,
  res: ServerResponse,
  api: VersionRestoreApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send: Send = (status, body) => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'version restore unavailable' });
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
    send(429, { error: 'Too many restore requests — slow down and try again shortly.' });
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
  let sha: string;
  try {
    const parsed = JSON.parse(raw) as { project?: unknown; sha?: unknown };
    project = String(parsed.project ?? '');
    sha = String(parsed.sha ?? '');
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  if (!isCommitSha(sha)) {
    send(400, { error: 'sha must be a full commit id' });
    return;
  }
  try {
    const result = await api(project, sha);
    if (result === null) {
      send(404, { error: 'unknown project' });
      return;
    }
    send(result.ok ? 200 : 409, { restore: result });
  } catch {
    send(503, { error: 'version restore failed' });
  }
}
