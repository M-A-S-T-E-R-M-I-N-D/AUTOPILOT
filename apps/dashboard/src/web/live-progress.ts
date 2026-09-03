// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure PER-FIRING progress math — client-only (no server counterpart, unlike
 * `shared/*.ts`), so it lives in `web/` rather than `shared/` (epic 0002
 * "shell decomposition", slice 2), following the same pattern
 * `flight-progress.ts` proved for the fly bar's TOTAL flight-level progress
 * (the other half of web-msnt5ccp-9bx2ix).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** {@link liveProgressOf}'s result: percent complete (uncapped, for the
 *  overrun check), the ARIA-range-capped percent, whether the firing is
 *  running longer than the average, and the human-readable label. */
export interface LiveProgress {
  readonly pct: number;
  readonly pctCapped: number;
  readonly isOver: boolean;
  readonly label: string;
}

/** The live worker card's per-firing progress bar's pure math
 *  (web-msnt5ccp-9bx2ix) — elapsed time for the still-live firing against
 *  this project's own average past-firing duration. Capped at 100% for the
 *  ARIA range; a real overrun is called out in the label instead of
 *  clipping. Takes fmtElapsed/fmtDuration via injection (mirrors
 *  flightProgressOf's fmtCost/fmtDuration params) rather than importing them
 *  from `./format.ts`, since a real cross-module import type-checks fine but
 *  breaks once Vitest's SSR transform rewrites it to a reference that
 *  doesn't survive `.toString()` extraction. */
export function liveProgressOf(
  startedAt: number,
  avgFiringDurationMs: number,
  fmtElapsed: (startedAt: number) => string,
  fmtDuration: (ms: number) => string,
): LiveProgress {
  const elapsedMs = Date.now() - startedAt;
  const pct = Math.max(0, Math.round((elapsedMs / avgFiringDurationMs) * 100));
  const pctCapped = Math.min(100, pct);
  const isOver = pct > 100;
  const label =
    fmtElapsed(startedAt) +
    ' of an average ' +
    fmtDuration(avgFiringDurationMs) +
    (isOver ? ' — running longer than usual' : ' (' + pct + '%)');
  return { pct, pctCapped, isOver, label };
}

/** The live worker card's "N recent action(s) seen" line — pluralized, with
 *  a "+" suffix once the shared recent-activity window is entirely this
 *  firing's own actions (it may have taken more than are visible). */
export function liveWorkerCountLabel(recentActions: number, recentActionsCapped: boolean): string {
  return (
    recentActions +
    (recentActionsCapped ? '+' : '') +
    ' recent action' +
    (recentActions === 1 && !recentActionsCapped ? '' : 's') +
    ' seen'
  );
}

/** The live worker card's "elapsed · ~N turn(s) so far" line. Takes
 *  fmtElapsed via injection (mirrors {@link liveProgressOf}'s params) rather
 *  than importing it from `./format.ts`, since a real cross-module import
 *  type-checks fine but breaks once Vitest's SSR transform rewrites it to a
 *  reference that doesn't survive `.toString()` extraction. */
export function liveWorkerTurnLabel(
  startedAt: number,
  turnsSeen: number,
  fmtElapsed: (startedAt: number) => string,
): string {
  return (
    fmtElapsed(startedAt) +
    ' elapsed · ~' +
    turnsSeen +
    (turnsSeen === 1 ? ' turn' : ' turns') +
    ' so far — cost known once it lands'
  );
}

/** One live worker card head chip's tip/aria-label pair. */
export interface LiveWorkerChipMeta {
  readonly tip: string;
  readonly ariaLabel: string;
}

/** {@link liveWorkerHeadMeta}'s result — `model` is `null` when the firing
 *  predates per-step model tracking, the same condition `liveWorkerCard`
 *  previously branched on before appending that chip at all. */
export interface LiveWorkerHeadMeta {
  readonly callsign: LiveWorkerChipMeta;
  readonly model: LiveWorkerChipMeta | null;
}

/** The live worker card's fixation-warning chip's tip/aria-label pair —
 *  shown when `orientFixation` (`shared/live-firing.ts`) is true: this many
 *  turns have passed with no DO-phase (edit) activity yet, the live
 *  counterpart to RESEARCH-LIBRARY.md's "ORIENT-length anomaly" gap. */
export function orientFixationChipMeta(turnsSeen: number): LiveWorkerChipMeta {
  const turnsLabel = turnsSeen + (turnsSeen === 1 ? ' turn' : ' turns');
  return {
    tip:
      turnsLabel + ' with no edit yet — may be stuck reading/planning instead of making progress',
    ariaLabel: 'possible fixation: ' + turnsLabel + ' with no edit yet',
  };
}

/** The live worker card head's callsign chip (always shown) and model chip
 *  (shown only once the firing carries a model) tip/aria-label math that
 *  `liveWorkerCard` previously computed inline across two `tipChip` calls. */
export function liveWorkerHeadMeta(
  callsign: string,
  model: string | null | undefined,
): LiveWorkerHeadMeta {
  return {
    callsign: {
      tip: 'a stable nickname for this firing, derived from its id — not the model or task name',
      ariaLabel: 'firing callsign ' + callsign,
    },
    model: model
      ? {
          tip: 'the model currently running this firing',
          ariaLabel: 'model: ' + model,
        }
      : null,
  };
}
