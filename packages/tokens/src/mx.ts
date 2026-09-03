// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MX (Material eXtended) — AUTOPILOT's own forward evolution of the M3
 * primitives in `./m3.ts` (epic 0005 "Cockpit MX redesign", slice 1: "MX
 * token layer... extending, not replacing, m3.ts"). Landed as new, tested
 * primitives ahead of consumption — the same "reserve now, wire per slice"
 * pattern `./scale.ts`'s `FONT.m3` already established, so this module is
 * NOT yet folded into `./css.ts`'s live stylesheet; each cockpit surface
 * adopts it as that surface is redesigned (slices 2-6), the way epic 0005
 * itself sequences the rollout. Four of the epic's six MX bullets land here
 * — tonal color from a seed, physics motion, shape morphing, tabular
 * numerals; the other two (a self-hosted variable type pair, an
 * elevation/spacing scale) already exist (`apps/dashboard/src/assets/fonts.ts`,
 * `./m3.ts`'s ELEVATION, `./scale.ts`'s SPACE).
 */

import { type Oklch, contrastRatio } from './color.js';

/** Material's canonical tonal-palette stops (m3.material.io/styles/color/the-color-system/key-colors-tones). */
export const TONE_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100] as const;
export type ToneStop = (typeof TONE_STOPS)[number];

function fmtOklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
}

/**
 * One point on a seed's tonal ramp: hue held constant (Material's tonal
 * palettes are single-hue), lightness set to `l` exactly, chroma eased
 * toward 0 at both extremes — a `4·l·(1-l)` envelope that peaks at the
 * seed's own chroma at l=0.5 and reaches 0 at l=0/l=1 — since saturated
 * colors run out of sRGB gamut near black/white. `chromaScale` lets a
 * caller derive a low-chroma "neutral" ramp from the same seed hue
 * (Material's own dynamic-color convention: one seed feeds a full-chroma
 * primary palette AND a near-desaturated neutral palette).
 */
export function toneAt(seed: Oklch, l: number, chromaScale = 1): string {
  const envelope = 4 * l * (1 - l);
  return fmtOklch(l, seed.c * chromaScale * envelope, seed.h);
}

/** `toneAt` restricted to Material's canonical `TONE_STOPS`. */
export function tone(seed: Oklch, stop: ToneStop): string {
  return toneAt(seed, stop / 100);
}

/** The full tonal ramp for a seed, one OKLCH string per `TONE_STOPS` entry. */
export function tonalPalette(seed: Oklch): Readonly<Record<ToneStop, string>> {
  const out = {} as Record<ToneStop, string>;
  for (const stop of TONE_STOPS) out[stop] = tone(seed, stop);
  return out;
}

export type ThemeMode = 'dark' | 'light';

/**
 * Picks whichever of near-black/near-white contrasts higher against `bg` —
 * for ANY background luminance, at least one of those two extremes clears
 * 4.5:1 (white clears it below ~L 0.183, black clears it above ~L 0.175,
 * and those two ranges overlap), so a caller pairing a derived tone with
 * `onTone` can never end up with a non-compliant text color, by construction.
 */
export function onTone(bg: string): string {
  const black = fmtOklch(0.06, 0, 0);
  const white = fmtOklch(0.99, 0, 0);
  // Stryker disable next-line EqualityOperator: the exact tie
  // (contrastRatio(black,bg) === contrastRatio(white,bg)) exists only at one
  // irrational bg luminance; `bg` always arrives through `fmtOklch`'s
  // 4-decimal-place formatting, which cannot land on it, so `>=` and `>`
  // are unobservably equivalent through this function's public string API.
  return contrastRatio(black, bg) >= contrastRatio(white, bg) ? black : white;
}

/** Accent + accentText derived from a seed, via `tone`/`onTone` — never a hardcoded hex. */
export function deriveAccentPair(
  seed: Oklch,
  mode: ThemeMode,
): { readonly accent: string; readonly accentText: string } {
  const accent = toneAt(seed, mode === 'dark' ? 0.74 : 0.52);
  return { accent, accentText: onTone(accent) };
}

/** One semantic status ramp's fixed hue + chroma — a "seed" in its own right,
 *  independent of the theme's primary seed (Material's dynamic color keeps
 *  error/status palettes fixed rather than deriving them from the primary
 *  seed, since their hue carries fixed meaning — green always success). */
const STATUS_SEEDS = {
  success: { l: 0.5, c: 0.19, h: 150 },
  warning: { l: 0.5, c: 0.18, h: 85 },
  danger: { l: 0.5, c: 0.24, h: 25 },
  info: { l: 0.5, c: 0.15, h: 240 },
  sevCritical: { l: 0.5, c: 0.25, h: 22 },
  sevHigh: { l: 0.5, c: 0.2, h: 55 },
  sevMedium: { l: 0.5, c: 0.16, h: 88 },
  sevLow: { l: 0.5, c: 0.12, h: 230 },
  needsYou: { l: 0.5, c: 0.22, h: 320 },
} as const satisfies Record<string, Oklch>;

/** Every MX color role beyond the neutral surfaces/text and accent pair. */
export const STATUS_TOKENS = Object.keys(STATUS_SEEDS) as ReadonlyArray<keyof typeof STATUS_SEEDS>;

