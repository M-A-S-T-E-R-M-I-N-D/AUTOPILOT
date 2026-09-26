<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0025. The icon system — one stroke family, no emoji, credits kept

Status: Draft (2026-09-13). Board tasks seeded 2026-09-12 under this number.

## The ask

Operator, 2026-09-12: "the use of emoji feels a bit cheap — use icons (and don't
forget to update the credits documents)". The dashboard uses emoji as glyphs in
headings, chips, buttons and tips (🎯, 🔥, 📥, 📋, 🧑‍🤝‍🧑, ✦, ⚑ …); they render
differently per platform, ignore the theme's colour and stroke, and cannot be
sized or aligned like type.

## The choice

**Lucide** (ISC). Stroke icons — `fill: none; stroke: currentColor;
stroke-width: 1.75` — the exact style the subject nav's SVGs already use, so one
family covers the whole surface. Attribution is not required on screen; when the
icon files are redistributed the complete upstream LICENSE travels with them (it
carries the Feather/MIT notice for the icons Lucide derived). Material Symbols
(Apache-2.0) was the alternative: attribution "loved, not required", but a
redistribution must carry the licence, modified-file notices and NOTICE
propagation, and the filled style does not match the nav.

## Laws

1. **Vendor only what is used.** Each icon's path is copied into
   `apps/dashboard/src/web/icons.ts` by name; no icon font, no full package, no
   runtime fetch (CSP `img-src`/`script-src 'self'` stays as it is).
2. **Semantics stay in text.** An icon beside a label is `aria-hidden`; an icon
   alone carries an `aria-label` from STRINGS — never a bare glyph.
3. **Theme-native.** `currentColor` everywhere; size from the type scale
   (`1em` inline, `1.25rem` in buttons, `1.5rem` in the rail); the three themes
   need no per-icon work.
4. **Credits.** `LICENSES/ISC-lucide.txt` (the complete upstream text),
   `THANKS.md` gains a Lucide line, `docs/README.md`'s credits section names it,
   and REUSE stays green (`reuse lint` in CI).
5. **No emoji in chrome.** A census test lists every emoji-bearing render site;
   the count goes to zero across the slices and the test pins zero.

## Slices

1. `icons.ts` + `LICENSES/ISC-lucide.txt` + THANKS; the subject nav and the
   board's focus/burn/inbox/backlog chips first (the most visible).
2. Panel headings and execute buttons (pool, PR review, triage, mirror pass,
   release, landing). **Hub landed 2026-09-13:** 32 more shapes vendored and
   `panelHeading(tag, cls, key, icon)` in the core bundle — an icon beside an
   inner `[data-i18n]` span, so the locale sweep never wipes it. The per-panel
   conversions (STRINGS drop the emoji in both locales, tests pin the new
   text) are lane work, file-disjoint by feature module.
3. Status pills and the live-worker cards; the office map's markers.
4. **Landed 2026-09-26:** the emoji census test
   (`apps/dashboard/test/web/icon-system-emoji-census.test.ts`) reads every
   `.ts` file under `src/web/` from disk, strips comments, and pins the raw
   emoji count at zero — ✓/✗/⚠ stay as the design's deliberate literal-glyph
   exception (see the test's own doc comment). Docs/screenshots refresh is
   still open.

## Related

Epic 0021 (the shell's nav already draws strokes), 0026 (the tasks screen, the
first consumer), `docs/README.md` credits.
