// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Theme-invariant design primitives (space, radius, type, fonts, motion). Colors
 * change per theme (see `./themes.ts`); these do not. Emitted once under `:root`.
 */

/**
 * Steps 0–4 are fixed: they are the rhythm INSIDE a component (chip padding,
 * a row's gap) and a phone wants those exactly as tight as a desktop does.
 * Steps 5, 6, 8 are the rhythm BETWEEN sections and breathe with the window
 * (epic 0021). Every `clamp()` here saturates at ≥1280px to the value the
 * token had before it went fluid — desktop pixels never move for token
 * reasons; only the narrow end tightens. `test/scale.test.ts` pins both the
 * saturation values and the smallest-window monotonicity.
 */
export const SPACE = {
  '0': '0',
  '1': '0.25rem',
  '2': '0.5rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': 'clamp(1.125rem, 0.6rem + 1.25vw, 1.5rem)',
  '6': 'clamp(1.25rem, 0.7rem + 1.75vw, 2rem)',
  '8': 'clamp(1.75rem, 1rem + 2.75vw, 3rem)',
} as const;

export const RADIUS = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  full: '9999px',
} as const;

/**
 * Body sizes (`xs`, `sm`, `base`) stay fixed: `1rem` is the density a
 * cockpit wants on a desktop AND the floor below which iOS Safari zooms a
 * focused input. Display sizes (`lg`…`3xl`) are fluid — a hero number that
 * is 48px on a desktop is 32px on a phone — and, like `SPACE`, saturate at
 * ≥1280px to exactly their prior fixed value (epic 0021).
 */
export const TYPE = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: 'clamp(1.0625rem, 1rem + 0.3vw, 1.125rem)',
  xl: 'clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem)',
  '2xl': 'clamp(1.5rem, 1.2rem + 1.5vw, 2rem)',
  '3xl': 'clamp(2rem, 1.5rem + 2.5vw, 3rem)',
} as const;

/**
 * Window-width breakpoints (epic 0021) — the app shell's three regimes and
 * the one "sm" step for component-level tweaks. Widths of the WINDOW, in
 * `rem`, never device classes: Material 3's canonical layouts, iPadOS 26's
 * free-form windows and Android's foldable guidance all converged on the
 * layout reading its own width. Consumed as min-width queries only (see
 * `mediaMin`): base styles are the phone, wider windows add.
 *
 *   base      < md   compact  — top bar + bottom subject bar, one subject
 *   md ≥ 48rem       medium   — left rail, one subject
 *   lg ≥ 64rem       expanded — left rail, every subject stacked (scroll-spy)
 */
export const BREAKPOINT = {
  sm: '40rem',
  md: '48rem',
  lg: '64rem',
  xl: '80rem',
} as const;

export type BreakpointName = keyof typeof BREAKPOINT;

/** `@media (min-width: …)` for a named breakpoint — the only query shape
 *  the mobile-first stylesheet uses (`layout-css.ts`; pinned by
 *  `apps/dashboard/test/web/app-shell.test.ts`). */
export function mediaMin(name: BreakpointName): string {
  return `@media (min-width: ${BREAKPOINT[name]})`;
}

/**
 * `sans` and `m3` are self-hosted (apps/dashboard/src/assets/fonts.ts — Inter
 * and Roboto, vendored OFL-1.1 from Google Fonts, `/fonts/*.woff2`) with the
 * prior system stack kept as the fallback for the fetch/parse window and any
 * consumer that never links the dashboard's font-face sheet. `m3` is the
 * Material 3 "Plain" typeface (m3.material.io/styles/typography); its
 * type-scale pass (`--type-*`, ./m3.ts, emitted via `css.ts`'s `m3Vars()`) is
 * live — `apps/dashboard/src/web/layout-css.ts`'s `.total-n` consumes it for
 * the fleet home's hero numbers (COCKPIT epic).
 */
export const FONT = {
  sans: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, monospace',
  m3: '"Roboto", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const MOTION = {
  fast: '120ms',
  normal: '240ms',
  ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;
