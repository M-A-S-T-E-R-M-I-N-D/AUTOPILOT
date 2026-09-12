// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The dashboard's CI-health surface (`GET /api/ci-status`, board
 * web-mtq70abw-opouz8): `control/ci-status.ts`'s per-workflow `gh run list`
 * report was CLI-only (`dashboard ci-status`) — this puts it where the
 * browser can see it, cached (see `createCiStatusApi`) rather than re-shelled
 * on every poll. Read-only, same on-demand `handleSocialIdentity`/
 * `handlePublicity` shape: never retries, cancels, or re-dispatches a run —
 * surfacing what needs a look is the entire job.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-util.js';
import type { CiStatusApi } from '../control/ci-status.js';

/**
 * The CI-health endpoint. Degrades to `{ workflows: [] }` on a thrown read
 * (the same "never crashes the dashboard" stance every other read endpoint
 * here takes) rather than a 500 — `createCiStatusApi` doesn't reject today,
 * but a caller wiring in a throwing `api` must still get a safe response.
 */
export async function handleCiStatus(
  req: IncomingMessage,
  res: ServerResponse,
  api: CiStatusApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'ci-status unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  try {
    send(200, { workflows: await api() });
  } catch {
    send(200, { workflows: [] });
  }
}
