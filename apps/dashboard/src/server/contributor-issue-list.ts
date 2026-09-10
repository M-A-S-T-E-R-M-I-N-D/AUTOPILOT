// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The CONTRIBUTOR JOURNEY issue list endpoint (`GET
 * /api/contributor-issues`, board web-mtt3hery-l8v0lf slice 1 of 4) — types
 * and handler, mirroring `server/pool-client.ts`'s `handlePublicity` shape
 * (a read-only preview, no execute pair): a visitor's live
 * good-first-issue/help-wanted pick list.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-util.js';
import type { ContributorIssueListPreviewApi } from '../flight/contributor-issue-list.js';

export type { ContributorIssueListPreviewApi };

/**
 * The contributor issue list read (`GET /api/contributor-issues`).
 * Read-only — shells to `gh` fresh on every call rather than polling, the
 * same on-demand-not-cached rationale `handlePoolClient`/`handlePublicity`
 * use. Degrades to `{ entries: [] }` on a thrown read (an unreachable/
 * unauthenticated `gh`) rather than surfacing a 500 — {@link
 * ContributorIssueListPreviewApi} never rejects on its own, but the catch
 * here still degrades should a caller wire in an `api` that does throw,
 * the same defense-in-depth stance `handlePublicity` takes. 404 only for
 * an unwired API.
 */
export async function handleContributorIssueList(
  req: IncomingMessage,
  res: ServerResponse,
  api: ContributorIssueListPreviewApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'contributor issue list unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  try {
    send(200, { entries: await api() });
  } catch {
    send(200, { entries: [] });
  }
}
