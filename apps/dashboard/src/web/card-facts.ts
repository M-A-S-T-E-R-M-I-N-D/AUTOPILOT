// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure tooltip/aria-label text math for the fleet card's "Details" panel
 * facts list (Gate, Backup) — client-only (no server counterpart), so it
 * lives in `web/` rather than `shared/` (epic 0002 "shell decomposition",
 * slice 2: feature-module split of `shell.ts`), following the same pattern
 * `flight-summary-panel.ts`'s `flightSummaryLineMeta` proved. Distinct from
 * `detail-sections.ts`, whose `detailSectionSigs` only computes this same
 * subsection's diff signature, not its rendered text.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The project fields {@link factsMeta} reads. */
export interface FactsMetaInput {
  readonly gate?: string | null;
  readonly backedUp?: unknown;
}

/** One facts-list row's text/tip/aria-label triple. */
export interface FactsFieldMeta {
  readonly text: string;
  readonly tip: string;
  readonly ariaLabel: string;
}

/** {@link factsMeta}'s result — either field is `null` when the project
 *  carries no such fact, the same condition `factsNode` previously branched
 *  on before appending that row at all. */
export interface FactsMeta {
  readonly gate: FactsFieldMeta | null;
  readonly backup: FactsFieldMeta | null;
}

/** The "Gate" and "Backup" facts-list rows' text/tip/aria-label math that
 *  `factsNode` previously computed inline across two conditional blocks
 *  before appending each `<dd>`. */
export function factsMeta(c: FactsMetaInput): FactsMeta {
  return {
    gate: c.gate
      ? {
          text: c.gate,
          tip: 'The check AUTOPILOT runs to verify a change before it commits',
          ariaLabel:
            'Gate: ' + c.gate + ' — the check AUTOPILOT runs to verify a change before it commits',
        }
      : null,
    backup: c.backedUp
      ? {
          text: 'MYTH + LEGACY snapshot',
          tip: 'MYTH is the pristine pre-touch snapshot, LEGACY is the lock-on baseline — both git tags exist before AUTOPILOT changes anything',
          ariaLabel:
            'Backup: MYTH and LEGACY snapshot tags exist before AUTOPILOT changes anything',
        }
      : null,
  };
}
