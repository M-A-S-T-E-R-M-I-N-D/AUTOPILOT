// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The goggles mark's numeric shape (epic 0008 slice 2; pad silhouette added
 * per founder direction 2026-08-20 — the mark must read as vintage Army Air
 * Corps D-1 flying goggles, not modern sunglasses) — the ONE geometry source
 * both the vector SVG (`goggles-mark.ts`) and the raster favicon pipeline
 * (`brandmark.ts`) draw two padded lenses, a bridge, and strap hints from,
 * so a future shape tweak edits one place instead of drifting the vector and
 * raster renditions apart.
 */

export const VIEWBOX = 32;
export const CORNER_RATIO = 0.22;
/** Outer radius of each padded eyecup — unchanged from the original flat lens so overall footprint/legibility stays validated. */
export const LENS_R = 5.5;
/** Inner radius of the glass, seated inside the pad — the gap between GLASS_R and LENS_R is the visible leather-pad ring. */
export const GLASS_R = 3.4;
export const LEFT_CX = 10;
export const RIGHT_CX = 22;
export const CY = 17;
export const STRUT_WIDTH = 1.6;
/**
 * Strap ticks are short and diagonal, so a hairline stroke anti-aliases away
 * almost entirely at a true 16px favicon render (unlike the bridge, which is
 * long enough to survive at `STRUT_WIDTH`) — wider than the bridge on
 * purpose so the strap hint stays legible at the smallest real icon size,
 * not just as a >64px preview.
 */
export const STRAP_WIDTH = 3.2;

export interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** The bridge overlaps each lens edge by 0.5 so the join reads as one solid piece, not a gap. */
export const BRIDGE: Segment = {
  x1: LEFT_CX + LENS_R - 0.5,
  y1: CY,
  x2: RIGHT_CX - LENS_R + 0.5,
  y2: CY,
};

/** Two short outward ticks off each lens's outer-upper edge — the strap disappearing off-canvas. */
export const STRAPS: readonly Segment[] = [
  { x1: 5.2, y1: 14.3, x2: 2, y2: 10.5 },
  { x1: 26.8, y1: 14.3, x2: 30, y2: 10.5 },
];
