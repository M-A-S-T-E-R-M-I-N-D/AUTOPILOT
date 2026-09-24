// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `GET /api/whats-new` — the facts the what's-new message shows (see
 * `read/whats-new.ts`). Read-only. A thrown read answers with every part
 * empty rather than a 500, so the message can still open and say so.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-util.js';
import type { WhatsNewApi } from '../read/whats-new.js';

export async function handleWhatsNew(
  req: IncomingMessage,
  res: ServerResponse,
  api: WhatsNewApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'whats-new unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  try {
    send(200, await api());
  } catch {
    send(200, { version: null, release: null, round: null, github: null, ci: null });
  }
}
