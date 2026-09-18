// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The COLLABORATION panel's combined endpoint (`GET /api/collaboration`,
 * BOARD web-mtpzqrxl-z7jgbu), mirroring `server/contributor-issue-list.ts`'s
 * `handleContributorIssueList` shape (a read-only preview, no execute pair).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-util.js';
import type { CollaborationApi } from '../flight/collaboration.js';

export type { CollaborationApi };

/**
 * The COLLABORATION panel's combined read (`GET /api/collaboration`).
 * Read-only — shells to `gh` fresh on every call rather than polling, the
 * same on-demand-not-cached rationale `handlePoolClient`/
 * `handleContributorIssueList` use. Degrades to `{ roadmap: [], helpWanted:
 * [] }` on a thrown read rather than surfacing a 500 — {@link
 * CollaborationApi} never rejects on its own, but the catch here still
 * degrades should a caller wire in an `api` that does throw, the same
 * defense-in-depth stance `handleContributorIssueList` takes. 404 only for
 * an unwired API.
 */
export async function handleCollaboration(
  req: IncomingMessage,
  res: ServerResponse,
  api: CollaborationApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'collaboration data unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  try {
    send(200, await api());
  } catch {
    send(200, { roadmap: [], helpWanted: [] });
  }
}
