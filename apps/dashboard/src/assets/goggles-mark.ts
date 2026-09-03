// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { BG_HEX, FG_HEX, FRAME_HEX } from './brand-colors.js';
import {
  BRIDGE,
  CORNER_RATIO,
  CY,
  GLASS_R,
  LEFT_CX,
  LENS_R,
  RIGHT_CX,
  STRAP_WIDTH,
  STRAPS,
  STRUT_WIDTH,
  VIEWBOX,
  type Segment,
} from './goggles-geometry.js';

/**
 * The goggles mark (epic 0008 slice 1; pad silhouette added per founder
 * direction 2026-08-20) — AUTOPILOT's primary brand mark: minimal front-on
 * VINTAGE aviator goggles, Army Air Corps D-1 style — two round padded
 * eyecups (a leather-pad ring around each glass, not a flat circle), a
 * bridge, a strap hint. The figure that wears them is never drawn — only
 * the goggles — so the mark answers "who is the pilot?" the same way every
 * time: the one flying your repo. Hand-authored SVG, geometry from
 * `goggles-geometry.ts` (the same source `brandmark.ts`'s raster favicon
 * pipeline draws from — epic 0008 slice 2) so one shape stays legible from a
 * 16px favicon through a 1024px social card.
 */

export type GogglesTheme = 'dark' | 'light';
export type GogglesVariant = 'plain' | 'crafted' | 'stamp';
export type GogglesEdition = 'universal' | 'founder';

export interface GogglesMarkOptions {
  readonly theme?: GogglesTheme;
  readonly variant?: GogglesVariant;
  /** Rounded-square backdrop for favicon/avatar use; false for transparent linework (README/doc embedding). */
  readonly background?: boolean;
  /**
   * `universal` (default) is the repo's default face — flat accent-color
   * glass. `founder` is the signature variant from epic 0008 slice 4
   * (founder direction 2026-08-14): a blue-white lens gradient plus a
   * subtle six-point glint in each lens reflection, for the founder's own
   * profile/release signature ("MΔSTERMIND"), never the default repo face.
   */
  readonly edition?: GogglesEdition;
}

interface GogglesPalette {
  readonly bg: string;
  readonly frame: string;
  readonly lens: string;
}

/**
 * Dark reuses the app-icon's exact hex (`brand-colors.ts`) so the two marks
 * read as one family. Light is the same MX tokens (packages/tokens/src/themes.ts
 * LIGHT.surface/text/accent) converted OKLCH -> linear sRGB (Björn
 * Ottosson's matrices, the same math as packages/tokens/src/color.ts's
 * relativeLuminance) -> gamma-encoded sRGB, computed once by hand — a
 * static mark doesn't need to re-theme with the page, the same reasoning
 * brandmark.ts already applies to the dark palette.
 */
const PALETTE: Readonly<Record<GogglesTheme, GogglesPalette>> = {
  dark: { bg: BG_HEX, frame: FRAME_HEX, lens: FG_HEX },
  light: { bg: '#fbfcfd', frame: '#171b20', lens: '#0063d7' },
};

function roundedSquareBackdrop(fill: string): string {
  const radius = (VIEWBOX * CORNER_RATIO).toFixed(2);
  return `<rect width="${VIEWBOX}" height="${VIEWBOX}" rx="${radius}" fill="${fill}" />`;
}

/** The padded eyecups — filled circles at the outer LENS_R, one per lens, sat behind the glass so the ring between GLASS_R and LENS_R reads as a leather pad. */
function pads(fill: string): string {
  return (
    `<circle cx="${LEFT_CX}" cy="${CY}" r="${LENS_R}" fill="${fill}" />` +
    `<circle cx="${RIGHT_CX}" cy="${CY}" r="${LENS_R}" fill="${fill}" />`
  );
}

function lenses(fill: string): string {
  return (
    `<circle cx="${LEFT_CX}" cy="${CY}" r="${GLASS_R}" fill="${fill}" />` +
    `<circle cx="${RIGHT_CX}" cy="${CY}" r="${GLASS_R}" fill="${fill}" />`
  );
}

function strokedSegment(seg: Segment, stroke: string, width: number): string {
  return `<line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" />`;
}

/** The bridge piece over the nose — overlaps each lens edge by 0.5 so the join reads solid, not gapped. */
function bridge(stroke: string): string {
  return strokedSegment(BRIDGE, stroke, STRUT_WIDTH);
}

/**
 * Two short outward ticks off each lens's outer-upper edge — the strap
 * disappearing off-canvas, never drawn further. Wider than the bridge
 * (`STRAP_WIDTH`, not `STRUT_WIDTH`) so the diagonal tick still reads at a
 * true 16px favicon render instead of anti-aliasing away.
 */
function strapHints(stroke: string): string {
  return STRAPS.map((seg) => strokedSegment(seg, stroke, STRAP_WIDTH)).join('');
}

/** Crafted-linework framing: a stitch-line ring etched into each pad, midway between the glass and the pad's outer edge (bg-colored stroke over the pad fill). */
function craftedRings(stroke: string): string {
  const r = ((GLASS_R + LENS_R) / 2).toFixed(2);
  return (
    `<circle cx="${LEFT_CX}" cy="${CY}" r="${r}" fill="none" stroke="${stroke}" stroke-width="0.6" />` +
    `<circle cx="${RIGHT_CX}" cy="${CY}" r="${r}" fill="none" stroke="${stroke}" stroke-width="0.6" />`
  );
}

