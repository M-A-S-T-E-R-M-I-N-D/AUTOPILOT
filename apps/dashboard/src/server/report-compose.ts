// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * LLM ISSUE COMPOSER 1/3 (board web-mtpzdrt1-lirsgh), HTTP half — the
 * CSRF-guarded `POST /api/report/compose` endpoint behind `flight/report-
 * compose.ts`'s pure `composeReport`. Same shell-decomposition shape `ask.ts`
 * established (validation + handler in their own file, `server.ts` wires the
 * route + re-exports the contract types). Pure like `handleReportFromHere`:
 * `composeReport` never touches the store or `gh`, but it DOES spend quota
 * (one tool-less model call), so it is rate-limited like `handleAsk` rather
 * than left uncapped like the free preview endpoint.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RateLimiter } from './rate-limit.js';
import { clientKey, sendJson, readBody, MAX_BODY_BYTES } from './http-util.js';
import type { ReportComposeResult } from '../flight/report-compose.js';

// A composed report's source note can run longer than an Ask question (it's
// describing a bug, not asking one thing) but is still bounded — the same
// quota-spend/prompt-amplification cap every model-fed field here carries.
const MAX_DESCRIPTION_CHARS = 4000;
// The `reportMenuContextOf` JSON bundle (selector, rect, dataset, region) is
// small by construction (`web/features/report-menu.ts` already caps the
// captured text at 200 chars) — this ceiling exists only to reject an
// API caller handing in something absurd, not to constrain the real client.
const MAX_CONTEXT_JSON_CHARS = 8000;
const MAX_MODULE_SOURCES = 20;
const MAX_MODULE_SOURCE_CHARS = 200;

export const REPORT_COMPOSE_RATE_LIMIT = 10;
export const REPORT_COMPOSE_RATE_WINDOW_MS = 60_000;

/** Compose one report from a free-text note (spends quota; injected). */
export type ReportComposeApi = (
  description: string,
  contextJson: string | undefined,
  moduleSources: readonly string[],
) => Promise<ReportComposeResult>;

interface ReportComposeInput {
  readonly description: string;
  readonly contextJson: string | undefined;
  readonly moduleSources: readonly string[];
}
type ReportComposeParseResult =
  | { readonly ok: true; readonly input: ReportComposeInput }
  | { readonly ok: false; readonly status: number; readonly body: unknown };

/** Validate an untrusted `moduleSources` field: absent is fine (empty list);
 *  present must be an array of short strings, bounded on both count and
 *  size — the same convention `server/ask.ts`'s `parseHistory` follows for
 *  its own bounded-array field. */
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
 * CSRF guard + body validation for `/api/report/compose`: POST +
 * `application/json`, a non-blank `description` capped at
 * MAX_DESCRIPTION_CHARS, an optional `contextJson` (the captured page
 * context bundle) capped at MAX_CONTEXT_JSON_CHARS, and an optional
 * `moduleSources` array — same shape as `server/ask.ts`'s `parseAskRequest`.
 */
async function parseReportComposeRequest(req: IncomingMessage): Promise<ReportComposeParseResult> {
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
 * The compose endpoint (`POST /api/report/compose`, body `{description,
 * contextJson?, moduleSources?}`). Spends quota (one tool-less model call),
 * so it is CSRF-guarded and rate-limited like `/api/ask`, even though — like
 * `/api/report-from-here`'s preview — it never touches the store or `gh`: a
 * malformed note still returns 200 with a rejected {@link ReportComposeResult}
 * and reasoning rather than a bare error.
 */
export async function handleReportCompose(
  req: IncomingMessage,
  res: ServerResponse,
  api: ReportComposeApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'report compose unavailable' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many compose requests — slow down and try again shortly.' });
    return;
  }
  const parsed = await parseReportComposeRequest(req);
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
    send(500, { error: error instanceof Error ? error.message : 'report compose failed' });
  }
}
