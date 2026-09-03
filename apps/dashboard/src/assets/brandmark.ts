// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { BG_HEX } from './brand-colors.js';
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
import { gogglesMarkSvg } from './goggles-mark.js';
import { encodeIco, encodePng, encodePngRect } from './png.js';

/**
 * The AUTOPILOT favicon/manifest raster pipeline (epic 0008 slice 2; pad
 * silhouette added per founder direction 2026-08-20) — the goggles mark
 * (`goggles-mark.ts`), rasterized: two padded eyecups (glass + a leather-pad
 * ring around it) + a bridge + strap-hint strokes on a dark rounded-square
 * backdrop. Shares its exact shape source (`goggles-geometry.ts`) and
 * colors (`brand-colors.ts`) with the vector SVG, so favicon.ico/icon-*.png
 * and the README/in-app marks can never silently diverge. Colors are fixed
 * hex, not the live OKLCH token pipeline — a static app icon doesn't
 * re-theme with the page.
 */
const BG: readonly [number, number, number] = [0x0a, 0x0d, 0x12];
const FG: readonly [number, number, number] = [0x25, 0xba, 0xf2];
const FRAME: readonly [number, number, number] = [0xf0, 0xf2, 0xf5];

const SUPERSAMPLE = 4;

/** Signed distance to a centered rounded square (Inigo Quilez's formula); <= 0 is inside. */
function roundedSquareSdf(x: number, y: number, size: number, radius: number): number {
  const half = size / 2;
  const qx = Math.abs(x - half) - (half - radius);
  const qy = Math.abs(y - half) - (half - radius);
  const outsideX = Math.max(qx, 0);
  const outsideY = Math.max(qy, 0);
  return (
    Math.sqrt(outsideX * outsideX + outsideY * outsideY) + Math.min(Math.max(qx, qy), 0) - radius
  );
}

/** Shortest distance from a point to a line segment (for stroke-width hit testing). */
function distToSegment(px: number, py: number, seg: Segment): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq));
  const ex = px - (seg.x1 + t * dx);
  const ey = py - (seg.y1 + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Rasterize the mark at `size`x`size` as straight RGBA8 (no PNG filter
 * bytes) — box-supersampled (4x4) for anti-aliased edges without pulling in
 * a rasterization library. Geometry scales from the 32-unit goggles canvas
 * (`goggles-geometry.ts`) to the requested pixel size.
 */
export function renderIconPixels(size: number): Uint8Array {
  const radius = size * CORNER_RATIO;
  const scale = size / VIEWBOX;
  const leftCx = LEFT_CX * scale;
  const rightCx = RIGHT_CX * scale;
  const cy = CY * scale;
  const padR = LENS_R * scale;
  const glassR = GLASS_R * scale;
  const strokeHalf = (STRUT_WIDTH * scale) / 2;
  const strapStrokeHalf = (STRAP_WIDTH * scale) / 2;
  const bridgePx: Segment = {
    x1: BRIDGE.x1 * scale,
    y1: BRIDGE.y1 * scale,
    x2: BRIDGE.x2 * scale,
    y2: BRIDGE.y2 * scale,
  };
  const strapsPx: readonly Segment[] = STRAPS.map((seg) => ({
    x1: seg.x1 * scale,
    y1: seg.y1 * scale,
    x2: seg.x2 * scale,
    y2: seg.y2 * scale,
  }));
  const out = new Uint8Array(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let alphaSum = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = px + (sx + 0.5) / SUPERSAMPLE;
          const y = py + (sy + 0.5) / SUPERSAMPLE;
          if (roundedSquareSdf(x, y, size, radius) > 0) continue;
          alphaSum += 1;
          const dxL = x - leftCx;
          const dyL = y - cy;
          const dxR = x - rightCx;
          const dyR = y - cy;
          const distLSq = dxL * dxL + dyL * dyL;
          const distRSq = dxR * dxR + dyR * dyR;
          const inGlass = distLSq <= glassR * glassR || distRSq <= glassR * glassR;
          const inPad = !inGlass && (distLSq <= padR * padR || distRSq <= padR * padR);
          const inStroke =
            !inGlass &&
            !inPad &&
            (distToSegment(x, y, bridgePx) <= strokeHalf ||
              strapsPx.some((seg) => distToSegment(x, y, seg) <= strapStrokeHalf));
          const [cr, cg, cb] = inGlass ? FG : inPad || inStroke ? FRAME : BG;
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const i = (py * size + px) * 4;
      if (alphaSum === 0) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
        continue;
      }
      out[i] = Math.round(r / alphaSum);
      out[i + 1] = Math.round(g / alphaSum);
      out[i + 2] = Math.round(b / alphaSum);
      out[i + 3] = Math.round((alphaSum / samples) * 255);
    }
  }
  return out;
}

const pngCache = new Map<number, Buffer>();

/** Memoized PNG render — the mark never changes, so repeat favicon fetches don't re-rasterize. */
export function renderIconPng(size: number): Buffer {
  const cached = pngCache.get(size);
  if (cached) return cached;
  const png = encodePng(size, renderIconPixels(size));
  pngCache.set(size, png);
  return png;
}

let icoCache: Buffer | undefined;

