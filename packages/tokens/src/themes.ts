// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { Theme } from './color.js';

/** Dark — the mission-control / cockpit look (intentional, not "default dark"). */
export const DARK: Theme = {
  surface: 'oklch(0.16 0.012 260)',
  surfaceRaised: 'oklch(0.21 0.016 260)',
  surfaceSunken: 'oklch(0.12 0.01 260)',
  text: 'oklch(0.96 0.005 260)',
  textMuted: 'oklch(0.74 0.02 260)',
  border: 'oklch(0.30 0.012 260)',
  borderStrong: 'oklch(0.46 0.02 260)',
  accent: 'oklch(0.74 0.14 230)',
  accentText: 'oklch(0.16 0.012 260)',
  success: 'oklch(0.76 0.16 150)',
  warning: 'oklch(0.82 0.15 85)',
  danger: 'oklch(0.68 0.19 25)',
  info: 'oklch(0.74 0.12 240)',
  sevCritical: 'oklch(0.66 0.2 22)',
  sevHigh: 'oklch(0.76 0.17 55)',
  sevMedium: 'oklch(0.82 0.14 88)',
  sevLow: 'oklch(0.74 0.1 230)',
  needsYou: 'oklch(0.72 0.19 320)',
};

/** Light — the editorial / Swiss look. */
export const LIGHT: Theme = {
  surface: 'oklch(0.99 0.002 250)',
  surfaceRaised: 'oklch(0.97 0.004 250)',
  surfaceSunken: 'oklch(0.95 0.005 250)',
  text: 'oklch(0.22 0.012 260)',
  textMuted: 'oklch(0.44 0.02 260)',
  border: 'oklch(0.88 0.006 250)',
  borderStrong: 'oklch(0.72 0.012 250)',
  accent: 'oklch(0.52 0.2 255)',
  accentText: 'oklch(0.99 0.002 250)',
  success: 'oklch(0.5 0.16 150)',
  warning: 'oklch(0.58 0.15 70)',
  danger: 'oklch(0.52 0.22 25)',
  info: 'oklch(0.53 0.16 250)',
  sevCritical: 'oklch(0.5 0.24 25)',
  sevHigh: 'oklch(0.56 0.18 55)',
  sevMedium: 'oklch(0.54 0.14 75)',
  sevLow: 'oklch(0.53 0.14 250)',
  needsYou: 'oklch(0.5 0.22 320)',
};

/** Terminal — phosphor-on-black, honest and high-contrast. */
export const TERMINAL: Theme = {
  surface: 'oklch(0.14 0.01 150)',
  surfaceRaised: 'oklch(0.18 0.015 150)',
  surfaceSunken: 'oklch(0.1 0.008 150)',
  text: 'oklch(0.9 0.16 150)',
  textMuted: 'oklch(0.7 0.13 150)',
  border: 'oklch(0.32 0.06 150)',
  borderStrong: 'oklch(0.48 0.1 150)',
  accent: 'oklch(0.86 0.16 90)',
  accentText: 'oklch(0.14 0.01 150)',
  success: 'oklch(0.86 0.18 150)',
  warning: 'oklch(0.86 0.16 85)',
  danger: 'oklch(0.72 0.2 25)',
  info: 'oklch(0.82 0.11 200)',
  sevCritical: 'oklch(0.72 0.21 25)',
  sevHigh: 'oklch(0.82 0.18 55)',
  sevMedium: 'oklch(0.86 0.15 85)',
  sevLow: 'oklch(0.8 0.12 165)',
  needsYou: 'oklch(0.8 0.19 320)',
};

export const THEME_NAMES = ['dark', 'light', 'terminal'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const THEMES: Readonly<Record<ThemeName, Theme>> = {
  dark: DARK,
  light: LIGHT,
  terminal: TERMINAL,
};

/** The default theme (an intentional choice for a fleet-of-autopilots cockpit). */
export const DEFAULT_THEME: ThemeName = 'dark';
