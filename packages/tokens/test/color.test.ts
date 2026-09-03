// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { parseOklch, relativeLuminance, contrastRatio } from '../src/color.js';

describe('parseOklch', () => {
  it('parses L (fraction or percent), C, H', () => {
    expect(parseOklch('oklch(0.5 0.1 250)')).toEqual({ l: 0.5, c: 0.1, h: 250 });
    expect(parseOklch('oklch(50% 0.1 250)')).toEqual({ l: 0.5, c: 0.1, h: 250 });
  });
  it('throws on a non-oklch string', () => {
    expect(() => parseOklch('#fff')).toThrow(/invalid oklch/);
  });
  it('tolerates more than one space between each component', () => {
    expect(parseOklch('oklch(0.5  0.1  250)')).toEqual({ l: 0.5, c: 0.1, h: 250 });
  });
});

describe('relativeLuminance', () => {
  it('is ~1 for white and ~0 for black', () => {
    expect(relativeLuminance(parseOklch('oklch(1 0 0)'))).toBeGreaterThan(0.99);
    expect(relativeLuminance(parseOklch('oklch(0 0 0)'))).toBeLessThan(0.01);
  });

  // Reference values below are the exact OKLCH -> linear-sRGB -> luminance
  // computation, verified independently outside this suite. High-precision
  // assertions on diverse hues/chromas/lightnesses pin down every
  // coefficient and sign in the Björn Ottosson matrices — a flipped sign,
  // swapped operator, or wrong constant on any term changes these results
  // measurably.
  it('clamps an out-of-gamut color on both bounds at once', () => {
    // A saturated, bright red: raw r > 1 (clamps to 1), raw g and b < 0
    // (both clamp to 0) — exercises clamp01's low AND high bound in a
    // single color, so the result is exactly 0.2126 (the r coefficient).
    expect(relativeLuminance(parseOklch('oklch(0.7 0.4 30)'))).toBeCloseTo(0.2126, 10);
  });

  it('matches the reference computation for a mid-range color', () => {
    expect(relativeLuminance(parseOklch('oklch(0.5 0.15 200)'))).toBeCloseTo(0.155454880726256, 10);
  });

  it('matches the reference computation for a dark, warm color', () => {
    expect(relativeLuminance(parseOklch('oklch(0.3 0.2 100)'))).toBeCloseTo(0.0272317078198446, 10);
  });

  it('matches the reference computation for a light, low-chroma color', () => {
    expect(relativeLuminance(parseOklch('oklch(0.85 0.05 45)'))).toBeCloseTo(0.604983543457653, 10);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black-on-white and symmetric', () => {
    const bw = contrastRatio('oklch(0 0 0)', 'oklch(1 0 0)');
    expect(bw).toBeGreaterThan(20.5);
    expect(contrastRatio('oklch(1 0 0)', 'oklch(0 0 0)')).toBeCloseTo(bw, 5);
  });
  it('is 1:1 for identical colors', () => {
    expect(contrastRatio('oklch(0.5 0.1 200)', 'oklch(0.5 0.1 200)')).toBeCloseTo(1, 5);
  });
});
