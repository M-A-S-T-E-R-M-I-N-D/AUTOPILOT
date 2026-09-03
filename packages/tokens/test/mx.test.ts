// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  TONE_STOPS,
  toneAt,
  tone,
  tonalPalette,
  onTone,
  deriveAccentPair,
  deriveMxTheme,
  STATUS_TOKENS,
  SPRING,
  springOrInstant,
  SHAPE_STATE_DELTA,
  stateRadius,
  NUMERIC_VARIANT,
  type MxTheme,
  type ThemeMode,
} from '../src/mx.js';
import { contrastRatio, type Oklch } from '../src/color.js';

const SEEDS: readonly Oklch[] = [
  { l: 0.5, c: 0.14, h: 230 }, // the current cockpit accent hue
  { l: 0.5, c: 0.05, h: 0 },
  { l: 0.5, c: 0.3, h: 90 },
  { l: 0.5, c: 0.22, h: 180 },
  { l: 0.5, c: 0.18, h: 320 },
];

const MODES: readonly ThemeMode[] = ['dark', 'light'];

/** Pulls the lightness component back out of an `fmtOklch`-formatted string. */
function lightnessOf(oklch: string): number {
  const match = /^oklch\(([\d.]+) /.exec(oklch);
  if (!match?.[1]) throw new Error(`not an oklch string: ${oklch}`);
  return Number(match[1]);
}

describe('toneAt / tone / tonalPalette', () => {
  it('sets lightness exactly and preserves hue', () => {
    const seed: Oklch = { l: 0.5, c: 0.2, h: 230 };
    const s = toneAt(seed, 0.62);
    expect(s).toMatch(/^oklch\(0\.6200 /);
    expect(s.endsWith('230.00)')).toBe(true);
  });

  it('eases chroma to ~0 at both lightness extremes', () => {
    const seed: Oklch = { l: 0.5, c: 0.2, h: 230 };
    expect(toneAt(seed, 0)).toMatch(/^oklch\(0\.0000 0\.0000 /);
    expect(toneAt(seed, 1)).toMatch(/^oklch\(1\.0000 0\.0000 /);
  });

  it("peaks chroma at l=0.5, at the seed's own chroma", () => {
    const seed: Oklch = { l: 0.5, c: 0.2, h: 230 };
    expect(toneAt(seed, 0.5)).toBe('oklch(0.5000 0.2000 230.00)');
  });

  it('tonalPalette covers every canonical tone stop', () => {
    const seed: Oklch = { l: 0.5, c: 0.12, h: 200 };
    const ramp = tonalPalette(seed);
    expect(
      Object.keys(ramp)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([...TONE_STOPS].sort((a, b) => a - b));
    for (const stop of TONE_STOPS) expect(ramp[stop]).toBe(tone(seed, stop));
  });

  it('tone divides the stop by 100 before easing (concrete value, not just self-consistency)', () => {
    const seed: Oklch = { l: 0.5, c: 0.2, h: 230 };
    expect(tone(seed, 50)).toBe('oklch(0.5000 0.2000 230.00)');
    expect(tone(seed, 0)).toBe('oklch(0.0000 0.0000 230.00)');
  });
});

describe('onTone', () => {
  it('picks near-white against a dark background, near-black against a light one', () => {
    expect(onTone('oklch(0.12 0.01 260)')).toMatch(/^oklch\(0\.9900/);
    expect(onTone('oklch(0.95 0.01 260)')).toMatch(/^oklch\(0\.0600/);
  });

  it('always clears 4.5:1 against its background, across a lightness sweep', () => {
    for (let l = 0; l <= 1; l += 0.05) {
      const bg = `oklch(${l.toFixed(2)} 0.02 200)`;
      expect(contrastRatio(onTone(bg), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('deriveAccentPair', () => {
  it.each(MODES)('clears WCAG AA in %s mode for every seed', (mode) => {
    for (const seed of SEEDS) {
      const { accent, accentText } = deriveAccentPair(seed, mode);
      expect(contrastRatio(accentText, accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('anchors dark-mode accent at tone 0.74 and light-mode at tone 0.52', () => {
    const seed = SEEDS[0]!;
    expect(lightnessOf(deriveAccentPair(seed, 'dark').accent)).toBe(0.74);
    expect(lightnessOf(deriveAccentPair(seed, 'light').accent)).toBe(0.52);
  });
});

describe('deriveMxTheme', () => {
  it.each(MODES)('defines every Theme-shaped role, all valid oklch, for %s', (mode) => {
    const theme: MxTheme = deriveMxTheme(SEEDS[0]!, mode);
    for (const value of Object.values(theme)) expect(value).toMatch(/^oklch\(/);
  });

  it.each(MODES)('meets WCAG AA contrast on its key pairs, for every seed (%s)', (mode) => {
    for (const seed of SEEDS) {
      const t = deriveMxTheme(seed, mode);
      expect(contrastRatio(t.text, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.text, t.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.textMuted, t.surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t.accent, t.surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t.accentText, t.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(MODES)('status roles meet WCAG AA as small text, for every seed (%s)', (mode) => {
    for (const seed of SEEDS) {
      const t = deriveMxTheme(seed, mode);
      for (const role of STATUS_TOKENS) {
        expect(contrastRatio(t[role], t.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t[role], t.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('two different seeds produce different accents (hue actually flows through)', () => {
    const a = deriveMxTheme(SEEDS[0]!, 'dark').accent;
    const b = deriveMxTheme(SEEDS[2]!, 'dark').accent;
    expect(a).not.toBe(b);
  });

  it('surfaceRaised, border, and borderStrong land on their documented per-mode tone stops', () => {
    const seed = SEEDS[0]!;
    const dark = deriveMxTheme(seed, 'dark');
    const light = deriveMxTheme(seed, 'light');
    expect(lightnessOf(dark.surfaceRaised)).toBe(0.22);
    expect(lightnessOf(light.surfaceRaised)).toBe(0.97);
    expect(lightnessOf(dark.border)).toBe(0.32);
    expect(lightnessOf(light.border)).toBe(0.86);
    expect(lightnessOf(dark.borderStrong)).toBe(0.48);
    expect(lightnessOf(light.borderStrong)).toBe(0.68);
  });
});

describe('SPRING', () => {
  it('ships gentle/snappy/bouncy, all positive physical params', () => {
    for (const spring of Object.values(SPRING)) {
      expect(spring.stiffness).toBeGreaterThan(0);
      expect(spring.damping).toBeGreaterThan(0);
      expect(spring.mass).toBeGreaterThan(0);
    }
  });

  it('bouncy has proportionally less damping than snappy (visibly springier)', () => {
    const bouncyRatio = SPRING.bouncy.damping / SPRING.bouncy.stiffness;
    const snappyRatio = SPRING.snappy.damping / SPRING.snappy.stiffness;
    expect(bouncyRatio).toBeLessThan(snappyRatio);
  });
});

describe('springOrInstant', () => {
  it('collapses to null (instant) when reduced motion is requested', () => {
    expect(springOrInstant(SPRING.gentle, true)).toBeNull();
  });

  it('passes the spring through unchanged otherwise', () => {
    expect(springOrInstant(SPRING.gentle, false)).toBe(SPRING.gentle);
  });
});

describe('SHAPE_STATE_DELTA / stateRadius', () => {
  it('hover tightens, pressed loosens, rest is unchanged', () => {
    expect(SHAPE_STATE_DELTA.rest).toBe(0);
    expect(SHAPE_STATE_DELTA.hover).toBeLessThan(0);
    expect(SHAPE_STATE_DELTA.pressed).toBeGreaterThan(0);
  });

  it('applies the delta to a base radius', () => {
    expect(stateRadius('12px', 'rest')).toBe('12px');
    expect(stateRadius('12px', 'hover')).toBe('10px');
    expect(stateRadius('12px', 'pressed')).toBe('14px');
  });

  it('clamps at 0 and leaves full/none pill shapes untouched', () => {
    expect(stateRadius('1px', 'hover')).toBe('0px');
    expect(stateRadius('9999px', 'hover')).toBe('9999px');
    expect(stateRadius('0', 'pressed')).toBe('0');
  });
});

describe('NUMERIC_VARIANT', () => {
  it('requests tabular, lining digits for instrument-panel alignment', () => {
    expect(NUMERIC_VARIANT).toBe('tabular-nums lining-nums');
  });
});