/** The classic favicon.ico, multi-resolution (16/32/48) for legacy chrome that ignores SVG icons. */
export function renderFaviconIco(): Buffer {
  if (!icoCache) {
    icoCache = encodeIco([16, 32, 48].map((size) => ({ size, png: renderIconPng(size) })));
  }
  return icoCache;
}

/**
 * The scalable brand mark — delegates to `gogglesMarkSvg()` (the ONE
 * source SVG, epic 0008 slice 2) instead of hand-duplicating markup, so the
 * favicon route and every other consumer of the mark render byte-identical
 * vector output.
 */
export function faviconSvg(): string {
  return gogglesMarkSvg({ theme: 'dark', variant: 'plain', background: true });
}

/**
 * GitHub face exports (epic 0008 slice 3) — committed static PNGs for the
 * canonical repo's avatar and social-preview card, generated once from the
 * same `renderIconPixels` source the favicon pipeline already rasterizes
 * (see `docs/brand/` and `test/assets/github-face-assets.test.ts`, the same
 * commit-and-guard pattern slice 2 used for the README's SVG exports).
 * Uploading them to GitHub Settings is a live action on the founder's own
 * account/repo — out of scope for generation, done by the operator.
 */
export const AVATAR_SIZE = 512;
export const SOCIAL_PREVIEW_WIDTH = 1280;
export const SOCIAL_PREVIEW_HEIGHT = 640;
export const SOCIAL_PREVIEW_MARK_SIZE = 480;

/** Avatar-sized favicon render — GitHub crops profile/org pictures to a circle, so the existing rounded-square backdrop already sits safely inside it. */
export function renderAvatarPng(): Buffer {
  return renderIconPng(AVATAR_SIZE);
}

/**
 * Paints an opaque `sprite` (its own alpha-blended edges) onto `canvas` at
 * `(offsetX, offsetY)` — used to center the square goggles-mark tile inside
 * the wider 2:1 social-preview canvas without re-deriving the mark's SDF
 * geometry for a second, rectangular composition.
 */
function compositeOnto(
  canvas: Uint8Array,
  canvasWidth: number,
  sprite: Uint8Array,
  spriteSize: number,
  offsetX: number,
  offsetY: number,
): void {
  for (let sy = 0; sy < spriteSize; sy += 1) {
    for (let sx = 0; sx < spriteSize; sx += 1) {
      const si = (sy * spriteSize + sx) * 4;
      const alpha = sprite[si + 3]! / 255;
      if (alpha === 0) continue;
      const ci = ((offsetY + sy) * canvasWidth + (offsetX + sx)) * 4;
      canvas[ci] = Math.round(sprite[si]! * alpha + canvas[ci]! * (1 - alpha));
      canvas[ci + 1] = Math.round(sprite[si + 1]! * alpha + canvas[ci + 1]! * (1 - alpha));
      canvas[ci + 2] = Math.round(sprite[si + 2]! * alpha + canvas[ci + 2]! * (1 - alpha));
      canvas[ci + 3] = 255;
    }
  }
}

/**
 * The 1280x640 (GitHub's recommended 2:1 social-preview ratio) card: the
 * goggles mark's own rounded-square tile, centered on a flat brand-dark
 * field. No wordmark text — same reasoning as the README export (BRAND.md):
 * baking text into a raster GitHub can't guarantee re-rendering isn't worth
 * it, and "the mask IS the mark" already carries the brand alone.
 */
export function renderSocialPreviewPixels(): Uint8Array {
  const canvas = new Uint8Array(SOCIAL_PREVIEW_WIDTH * SOCIAL_PREVIEW_HEIGHT * 4);
  for (let i = 0; i < canvas.length; i += 4) {
    canvas[i] = BG[0];
    canvas[i + 1] = BG[1];
    canvas[i + 2] = BG[2];
    canvas[i + 3] = 255;
  }
  const mark = renderIconPixels(SOCIAL_PREVIEW_MARK_SIZE);
  const offsetX = Math.round((SOCIAL_PREVIEW_WIDTH - SOCIAL_PREVIEW_MARK_SIZE) / 2);
  const offsetY = Math.round((SOCIAL_PREVIEW_HEIGHT - SOCIAL_PREVIEW_MARK_SIZE) / 2);
  compositeOnto(canvas, SOCIAL_PREVIEW_WIDTH, mark, SOCIAL_PREVIEW_MARK_SIZE, offsetX, offsetY);
  return canvas;
}

let socialPreviewCache: Buffer | undefined;

/** Memoized PNG render — the card never changes, so repeat generations don't re-rasterize. */
export function renderSocialPreviewPng(): Buffer {
  if (!socialPreviewCache) {
    socialPreviewCache = encodePngRect(
      SOCIAL_PREVIEW_WIDTH,
      SOCIAL_PREVIEW_HEIGHT,
      renderSocialPreviewPixels(),
    );
  }
  return socialPreviewCache;
}

/** Web app manifest (PWA install metadata) — served at /manifest.webmanifest. */
export function webManifest(): string {
  return JSON.stringify(
    {
      name: 'AUTOPILOT',
      short_name: 'AUTOPILOT',
      description: 'AUTOPILOT dashboard — fleet control for autonomous engineering flights.',
      start_url: '/',
      display: 'standalone',
      background_color: BG_HEX,
      theme_color: BG_HEX,
      icons: [
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    },
    null,
    2,
  );
}
