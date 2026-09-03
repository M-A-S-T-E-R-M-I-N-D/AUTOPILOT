// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  AVATAR_SIZE,
  SOCIAL_PREVIEW_HEIGHT,
  SOCIAL_PREVIEW_MARK_SIZE,
  SOCIAL_PREVIEW_WIDTH,
  faviconSvg,
  renderAvatarPng,
  renderFaviconIco,
  renderIconPixels,
  renderIconPng,
  renderSocialPreviewPixels,
  renderSocialPreviewPng,
  webManifest,
} from '../../src/assets/brandmark.js';
import {
  BRIDGE,
  CY,
  GLASS_R,
  LEFT_CX,
  LENS_R,
  RIGHT_CX,
  STRAPS,
  VIEWBOX,
} from '../../src/assets/goggles-geometry.js';

describe('renderIconPixels', () => {
  it('produces one RGBA pixel per grid cell', () => {
    const size = 16;
    expect(renderIconPixels(size).length).toBe(size * size * 4);
  });

  it('paints the accent color inside each lens, the frame color on the bridge, and leaves corners transparent', () => {
    const size = 64; // 2x the 32-unit goggles canvas — headroom so sample pixels sit well clear of any edge.
    const scale = size / VIEWBOX;
    const px = renderIconPixels(size);
    const at = (x: number, y: number) => {
      const i = (y * size + x) * 4;
      return { r: px[i]!, g: px[i + 1]!, b: px[i + 2]!, a: px[i + 3]! };
    };
    const leftLens = at(Math.round(LEFT_CX * scale), Math.round(CY * scale));
    expect(leftLens).toEqual({ r: 0x25, g: 0xba, b: 0xf2, a: 255 });
    const rightLens = at(Math.round(RIGHT_CX * scale), Math.round(CY * scale));
    expect(rightLens).toEqual({ r: 0x25, g: 0xba, b: 0xf2, a: 255 });
    const bridgeMid = at(Math.round(((LEFT_CX + RIGHT_CX) / 2) * scale), Math.round(CY * scale));
    expect(bridgeMid).toEqual({ r: 0xf0, g: 0xf2, b: 0xf5, a: 255 });

    const corner = at(0, 0);
    expect(corner.a).toBe(0);
  });

  it('keeps the pad ring a distinct, unblended frame color at a true 16px favicon render — the vintage D-1 silhouette must survive to the smallest real icon size, not just a 64px+ preview', () => {
    const size = 16; // the classic favicon floor (`renderFaviconIco`'s smallest listed size)
    const scale = size / VIEWBOX;
    const padR = LENS_R * scale;
    const glassR = GLASS_R * scale;
    const leftCx = LEFT_CX * scale;
    const cy = CY * scale;
    const px = renderIconPixels(size);
    let foundUnblendedPadPixel = false;
    for (let y = 0; y < size && !foundUnblendedPadPixel; y += 1) {
      for (let x = 0; x < size; x += 1) {
        // Sample cells whose center sits strictly inside the pad annulus (between the glass and the pad's outer edge).
        const dist = Math.hypot(x + 0.5 - leftCx, y + 0.5 - cy);
        if (dist <= glassR || dist >= padR) continue;
        const i = (y * size + x) * 4;
        if (px[i] === 0xf0 && px[i + 1] === 0xf2 && px[i + 2] === 0xf5 && px[i + 3] === 255) {
          foundUnblendedPadPixel = true;
          break;
        }
      }
    }
    expect(foundUnblendedPadPixel).toBe(true);
  });

  it('keeps the strap hint a distinct, unblended frame color at a true 16px favicon render — the vintage D-1 silhouette needs the strap legible at the smallest real icon size too, not just the pad ring', () => {
    const size = 16; // the classic favicon floor (`renderFaviconIco`'s smallest listed size)
    const scale = size / VIEWBOX;
    const px = renderIconPixels(size);
    let foundUnblendedStrapPixel = false;
    for (const seg of STRAPS) {
      const x1 = seg.x1 * scale;
      const y1 = seg.y1 * scale;
      const x2 = seg.x2 * scale;
      const y2 = seg.y2 * scale;
      // Sample along the strap segment itself, where stroke coverage peaks.
      for (let t = 0; t <= 1 && !foundUnblendedStrapPixel; t += 0.05) {
        const x = Math.round(x1 + (x2 - x1) * t);
        const y = Math.round(y1 + (y2 - y1) * t);
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const i = (y * size + x) * 4;
        if (px[i] === 0xf0 && px[i + 1] === 0xf2 && px[i + 2] === 0xf5 && px[i + 3] === 255) {
          foundUnblendedStrapPixel = true;
        }
      }
      if (foundUnblendedStrapPixel) break;
    }
    expect(foundUnblendedStrapPixel).toBe(true);
  });

  it('keeps the bridge a distinct, unblended frame color at a true 16px favicon render — the strap fix (commit a85acc5d) claimed the long, axis-aligned bridge survives at STRUT_WIDTH unlike the short diagonal strap, but that claim had no regression test of its own', () => {
    const size = 16; // the classic favicon floor (`renderFaviconIco`'s smallest listed size)
    const scale = size / VIEWBOX;
    const x1 = BRIDGE.x1 * scale;
    const y1 = BRIDGE.y1 * scale;
    const x2 = BRIDGE.x2 * scale;
    const y2 = BRIDGE.y2 * scale;
    const px = renderIconPixels(size);
    let foundUnblendedBridgePixel = false;
    // Sample a small neighborhood around the segment (not a single rounded
    // point) — the bridge sits exactly on a pixel-row boundary at this
    // scale (CY=17 -> y=8.5), so Math.round alone can land one row off
    // from where the solid coverage actually falls.
    for (let t = 0; t <= 1 && !foundUnblendedBridgePixel; t += 0.05) {
      const bx = x1 + (x2 - x1) * t;
      const by = y1 + (y2 - y1) * t;
      for (const x of [Math.floor(bx), Math.ceil(bx)]) {
        for (const y of [Math.floor(by), Math.ceil(by)]) {
          if (x < 0 || x >= size || y < 0 || y >= size) continue;
          const i = (y * size + x) * 4;
          if (px[i] === 0xf0 && px[i + 1] === 0xf2 && px[i + 2] === 0xf5 && px[i + 3] === 255) {
            foundUnblendedBridgePixel = true;
          }
        }
      }
    }
    expect(foundUnblendedBridgePixel).toBe(true);
  });
});

