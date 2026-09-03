// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The dark-theme brand hex trio, shared by `brandmark.ts` (raster favicon
 * pipeline) and `goggles-mark.ts` (vector mark) so both read as one family
 * from a single source instead of two hand-copied literals drifting apart.
 * A standalone leaf module (no imports) — `brandmark.ts` and
 * `goggles-mark.ts` both depend on it, so it must not depend on either, or
 * the two would import each other through it.
 *
 * Fixed hex, not the live OKLCH token pipeline (`packages/tokens/src/themes.ts`):
 * a static brand mark doesn't re-theme with the page, the same reasoning
 * `docs/BRAND.md` documents for the vector mark. Each hex is the sRGB
 * conversion of the matching MX token, computed once by hand.
 */
export const BG_HEX = '#0a0d12';
export const FG_HEX = '#25baf2';
/** Bridge/strap stroke color — the goggles mark's frame, dark theme. */
export const FRAME_HEX = '#f0f2f5';
