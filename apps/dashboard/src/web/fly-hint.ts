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

/** The STRINGS keys {@link flyHintText} composes its sentence from (board
 *  web-msnsndki-dz3vn1) — named alongside `flightProgressLabel`'s family in
 *  `@autopilot/tokens`' `strings.ts`. */
export type FlyHintKey =
  'flyHintFixedMode' | 'flyHintTotalMode' | 'flyHintCapsWithTurns' | 'flyHintCapsNoTurns';

/** The bundle's `tr(key, subs)` (`web/features/locale.ts`), injected into
 *  {@link flyHintText} the same route `flightProgressOf` takes — the
 *  function stays spliced into `/app.js` via `.toString()`, so it cannot
 *  import a translator any more than it can import a formatter. */
export type FlyHintTranslator = (
  key: FlyHintKey,
  subs?: Readonly<Record<string, string | number>>,
) => string;

/** The fly bar's live HINT sentence — the operator found two bare $ fields
 *  and a silent turn cap unreadable ("the mechanism is confusing"), so
 *  `updateFlyHint` spells the plan out in words. Two shapes depending on
 *  which budget mode is active: a fixed firing COUNT ("N firing(s) × $X
 *  each — spends up to $Y total"), or a TOTAL $ target the flight keeps
 *  firing against until it can't fund another firing ("Keeps firing while
 *  the remaining $X can fund another $Y firing — ≈ up to N firing(s)").
 *  Both end with a `caps` clause naming the per-firing $ cap and, when the
 *  server has reported one, the per-firing turn cap — `tr` rides the same
 *  injection route `flightProgressOf`'s does (board web-msnsndki-dz3vn1):
 *  `flyHintFixedMode`/`flyHintTotalMode` are the two sentence templates,
 *  `flyHintCapsWithTurns`/`flyHintCapsNoTurns` the trailing clause (passed
 *  in as `{caps}`, a pre-rendered substitution like `flightProgressLabel`'s
 *  `{progress}`/`{eta}`), so each locale's grammar decides where the
 *  numbers land. */
export function flyHintText(
  isTotalMode: boolean,
  perFiring: number,
  totalUsd: number,
  count: number,
  maxTurns: number | null,
  tr: FlyHintTranslator,
): string {
  const caps = maxTurns
    ? tr('flyHintCapsWithTurns', { perFiring, maxTurns })
    : tr('flyHintCapsNoTurns', { perFiring });
  if (isTotalMode) {
    const estimate =
      perFiring > 0 && totalUsd > 0 ? Math.max(1, Math.floor(totalUsd / perFiring)) : 0;
    return tr('flyHintTotalMode', { remaining: totalUsd, perFiring, estimate, caps });
  }
  const ceiling = Math.round(count * perFiring * 100) / 100;
  return tr('flyHintFixedMode', { count, perFiring, ceiling, caps });
}
