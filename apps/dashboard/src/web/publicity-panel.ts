// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure publicity-panel formatting — client-only, same "server returns raw
 * facts, the client turns them into display text" split `pool-client-
 * panel.ts`/`pr-review-panel.ts` use. Ships the operator-facing surface
 * `docs/epics/0007-platform-maintainer-and-pool.md` slice 7 flagged as open
 * — `GET /api/publicity`'s repo/watch/star/discussions affordances now have
 * somewhere to render.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart. Each
 * exported function stays self-contained (no shared module-scope constants)
 * since `.toString()` serializes only the function body, never its
 * surrounding closure.
 */

/** One publicity affordance, the shape `GET /api/publicity`'s
 *  `affordances[]` entries carry — see `flight/publicity.ts`'s
 *  `PublicityAffordance`. */
export interface PublicityAffordanceLike {
  readonly label: string;
  readonly url: string;
  readonly dormant: boolean;
  readonly reasoning: string;
  readonly count?: number | undefined;
}

/** The publicity affordance link's `data-tip` (also read to screen readers
 *  via an `aria-describedby` sr-only sibling, D1 ATTRIBUTE PAYLOAD epic
 *  0015) — names the affordance, its live GitHub count when the server
 *  resolved one, then the reasoning behind its live or dormant state, same
 *  "name the thing, then say why" shape `poolClaimExecuteTip` uses. */
export function publicityAffordanceTip(affordance: PublicityAffordanceLike): string {
  const countPart = typeof affordance.count === 'number' ? ' · ' + affordance.count : '';
  return affordance.label + countPart + ' — ' + affordance.reasoning;
}
