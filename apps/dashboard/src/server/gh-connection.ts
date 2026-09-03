// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The connect screen's two GitHub read endpoints — status (`GET
 * /api/connection/gh`) and the LTS chip (`GET`/`POST
 * /api/connection/gh-lts`) — epic 0002 "shell decomposition" — split from
 * `server.ts`, mirroring the `github-execute.ts` extraction; the server
 * shell wires each into its router with its own rate limiter (the LTS
 * endpoint's POST shells a real `gh api` call against GitHub's own
 * separately rate-limited REST API).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RateLimiter } from './rate-limit.js';
import { clientKey, sendJson } from './http-util.js';
import type { GhStatus } from '../connection/gh-probe.js';
import type { LtsCheckResult } from '../connection/gh-lts.js';

// Guards POST /api/connection/gh-lts — a real `gh api` call against GitHub's
// (separately rate-limited) REST API per request, same reasoning as
// GITHUB_SYNC's limiter even though this one is read-only.
export const GH_LTS_RATE_LIMIT = 5;
export const GH_LTS_RATE_WINDOW_MS = 60_000;

/** The connect screen's GitHub half (docs/epics/0006-github-connected-mode.md,
 *  slice 1) — read-only detection, never a write; `gh` owns the credential. */
export interface GhApi {
  getStatus(): Promise<GhStatus>;
}

/** The connect screen's LTS chip backing API (docs/epics/
 *  0006-github-connected-mode.md, slice 4) — `getCached()` is a cheap,
 *  network-free read (served on GET, e.g. on popover open); `check()` shells
 *  a real `gh api` call and is only ever invoked from the rate-limited,
 *  CSRF-guarded POST path (an explicit operator click on "Check for
 *  updates"), never automatically. */
export interface GhLtsApi {
  getCached(): LtsCheckResult;
  check(): Promise<LtsCheckResult>;
}

export async function handleGhStatus(
  req: IncomingMessage,
  res: ServerResponse,
  api: GhApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);

  if (!api) {
    send(404, { error: 'gh API unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  send(200, await api.getStatus());
}

/**
 * The connect screen's LTS chip endpoint (`/api/connection/gh-lts`, epic
 * 0006 slice 4). GET serves the last cached result — cheap, network-free,
 * safe to call every time the popover opens. POST is the operator's
 * explicit "Check for updates" click: it runs a real `gh api` call against
 * GitHub, so it is CSRF-guarded (`application/json` Content-Type, same as
 * every other state-changing POST here) and rate-limited (a real network
 * call against GitHub's own separately rate-limited API, same reasoning as
 * `handleGithubSyncExecute`'s limiter).
 */
export async function handleGhLts(
  req: IncomingMessage,
  res: ServerResponse,
  api: GhLtsApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);

  if (!api) {
    send(404, { error: 'gh LTS API unavailable' });
    return;
  }
  const method = req.method ?? 'GET';
  if (method === 'GET') {
    send(200, api.getCached());
    return;
  }
  if (method !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many GitHub LTS check requests — slow down and try again shortly.' });
    return;
  }
  send(200, await api.check());
}
