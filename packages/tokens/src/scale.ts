// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Theme-invariant design primitives (space, radius, type, fonts, motion). Colors
 * change per theme (see `./themes.ts`); these do not. Emitted once under `:root`.
 */

export const SPACE = {
  '0': '0',
  '1': '0.25rem',
  '2': '0.5rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': '1.5rem',
  '6': '2rem',
  '8': '3rem',
} as const;

export const RADIUS = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  full: '9999px',
} as const;

export const TYPE = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.5rem',
  '2xl': '2rem',
  '3xl': '3rem',
} as const;

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
