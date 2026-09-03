// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The contributor-pool and publicity endpoints — pool browse (`GET
 * /api/pool-client`), pool claim (`POST /api/pool-client/execute`), and
 * publicity affordances (`GET /api/publicity`) — types and handlers (epic
 * 0002 "shell decomposition" — split from `server.ts`, mirroring the
 * `gh-connection.ts`/`github-execute.ts` extractions: the server shell wires
 * each into its router unchanged, importing the handler and, for the
 * execute endpoint, its own rate limiter). Grouped together rather than
 * split by read/write like the prior two cuts because both panels (epic
 * 0007 "PLATFORM 6/7" and "7/7") are the CONTRIBUTOR POOL/PUBLICITY chrome
 * pair and share no state with anything else `server.ts` keeps — the same
 * "fully self-contained seam" bar every whole-region move in this epic
 * already clears.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RateLimiter } from './rate-limit.js';
import { clientKey, sendJson, readBody, MAX_BODY_BYTES } from './http-util.js';
import type { PoolBrowseEntry, ClaimAndQueuePoolIssueResult } from '../flight/pool-client.js';
import type { PublicityAffordance } from '../flight/publicity.js';

// Guards POST /api/pool-client/execute — heavier-than-a-quota-spend
// reasoning as every other EXECUTE limiter in this file's siblings: a real
// `gh` assign + comment call per request, not just a read.
export const POOL_CLIENT_RATE_LIMIT = 5;
export const POOL_CLIENT_RATE_WINDOW_MS = 60_000;

/** The pool client browse preview (injected; reads only, shells to `gh issue
 *  list` + `gh api user` on demand) — every open pool issue paired with the
 *  claim-or-skip decision for the caller's own gh identity (see
 *  `flight/pool-client-execute.ts`). */
export type PoolClientApi = () => Promise<readonly PoolBrowseEntry[]>;

/** The pool client's CLAIM action for one issue number, optionally also
 *  queuing a local board task on `projectId` (injected; assigns + comments
 *  via `gh` for a claimable issue — see `flight/pool-client.ts`'s
 *  `claimPoolIssue`/`claimAndQueuePoolIssueTask`). Always resolves — never
 *  `null` — since the decision core is total over its inputs, a
 *  no-longer-claimable issue plans a `'skip'` with its own reasoning rather
 *  than a 404; `taskQueued` is `false` whenever no `projectId` was given. */
export type PoolClientExecuteApi = (
  issueNumber: number,
  projectId?: string,
) => Promise<ClaimAndQueuePoolIssueResult>;

/** The publicity affordances preview (injected; read-only, shells to `gh
 *  repo view` on demand) — see `flight/publicity.ts`'s
 *  `createPublicityPreviewApi`. Never rejects: an unresolved repo identity
 *  degrades to the dormant affordance set rather than throwing. */
export type PublicityApi = () => Promise<readonly PublicityAffordance[]>;

/**
 * The contributor pool's browse endpoint (`GET /api/pool-client`). Read-only
 * — shells to `gh` fresh on every call rather than polling, since the pool
 * itself changes far slower than a fleet stream tick. Degrades to
 * `{ entries: [] }` on a thrown read (an unreachable/unauthenticated `gh`),
 * the same "never crashes the dashboard" stance every other read endpoint
 * takes, rather than surfacing a 500 for what is often just "not logged
 * into `gh` yet". 404 only for an unwired API.
 */
export async function handlePoolClient(
  req: IncomingMessage,
  res: ServerResponse,
  api: PoolClientApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'pool client unavailable' });
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

/**
 * The publicity affordances endpoint (`GET /api/publicity`). Read-only, same
 * on-demand-not-polled rationale as {@link handlePoolClient} — shells to `gh
 * repo view` fresh on every call. `createPublicityPreviewApi` never rejects
 * (an unresolved identity degrades to the dormant affordance set), but the
 * catch here still degrades to `{ affordances: [] }` — the same "never
 * crashes the dashboard" stance every other read endpoint takes — should a
 * caller wire in an `api` that does throw.
 */
export async function handlePublicity(
  req: IncomingMessage,
  res: ServerResponse,
  api: PublicityApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'publicity unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  try {
    send(200, { affordances: await api() });
  } catch {
    send(200, { affordances: [] });
  }
}

/**
 * The pool client's CLAIM execute endpoint (`POST /api/pool-client/execute`,
 * body `{number, project?}`). State-changing — assigns the issue and posts a
 * claim comment via `gh` — so it is a CSRF-guarded JSON POST like every other
 * write, and separately rate-limited (same heavier-than-a-quota-spend
 * reasoning as `handlePrReviewExecute`). The decision is re-derived fresh
 * from `gh` at execute time rather than trusting anything the client sent —
 * see `flight/pool-client-execute.ts`. An optional `project` (one of the
 * caller's own registered project ids) additionally queues a local
 * `source: 'github'` board task there — the "fly locally" leg's HTTP half;
 * omitting it (or naming an unknown project) still claims the issue, just
 * with `taskQueued: false`, since {@link createPoolClientExecuteApi} resolves
 * the project itself and never trusts it blindly. Always a 200: {@link
 * PoolClientExecuteApi} never returns `null`, since an issue no longer
 * claimable by execute time (already claimed, or dropped out of the open
 * pool — e.g. another co-pilot won the race) plans an honest `'skip'` rather
 * than a 404; the caller inspects the returned `decision`/`commandResults`/
 * `taskQueued` for whether a claim (and a task) actually landed.
 */
export async function handlePoolClientExecute(
  req: IncomingMessage,
  res: ServerResponse,
  api: PoolClientExecuteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'pool client execute unavailable' });
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
    send(429, { error: 'Too many pool client requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let number: number;
  let projectId: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { number?: unknown; project?: unknown };
    number = typeof parsed.number === 'number' ? parsed.number : NaN;
    projectId =
      typeof parsed.project === 'string' && parsed.project.length > 0 ? parsed.project : undefined;
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (!Number.isInteger(number) || number <= 0) {
    send(400, { error: 'a positive integer issue number is required' });
    return;
  }
  try {
    send(200, await api(number, projectId));
  } catch (error) {
    send(500, {
      error: error instanceof Error ? error.message : 'pool client execute failed',
    });
  }
}
