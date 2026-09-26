// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `GET /api/versions?project=<id>` — one project's MYTH, LEGACY and flight
 * log (board ap-mui2h3s1-1, slice 2; the timeline is `read/versions.ts`).
 * `GET /api/versions/diff?project=<id>&from=<sha>&to=<sha>` — what changed
 * between two of those versions (slice 3).
 * Read-only, and on demand rather than polled: both reads run git.
 *
 * `{ versions: null }` means the dashboard does not know that project. A
 * thrown read answers 503. It must not answer with an empty timeline, because
 * an empty timeline means "never locked", and a restore screen that shows a
 * locked repo as never locked hides its restore floor.
 *
 * `{ diff: null }` means an unknown project or a diff git could not read. A
 * `from` or `to` that is not a full commit id is refused with 400 before any
 * reader runs.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-util.js';
import { isCommitSha, type VersionDiff, type VersionsTimeline } from '../read/versions.js';

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
