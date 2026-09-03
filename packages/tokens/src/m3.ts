// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Material 3 primitives (m3.material.io/styles) not covered by the ad hoc
 * `./scale.ts` grid: elevation, shape scale, motion easing/duration, interaction
 * state-layer opacities, and the full type scale. Theme-invariant — elevation's
 * "surface tint" is an overlay OPACITY here; composing it into an actual color
 * (`color-mix(in srgb, var(--color-accent) <n>%, var(--color-surface))`) is left
 * to the consumer, since the tint color itself is per-theme.
 */

export interface ElevationLevel {
  readonly dp: number;
  readonly shadow: string;
  /** Surface tint overlay opacity at this level (Material elevation overlay table). */
  readonly surfaceTint: number;
}

/** M3's six elevation levels (m3.material.io/styles/elevation/tokens). */
export const ELEVATION: readonly ElevationLevel[] = [
  { dp: 0, shadow: 'none', surfaceTint: 0 },
  {
    dp: 1,
    shadow: '0 1px 2px 0 rgba(0,0,0,0.30), 0 1px 3px 1px rgba(0,0,0,0.15)',
    surfaceTint: 0.05,
  },
  {
    dp: 3,
    shadow: '0 1px 2px 0 rgba(0,0,0,0.30), 0 2px 6px 2px rgba(0,0,0,0.15)',
    surfaceTint: 0.08,
  },
  {
    dp: 6,
    shadow: '0 1px 3px 0 rgba(0,0,0,0.30), 0 4px 8px 3px rgba(0,0,0,0.15)',
    surfaceTint: 0.11,
  },
  {
    dp: 8,
    shadow: '0 2px 3px 0 rgba(0,0,0,0.30), 0 6px 10px 4px rgba(0,0,0,0.15)',
    surfaceTint: 0.12,
  },
  {
    dp: 12,
    shadow: '0 4px 4px 0 rgba(0,0,0,0.30), 0 8px 12px 6px rgba(0,0,0,0.15)',
    surfaceTint: 0.14,
  },
] as const;

/** M3 shape scale — corner radius by role (m3.material.io/styles/shape). */
export const SHAPE = {
  none: '0',
  extraSmall: '4px',
  small: '8px',
  medium: '12px',
  large: '16px',
  extraLarge: '28px',
  full: '9999px',
} as const;

/** M3 motion duration scale, ms (m3.material.io/styles/motion/easing-and-duration). */
export const DURATION = {
  short1: 50,
  short2: 100,
  short3: 150,
  short4: 200,
  medium1: 250,
  medium2: 300,
  medium3: 350,
  medium4: 400,
  long1: 450,
  long2: 500,
  long3: 550,
  long4: 600,
  extraLong1: 700,
  extraLong2: 800,
  extraLong3: 900,
  extraLong4: 1000,
} as const;

/**
 * M3 easing curves. `emphasized` has no single-curve form in the spec (it's a
 * multi-segment path) — only its accelerate/decelerate halves are, so those are
 * what's exposed here.
 */
export const EASING = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  standardAccelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  standardDecelerate: 'cubic-bezier(0, 0, 0, 1)',
  emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
} as const;

/** M3 interaction state-layer opacities (m3.material.io/foundations/interaction/states). */
export const STATE_LAYER = {
  hover: 0.08,
  focus: 0.1,
  pressed: 0.1,
  dragged: 0.16,
} as const;

export interface TypeRole {
  readonly size: string;
  readonly lineHeight: string;
  readonly weight: number;
  readonly tracking: string;
}

/** The full M3 type scale (m3.material.io/styles/typography/type-scale-tokens). */
export const TYPE_SCALE = {
  displayLarge: { size: '57px', lineHeight: '64px', weight: 400, tracking: '-0.25px' },
  displayMedium: { size: '45px', lineHeight: '52px', weight: 400, tracking: '0px' },
  displaySmall: { size: '36px', lineHeight: '44px', weight: 400, tracking: '0px' },
  headlineLarge: { size: '32px', lineHeight: '40px', weight: 400, tracking: '0px' },
  headlineMedium: { size: '28px', lineHeight: '36px', weight: 400, tracking: '0px' },
  headlineSmall: { size: '24px', lineHeight: '32px', weight: 400, tracking: '0px' },
  titleLarge: { size: '22px', lineHeight: '28px', weight: 400, tracking: '0px' },
  titleMedium: { size: '16px', lineHeight: '24px', weight: 500, tracking: '0.15px' },
  titleSmall: { size: '14px', lineHeight: '20px', weight: 500, tracking: '0.1px' },
  labelLarge: { size: '14px', lineHeight: '20px', weight: 500, tracking: '0.1px' },
  labelMedium: { size: '12px', lineHeight: '16px', weight: 500, tracking: '0.5px' },
  labelSmall: { size: '11px', lineHeight: '16px', weight: 500, tracking: '0.5px' },
  bodyLarge: { size: '16px', lineHeight: '24px', weight: 400, tracking: '0.5px' },
  bodyMedium: { size: '14px', lineHeight: '20px', weight: 400, tracking: '0.25px' },
  bodySmall: { size: '12px', lineHeight: '16px', weight: 400, tracking: '0.4px' },
} as const satisfies Record<string, TypeRole>;

export type TypeRoleName = keyof typeof TYPE_SCALE;
