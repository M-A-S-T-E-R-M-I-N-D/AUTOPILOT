// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Flight-end summary line (FLEET-ORCHESTRATION.md's "fractional firing"
 * debrief, board web-msw5gwfs-rqylda): a fleet launch that omits the
 * `[firings]` CLI arg silently defaults to ONE firing (`DEFAULT_FIRINGS` in
 * fly.ts) and exits `stoppedBy: 'max-iterations'` — a clean, by-design exit
 * that reads from outside as "the instance died early" unless the REQUESTED
 * count is spelled out alongside the actual one. `stoppedBy: 'max-iterations'`
 * always means `summary.firings === requestedFirings` (loop.ts's `while
 * (iterations < max)` can only exit that way at exactly `max`), so this never
 * reveals a mismatch — it exists purely to make the by-request stop
 * self-explanatory in the log line instead of requiring outside context.
 */

import type { LoopSummary } from '@autopilot/engine';

export function formatFlightDoneLine(
  summary: LoopSummary,
  requestedFirings: number,
  shipped: number,
  totalRecorded: number,
): string {
  const requestedNote =
    summary.stoppedBy === 'max-iterations' ? ` (requested ${requestedFirings})` : '';
  return (
    `Done — ${summary.firings} firing(s)${requestedNote}, ${shipped}/${totalRecorded} shipped` +
    ` (gate-verified). Stopped by: ${summary.stoppedBy}.`
  );
}
