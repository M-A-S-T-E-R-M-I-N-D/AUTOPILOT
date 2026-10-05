// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The operator routing console's endpoints (epic 0019 S4, board
 * web-mtrh1hn3-8x9f0z): the read (`GET /api/routing-console`), mirroring
 * `server/collaboration.ts`'s `handleCollaboration` shape, and its one write
 * (`POST /api/routing-console/route`), mirroring `server/pool-client.ts`'s
 * `handlePoolClientExecute`, with its own rate limiter.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RateLimiter } from './rate-limit.js';
import { clientKey, sendJson, readBody, MAX_BODY_BYTES } from './http-util.js';
import { UNREADABLE_ROUTING_CONSOLE, type RoutingConsoleApi } from '../flight/routing-console.js';
import type { RoutingConsoleRouteApi } from '../flight/routing-console-execute.js';

export type { RoutingConsoleApi, RoutingConsoleRouteApi };

// Guards POST /api/routing-console/route: each request is a real `gh issue
// edit` on the page, the same reasoning as the pool client's claim limiter.
export const ROUTING_CONSOLE_ROUTE_RATE_LIMIT = 10;
export const ROUTING_CONSOLE_ROUTE_RATE_WINDOW_MS = 60_000;

/**
 * The routing console's read (`GET /api/routing-console[?project=]`):
 * milestone progress, the priority and status label queues, and claims, as
 * the GitHub page says them. Read-only — shells to `gh` fresh on every call,
 * the same on-demand-not-cached rationale `handleCollaboration` uses. A
 * project page names itself with `?project=`, and `main.ts`'s
 * `readProjectRoutingConsole` reads that project's own repository. A thrown
 * read answers {@link UNREADABLE_ROUTING_CONSOLE} (milestones unknown)
 * rather than a 500. 404 only for an unwired API.
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
  const project = new URL(req.url ?? '/', 'http://localhost').searchParams.get('project') ?? '';
  try {
    send(200, await api(project.length > 0 ? project : undefined));
  } catch {
    send(200, UNREADABLE_ROUTING_CONSOLE);
  }
}

/**
 * The routing console's one write (`POST /api/routing-console/route`, body
 * `{issue, label, project?}`): adds one house priority label to an open issue
 * no priority label routes yet. State-changing on GitHub, so it is a
 * CSRF-guarded JSON POST like every other write, and separately rate-limited.
 * The injected `api` re-reads the issue and gates on the maintainer role
 * itself, so a refusal is a 200 carrying `refusedReason`, never a 403. A
 * project page names itself with `project`, and the route acts on that
 * project's own repository, the one its console was read from.
 */
export async function handleRoutingConsoleRoute(
  req: IncomingMessage,
  res: ServerResponse,
  api: RoutingConsoleRouteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'routing console route unavailable' });
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
    send(429, { error: 'Too many routing requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  const body = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as {
    issue?: unknown;
    label?: unknown;
    project?: unknown;
  };
  const issue = typeof body.issue === 'number' ? body.issue : NaN;
  if (!Number.isInteger(issue) || issue <= 0) {
    send(400, { error: 'a positive integer issue number is required' });
    return;
  }
  if (typeof body.label !== 'string' || body.label.length === 0) {
    send(400, { error: 'a label is required' });
    return;
  }
  const project =
    typeof body.project === 'string' && body.project.length > 0 ? body.project : undefined;
  try {
    send(200, await api(issue, body.label, project));
  } catch (error) {
    send(500, { error: error instanceof Error ? error.message : 'routing console route failed' });
  }
}
