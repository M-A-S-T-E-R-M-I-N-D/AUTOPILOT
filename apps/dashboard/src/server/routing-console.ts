// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The operator routing console's endpoint (`GET /api/routing-console`, epic
 * 0019 S4, board web-mtrh1hn3-8x9f0z), mirroring `server/collaboration.ts`'s
 * `handleCollaboration` shape (a read-only preview, no execute pair).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-util.js';
import { UNREADABLE_ROUTING_CONSOLE, type RoutingConsoleApi } from '../flight/routing-console.js';

export type { RoutingConsoleApi };

/**
 * The routing console's read (`GET /api/routing-console`): milestone
 * progress, the priority and status label queues, and claims, as the GitHub
 * page says them. Read-only — shells to `gh` fresh on every call, the same
 * on-demand-not-cached rationale `handleCollaboration` uses. A thrown read
 * answers {@link UNREADABLE_ROUTING_CONSOLE} (milestones unknown) rather
 * than a 500; {@link RoutingConsoleApi} never rejects on its own, so the
 * catch only guards an `api` wired in that does. 404 only for an unwired API.
 */
export async function handleRoutingConsole(
  req: IncomingMessage,
  res: ServerResponse,
  api: RoutingConsoleApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'routing console unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  try {
    send(200, await api());
  } catch {
    send(200, UNREADABLE_ROUTING_CONSOLE);
  }
}
