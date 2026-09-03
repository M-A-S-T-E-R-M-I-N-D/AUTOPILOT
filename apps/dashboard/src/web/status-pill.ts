// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure status-pill label/tip/aria-label math for the fleet card's project-status
 * badge and the task board's per-task status pill (epic 0002 "shell decomposition",
 * slice 2, seventy-fourth cut) — client-only (no server counterpart), so it lives
 * in `web/` rather than `shared/`, following the same pattern `gauge.ts`/
 * `lang-bar.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the generated
 * `/app.js` text via `.toString()` — see `fleetJs()` — instead of hand-retyping
 * it, so the two copies can no longer drift apart.
 */

/** {@link statusPillMeta}'s result: the pill's visible label, and its hover/focus
 *  tip + aria-label — both `null` when `status` carries no entry in the caller's
 *  tip map (the pill renders unexplained, same as `statusPill`'s original inline
 *  `if (tip)` guard). */
export interface StatusPillMeta {
  readonly label: string;
  readonly tip: string | null;
  readonly ariaLabel: string | null;
}

/** Turns a raw status string ("needs_approval") into its pill label ("needs
 *  approval" — only the first underscore is replaced, mirroring the original
 *  inline `.replace('_', ' ')`) plus, when the caller's tip map carries an
 *  entry for it, the "Status: <label> — <tip>" aria-label shown alongside the
 *  hover/focus tip itself. */
export function statusPillMeta(
  status: string,
  tips: Readonly<Record<string, string>>,
): StatusPillMeta {
  const label = String(status).replace('_', ' ');
  const tip = tips[status] ?? null;
  const ariaLabel = tip ? `Status: ${label} — ${tip}` : null;
  return { label, tip, ariaLabel };
}
