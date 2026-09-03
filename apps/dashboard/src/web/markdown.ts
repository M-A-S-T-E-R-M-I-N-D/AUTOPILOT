// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure line-classification/parsing helpers for the Docs viewer's Markdown
 * renderer — client-only (no server counterpart, unlike `shared/*.ts`), so
 * it lives in `web/` rather than `shared/` (epic 0002 "shell decomposition",
 * slice 2: feature-module split of `shell.ts`), following the same pattern
 * `office-map.ts`/`format.ts`/`heatmap.ts`/`flight-metrics.ts` proved.
 * Deliberately DOM-free: the DOM-building half (`appendInline`,
 * `sanitizeChartNode`, `renderChartSvg`, `renderMarkdown` itself) stays
 * inline in `fleetJs()`, same reason `office-map.ts` left its SVG-drawing
 * half inline — those need `document`/DOM types the build tsconfig doesn't
 * currently carry.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** Splits one Markdown table row into trimmed cell text, dropping the
 *  leading/trailing pipe if present. */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

/** A fenced code block delimiter line (```` ``` ````). */
export function isFence(line: string): boolean {
  return /^\s*```/.test(line);
}

/** An ATX heading line (`#` through `######`). */
export function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

/** A bulleted (`-`/`*`) or ordered (`1.`) list item line. */
export function isListItem(line: string): boolean {
  return /^\s*([-*]|\d+\.)\s+/.test(line);
}

/** The opening line of a raw embedded `<svg>` block (self-study charts). */
export function isSvgStart(line: string): boolean {
  return /^\s*<svg[\s>]/i.test(line);
}

/** True when `lines[idx]` is a table header row — it contains a pipe and the
 *  next line is a valid header/body separator (`| :-- | --: |`, dashes only,
 *  etc). */
export function isTableStart(lines: readonly string[], idx: number): boolean {
  const line = lines[idx] ?? '';
  return (
    line.indexOf('|') !== -1 &&
    idx + 1 < lines.length &&
    /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[idx + 1] ?? '')
  );
}

/** True when `lines[idx]` starts (or is) a block-level element — a blank
 *  line, fence, heading, list item, table, or embedded SVG — so a paragraph
 *  scan knows where to stop. */
export function isBlockStart(lines: readonly string[], idx: number): boolean {
  const line = lines[idx] ?? '';
  return (
    !line.trim() ||
    isFence(line) ||
    isHeading(line) ||
    isListItem(line) ||
    isTableStart(lines, idx) ||
    isSvgStart(line)
  );
}
