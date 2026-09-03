// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { SPACE, RADIUS, TYPE, FONT, MOTION } from '../src/scale.js';

describe('SPACE', () => {
  it('ships the full spacing scale in ascending order', () => {
    expect(Object.keys(SPACE)).toEqual(['0', '1', '2', '3', '4', '5', '6', '8']);
    expect(SPACE['0']).toBe('0');
    expect(SPACE['4']).toBe('1rem');
    expect(SPACE['8']).toBe('3rem');
  });

  it('grows monotonically in rem (excluding the bare "0" keyword)', () => {
    const keys = Object.keys(SPACE).filter((k) => k !== '0') as Exclude<keyof typeof SPACE, '0'>[];
    const remValues = keys.map((k) => parseFloat(SPACE[k]));
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
    expect(TYPE.base).toBe('1rem');
  });

  it('grows monotonically from xs to 3xl', () => {
    const keys = Object.keys(TYPE) as (keyof typeof TYPE)[];
    const remValues = keys.map((k) => parseFloat(TYPE[k]));
    for (let i = 1; i < remValues.length; i += 1) {
      expect(remValues[i]).toBeGreaterThan(remValues[i - 1]!);
    }
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
