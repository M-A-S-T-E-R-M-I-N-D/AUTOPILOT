// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The one landing outcome that must OUTLIVE the process that produced it.
 *
 * `landing/job.ts` keeps its jobs in memory, which is right for a gate run
 * nobody is still doing once the server is gone — except for the single most
 * common green path in this self-hosted project: a successful land of THIS
 * folder fires the rebuild+restart trigger, so the process holding that job
 * is replaced moments after it finished. The operator's page reconnects to a
 * brand-new server with an empty registry and, without this, would be told
 * `{ job: null }` — "nothing happened" — about the land that just succeeded.
 *
 * `landing/execute.ts` already writes a `landed` events row on every green
 * gate-then-merge (the audit trail both the manual button and the
 * land-watchdog go through), and `createOutOfBandLandGateCheck` writes
 * `land-gate-alarm` on a red out-of-band gate. This reads the most recent of
 * those back, so a fresh process can still answer "what happened to my
 * landing?" from the durable record instead of from lost memory.
 */

import { openStore, type Store } from '@autopilot/store';
import type { LandingExecuteApiResult } from './execute.js';

/** How far back a landed row still counts as "the land you just pressed".
 *  Matches the job registry's own result TTL — past it, an old success is
 *  history, not news about this press. */
export const LANDING_HISTORY_WINDOW_MS = 15 * 60 * 1000;

/** Reads the most recent durable landing outcome for a project, or `null`
 *  when there is none inside `windowMs`. Never throws: a missing/locked store
 *  degrades to "no recent outcome", which is exactly what the in-memory
 *  registry would have said anyway. */
export function readRecentLandingOutcome(
  dbPath: string,
  projectId: string,
  nowMs: number,
  windowMs: number = LANDING_HISTORY_WINDOW_MS,
): LandingExecuteApiResult | null {
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    const row = store.db
      .prepare(
        "SELECT payload FROM events WHERE project_id = ? AND type = 'landed' AND created_at >= ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(projectId, nowMs - windowMs) as { payload: string } | undefined;
    if (!row) return null;

    let details = 'merged.';
    try {
      const parsed = JSON.parse(row.payload) as { details?: unknown };
      if (typeof parsed.details === 'string') details = parsed.details;
    } catch {
      /* a malformed payload still proves the land happened — keep the default */
    }
    return { ok: true, reason: 'landed', details, restarting: false };
  } catch {
    return null;
  } finally {
    store?.close();
  }
}
