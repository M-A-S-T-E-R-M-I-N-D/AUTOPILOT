<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# AUTOPILOT — brand mark

Epic [0008](epics/0008-brand-identity.md), slice 1: the goggles mark + this
spec. Slice 2 (wordmark + favicon/manifest/README-header wiring) and slice 4
(founder's-mark edition) are complete — see "Slice 2" and "Slice 4" below.
Founder direction (2026-08-20) refined the construction: the mark must read
as VINTAGE pilot aviator goggles, Army Air Corps D-1 style, not modern
sunglasses — see "Pad silhouette" below.

## The mark

Minimal front-on aviator goggles: two padded eyecups (a leather-pad ring
around a smaller glass, not a flat circle), a bridge over the nose, a strap
hint at each outer edge. The figure that wears them is never drawn — only
the goggles — so the mark answers "who is the pilot?" the same way every
time: the one flying your repo.

One shape, four founder themes: **pilot** (the product's whole metaphor),
**mask** (anonymity — no face, no eyes, ever), **mirrored lenses that reveal
nothing** while implying someone steady behind them (**trust** — a guardian
who works for you), and a heritage silhouette (leather-and-brass through
fighter-jet visors) that reads timeless rather than trendy.

Source: `apps/dashboard/src/assets/goggles-mark.ts`, `gogglesMarkSvg()`.
Hand-authored SVG, no rasterizer, no build step — one function returns the
complete `<svg>` string for every theme/variant/backdrop combination.

## Construction

- Canvas: `viewBox="0 0 32 32"` — the same canvas as the existing app-icon
  dot (`brandmark.ts`), so a future favicon swap (slice 2) is a drop-in.
- Two padded eyecups per lens, not a flat circle: an outer **pad** disk
  (`r=LENS_R=5.5`, frame color) with a smaller **glass** disk on top
  (`r=GLASS_R=3.4`, accent color), centered left/right of the vertical
  midline. The ring between the two radii is the leather-pad silhouette —
  the detail that reads as vintage Army Air Corps D-1 flying goggles
  instead of modern sunglasses (founder direction, 2026-08-20).
- A bridge: a short stroked line overlapping each pad's edge by 0.5 units so
  the join reads as one solid piece, not a gap.
- A strap hint: one short outward tick off each pad's outer-upper edge —
  the strap disappearing off-canvas, never drawn further than that. Drawn
  at `STRAP_WIDTH` (3.2 units), double the bridge's `STRUT_WIDTH` (1.6) —
  a short diagonal tick anti-aliases away almost entirely at a true 16px
  favicon render at hairline width, unlike the long, axis-aligned bridge,
  which survives at 1.6 (founder direction, 2026-08-21: the strap must
  read alongside the pad ring and lenses at favicon size, not just the
  pad).
- Pure vector geometry, no fine detail below the stroke-width floor — this
  is what keeps one source legible from a 16px favicon to a 1024px social
  card instead of needing a second, simplified asset at small sizes. The pad
  ring, the strap hint, and the bridge are all sized to survive a true 16px
  favicon render — no longer just a by-eye check against a nearest-neighbor
  upscale: regression tests (`apps/dashboard/test/assets/brandmark.test.ts`'s
  `renderIconPixels` 16px cases) sample the pad annulus, the strap stroke,
  and the bridge stroke, and assert an unblended frame-color pixel survives
  in each. The bridge's survival at `STRUT_WIDTH` (1.6) was only an
  unverified claim in the `STRAP_WIDTH` fix's commit message (2026-08-22)
  until a follow-up regression test proved it: the bridge sits in the ~0.5
  viewBox-unit gap between the two pads, which is already sub-pixel at
  16px, so the pads' own overlap carries the connection — no width change
  was needed, only the missing proof.

## Variants

| Variant | Adds | Intended context |
| --- | --- | --- |
| `plain` | — | The primary mark. Validated legible at 16/32/64/512/1024px. |
| `crafted` | A stitch-line ring etched into each pad, midway between glass and pad edge | Crafted-linework framing for the README header (larger canvas). |
| `stamp` | A badge-style double ring around the whole mark | Stamp-seal framing for the README header / social card. |

`crafted` and `stamp` are framing options, not favicon replacements — their
extra rings are sized for a context bigger than 32px.

## Backdrop

`background: true` (default) paints a rounded-square backdrop behind the
mark, matching the existing app-icon convention — use this for
favicon/avatar contexts that need an opaque tile. `background: false`
renders transparent linework for embedding over existing page/doc
backgrounds (README header, in-app chrome).

## Theme bindings

Colors are fixed hex, not the live OKLCH token pipeline — a static mark
doesn't re-theme with the page, the same reasoning `brandmark.ts` already
applies to the app icon. Each hex is the sRGB conversion of the matching MX
token (`packages/tokens/src/themes.ts`), computed once by hand (Björn
Ottosson's OKLCH → linear-sRGB matrices, the same math as
`packages/tokens/src/color.ts`'s `relativeLuminance`, then gamma-encoded).

| Theme | Backdrop | Frame (pad/bridge/strap) | Glass | Token source |
| --- | --- | --- | --- | --- |
| `dark` | `#0a0d12` | `#f0f2f5` | `#25baf2` | `DARK.surface` / `DARK.text` / `DARK.accent` — glass hex is identical to `brandmark.ts`'s `FG_HEX`, so the goggles mark and the existing app-icon dot read as one family. |
| `light` | `#fbfcfd` | `#171b20` | `#0063d7` | `LIGHT.surface` / `LIGHT.text` / `LIGHT.accent`. |

Dark is the primary, product-default theme (epic 0005); light is an
intentional secondary, not an afterthought.

## Don'ts

- Don't draw the figure wearing the goggles. Ever. The mask IS the mark.
- Don't recolor the glass off the accent token — the accent-colored glass is
  the visual link back to the existing in-app brand dot.
- Don't drop the pad ring back to a flat lens circle — that reads as modern
  sunglasses, not vintage flying goggles, which is the exact regression
  founder direction (2026-08-20) corrected.
- Don't shrink the `plain` variant below its validated 16px floor; use the
  `crafted`/`stamp` framing at the larger sizes instead of scaling
  ornamentation down.
- Don't thin the strap hint back to the bridge's `STRUT_WIDTH` — a hairline
  diagonal tick anti-aliases away at 16px, the exact regression the
  `STRAP_WIDTH` fix corrected.
- Don't reach for the live OKLCH pipeline for a static export — pick the
  fixed hex from the table above, same as `brandmark.ts`.

## Slice 2 — favicon/manifest wiring + the in-app lockup + the README header

The mark's geometry and dark-theme hex moved out of `goggles-mark.ts` into
two shared leaf modules — `assets/goggles-geometry.ts` (shape) and
`assets/brand-colors.ts` (color) — so the vector SVG and the raster favicon
pipeline draw from the same numbers instead of two hand-copied
definitions. `brandmark.ts`'s `renderIconPixels` now rasterizes the actual
goggles shape (lens circles + bridge/strap strokes) instead of the old
plain accent dot, and `faviconSvg()` delegates to `gogglesMarkSvg()` — so
`favicon.ico`/`icon-192.png`/`icon-512.png`/`favicon.svg` all render from
the one source SVG.

The in-app masthead (`web/shell.ts`) swaps the `●` bullet for
`gogglesMarkInlineSvg()` — a distinct rendition colored with
`var(--color-accent)`/`var(--color-text)` instead of `PALETTE`'s fixed hex,
so the icon re-themes live when the switcher flips
`document.documentElement.dataset.theme` (a baked-hex SVG would go stale
until reload). It sits next to the existing bold, tracked "AUTOPILOT" text
— together, the icon + text lockup.

The static-export decision for the README (which can't run CSS, so
`gogglesMarkInlineSvg()` doesn't apply): commit `gogglesMarkSvg()`'s
fixed-hex output once, at build time, rather than serve it per-request the
way the favicon route does — a README image needs a file GitHub can fetch
by relative path, not a live endpoint. `docs/brand/goggles-mark-dark.svg`
and `docs/brand/goggles-mark-light.svg` (`crafted` variant, transparent
background) are generated from `gogglesMarkSvg({ theme, variant: 'crafted',
background: false })`; `test/assets/readme-brand-assets.test.ts` asserts
both files stay byte-identical to that call so the geometry/color source of
truth stays `goggles-mark.ts`, not a hand-maintained copy. `README.md`'s
header wires them through a `<picture>` element with a
`prefers-color-scheme` media query — GitHub natively supports this pattern,
so the mark switches with the reader's OS/GitHub theme the same way the
in-app lockup switches with AUTOPILOT's own theme switcher. "AUTOPILOT"
stays a real `# AUTOPILOT` markdown heading beneath the image, matching the
in-app pattern of icon + separate text rather than a fused wordmark glyph
(baking text into portable SVG would mean embedding font data GitHub can't
guarantee rendering).

## Slice 3 — GitHub face exports

The avatar (`docs/brand/avatar.png`, 512x512, `renderAvatarPng()`) and
social-preview card (`docs/brand/social-preview.png`, 1280x640 — GitHub's
recommended 2:1 ratio, `renderSocialPreviewPng()`) are both rasterized from
the same `renderIconPixels` source the favicon pipeline already uses
(`apps/dashboard/src/assets/brandmark.ts`), zero new dependencies
(`png.ts`'s `encodePngRect` generalizes the existing square-only PNG encoder
to a rectangular canvas). The social-preview card centers the goggles
tile's own rounded-square backdrop on a flat brand-dark field — no wordmark
text baked in, same reasoning as the README export (below): a raster GitHub
serves as-is can't guarantee font rendering, and "the mask IS the mark"
already carries the brand alone. Both files are committed and guarded
against drift by `test/assets/github-face-assets.test.ts`, the same
commit-and-compare pattern as the README's SVG exports.

🟣 Open operator step to close this slice: upload `docs/brand/avatar.png`
and `docs/brand/social-preview.png` to the canonical repo's GitHub Settings
(Profile picture / Social preview) — a live action on the founder's own
account, out of scope for generation.

## Slice 4 — founder's-mark edition

The founder's signature variant (profile picture, releases signed
"MΔSTERMIND") — never the default repo face, which stays the `universal`
edition wired through the favicon/manifest/README/GitHub-face pipeline
above. Source: `gogglesMarkSvg({ edition: 'founder' })`
(`apps/dashboard/src/assets/goggles-mark.ts`); committed static export:
`docs/brand/goggles-mark-founder.svg` (dark theme, `plain` variant,
opaque backdrop — a self-contained face like the avatar, not README
linework), drift-guarded by `test/assets/founder-mark-assets.test.ts`.

Same pad-ring shape as the universal mark (`goggles-geometry.ts` — the
founder edition is a recolor, not a different silhouette), with two
changes confined to the glass:

- **Blue-white lens gradient**: each glass disk swaps its flat accent fill
  for a radial gradient (`<radialGradient>`, white center offset toward the
  upper-left, fading to the theme's accent blue at the edge) — a mirrored,
  reflective lens instead of a flat disk, literalizing the epic's "mirrored
  lenses that reveal nothing" synthesis.
- **Six-point glint**: a small reflection glint in each lens — three
  crossing white strokes through an off-center point (six visible ray
  tips), sized to sit inside the glass without spilling onto the pad. A
  subtle nod to the founder's six-point themes (epic 0008's "honest
  counsel" section), never drawn as a literal hexagram and never present in
  the universal mark.

The raster favicon/avatar/social-preview pipeline (`brandmark.ts`) is
intentionally untouched by this slice — it keeps rasterizing the universal
edition only, so the repo's default face never silently picks up the
founder's gradient.

### Founder's-mark don'ts

- Don't wire the founder edition into `faviconSvg()`, `webManifest()`, the
  in-app masthead lockup, or any surface a visiting contributor sees by
  default — the universal edition is the repo's face; the founder edition
  is a personal signature, not a public variant.
- Don't draw the glint as a literal six-pointed star/hexagram outline — the
  three-stroke "reflection glint" reads as a photographic highlight, which
  is deliberately more subtle than a rendered religious symbol (see epic
  0008's "honest counsel" section on the Star of David).
- Don't drop the gradient's white stop below full opacity or move it off
  the upper-left offset — a centered or dim highlight stops reading as a
  reflection and starts reading as a flat recolor.

## Open (future slices)

- None currently open for the primary/founder marks; epic 0008 slice 3's
  remaining item is the 🟣 operator upload step above (not a generation
  gap).
