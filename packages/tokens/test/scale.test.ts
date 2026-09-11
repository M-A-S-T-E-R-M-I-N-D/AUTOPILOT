// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { SPACE, RADIUS, TYPE, FONT, MOTION, BREAKPOINT, mediaMin } from '../src/scale.js';

/** A fluid token is `clamp(<min>, <preferred>, <max>)`; a fixed one is a
 *  bare length. Both carry a smallest-window value — the first term — and
 *  that is the number the monotonic checks below compare, so a scale stays
 *  a scale at 320px, not just at the desktop where the clamps saturate. */
function smallestRem(value: string): number {
  const m = value.match(/^clamp\(\s*([\d.]+)rem/);
  return parseFloat(m ? m[1]! : value);
}

/** The largest-window value: a clamp's last term, or the fixed length. */
function largestRem(value: string): number {
  const m = value.match(/,\s*([\d.]+)rem\s*\)$/);
  return parseFloat(m ? m[1]! : value);
}

describe('SPACE', () => {
  it('ships the full spacing scale in ascending order', () => {
    expect(Object.keys(SPACE)).toEqual(['0', '1', '2', '3', '4', '5', '6', '8']);
    expect(SPACE['0']).toBe('0');
    expect(SPACE['4']).toBe('1rem');
  });

  it('keeps the micro steps (1–4) fixed — component rhythm does not breathe with the window', () => {
    for (const k of ['1', '2', '3', '4'] as const) expect(SPACE[k]).toMatch(/^[\d.]+rem$/);
  });

  it('makes the section steps (5, 6, 8) fluid, saturating at exactly the prior fixed value', () => {
    // Epic 0021: at ≥1280px every clamp resolves to what the token was
    // before it went fluid, so desktop pixels never move for token reasons.
    expect(SPACE['5']).toMatch(/^clamp\(/);
    expect(largestRem(SPACE['5'])).toBe(1.5);
    expect(largestRem(SPACE['6'])).toBe(2);
    expect(largestRem(SPACE['8'])).toBe(3);
  });

  it('grows monotonically at the smallest window too (excluding the bare "0" keyword)', () => {
    const keys = Object.keys(SPACE).filter((k) => k !== '0') as Exclude<keyof typeof SPACE, '0'>[];
    const remValues = keys.map((k) => smallestRem(SPACE[k]));
    for (let i = 1; i < remValues.length; i += 1) {
      expect(remValues[i]).toBeGreaterThan(remValues[i - 1]!);
    }
  });
});

describe('RADIUS', () => {
  it('ships none-through-full corner scale', () => {
    expect(Object.keys(RADIUS)).toEqual(['sm', 'md', 'lg', 'full']);
    expect(RADIUS.full).toBe('9999px');
  });

  it('grows monotonically from sm to lg', () => {
    expect(parseFloat(RADIUS.md)).toBeGreaterThan(parseFloat(RADIUS.sm));
    expect(parseFloat(RADIUS.lg)).toBeGreaterThan(parseFloat(RADIUS.md));
  });
});

describe('TYPE', () => {
  it('ships the full type scale, xs through 3xl', () => {
    expect(Object.keys(TYPE)).toEqual(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl']);
  });

  it('keeps body sizes fixed — 1rem is the desktop density AND the floor below which iOS zooms a focused input', () => {
    expect(TYPE.base).toBe('1rem');
    expect(TYPE.xs).toMatch(/^[\d.]+rem$/);
    expect(TYPE.sm).toMatch(/^[\d.]+rem$/);
  });

  it('makes the display sizes (lg…3xl) fluid, saturating at exactly the prior fixed value', () => {
    expect(largestRem(TYPE.lg)).toBe(1.125);
    expect(largestRem(TYPE.xl)).toBe(1.5);
    expect(largestRem(TYPE['2xl'])).toBe(2);
    expect(largestRem(TYPE['3xl'])).toBe(3);
    for (const k of ['lg', 'xl', '2xl', '3xl'] as const) expect(TYPE[k]).toMatch(/^clamp\(/);
  });

  it('grows monotonically from xs to 3xl at the smallest window', () => {
    const keys = Object.keys(TYPE) as (keyof typeof TYPE)[];
    const remValues = keys.map((k) => smallestRem(TYPE[k]));
    for (let i = 1; i < remValues.length; i += 1) {
      expect(remValues[i]).toBeGreaterThan(remValues[i - 1]!);
    }
  });
});

describe('BREAKPOINT', () => {
  it('names the four window widths in rem, ascending — never device classes', () => {
    expect(Object.keys(BREAKPOINT)).toEqual(['sm', 'md', 'lg', 'xl']);
    const rems = Object.values(BREAKPOINT).map((v) => parseFloat(v));
    for (let i = 1; i < rems.length; i += 1) expect(rems[i]).toBeGreaterThan(rems[i - 1]!);
    for (const v of Object.values(BREAKPOINT)) expect(v).toMatch(/^\d+rem$/);
  });

  it('mediaMin() emits a min-width query only — mobile-first means wider windows ADD', () => {
    expect(mediaMin('md')).toBe('@media (min-width: 48rem)');
    expect(mediaMin('lg')).toBe('@media (min-width: 64rem)');
    expect(mediaMin('sm')).not.toContain('max-width');
  });
});

describe('FONT', () => {
  it('ships sans, mono, and the M3 typeface stacks with a shared fallback tail', () => {
    expect(Object.keys(FONT)).toEqual(['sans', 'mono', 'm3']);
    expect(FONT.sans).toContain('"Inter"');
    expect(FONT.mono).toContain('monospace');
    expect(FONT.m3).toContain('"Roboto"');
    // both self-hosted stacks fall back to the same system-ui chain (see scale.ts's
    // FONT comment: the prior system stack stays as the fetch/parse-window fallback)
    expect(FONT.sans).toContain('system-ui, -apple-system, "Segoe UI", sans-serif');
    expect(FONT.m3).toContain('system-ui, -apple-system, "Segoe UI", sans-serif');
  });
});

describe('MOTION', () => {
  it('ships fast/normal durations and an easing curve', () => {
    expect(Object.keys(MOTION)).toEqual(['fast', 'normal', 'ease']);
    expect(MOTION.fast).toBe('120ms');
    expect(MOTION.normal).toBe('240ms');
    expect(MOTION.ease).toMatch(/^cubic-bezier\(/);
  });

  it('fast is quicker than normal', () => {
    expect(parseFloat(MOTION.fast)).toBeLessThan(parseFloat(MOTION.normal));
  });
});
