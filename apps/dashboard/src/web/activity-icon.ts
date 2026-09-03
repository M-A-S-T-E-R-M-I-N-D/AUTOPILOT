// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure data + lookup for the activity feed's vendored inline SVG icons —
 * client-only (no server counterpart), so it lives in `web/` rather than
 * `shared/` (epic 0002 "shell decomposition"). `actIcon()` (the actual
 * `document.createElementNS` SVG-node assembly `narratorKind()`'s icon needs)
 * stays inline in `fleetJs()`: it's pure DOM wiring with no computable logic
 * left once the kind→shapes lookup — {@link actIconShapes} — moves out here.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()`/`JSON.stringify()` — see
 * `fleetJs()` — instead of hand-retyping it, so the two copies can no longer
 * drift apart.
 */

/** One `<path>`/`<rect>`/`<circle>` primitive inside a vendored 16x16 icon —
 *  `t` is the SVG tag name, every other key is an attribute `actIcon()` sets
 *  verbatim via `setAttribute`. */
export interface ActIconShape {
  readonly t: string;
  readonly [attr: string]: string | number;
}

/** Hand-authored 16x16 line-glyph icons for the activity feed (no external
 *  font/icon CDN, so the CSP stays default-src 'self') — keyed by
 *  `narratorKind()` so the icon always matches the sentence next to it. */
export const ACT_ICON_SHAPES: Record<string, readonly ActIconShape[]> = {
  edit: [
    { t: 'path', d: 'M2.5 13.5l.9-3.6 6.9-6.9 2.7 2.7-6.9 6.9-3.6.9z' },
    { t: 'path', d: 'M9.6 3.7l2.7 2.7' },
  ],
  read: [
    { t: 'path', d: 'M4 2h5l3 3v9H4z' },
    { t: 'path', d: 'M9 2v3h3' },
    { t: 'path', d: 'M6 9h4' },
    { t: 'path', d: 'M6 11.5h4' },
  ],
  search: [
    { t: 'circle', cx: 6.8, cy: 6.8, r: 4 },
    { t: 'path', d: 'M9.8 9.8l3.7 3.7' },
  ],
  gate: [
    { t: 'path', d: 'M8 1.5l5 2v4c0 4-2.2 6.3-5 7-2.8-.7-5-3-5-7v-4z' },
    { t: 'path', d: 'M5.5 8l2 2 3-3.5' },
  ],
  commit: [
    { t: 'path', d: 'M1 8h5' },
    { t: 'circle', cx: 8, cy: 8, r: 2 },
    { t: 'path', d: 'M10 8h5' },
  ],
  orient: [
    { t: 'circle', cx: 8, cy: 8, r: 6.5 },
    { t: 'path', d: 'M10.5 5.5l-1.7 4-4 1.7 1.7-4z' },
  ],
  command: [
    { t: 'rect', x: 1.5, y: 2.5, width: 13, height: 11, rx: 1.5 },
    { t: 'path', d: 'M4 6.5l2.5 2-2.5 2' },
    { t: 'path', d: 'M8 10.5h3' },
  ],
  other: [{ t: 'circle', cx: 8, cy: 8, r: 2 }],
};

/**
 * Resolves `kind` (`narratorKind()`'s output) to its icon's shape list,
 * falling back to the generic `other` glyph for any kind without a dedicated
 * icon — `actIcon()`'s one piece of decision logic, previously recomputed
 * inline with no direct test coverage of the fallback.
 */
export function actIconShapes(kind: string): readonly ActIconShape[] {
  return ACT_ICON_SHAPES[kind] ?? ACT_ICON_SHAPES['other']!;
}
