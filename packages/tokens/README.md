<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# @autopilot/tokens

Design tokens: the single source of truth for palette, type, space, shape and motion, with the
three shipped themes — **dark** (mission control), **light** (editorial), **terminal** (phosphor) —
and the dashboard's locale table.

Part of the [AUTOPILOT](../../README.md) monorepo; not published on its own (`private`).

## What lives here

- `themes.ts`, `color.ts` — the three `Theme` records in oklch and the contrast math;
  `docs/CONTRAST-MATRIX.md` is generated from them and CI-verified (every semantic pair ≥ 4.5:1).
- `scale.ts`, `mx.ts` — the fluid type and space scales and the M3-derived shape, elevation and
  motion tokens.
- `css.ts` — `tokensCss()`: every token as a CSS custom property, per theme under
  `[data-theme='…']`. The dashboard's stylesheet reads tokens only; a hex literal there is a defect.
- `strings.ts`, `locales.ts` — `STRINGS` in English and Hebrew and the `translate()` the client
  mirrors as `tr()`. Every key exists in both locales; a test forbids identical values except for the
  Latin-script allow-list. See `docs/TRANSLATION-DOCTRINE.md`.

Tests: `pnpm exec vitest run packages/tokens`. Regenerate the matrix: `pnpm contrast-matrix:update`.
