// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `GET /api/versions?project=<id>` — one project's MYTH, LEGACY and flight
 * log (board ap-mui2h3s1-1, slice 2; the timeline is `read/versions.ts`).
 * Read-only, and on demand rather than polled: the read runs git.
 *
 * `{ versions: null }` means the dashboard does not know that project. A
 * thrown read answers 503. It must not answer with an empty timeline, because
 * an empty timeline means "never locked", and a restore screen that shows a
 * locked repo as never locked hides its restore floor.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-util.js';
import type { VersionsTimeline } from '../read/versions.js';

/** The project's timeline, or null when no project has that id. */
export type VersionsApi = (
  projectId: string,
) => VersionsTimeline | null | Promise<VersionsTimeline | null>;

export async function handleVersions(
  req: IncomingMessage,
  res: ServerResponse,
  api: VersionsApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'versions unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    send(200, { versions: await api(project) });
  } catch {
    send(503, { error: 'versions read failed' });
  }
}
