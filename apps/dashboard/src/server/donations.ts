// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The `GET /api/donations` read (FOUNDATION 1/3, board web-mtq0rsit-ywz1m7) —
 * wraps `flight/donations.ts`'s `DonationsPreviewApi` the same way
 * `pool-client.ts`'s `handlePublicity` wraps `PublicityApi`: 404 when the API
 * was never wired, 405 on anything but GET (read-only, no CSRF concern), and
 * a fail-closed `{ entries: [] }` on any read/parse error instead of a 500 —
 * the same "never crash the route" contract every other preview read here
 * uses.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DonationsPreviewApi } from '../flight/donations.js';
import { sendJson } from './http-util.js';

export async function handleDonations(
  req: IncomingMessage,
  res: ServerResponse,
  api: DonationsPreviewApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'donations unavailable' });
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
