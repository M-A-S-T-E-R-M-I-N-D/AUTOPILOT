// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { gogglesMarkInlineSvg, gogglesMarkSvg } from '../../src/assets/goggles-mark.js';

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('gogglesMarkSvg', () => {
  it('is a self-contained, accessible SVG on the 32x32 favicon canvas', () => {
    const svg = gogglesMarkSvg();
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="AUTOPILOT — aviator goggles mark"');
  });

  it('draws exactly two padded eyecups (pad ring + glass), one bridge, and a two-line strap hint by default', () => {
    const svg = gogglesMarkSvg();
    expect(countOccurrences(svg, '<circle')).toBe(4); // 2 pad rings + 2 glass lenses
    expect(countOccurrences(svg, '<line')).toBe(3); // bridge + two strap ticks
    expect(countOccurrences(svg, '<rect')).toBe(1); // background backdrop
  });

  it('sizes the glass strictly inside the pad, leaving a visible pad ring — the vintage D-1 silhouette', () => {
    const svg = gogglesMarkSvg();
    const radii = [...svg.matchAll(/<circle[^>]*\br="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(radii).toEqual([5.5, 5.5, 3.4, 3.4]); // pads first (drawn behind), then glass on top
  });

  it('paints the dark theme with the exact app-icon accent (brand family kinship)', () => {
    const svg = gogglesMarkSvg({ theme: 'dark' });
    expect(svg).toContain('fill="#0a0d12"'); // backdrop
    expect(svg).toContain('fill="#25baf2"'); // lenses, same accent as brandmark.ts
  });

  it('paints a distinct, MX-token-bound light theme', () => {
    const dark = gogglesMarkSvg({ theme: 'dark' });
    const light = gogglesMarkSvg({ theme: 'light' });
    expect(light).toContain('fill="#fbfcfd"');
    expect(light).toContain('fill="#0063d7"');
    expect(light).not.toBe(dark);
  });

  it('omits the backdrop rect for transparent, doc-embedded linework', () => {
    const svg = gogglesMarkSvg({ background: false });
    expect(svg).not.toContain('<rect');
  });

  it('crafted variant adds a stitch-line ring etched into each pad', () => {
    const plain = gogglesMarkSvg({ variant: 'plain' });
    const crafted = gogglesMarkSvg({ variant: 'crafted' });
    expect(countOccurrences(plain, '<circle')).toBe(4);
    expect(countOccurrences(crafted, '<circle')).toBe(6); // 2 pads + 2 glass + 2 stitch rings
    expect(crafted).toContain('fill="none"');
  });

  it('stamp variant frames the whole mark in a badge-style double ring', () => {
    const svg = gogglesMarkSvg({ variant: 'stamp' });
    expect(countOccurrences(svg, '<circle')).toBe(6); // 2 pads + 2 glass + 2 seal rings
    expect(svg).toContain('r="15"');
    expect(svg).toContain('r="13.4"');
  });

  it('keeps stroke weight legible (not hairline) relative to the 32-unit canvas', () => {
    const svg = gogglesMarkSvg();
    const strokeWidths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(strokeWidths.length).toBeGreaterThan(0);
    for (const width of strokeWidths) {
      expect(width / 32).toBeGreaterThanOrEqual(0.03); // thick enough to survive a 16px favicon render
    }
  });
});

describe('gogglesMarkSvg founder edition', () => {
  it('leaves the universal (default) edition untouched — no gradient, no glint', () => {
    const svg = gogglesMarkSvg();
    expect(svg).not.toContain('radialGradient');
    expect(svg).not.toContain('url(#founder-lens-gradient');
    expect(countOccurrences(svg, '<line')).toBe(3); // bridge + two strap ticks only
  });

  it('replaces the flat lens fill with a blue-white radial gradient', () => {
    const svg = gogglesMarkSvg({ edition: 'founder' });
    expect(svg).toContain('<radialGradient id="founder-lens-gradient-dark"');
    expect(svg).toContain('stop-color="#ffffff"');
    expect(svg).toContain('stop-color="#25baf2"'); // dark theme accent, family kinship with the universal mark
    expect(countOccurrences(svg, 'fill="url(#founder-lens-gradient-dark)"')).toBe(2); // both lenses
  });

  it('adds a six-point glint (six ray tips, three crossing strokes) per lens', () => {
    const svg = gogglesMarkSvg({ edition: 'founder' });
    // 3 base lines (bridge + two straps) + 6 glint lines (3 per lens x 2 lenses) = 9
    expect(countOccurrences(svg, '<line')).toBe(9);
  });

  it('keeps the pad ring silhouette intact — the founder edition is not a different shape', () => {
    const svg = gogglesMarkSvg({ edition: 'founder' });
    const radii = [...svg.matchAll(/<circle[^>]*\br="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(radii).toEqual([5.5, 5.5, 3.4, 3.4]);
  });

  it('marks the aria-label as the founder signature edition, distinct from the universal mark', () => {
    const universal = gogglesMarkSvg();
    const founder = gogglesMarkSvg({ edition: 'founder' });
    expect(universal).toContain('aria-label="AUTOPILOT — aviator goggles mark"');
    expect(founder).toContain(
      'aria-label="AUTOPILOT — aviator goggles mark, founder signature edition"',
    );
  });

  it('binds the gradient id to the theme so dark/light founder exports never collide if inlined together', () => {
    const dark = gogglesMarkSvg({ edition: 'founder', theme: 'dark' });
    const light = gogglesMarkSvg({ edition: 'founder', theme: 'light' });
    expect(dark).toContain('founder-lens-gradient-dark');
    expect(light).toContain('founder-lens-gradient-light');
    expect(light).toContain('stop-color="#0063d7"'); // light theme accent
  });
});

describe('gogglesMarkInlineSvg', () => {
  it('is transparent (no backdrop) and colored via CSS custom properties, not fixed hex', () => {
    const svg = gogglesMarkInlineSvg();
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<rect'); // no backdrop tile — sits inline next to the wordmark text
    expect(svg).toContain('var(--color-accent)');
    expect(svg).toContain('var(--color-text)');
    expect(svg).not.toContain('#25baf2');
    expect(svg).not.toContain('#0a0d12');
  });
});
