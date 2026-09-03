// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure clamp/flip geometry for the shared `[data-tip]` tooltip primitive
 * (app-wide hover/focus tooltips, not just sparklines) — client-only (no
 * server counterpart), so it lives in `web/` rather than `shared/` (epic
 * 0002 "shell decomposition"). `showTip()` (the actual `getBoundingClientRect`
 * reads and `tip.style.left`/`top` writes) stays inline in `fleetJs()`: it's
 * pure DOM wiring with no computable logic left once the positioning math —
 * {@link tipPosition} — moves out here.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The hovered/focused target element's viewport rect — the fields
 *  {@link tipPosition} reads off `target.getBoundingClientRect()`. */
export interface TipTargetRect {
  readonly left: number;
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
}

/** The tooltip element's own viewport rect — read AFTER it is unhidden
 *  (`tip.hidden = false`) so its real rendered size is known. */
export interface TipBoxRect {
  readonly width: number;
  readonly height: number;
}

/** The tooltip's computed `left`/`top`, in CSS pixels (unitless numbers —
 *  `showTip()` appends `'px'`). */
export interface TipPosition {
  readonly left: number;
  readonly top: number;
}

/**
 * Centers the tooltip horizontally over `box`, clamped to a 4px viewport
 * margin on either side so it never overflows off-screen. Prefers sitting
 * above the target (an 8px gap); when there isn't room above (`top < 4`,
 * e.g. the target sits near the top of the viewport), flips it below the
 * target instead — previously computed inline in `showTip()` with neither
 * branch under direct test.
 */
export function tipPosition(
  box: TipTargetRect,
  tipBox: TipBoxRect,
  viewportWidth: number,
): TipPosition {
  const left = Math.max(
    4,
    Math.min(box.left + box.width / 2 - tipBox.width / 2, viewportWidth - tipBox.width - 4),
  );
  let top = box.top - tipBox.height - 8;
  if (top < 4) top = box.bottom + 8;
  return { left, top };
}
