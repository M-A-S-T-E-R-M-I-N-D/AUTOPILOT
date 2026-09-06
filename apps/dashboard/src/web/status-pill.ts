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
 *
 * i18n (board web-msnsndki-dz3vn1): the caller's map names, per status, the
 * `STRINGS` key of its label; the tip's key is that key + `Tip`, the pairing
 * convention every tip in `STRINGS` already follows (`taskAdd`/`taskAddTip`,
 * `liveTool…`/`liveToolTip`). The bundle's `tr()` is injected the same way
 * `flightProgressOf` takes its translator (a spliced function can no more
 * import one than it can a formatter). The aria-label is the shared
 * `statusAria` template filled from those two translated atoms, and both keys
 * ride back out (`labelKey`/`tipKey`) so `statusPill()` can tag the element
 * `[data-i18n]` / `[data-i18n-tip]` / `[data-i18n-aria-template]` for
 * `translateDom()`'s sweeps — whose template pass fills `{label}`/`{tip}`
 * from those same two own keys — so a mid-session locale switch flips all
 * three in place.
 */

/** The bundle's `tr(key, subs)` (`web/features/locale.ts`), injected into
 *  {@link statusPillMeta}. */
export type StatusPillTranslator = (
  key: string,
  subs?: Readonly<Record<string, string | number>>,
) => string;

/** {@link statusPillMeta}'s result: the pill's visible label, its hover/focus
 *  tip + aria-label, and the `STRINGS` keys behind the label and tip — the
 *  tip, aria-label and keys are all `null` when `status` carries no entry in
 *  the caller's key map (the pill renders unexplained, same as `statusPill`'s
 *  original inline `if (tip)` guard). */
export interface StatusPillMeta {
  readonly label: string;
  readonly tip: string | null;
  readonly ariaLabel: string | null;
  readonly labelKey: string | null;
  readonly tipKey: string | null;
}

/** Resolves a status's translated label, tip, and "Status: <label> — <tip>"
 *  aria-label through the caller's `status → label key` map. A status with no
 *  entry keeps the original fallback label — the raw status with only its
 *  FIRST underscore replaced by a space ("needs_approval" → "needs approval"),
 *  mirroring the original inline `.replace('_', ' ')` — and no tip or
 *  aria-label. */
export function statusPillMeta(
  status: string,
  keys: Readonly<Record<string, string>>,
  tr: StatusPillTranslator,
): StatusPillMeta {
  const labelKey = keys[status] ?? null;
  if (!labelKey) {
    const fallback = String(status).replace('_', ' ');
    return { label: fallback, tip: null, ariaLabel: null, labelKey: null, tipKey: null };
  }
  const tipKey = labelKey + 'Tip';
  const label = tr(labelKey);
  const tip = tr(tipKey);
  return { label, tip, ariaLabel: tr('statusAria', { label, tip }), labelKey, tipKey };
}
