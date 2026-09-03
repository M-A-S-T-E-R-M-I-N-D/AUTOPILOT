// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure recent-operator-actions math — the last piece of Omniscient chat
 * context (BACKLOG web-msnrw1ok-0gsdff): VIEW (slice 1) and the WIP-limit-1
 * focused task (slice 2) are already injected; this slice adds what the
 * operator actually DID this session (flight launches/stops/pauses), so a
 * follow-up question like "why is it still going" has an answer even when
 * the action that caused it happened moments ago and isn't reflected in
 * live flight state yet. Client-only (no server counterpart, unlike
 * `shared/*.ts`), so it lives in `web/` — the same split `search-history.ts`
 * uses for the remembered-queries list. Session-scoped (an in-memory array,
 * not localStorage): unlike search history, a stale action from a prior
 * visit has no value to the model and would be actively misleading.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart. Callers
 * (`fly.ts`'s launch/stop/pause handlers) reference the embedded names
 * directly without re-importing/re-embedding, the same hoisting `search.ts`
 * already relies on for `el`.
 */

/** How many recent actions ride along in the Ask view context — enough for
 *  "what did I just do" continuity without ballooning prompt size. */
export const OPERATOR_ACTION_LOG_CAP = 5;

/** The new action log after recording `action` — capped at `cap` entries
 *  (oldest dropped first). Does not mutate `log`. */
export function recordOperatorAction(
  log: readonly string[],
  action: string,
  cap: number,
): string[] {
  const next = [...log, action];
  if (next.length > cap) next.splice(0, next.length - cap);
  return next;
}

/** The Ask view-context suffix for the current action log — empty string
 *  (nothing to append) when no action has been recorded yet this session. */
export function operatorActionsViewText(log: readonly string[]): string {
  return log.length > 0 ? `recent operator actions: ${log.join('; ')}` : '';
}
