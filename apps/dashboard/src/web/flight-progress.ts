// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure TOTAL flight-level progress math — client-only (no server
 * counterpart, unlike `shared/*.ts`), so it lives in `web/` rather than
 * `shared/` (epic 0002 "shell decomposition", slice 2: feature-module split
 * of `shell.ts`), following the same pattern `office-map.ts`/`format.ts`/
 * `heatmap.ts`/`flight-metrics.ts`/`markdown.ts`/`activity-log.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** One landed firing, as read from a flight's session-scoped flight log
 *  (the firings landed since the flight's own `startedAt`). */
export interface SessionFiring {
  readonly cost?: number | null;
  readonly durationMs?: number | null;
}

/** The budget/firing-count target a flight was launched with —
 *  {@link flightProgressOf} reads whichever one is set. */
export interface FlightProgressTarget {
  readonly totalBudgetUsd?: number | null;
  readonly firings?: number | null;
}

/** {@link flightProgressOf}'s result: percent complete, the human-readable
 *  spend/count clause, and an ETA clause (empty until an average firing
 *  duration is known from either this session or `historicalAvgDurationMs`). */
export interface FlightProgress {
  readonly pct: number;
  readonly progressBit: string;
  readonly etaBit: string;
}

/** The STRINGS keys {@link flightProgressOf} composes its two clauses from
 *  (board web-msnsndki-dz3vn1). Named here, not imported from
 *  `@autopilot/tokens`, so this module stays import-free like every other
 *  spliced `web/` helper — the union still typechecks each key against
 *  `STRINGS.en` wherever a real table backs the translator (its tests). */
export type FlightProgressKey =
  | 'flightProgressSpentOfTotal'
  | 'flightProgressFiringsSoFar'
  | 'flightProgressEta'
  | 'flightProgressFinishingUp';

/** The bundle's `tr(key, subs)` (`web/features/locale.ts`), injected into
 *  {@link flightProgressOf} the same way `fmtCost`/`fmtDuration` are — the
 *  function stays spliced into `/app.js` via `.toString()`, so it cannot
 *  import a translator any more than it can import a formatter. */
export type FlightProgressTranslator = (
  key: FlightProgressKey,
  subs?: Readonly<Record<string, string | number>>,
) => string;

/** One flight-log entry, as read from a project's full firing history — the
 *  shape {@link sessionFlightDataFor} filters into {@link SessionFiring}s. */
export interface FlightLogFiring extends SessionFiring {
  readonly at: number;
}

/** The project fields {@link sessionFlightDataFor} reads to find the
 *  currently-flying project and its full firing history. */
export interface FlyingProject {
  readonly status: string;
  readonly flightLog?: readonly FlightLogFiring[];
}

/** {@link sessionFlightDataFor}'s result — {@link flightProgressOf}'s other
 *  two params. */
export interface SessionFlightData {
  readonly sessionFirings: readonly SessionFiring[];
  readonly historicalAvgDurationMs: number | null;
}

/** The fly bar's TOTAL flight-level progress bar's pure math
 *  (web-msnt5ccp-9bx2ix) — percent complete against whichever target the
 *  flight was launched with (a total $ budget or a fixed firing count), plus
 *  an ETA derived from this flight's own average landed-firing duration once
 *  one exists, falling back to `historicalAvgDurationMs` (the project's full
 *  history, via `averageFiringDurationMs`) before that. Null when the flight
 *  carries neither target — nothing to show a bar for.
 *  Takes fmtCost/fmtDuration via injection (mirrors actMeta's fmtTokens
 *  param) rather than importing them from `./format.ts`, since a real
 *  cross-module import type-checks fine but breaks once Vitest's SSR
 *  transform rewrites it to a reference that doesn't survive `.toString()`
 *  extraction. `tr` rides the same route (board web-msnsndki-dz3vn1): the
 *  two clauses are `{spent}`/`{total}`/`{done}`/`{count}`/`{eta}` templates
 *  in STRINGS, so each locale's grammar decides where the numbers land. */
export function flightProgressOf(
  s: FlightProgressTarget,
  sessionFirings: readonly SessionFiring[],
  historicalAvgDurationMs: number | null,
  fmtCost: (n: number) => string,
  fmtDuration: (ms: number) => string,
  tr: FlightProgressTranslator,
): FlightProgress | null {
  let spentSoFar = 0;
  for (const f of sessionFirings) spentSoFar += f.cost || 0;
  const firingsCompleted = sessionFirings.length;

  let pct: number | null = null;
  let progressBit = '';
  if (s.totalBudgetUsd) {
    pct = Math.min(100, Math.round((spentSoFar / s.totalBudgetUsd) * 100));
    progressBit = tr('flightProgressSpentOfTotal', {
      spent: fmtCost(spentSoFar),
      total: s.totalBudgetUsd,
    });
  } else if (s.firings) {
    pct = Math.min(100, Math.round((firingsCompleted / s.firings) * 100));
    progressBit = tr('flightProgressFiringsSoFar', {
      done: firingsCompleted,
      count: s.firings,
      spent: fmtCost(spentSoFar),
    });
  }
  if (pct === null) return null;

  const durations: number[] = [];
  for (const f of sessionFirings) {
    if (typeof f.durationMs === 'number') durations.push(f.durationMs);
  }
  const avgDurationMs = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : historicalAvgDurationMs;

  let remainingFirings: number | null = null;
  if (s.totalBudgetUsd) {
    if (firingsCompleted > 0 && spentSoFar > 0) {
      const avgCost = spentSoFar / firingsCompleted;
      remainingFirings = Math.max(0, Math.floor((s.totalBudgetUsd - spentSoFar) / avgCost));
    }
  } else if (s.firings) {
    remainingFirings = Math.max(0, s.firings - firingsCompleted);
  }
  let etaBit = '';
  if (remainingFirings !== null && avgDurationMs) {
    etaBit =
      remainingFirings > 0
        ? tr('flightProgressEta', { eta: fmtDuration(remainingFirings * avgDurationMs) })
        : tr('flightProgressFinishingUp');
  }

  return { pct, progressBit, etaBit };
}

/**
 * {@link flightProgressOf}'s two upstream inputs — which of this flight's
 * own firings have landed since it started (`sessionFirings`), and the
 * fallback average duration from the project's full history
 * (`historicalAvgDurationMs`) for use before any firing has landed this
 * session. At most one flight runs at a time (FlightRunner), so the flying
 * project in the shared fleet snapshot IS the one this status describes — no
 * folder-to-project lookup needed.
 * Takes `averageFiringDurationMs` via injection (mirrors this module's own
 * fmtCost/fmtDuration params) rather than importing it from
 * `shared/live-firing.ts`, same reason every shared module in this epic
 * stays import-free.
 */
export function sessionFlightDataFor(
  projects: readonly FlyingProject[],
  startedAt: number,
  averageFiringDurationMs: (flightLog: readonly FlightLogFiring[]) => number | null,
): SessionFlightData {
  const flying = projects.find((p) => p.status === 'flying') || null;
  const flightLog = flying ? flying.flightLog || [] : [];
  const sessionFirings = flightLog.filter((f) => f.at >= startedAt);
  const historicalAvgDurationMs = flying ? averageFiringDurationMs(flightLog) : null;
  return { sessionFirings, historicalAvgDurationMs };
}
