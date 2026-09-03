// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure drop-target math for the task list's pointer drag-reorder (HTML5 DnD,
 * zero deps) — client-only, so it lives in `web/` rather than `shared/`
 * (epic 0002 "shell decomposition"). The `dragover` handler stays inline in
 * `fleetJs()`: it's pure DOM wiring (`getBoundingClientRect()` reads,
 * `insertBefore()` writes) with no computable logic left once the "which row
 * does the pointer sit above" math — {@link dragBeforeIndex} — moves out
 * here. Same shape as `tipPosition` (web/tip-position.ts): takes plain rect
 * data instead of live DOM elements, returns a plain result.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** One open row's viewport rect — the fields {@link dragBeforeIndex} reads
 *  off each candidate row's `getBoundingClientRect()`. */
export interface DragBoxRect {
  readonly top: number;
  readonly height: number;
}

/**
 * Given the vertical midpoints of the other open rows and the pointer's
 * `clientY`, picks the row the dragged item should be inserted BEFORE — the
 * open row whose midpoint sits closest below the pointer. Returns `null`
 * when the pointer is below every row's midpoint (the dragged item belongs
 * at the end instead).
 */
export function dragBeforeIndex(boxes: readonly DragBoxRect[], clientY: number): number | null {
  let before: number | null = null;
  let closestOffset = -Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (!box) continue;
    const offset = clientY - box.top - box.height / 2;
    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset;
      before = i;
    }
  }
  return before;
}
