// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Fits a pipeline node's label into its cell.
 *
 * Operator, 2026-09-18: "the file names and the whole pipeline view still
 * look bad typographically". The files lens labels every node with a full
 * repo path, and a 120-unit cell held `apps/dashboard/src/web/shell.ts`
 * by overflowing both of its edges into the neighbouring lanes.
 *
 * Pure text math — no DOM, no measurement. The renderer runs on the server
 * and is spliced into the client by `.toString()`, and SVG text cannot be
 * measured before it is painted anyway. The budget is a character count
 * derived from the cell width and the label font's average advance; the
 * full label always survives in the node's `<title>`, so nothing is lost,
 * only abbreviated. The LEAF (the file name) is what a reader scans for,
 * so it is the last thing to give way: `…/web/shell.ts` before `shell.ts`
 * alone, and only then `shell-decompo…ts`.
 */

export interface FittedLabel {
  /** The leading directories that still fit, ellipsised from the front and
   *  ending in a slash — '' for a label with no separator or no room. */
  readonly head: string;
  /** The last path segment, or the whole label when it has no separator. */
  readonly leaf: string;
  /** Whether anything was cut — the caller keeps the full text in a title. */
  readonly truncated: boolean;
}

/** Average glyph advance of the node label font (text-xs, 12 user units) on
 *  the Inter/system stack, a hair conservative so a fitted label never
 *  touches the cell edge. */
export const PIPELINE_LABEL_CHAR_UNITS = 6.6;
/** Horizontal padding inside a node, both sides together, in viewBox units. */
export const PIPELINE_LABEL_PAD_UNITS = 16;
/** The one glyph that stands for the cut — never three dots. */
export const LABEL_ELLIPSIS = '…';
/** Below this a label is unreadable anyway; the budget never drops under it. */
export const LABEL_MIN_CHARS = 4;

/** How many characters a cell of `cellWidth` viewBox units can show. */
export function labelBudget(cellWidth: number): number {
  return Math.max(
    LABEL_MIN_CHARS,
    Math.floor((cellWidth - PIPELINE_LABEL_PAD_UNITS) / PIPELINE_LABEL_CHAR_UNITS),
  );
}

export function fitLabel(label: string, maxChars: number): FittedLabel {
  // lastIndexOf is -1 for a bare name, and slice(0) / slice(0, 0) then give
  // the whole label and '' — no branch needed for that case.
  const slash = label.lastIndexOf('/');
  const leaf = label.slice(slash + 1);
  const dirs = label.slice(0, slash + 1);
  if (label.length <= maxChars) return { head: dirs, leaf, truncated: false };

  // The leaf fits with room for `…/` in front: keep as many TRAILING
  // directory segments as the budget allows, so `…/web/shell.ts` beats
  // `…/shell.ts` whenever the extra segment fits.
  if (leaf.length + LABEL_ELLIPSIS.length + 1 <= maxChars) {
    const room = maxChars - leaf.length - LABEL_ELLIPSIS.length - 1;
    const segments = dirs.split('/').filter((segment) => segment.length > 0);
    let head = '';
    for (const segment of [...segments].reverse()) {
      const candidate = `${segment}/${head}`;
      if (candidate.length > room) break;
      head = candidate;
    }
    return { head: `${LABEL_ELLIPSIS}/${head}`, leaf, truncated: true };
  }

  // Even the leaf alone overflows: keep its start and its extension, so a
  // reader still sees what kind of file it is.
  const dot = leaf.lastIndexOf('.');
  const ext = dot > 0 ? leaf.slice(dot) : '';
  const keep = Math.max(1, maxChars - ext.length - LABEL_ELLIPSIS.length);
  return { head: '', leaf: `${leaf.slice(0, keep)}${LABEL_ELLIPSIS}${ext}`, truncated: true };
}
