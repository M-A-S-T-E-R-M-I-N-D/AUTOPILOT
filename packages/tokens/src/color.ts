// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Semantic color tokens + a pure OKLCH→WCAG-contrast core. Colors are authored in
 * OKLCH (perceptually uniform); the contrast check converts OKLCH → linear sRGB
 * (Björn Ottosson's matrices) → relative luminance → the WCAG ratio, so a theme's
 * accessibility is enforced by test, with zero runtime dependency.
 */

export const COLOR_TOKENS = [
  'surface',
  'surfaceRaised',
  'surfaceSunken',
  'text',
  'textMuted',
  'border',
  'borderStrong',
  'accent',
  'accentText',
  'success',
  'warning',
  'danger',
  'info',
  'sevCritical',
  'sevHigh',
  'sevMedium',
  'sevLow',
  'needsYou',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

/** A theme is a complete map of every semantic color token to an OKLCH string. */
export type Theme = Readonly<Record<ColorToken, string>>;

export interface Oklch {
  readonly l: number; // 0..1
  readonly c: number;
  readonly h: number; // degrees
}

export function parseOklch(value: string): Oklch {
  const match = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i.exec(value);
  if (!match) throw new Error(`invalid oklch color: ${value}`);
  // Stryker disable next-line StringLiteral: `match[1]` can never be
  // undefined here — its capture group (`[\d.]+%?`) requires at least one
  // char, so a successful `match` always populates it. The `?? '0'`
  // fallback is dead code, provably unreachable.
  const lRaw = match[1] ?? '0';
  const l = lRaw.endsWith('%') ? parseFloat(lRaw) / 100 : parseFloat(lRaw);
  // Stryker disable next-line StringLiteral: same reasoning as `lRaw`
  // above — match[2]/match[3]'s capture groups are mandatory too.
  return { l, c: parseFloat(match[2] ?? '0'), h: parseFloat(match[3] ?? '0') };
}

function clamp01(x: number): number {
  // Stryker disable next-line EqualityOperator: `x < 0`/`x > 1` vs.
  // `x <= 0`/`x >= 1` are unobservable — at the exact boundary (x === 0 or
  // x === 1) the ternary's literal branch and the fall-through `x` branch
  // evaluate to the identical number. Provably equivalent, not killable.
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** WCAG relative luminance (0..1) of an OKLCH color, via linear-light sRGB. */
export function relativeLuminance(color: Oklch): number {
  const hr = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hr);
  const b = color.c * Math.sin(hr);
  const l_ = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = color.l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const r = clamp01(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S);
  const g = clamp01(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S);
  const bl = clamp01(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

/** The WCAG contrast ratio (1..21) between two OKLCH color strings. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseOklch(a));
  const lb = relativeLuminance(parseOklch(b));
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA classification for one token pair's contrast ratio: `text` clears the 4.5:1 floor
 *  normal text needs, `large` clears only the 3:1 floor large text/non-text UI components need,
 *  `fail` clears neither. */
export type ContrastLevel = 'text' | 'large' | 'fail';

export interface ContrastPair {
  readonly a: ColorToken;
  readonly b: ColorToken;
  readonly ratio: number;
  readonly level: ContrastLevel;
}

function classifyContrast(ratio: number): ContrastLevel {
  if (ratio >= 4.5) return 'text';
  if (ratio >= 3) return 'large';
  return 'fail';
}

/** Every unordered pair of semantic color tokens in one theme, with its WCAG contrast ratio
 *  and AA classification — the fg×bg ledger epic-0015's token-double-duty audit needs
 *  (`.flight-slice-chip`'s accentText-as-plain-text defect was the first confirmed instance,
 *  caught by inspection, not by a matrix like this one; see `docs/epics/0015-cockpit-supervisory-control.md`).
 *  Not every pair below is ever actually rendered together — this is the reference ledger, not
 *  a claim that all 153 combinations occur in the served CSS. */
export function contrastMatrix(theme: Theme): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (let i = 0; i < COLOR_TOKENS.length; i++) {
    for (let j = i + 1; j < COLOR_TOKENS.length; j++) {
      const a = COLOR_TOKENS[i] as ColorToken;
      const b = COLOR_TOKENS[j] as ColorToken;
      const ratio = contrastRatio(theme[a], theme[b]);
      pairs.push({ a, b, ratio, level: classifyContrast(ratio) });
    }
  }
  return pairs;
}
