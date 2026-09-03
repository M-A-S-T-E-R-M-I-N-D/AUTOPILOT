<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0008. Brand identity — the goggles mark: a pilot you can trust, a face you never see

Status: Active — the goggles mark + brandmark modules landed
(`src/assets/goggles-mark.ts`, `src/assets/brandmark.ts`), the masthead
lockup/favicon/manifest are wired into the shell, and slice 2 is complete:
the README header now carries the mark via a theme-aware `<picture>`
element pointing at committed static SVGs (2026-08-20 fleet round); slice 3's
avatar/social-preview PNGs are now generated and committed, one 🟣
operator upload step short of closing it; slice 4 is now complete
(2026-08-21 fleet round) — see below. Founder direction (2026-08-20, same
day): the mark's flat lens circles read as modern sunglasses, not the
intended vintage Army Air Corps D-1 flying goggles — fixed by adding a
padded-eyecup silhouette (a frame-colored pad ring around a smaller glass
disk, replacing the flat lens circle) across
`goggles-geometry.ts`/`goggles-mark.ts`/`brandmark.ts`'s raster pipeline;
all committed static exports (README SVGs, avatar/social PNGs) regenerated
from the new geometry. See `docs/BRAND.md`'s "Construction" section. A
regression test proved the pad ring survives a true 16px favicon render;
a follow-up test (2026-08-22 fleet round) proved the strap hint did NOT —
a hairline diagonal tick anti-aliases away almost entirely at 16px, unlike
the long, axis-aligned bridge. Fixed by giving the strap its own
`STRAP_WIDTH` (3.2 units, double the bridge's `STRUT_WIDTH`) in
`goggles-geometry.ts`, applied in both `goggles-mark.ts`'s vector strokes
and `brandmark.ts`'s raster stroke-hit-testing; all committed static
exports regenerated again from the new geometry. A last follow-up test
(2026-08-23 fleet round) closed the one remaining unverified piece of that
fix's own claim — the bridge's own 16px survival was asserted in the fix's
commit message but never proved. A dedicated regression test passed with
no geometry change: the bridge sits in the sub-pixel gap between the two
pads at 16px, so the pads' own overlap already carries the connection. All
three mark elements (pad ring, strap, bridge) now have 16px regression
coverage — slice 1's legibility claim is fully closed.

Founder direction (2026-08-14), themes verbatim: a pilot · Star of David · aviator
goggles across the eras · anonymity · hackers · a mysterious figure that is a FRIEND —
one you can absolutely trust · Israeli colors · everything orbiting those themes. The
official GitHub face (avatar, social card, README header) plus the in-product mark.

## The synthesis (why goggles carry every theme at once)

**Aviator goggles are the one object that IS all of the founder's themes:** they say
pilot (the product's whole metaphor), they MASK (anonymity, the hacker figure), their
mirrored lenses reveal nothing (mystery) while implying someone steady behind them
(the trustworthy friend — a guardian who works for you), and their heritage shape
(leather-and-brass era through fighter-jet visors) gives the timeless-not-trendy
weight an infrastructure tool wants. Research grounding (2026): mascots work as
capability metaphors and trust devices in OSS branding
([Linux Foundation](https://www.linuxfoundation.org/blog/open-source-symbolism-exploring-the-stories-behind-linux-foundation-project-mascots-and-logos),
[OpenStack's mascot process](https://www.openstack.org/project-mascots/));
current trend language that fits: **Stamp & Seal** and **Crafted Linework** (trust,
heritage), plus the retro-futurist lane for aviation
([VistaPrint 2026 trends](https://www.vistaprint.com/hub/logo-design-trends),
[LogoLounge 2026](https://www.logolounge.com/trend/2026-logo-trend-report)).

## Direction

- **Primary mark:** minimal SVG aviator goggles, front-on — two lenses + bridge +
  strap hint; readable at 16px (favicon) and 1024px (social card). Crafted-linework /
  stamp-seal framing option for the README header. Dark-first (Cockpit MX palette,
  epic 0005 tokens), light variant intentional.
- **Wordmark:** AUTOPILOT in the MX display face, tabular-numerals family kinship.
- **On the national/religious symbols (honest counsel, founder decides):** the Star
  of David and flag colors carry real meaning to the founder AND real adoption
  friction for a global OSS platform (symbols read politically by some audiences).
  Recommended shape: keep the PRIMARY mark universal; ship a **founder's-mark
  edition** — the goggles with a blue-white lens gradient and a subtle six-point
  glint in the lens reflection — as the founder's signature variant (profile,
  releases signed "MΔSTERMIND"), not the default repo face. Both get built; the
  founder chooses which flies where.
- **Anonymity/hacker note:** the figure is never drawn — ONLY the goggles. No face,
  no eyes. The brand's answer to "who is the pilot?" is permanently: the one flying
  your repo.

## Acceptance criteria

- SVG-first, zero-dependency assets committed under `apps/dashboard/src/assets/brand/`
  (or sibling), wired through the EXISTING favicon/manifest pipeline; README header,
  GitHub avatar + social-preview exports rendered from the same source SVG.
- Legible at 16/32/64/512/1024 px; axe-clean wherever embedded; both themes.
- The founder's-mark variant exists alongside the universal mark.
- Brand usage doc (one page): mark, spacing, don'ts, palette bindings to MX tokens.

## Out of scope

- Paid design contests, raster-first workflows, any tracking pixels in social cards.

## Slices

1. Brand spec + SVG primary mark (goggles) at all sizes, both themes.
   SHIPPED — `apps/dashboard/src/assets/goggles-mark.ts`'s `gogglesMarkSvg()`:
   hand-authored SVG (two lenses, bridge, strap hint) on the same 32x32
   canvas as the existing app-icon dot, `dark`/`light` themes bound to the
   MX tokens (`packages/tokens/src/themes.ts`), `plain`/`crafted`/`stamp`
   variants, and an optional rounded-square backdrop for favicon/avatar use
   vs. transparent linework for doc embedding. Brand spec doc: `docs/BRAND.md`
   (construction, variant table, theme-bound hex, don'ts). Covered by
   `test/assets/goggles-mark.test.ts`. Not yet wired into the favicon/README —
   that is slice 2.
2. Wordmark + lockups; favicon/manifest/README-header wiring via existing pipeline.
   SHIPPED — shared geometry/color sources
   (`assets/goggles-geometry.ts`, `assets/brand-colors.ts`) so the vector
   mark and the raster favicon pipeline draw from ONE shape/palette instead
   of two hand-copied definitions; `brandmark.ts`'s `renderIconPixels`
   rasterizes the actual goggles shape (two lenses + bridge + strap
   strokes) instead of the old plain dot, and `faviconSvg()` now delegates
   to `gogglesMarkSvg()` — favicon.ico/icon-*.png/favicon.svg all render
   from the one source; the in-app masthead lockup (`web/shell.ts`) swaps
   the `●` bullet for `gogglesMarkInlineSvg()` (a CSS-custom-property
   themed variant so it re-themes live with the switcher) next to the
   existing bold/tracked "AUTOPILOT" wordmark text; and the README header
   now carries the mark via committed static exports
   (`docs/brand/goggles-mark-{dark,light}.svg`, generated from
   `gogglesMarkSvg({ variant: 'crafted', background: false })` and guarded
   against drift by `test/assets/readme-brand-assets.test.ts`) wired
   through a `<picture prefers-color-scheme>` element above a real
   `# AUTOPILOT` heading — the static-export decision the earlier slice
   left open: a live, CSS-themed SVG can't work in a file GitHub fetches
   by relative path, so the README uses `gogglesMarkSvg()`'s fixed-hex
   output instead of `gogglesMarkInlineSvg()`. Slice 2 is complete.
3. GitHub face: avatar + social-preview exports; apply to the canonical repo.
   In progress — shipped so far: `docs/brand/avatar.png` (512x512) and
   `docs/brand/social-preview.png` (1280x640, GitHub's recommended 2:1
   ratio) committed, rasterized from the same `renderIconPixels` source the
   favicon pipeline uses (`renderAvatarPng()`/`renderSocialPreviewPng()` in
   `brandmark.ts`; `png.ts`'s new `encodePngRect` generalizes the existing
   square-only PNG encoder), drift-guarded by
   `test/assets/github-face-assets.test.ts`. See `docs/BRAND.md`'s "Slice 3"
   section. Open — 🟣 human-required: the operator uploads both files to the
   canonical repo's GitHub Settings (Profile picture / Social preview); a
   live action on the founder's own account, not something generation can
   do.
4. Founder's-mark edition (blue-white lens, six-point glint) + usage doc.
   SHIPPED (2026-08-21 fleet round) — `gogglesMarkSvg({ edition: 'founder'
   })` swaps the flat lens fill for a radial blue-white gradient and adds a
   subtle six-point reflection glint per lens, same pad-ring silhouette as
   the universal mark (a recolor, not a new shape); committed static export
   `docs/brand/goggles-mark-founder.svg`, drift-guarded by
   `test/assets/founder-mark-assets.test.ts`, which also asserts the
   favicon/manifest/README pipeline stays on the universal edition. Usage
   doc: `docs/BRAND.md`'s "Slice 4" section. The raster
   favicon/avatar/social-preview pipeline intentionally does not gain a
   founder variant — out of scope, since the repo's default face must stay
   universal.

## Related

- Epic 0005 Cockpit MX (palette/type source), epic 0006/0007 (the GitHub surfaces
  this face fronts), existing brand-mark/favicon plumbing (century-day ship).
