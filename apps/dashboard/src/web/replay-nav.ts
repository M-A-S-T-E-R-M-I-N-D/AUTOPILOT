// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure step-navigation helpers for the Firing Replay viewer's playback
 * controls (BOARD web-msnt26yk-5fzo6j, "AgentOps-style time travel" —
 * slice 1's full trace and the diff-capture slice already landed; this is
 * the "step through" half named in the board title, still open until now)
 * — client-only (no server counterpart), so it lives in `web/` rather than
 * `shared/`, the same split `diff-view.ts`/`activity-log.ts` document.
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` (see `fleetJs()`), same as the
 * other `web/` feature modules, so the two copies can no longer drift apart.
 */

/** One step-through position: which entry is showing, out of how many, and
 *  whether Prev/Next can move further. */
export interface ReplayNav {
  readonly index: number;
  readonly total: number;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly label: string;
}

/** Clamp a requested step index into `[0, total - 1]` (or `0` for an empty
 *  trace) — a stale cached index from a shorter previous trace, or a
 *  Prev/Next click past an end, always lands on a real entry rather than
 *  wrapping around or going out of bounds. */
export function clampReplayStep(index: number, total: number): number {
  if (total <= 0) return 0;
  if (index < 0) return 0;
  if (index > total - 1) return total - 1;
  return index;
}

/** The playback controls' position — "Step N of M" plus which direction can
 *  still move — derived from a raw (possibly out-of-range) index. */
export function replayNav(index: number, total: number): ReplayNav {
  const clamped = clampReplayStep(index, total);
  return {
    index: clamped,
    total,
    canPrev: total > 0 && clamped > 0,
    canNext: total > 0 && clamped < total - 1,
    label: total > 0 ? `Step ${clamped + 1} of ${total}` : 'No steps',
  };
}
