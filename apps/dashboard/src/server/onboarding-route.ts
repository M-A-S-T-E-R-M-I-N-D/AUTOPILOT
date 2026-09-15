// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ONBOARDING'S FIRST MICRO-TASK (epic 0032), server half:
 * `POST /api/onboarding/sample` `{sample}` — copy a bundled sample out of
 * this repository into the operator's own space, make it a repository, and
 * register it, so a new operator has something real to fly one click after
 * installing.
 *
 * POST-only and CSRF-guarded like every state-changing route here (it writes
 * to disk and to the store). Rate-limited, because each call copies a
 * directory and shells `git init`. Every refusal answers with a sentence the
 * panel can show, never a stack.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RateLimiter } from './rate-limit.js';
import { clientKey, sendJson, readBody } from './http-util.js';
import { NO_CONTRIBUTIONS, type ContributionCounts } from '../flight/contributions.js';

/** Guards the copy: a directory copy plus a `git init` per call. */
export const SAMPLE_RATE_LIMIT = 5;
export const SAMPLE_RATE_WINDOW_MS = 60_000;

/** What the panel gets back — the folder to prefill the Fly bar with. */
export interface SampleAddResult {
  readonly ok: boolean;
  /** Absolute path of the copy, set whenever one exists (even if it already did). */
  readonly folder?: string;
  readonly projectId?: string;
  /** A sentence: what happened, or why nothing did. */
  readonly message: string;
}

/** The onboarding's backing API (injected; keeps the server testable). */
export interface OnboardingApi {
  addSample(sample: string): Promise<SampleAddResult>;
  /** What this account has actually contributed on GitHub, so the ladder's
   *  two contribution steps read a real fact rather than a mark this browser
   *  happened to write (operator, 2026-09-15). Read-only. */
  contributions(): Promise<ContributionCounts>;
}

const MAX_BODY_BYTES = 4 * 1024;

export async function handleOnboardingSample(
  req: IncomingMessage,
  res: ServerResponse,
  api: OnboardingApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);

  if (!api) {
    send(404, { error: 'onboarding API unavailable' });
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
    send(429, { error: 'Too many sample requests — slow down and try again shortly.' });
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }

  send(200, await api.addSample(String(body['sample'] ?? '')));
}

/**
 * `GET /api/onboarding/contributions` — has this account filed an issue or
 * opened a pull request anywhere?
 *
 * GET and read-only, unlike its POST sibling above: it runs two `gh search`
 * verbs and writes nothing. A machine with no `gh`, or one not signed in,
 * answers "nothing found" with a 200 rather than an error, because the only
 * consequence is a checklist row staying unticked.
 */
export async function handleOnboardingContributions(
  req: IncomingMessage,
  res: ServerResponse,
  api: OnboardingApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'onboarding API unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  try {
    send(200, await api.contributions());
  } catch {
    send(200, NO_CONTRIBUTIONS);
  }
}
