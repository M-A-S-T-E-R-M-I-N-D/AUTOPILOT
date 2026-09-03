// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { ELEVATION, SHAPE, DURATION, EASING, STATE_LAYER, TYPE_SCALE } from '../src/m3.js';

describe('ELEVATION', () => {
  it('ships the six M3 levels, dp ascending, level 0 shadowless', () => {
    expect(ELEVATION).toHaveLength(6);
    expect(ELEVATION[0]).toEqual({ dp: 0, shadow: 'none', surfaceTint: 0 });
    for (let i = 1; i < ELEVATION.length; i += 1) {
      expect(ELEVATION[i]!.dp).toBeGreaterThan(ELEVATION[i - 1]!.dp);
    }
  });

  it('increases surface tint opacity monotonically with elevation', () => {
    for (let i = 1; i < ELEVATION.length; i += 1) {
      expect(ELEVATION[i]!.surfaceTint).toBeGreaterThan(ELEVATION[i - 1]!.surfaceTint);
    }
    expect(ELEVATION[ELEVATION.length - 1]!.surfaceTint).toBeLessThanOrEqual(1);
  });
});

describe('SHAPE', () => {
  it('ships the full M3 corner scale, none through full', () => {
    expect(Object.keys(SHAPE)).toEqual([
      'none',
      'extraSmall',
      'small',
      'medium',
      'large',
      'extraLarge',
      'full',
    ]);
    expect(SHAPE.none).toBe('0');
    expect(SHAPE.full).toBe('9999px');
  });
});

describe('DURATION', () => {
  it('is a positive, ascending ms scale', () => {
    const values = Object.values(DURATION);
    expect(values.every((v) => v > 0)).toBe(true);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});

describe('EASING', () => {
  it('every curve is a valid cubic-bezier', () => {
    for (const curve of Object.values(EASING)) {
      expect(curve).toMatch(/^cubic-bezier\([\d.,\s]+\)$/);
    }
  });
});

describe('STATE_LAYER', () => {
  it('hover < focus/pressed < dragged, all valid opacities', () => {
    expect(STATE_LAYER.hover).toBeLessThan(STATE_LAYER.focus);
    expect(STATE_LAYER.focus).toBe(STATE_LAYER.pressed);
    expect(STATE_LAYER.pressed).toBeLessThan(STATE_LAYER.dragged);
    for (const v of Object.values(STATE_LAYER)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('TYPE_SCALE', () => {
  it('defines all fifteen M3 roles', () => {
    expect(Object.keys(TYPE_SCALE)).toHaveLength(15);
    for (const role of ['displayLarge', 'bodyMedium', 'labelSmall'] as const) {
      expect(TYPE_SCALE[role].size).toMatch(/^\d+(\.\d+)?px$/);
      expect(TYPE_SCALE[role].lineHeight).toMatch(/^\d+(\.\d+)?px$/);
    }
  });

  it('sizes shrink display > headline > title/body > label roles', () => {
    const px = (s: string): number => parseFloat(s);
    expect(px(TYPE_SCALE.displayLarge.size)).toBeGreaterThan(px(TYPE_SCALE.headlineLarge.size));
    expect(px(TYPE_SCALE.headlineLarge.size)).toBeGreaterThan(px(TYPE_SCALE.titleLarge.size));
    expect(px(TYPE_SCALE.titleLarge.size)).toBeGreaterThan(px(TYPE_SCALE.bodySmall.size));
  });
});
