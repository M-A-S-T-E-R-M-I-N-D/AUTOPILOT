// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * COMPOSER TARGET=TASKS (board web-mtq2m6la-ckpxm7), HTTP half — the
 * CSRF-guarded `POST /api/report/compose-tasks` endpoint behind
 * `flight/report-compose-tasks.ts`'s pure `composeReportTasks`. Same shell
 * shape `server/report-compose.ts` established for the single-report
 * composer: validation + handler in their own file, `server.ts` wires the
 * route + re-exports the contract type. Pure like `handleReportCompose`:
 * `composeReportTasks` never touches the store, but it DOES spend quota (one
 * tool-less model call), so it is rate-limited the same way.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RateLimiter } from './rate-limit.js';
import { clientKey, sendJson, readBody, MAX_BODY_BYTES } from './http-util.js';
import type { ReportComposeTasksResult } from '../flight/report-compose-tasks.js';

// Same bound `server/report-compose.ts`'s `MAX_DESCRIPTION_CHARS` uses — a
// bundled, multi-ask note is still describing bugs, not asking one thing, so
// it gets the same generous-but-bounded cap.
const MAX_DESCRIPTION_CHARS = 4000;
// Same bound `server/report-compose.ts`'s `MAX_CONTEXT_JSON_CHARS` uses.
const MAX_CONTEXT_JSON_CHARS = 8000;
const MAX_MODULE_SOURCES = 20;
const MAX_MODULE_SOURCE_CHARS = 200;

export const REPORT_COMPOSE_TASKS_RATE_LIMIT = 10;
export const REPORT_COMPOSE_TASKS_RATE_WINDOW_MS = 60_000;

/** Compose one or more board tasks from a free-text note (spends quota; injected). */
export type ReportComposeTasksApi = (
  description: string,
  contextJson: string | undefined,
  moduleSources: readonly string[],
) => Promise<ReportComposeTasksResult>;

interface ReportComposeTasksInput {
  readonly description: string;
  readonly contextJson: string | undefined;
  readonly moduleSources: readonly string[];
}
type ReportComposeTasksParseResult =
  | { readonly ok: true; readonly input: ReportComposeTasksInput }
  | { readonly ok: false; readonly status: number; readonly body: unknown };

/** Same bounded-array validation `server/report-compose.ts`'s
 *  `parseModuleSources` performs — absent is fine (empty list); present must
 *  be an array of short strings, bounded on both count and size. */
function parseModuleSources(value: unknown): readonly string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MODULE_SOURCES) return null;
  const sources: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length > MAX_MODULE_SOURCE_CHARS) return null;
    sources.push(entry);
  }
  return sources;
}

/**
 * CSRF guard + body validation for `/api/report/compose-tasks`: POST +
 * `application/json`, a non-blank `description` capped at
 * MAX_DESCRIPTION_CHARS, an optional `contextJson` (the captured page
 * context bundle) capped at MAX_CONTEXT_JSON_CHARS, and an optional
 * `moduleSources` array — same shape as `server/report-compose.ts`'s
 * `parseReportComposeRequest`.
 */
async function parseReportComposeTasksRequest(
  req: IncomingMessage,
): Promise<ReportComposeTasksParseResult> {
  if ((req.method ?? 'GET') !== 'POST') {
    return { ok: false, status: 405, body: { error: 'method not allowed' } };
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    return { ok: false, status: 415, body: { error: 'Content-Type must be application/json' } };
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    return { ok: false, status: 413, body: { error: 'request body too large' } };
  }
  let description: string;
  let contextJson: string | undefined;
  let moduleSources: readonly string[] | null;
  try {
    const body = JSON.parse(raw) as {
      description?: unknown;
      contextJson?: unknown;
      moduleSources?: unknown;
    };
    description = typeof body.description === 'string' ? body.description : '';
    contextJson = typeof body.contextJson === 'string' ? body.contextJson : undefined;
    moduleSources = parseModuleSources(body.moduleSources);
  } catch {
    return { ok: false, status: 400, body: { error: 'invalid JSON' } };
  }
  if (description.trim().length === 0) {
    return { ok: false, status: 400, body: { error: 'a description is required' } };
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    return {
      ok: false,
      status: 400,
      body: { error: `description must be ${MAX_DESCRIPTION_CHARS} characters or fewer` },
    };
  }
  if (contextJson !== undefined && contextJson.length > MAX_CONTEXT_JSON_CHARS) {
    return {
      ok: false,
      status: 400,
      body: { error: `contextJson must be ${MAX_CONTEXT_JSON_CHARS} characters or fewer` },
    };
  }
  if (moduleSources === null) {
    return {
      ok: false,
      status: 400,
      body: {
        error:
          `moduleSources must be an array of at most ${MAX_MODULE_SOURCES} strings of ` +
          `${MAX_MODULE_SOURCE_CHARS} characters or fewer`,
      },
    };
  }
  return { ok: true, input: { description, contextJson, moduleSources } };
}

/**
 * The compose-to-tasks endpoint (`POST /api/report/compose-tasks`, body
 * `{description, contextJson?, moduleSources?}`). Spends quota (one
 * tool-less model call), so it is CSRF-guarded and rate-limited like
 * `/api/report/compose` — like that sibling, it never touches the store: a
 * malformed note still returns 200 with a rejected
 * {@link ReportComposeTasksResult} and reasoning rather than a bare error.
 * Applying the returned tasks to the board (`applyComposedTasks`) is a
 * separate execute endpoint, same preview/execute split
 * `/api/report-from-here` and `/api/report-from-here/execute` take.
 */
export async function handleReportComposeTasks(
  req: IncomingMessage,
  res: ServerResponse,
  api: ReportComposeTasksApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'report compose-to-tasks unavailable' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many compose requests — slow down and try again shortly.' });
    return;
  }
  const parsed = await parseReportComposeTasksRequest(req);
  if (!parsed.ok) {
    send(parsed.status, parsed.body);
    return;
  }
  try {
    send(
      200,
      await api(parsed.input.description, parsed.input.contextJson, parsed.input.moduleSources),
    );
  } catch (error) {
    send(500, { error: error instanceof Error ? error.message : 'report compose-to-tasks failed' });
  }
}
