// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The role-gated dashboard's identity endpoint (`GET /api/social-identity`,
 * EPIC 0019 "GitHub steward" law 1 ("role honesty first") extended to the
 * UI — board `web-mtt3f7j6-3bj899`: panels and buttons render by the
 * resolved role so a non-owner never sees a maintainer verb on a repo it
 * does not own. Read-only, on-demand-not-polled — same shape `pool-
 * client.ts`'s `handlePublicity` already takes: shells to `gh` fresh on
 * every call and degrades to `{ identity: null }` rather than a 500 on any
 * failure, since an unresolved identity (no `gh`, unauthenticated, no
 * GitHub remote at all — the common fully-local project) is an expected
 * state, not an error.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-util.js';
import type { SocialIdentity } from '../flight/social-pass.js';

/** The identity read (injected; shells to `gh api user` + `gh repo view` on
 *  demand) — see `flight/social-pass.ts`'s `createSocialIdentityApi`. Never
 *  rejects: an unresolved identity degrades to `undefined`. */
export type SocialIdentityApi = () => Promise<SocialIdentity | undefined>;

/**
 * The social identity endpoint (`GET /api/social-identity`). Read-only, same
 * on-demand-not-polled rationale as `handlePublicity` — shells to `gh` fresh
 * on every call. `createSocialIdentityApi` never rejects (an unresolved
 * identity degrades to `undefined`), but the catch here still degrades to
 * `{ identity: null }` — the same "never crashes the dashboard" stance every
 * other read endpoint takes — should a caller wire in an `api` that does
 * throw.
 */
export async function handleSocialIdentity(
  req: IncomingMessage,
  res: ServerResponse,
  api: SocialIdentityApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'social identity unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  try {
    send(200, { identity: (await api()) ?? null });
  } catch {
    send(200, { identity: null });
  }
}