/** The full MX theme: a neutral ramp (seed hue, near-desaturated) for
 *  surfaces/text/borders, the seed's own full-chroma ramp for accent, and
 *  each status role's own fixed-hue ramp — every value `tone`/`onTone`
 *  derived, none hand-picked. Mirrors `./color.ts`'s `Theme` shape so a
 *  consumer can drop an `MxTheme` in wherever a `Theme` is expected. */
export interface MxTheme {
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceSunken: string;
  readonly text: string;
  readonly textMuted: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly accent: string;
  readonly accentText: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;
  readonly sevCritical: string;
  readonly sevHigh: string;
  readonly sevMedium: string;
  readonly sevLow: string;
  readonly needsYou: string;
}

const NEUTRAL_CHROMA_SCALE = 0.05;

/** Derives a complete `MxTheme` for one mode from a single seed color. */
export function deriveMxTheme(seed: Oklch, mode: ThemeMode): MxTheme {
  const neutral = (l: number): string => toneAt(seed, l, NEUTRAL_CHROMA_SCALE);
  const surface = neutral(mode === 'dark' ? 0.16 : 0.99);
  const surfaceRaised = neutral(mode === 'dark' ? 0.22 : 0.97);
  const surfaceSunken = neutral(mode === 'dark' ? 0.11 : 0.95);
  const text = neutral(mode === 'dark' ? 0.96 : 0.22);
  const textMuted = neutral(mode === 'dark' ? 0.74 : 0.44);
  const { accent, accentText } = deriveAccentPair(seed, mode);

  const statusEntries = (
    Object.entries(STATUS_SEEDS) as Array<[keyof typeof STATUS_SEEDS, Oklch]>
  ).map(([role, statusSeed]): [keyof typeof STATUS_SEEDS, string] => [
    role,
    toneAt(statusSeed, mode === 'dark' ? 0.74 : 0.5),
  ]);
  const status = Object.fromEntries(statusEntries) as Record<keyof typeof STATUS_SEEDS, string>;

  return {
    surface,
    surfaceRaised,
    surfaceSunken,
    text,
    textMuted,
    border: neutral(mode === 'dark' ? 0.32 : 0.86),
    borderStrong: neutral(mode === 'dark' ? 0.48 : 0.68),
    accent,
    accentText,
    ...status,
  };
}

// --- Physics motion (M3 Expressive's "spring, not fixed-curve" spirit) ---

export interface Spring {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

/**
 * Stiffness/damping/mass triples for spring-driven state changes — AUTOPILOT's
 * own physics motion scale, in the spirit of Material 3 Expressive's spatial/
 * effects springs, layered over (not replacing) `./m3.ts`'s fixed `DURATION`/
 * `EASING` curves for consumers that stay curve-based. A JS spring driver
 * (Web Animations API or a small RAF loop) reads these; there is no lossless
 * spring→cubic-bezier conversion, so this module intentionally stops at data.
 */
export const SPRING: Readonly<Record<'gentle' | 'snappy' | 'bouncy', Spring>> = {
  gentle: { stiffness: 300, damping: 30, mass: 1 },
  snappy: { stiffness: 500, damping: 34, mass: 1 },
  bouncy: { stiffness: 420, damping: 18, mass: 1 },
} as const;

/** `prefers-reduced-motion` collapses any spring to an instant, zero-duration
 *  state change — the epic's "state changes feel physical... collapses to
 *  instant" requirement, expressed as one small pure function so every
 *  consumer applies it the same way instead of re-deriving the rule. */
export function springOrInstant(spring: Spring, reduceMotion: boolean): Spring | null {
  return reduceMotion ? null : spring;
}

// --- Shape morphing (radius as a live, state-responsive token) ---

export type InteractionState = 'rest' | 'hover' | 'pressed';

/** Radius deltas (px) layered onto an `./m3.ts` `SHAPE` value per interaction
 *  state — "rest → hover → active shifts shape subtly" per the epic, never a
 *  full shape swap (that would fight the spring motion, not compose with it). */
export const SHAPE_STATE_DELTA: Readonly<Record<InteractionState, number>> = {
  rest: 0,
  hover: -2,
  pressed: 2,
} as const;

/** Applies a shape's state delta to a base `./m3.ts` `SHAPE` radius (e.g.
 *  `SHAPE.medium`), clamped at 0 — `SHAPE.full`'s `9999px` stays untouched
 *  (pill shapes have no meaningful "shift" to morph toward). */
export function stateRadius(baseRadiusPx: string, state: InteractionState): string {
  if (baseRadiusPx === '9999px' || baseRadiusPx === '0') return baseRadiusPx;
  const base = parseFloat(baseRadiusPx);
  const next = Math.max(0, base + SHAPE_STATE_DELTA[state]);
  return `${next}px`;
}

// --- Tabular numerals ("instrument-panel discipline" for every metric) ---

/** `font-variant-numeric` value for metric display — $, tokens, turns,
 *  percentages all render with fixed-width, non-oldstyle digits so columns
 *  of numbers align like an instrument panel instead of a proportional font's
 *  ragged digit widths. */
export const NUMERIC_VARIANT = 'tabular-nums lining-nums' as const;
