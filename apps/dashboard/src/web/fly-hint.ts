// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure fly-bar HINT sentence math — client-only (no server counterpart,
 * unlike `shared/*.ts`), so it lives in `web/` rather than `shared/` (epic
 * 0002 "shell decomposition", slice 2), following the same pattern
 * `flight-progress.ts`/`live-progress.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The fly bar's live HINT sentence — the operator found two bare $ fields
 *  and a silent turn cap unreadable ("the mechanism is confusing"), so
 *  `updateFlyHint` spells the plan out in words. Two shapes depending on
 *  which budget mode is active: a fixed firing COUNT ("N firing(s) × $X
 *  each — spends up to $Y total"), or a TOTAL $ target the flight keeps
 *  firing against until it can't fund another firing ("Keeps firing while
 *  the remaining $X can fund another $Y firing — ≈ up to N firing(s)").
 *  Both end with a `capsBit` clause naming the per-firing $ cap and, when
 *  the server has reported one, the per-firing turn cap. */
export function flyHintText(
  isTotalMode: boolean,
  perFiring: number,
  totalUsd: number,
  count: number,
  maxTurns: number | null,
): string {
  const capsBit = maxTurns
    ? ' · each firing: up to $' + perFiring + ' and ' + maxTurns + ' turns'
    : ' · each firing: up to $' + perFiring;
  if (isTotalMode) {
    const estimate =
      perFiring > 0 && totalUsd > 0 ? Math.max(1, Math.floor(totalUsd / perFiring)) : 0;
    return (
      'Keeps firing while the remaining $' +
      totalUsd +
      ' can fund another $' +
      perFiring +
      ' firing — ≈ up to ' +
      estimate +
      ' firing(s)' +
      capsBit +
      '.'
    );
  }
  const ceiling = Math.round(count * perFiring * 100) / 100;
  return (
    count +
    ' firing(s) × $' +
    perFiring +
    ' each — spends up to $' +
    ceiling +
    ' total' +
    capsBit +
    '.'
  );
}