describe('renderIconPng / renderFaviconIco', () => {
  it('renders a real PNG (magic bytes) at the requested size, memoized across calls', () => {
    const a = renderIconPng(48);
    const b = renderIconPng(48);
    expect(a.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(a).toBe(b); // memoized, not just equal
  });

  it('builds a favicon.ico with the classic 16/32/48 sizes', () => {
    const ico = renderFaviconIco();
    expect(ico.readUInt16LE(2)).toBe(1); // ICO type
    expect(ico.readUInt16LE(4)).toBe(3); // three sizes
  });
});

describe('faviconSvg', () => {
  it('is the goggles mark — the ONE source SVG (epic 0008 slice 2)', () => {
    const svg = faviconSvg();
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('#25baf2'); // lens color
    expect(svg).toContain('aria-label="AUTOPILOT — aviator goggles mark"');
  });
});

describe('renderAvatarPng', () => {
  it('renders a square PNG at AVATAR_SIZE', () => {
    const png = renderAvatarPng();
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(AVATAR_SIZE);
    expect(png.readUInt32BE(20)).toBe(AVATAR_SIZE);
  });
});

describe('renderSocialPreviewPixels / renderSocialPreviewPng', () => {
  it('produces one RGBA pixel per grid cell at the 1280x640 card size', () => {
    expect(renderSocialPreviewPixels().length).toBe(
      SOCIAL_PREVIEW_WIDTH * SOCIAL_PREVIEW_HEIGHT * 4,
    );
  });

  it('fills the field with the brand-dark background and leaves the far corner opaque (no transparency, unlike the tile itself)', () => {
    const px = renderSocialPreviewPixels();
    const corner = { r: px[0]!, g: px[1]!, b: px[2]!, a: px[3]! };
    expect(corner).toEqual({ r: 0x0a, g: 0x0d, b: 0x12, a: 255 });
  });

  it('centers the goggles tile — its own lens coordinates land lens-colored once offset onto the canvas', () => {
    const px = renderSocialPreviewPixels();
    const scale = SOCIAL_PREVIEW_MARK_SIZE / VIEWBOX;
    const offsetX = Math.round((SOCIAL_PREVIEW_WIDTH - SOCIAL_PREVIEW_MARK_SIZE) / 2);
    const offsetY = Math.round((SOCIAL_PREVIEW_HEIGHT - SOCIAL_PREVIEW_MARK_SIZE) / 2);
    const at = (x: number, y: number) => {
      const i = (y * SOCIAL_PREVIEW_WIDTH + x) * 4;
      return { r: px[i]!, g: px[i + 1]!, b: px[i + 2]!, a: px[i + 3]! };
    };
    const leftLens = at(offsetX + Math.round(LEFT_CX * scale), offsetY + Math.round(CY * scale));
    expect(leftLens).toEqual({ r: 0x25, g: 0xba, b: 0xf2, a: 255 });
    const rightLens = at(offsetX + Math.round(RIGHT_CX * scale), offsetY + Math.round(CY * scale));
    expect(rightLens).toEqual({ r: 0x25, g: 0xba, b: 0xf2, a: 255 });

    // Just outside the tile's left edge is pure background — proves the tile is
    // actually centered (with margin) rather than filling the whole canvas.
    const outsideTile = at(offsetX - 1, offsetY + Math.round(CY * scale));
    expect(outsideTile).toEqual({ r: 0x0a, g: 0x0d, b: 0x12, a: 255 });
  });

  it('renders a real PNG at the exact 1280x640 dimensions, memoized across calls', () => {
    const a = renderSocialPreviewPng();
    const b = renderSocialPreviewPng();
    expect(a.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(a.readUInt32BE(16)).toBe(SOCIAL_PREVIEW_WIDTH);
    expect(a.readUInt32BE(20)).toBe(SOCIAL_PREVIEW_HEIGHT);
    expect(a).toBe(b); // memoized, not just equal
  });
});

describe('webManifest', () => {
  it('declares the app identity and every icon route this router serves', () => {
    const manifest = JSON.parse(webManifest());
    expect(manifest.name).toBe('AUTOPILOT');
    expect(manifest.short_name).toBe('AUTOPILOT');
    const srcs = manifest.icons.map((i: { src: string }) => i.src);
    expect(srcs).toEqual(['/favicon.svg', '/icon-192.png', '/icon-512.png']);
  });
});
