// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { INTER_VARIABLE_WOFF2_BASE64, ROBOTO_VARIABLE_WOFF2_BASE64 } from './font-data.js';

/**
 * M3 design foundation: Inter (UI text) and Roboto (Material 3 "Plain"
 * typeface, ./scale.ts FONT.m3) self-hosted as `/fonts/*.woff2` — same-origin,
 * so CSP stays `default-src 'self'` with zero calls to fonts.googleapis.com /
 * fonts.gstatic.com. Each family ships as ONE variable-font file covering its
 * whole weight axis (Google's own css2 latin subset resolves every requested
 * weight to the same file), so multiple @font-face weight rules below share a
 * single download instead of one request per weight.
 *
 * A Material Symbols icon subset is deliberately NOT included here — this app
 * has no icon usage yet to subset against (that lands with the M3 component
 * pass), and shipping a speculative glyph set would just be dead weight.
 */

const INTER_PATH = '/fonts/inter.woff2';
const ROBOTO_PATH = '/fonts/roboto.woff2';

/** The exact latin unicode-range Google Fonts declares for both families. */
const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

const INTER_WEIGHTS = [400, 500, 600, 700] as const;
const ROBOTO_WEIGHTS = [400, 500, 700] as const;

let interBuf: Buffer | undefined;
/** The self-hosted Inter variable font — memoized decode of the embedded base64. */
export function interWoff2(): Buffer {
  if (!interBuf) interBuf = Buffer.from(INTER_VARIABLE_WOFF2_BASE64, 'base64');
  return interBuf;
}

let robotoBuf: Buffer | undefined;
/** The self-hosted Roboto variable font — memoized decode of the embedded base64. */
export function robotoWoff2(): Buffer {
  if (!robotoBuf) robotoBuf = Buffer.from(ROBOTO_VARIABLE_WOFF2_BASE64, 'base64');
  return robotoBuf;
}

/** `path -> renderer`, so routes.ts can wire the font routes with one loop. */
export const FONT_ROUTES: Readonly<Record<string, () => Buffer>> = {
  [INTER_PATH]: interWoff2,
  [ROBOTO_PATH]: robotoWoff2,
};

function fontFace(family: string, path: string, weight: number, stretch: boolean): string {
  const stretchLine = stretch ? '\n  font-stretch: 100%;' : '';
  return `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};${stretchLine}
  font-display: swap;
  src: url(${path}) format('woff2');
  unicode-range: ${LATIN_RANGE};
}`;
}

/** The @font-face rules for both self-hosted families, one per vendored weight. */
export function fontFaceCss(): string {
  const inter = INTER_WEIGHTS.map((w) => fontFace('Inter', INTER_PATH, w, false));
  const roboto = ROBOTO_WEIGHTS.map((w) => fontFace('Roboto', ROBOTO_PATH, w, true));
  return `${[...inter, ...roboto].join('\n\n')}\n`;
}

/** The self-hosted font files to preload — declared once so shell.ts and any
 *  future consumer stay in sync with FONT_ROUTES. */
export const PRELOAD_FONT_PATHS: readonly string[] = [INTER_PATH, ROBOTO_PATH];
