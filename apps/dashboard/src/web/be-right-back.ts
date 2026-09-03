// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure show/hide math for the BE-RIGHT-BACK overlay (BOARD web-msqgho43-yeqne3)
 * — the full-screen "be right back" card `web/shell.ts`'s `refresh()` shows on
 * sustained `/api/state` failure and hides the instant a poll succeeds again.
 * Client-only (no server counterpart), so it lives in `web/` rather than
 * `shared/` — the same `timeline-strip.ts`/`gauge.ts` precedent (epic 0002
 * "shell decomposition", slice 2: pure math extracted ahead of the DOM glue
 * that consumes it).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** Consecutive `/api/state` failures required before the overlay appears — a
 *  single missed tick is normal jitter (a slow response, a GC pause), not a
 *  real outage; requiring more than one avoids flashing the full-screen card
 *  on every minor hiccup while still surfacing a genuine, sustained loss
 *  quickly (the next poll after the threshold, not after some longer wait). */
export const BRB_FAIL_THRESHOLD = 2;

/** Whether the overlay should be showing, given the current consecutive
 *  failure streak. One successful poll resets the streak to 0 (the caller's
 *  job — see `refresh()`), which immediately clears the overlay: healing is
 *  as sudden as the outage, never lingering past the connection's return. */
export function brbOverlayVisible(failStreak: number, threshold = BRB_FAIL_THRESHOLD): boolean {
  return failStreak >= threshold;
}