/** Stamp-seal framing: a double ring around the whole mark, badge-style. */
function stampRing(stroke: string): string {
  const center = VIEWBOX / 2;
  return (
    `<circle cx="${center}" cy="${center}" r="15" fill="none" stroke="${stroke}" stroke-width="0.8" />` +
    `<circle cx="${center}" cy="${center}" r="13.4" fill="none" stroke="${stroke}" stroke-width="0.4" />`
  );
}

function founderLensGradientId(theme: GogglesTheme): string {
  return `founder-lens-gradient-${theme}`;
}

/**
 * The founder edition's blue-white lens gradient — a radial highlight (white,
 * offset toward the upper-left like a light source) fading to the theme's
 * accent blue at the pad edge, instead of the universal edition's flat
 * accent fill. Reads as a mirrored, reflective lens — "mirrored lenses that
 * reveal nothing" (epic 0008's synthesis) made literal for the founder's own
 * signature variant.
 */
function founderLensGradientDefs(theme: GogglesTheme, accent: string): string {
  const id = founderLensGradientId(theme);
  return `<defs><radialGradient id="${id}" cx="35%" cy="35%" r="75%">
    <stop offset="0%" stop-color="#ffffff" />
    <stop offset="100%" stop-color="${accent}" />
  </radialGradient></defs>`;
}

/** Half-length of each of the glint's three crossing strokes — small enough to sit inside the glass, not spill onto the pad. */
const GLINT_RAY_R = GLASS_R * 0.42;
/** The glint's center, offset up-left within the glass — a light-source position, not dead-center. */
const GLINT_OFFSET = GLASS_R * 0.32;

/** One six-point glint: three crossing strokes through a center point (0°/60°/120°), six visible ray tips — a subtle nod to the founder's six-point themes, never the primary mark's story. */
function sixPointGlint(cx: number, cy: number, stroke: string): string {
  return [0, 60, 120]
    .map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const dx = Math.cos(rad) * GLINT_RAY_R;
      const dy = Math.sin(rad) * GLINT_RAY_R;
      const x1 = (cx - dx).toFixed(2);
      const y1 = (cy - dy).toFixed(2);
      const x2 = (cx + dx).toFixed(2);
      const y2 = (cy + dy).toFixed(2);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="0.5" stroke-linecap="round" />`;
    })
    .join('');
}

/** A glint in each lens, positioned identically relative to its own center so the pair reads as one deliberate reflection, not two accidents. */
function founderGlints(stroke: string): string {
  return (
    sixPointGlint(LEFT_CX - GLINT_OFFSET, CY - GLINT_OFFSET, stroke) +
    sixPointGlint(RIGHT_CX - GLINT_OFFSET, CY - GLINT_OFFSET, stroke)
  );
}

/**
 * The goggles mark as a self-contained SVG string — two lenses, a bridge, a
 * strap hint, at every requested theme/variant/backdrop combination. `plain`
 * is the primary mark, validated legible from 16px to 1024px; `crafted` and
 * `stamp` are framing options sized for the larger README-header context.
 * Fixed hex per theme (see `PALETTE`) — for a live, re-themeable rendition
 * embedded in the running dashboard, use `gogglesMarkInlineSvg()` instead.
 */
export function gogglesMarkSvg(options: GogglesMarkOptions = {}): string {
  const { theme = 'dark', variant = 'plain', background = true, edition = 'universal' } = options;
  const { bg, frame, lens } = PALETTE[theme];
  const isFounder = edition === 'founder';
  const lensFill = isFounder ? `url(#${founderLensGradientId(theme)})` : lens;
  const layers = [
    isFounder ? founderLensGradientDefs(theme, lens) : '',
    background ? roundedSquareBackdrop(bg) : '',
    variant === 'stamp' ? stampRing(frame) : '',
    pads(frame),
    lenses(lensFill),
    isFounder ? founderGlints('#ffffff') : '',
    bridge(frame),
    strapHints(frame),
    variant === 'crafted' ? craftedRings(bg) : '',
  ].filter((layer) => layer !== '');
  const label = isFounder
    ? 'AUTOPILOT — aviator goggles mark, founder signature edition'
    : 'AUTOPILOT — aviator goggles mark';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" role="img" aria-label="${label}">
  ${layers.join('\n  ')}
</svg>
`;
}

/**
 * The goggles mark for live, in-app embedding (epic 0008 slice 2 — the
 * masthead brand lockup, `web/shell.ts`). Colors are CSS custom properties
 * (`var(--color-accent)`/`var(--color-text)`, `packages/tokens`) instead of
 * `PALETTE`'s fixed hex, so the icon re-themes instantly when the theme
 * switcher flips `document.documentElement.dataset.theme` — a baked-hex
 * SVG would go stale until reload. Always transparent linework (no
 * backdrop): it sits inline next to the "AUTOPILOT" wordmark text, not on
 * its own tile.
 */
export function gogglesMarkInlineSvg(): string {
  const layers = [
    pads('var(--color-text)'),
    lenses('var(--color-accent)'),
    bridge('var(--color-text)'),
    strapHints('var(--color-text)'),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" role="img" aria-label="AUTOPILOT — aviator goggles mark" focusable="false">
  ${layers.join('\n  ')}
</svg>
`;
}
