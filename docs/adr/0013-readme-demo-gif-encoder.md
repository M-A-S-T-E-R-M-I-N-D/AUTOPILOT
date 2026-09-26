<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0013. The README demo's GIF encoder: `gifenc` 1.0.3, pinned exactly, or no GIF

Status: Proposed (board `web-mtnd3yeq-oyprf0`, "README hero demo GIF
(HUMAN-GATED dep)"). This record is the supply-chain review the operator's
approval waits on. It adds no dependency and changes no code. Approving it is
the operator's call. The slice after approval is at the end.

## Context

`node scripts/docs/record-demo-frames.mjs` already records the demo (Lock on ·
Lucky · Fire) as seven 1280×800 PNG frames, with a `frames.json` of hold
times, and assembles them into a lossless APNG with no new dependency
([epic 0030](../epics/0030-lock-on-and-fire.md), slice 1). What is missing is
the GIF the task asks for. GitHub treats the two formats differently. It marks
an embedded `.gif` `data-animated-image`, which gives the reader a play/pause
control and follows their reduced-motion preference. The same embed of the
APNG comes back as a bare `<img>` that loops with no control. A `<picture>`
can swap in a still for readers who set `prefers-reduced-motion`, and
`apps/dashboard/test/assets/readme-motion.test.ts` requires that swap.
Readers who have not set the preference still get no way to stop the loop.

### Measured on the recorded frames (2026-09-26)

Method: the seven frames in the git-ignored `docs/screens/demo-frames/`,
decoded with node:zlib (inflate, then PNG's five scanline filters, as the
recorder's own decoder does), counting exact 8-bit RGB triples.

| Quantity | Value |
| --- | --- |
| Distinct colours per frame | 1,896 – 2,684 |
| Distinct colours across the loop | 3,446 |
| Pixels exactly covered by the 256 most frequent colours, per frame | 98.06% – 98.49% |
| The same, across the loop | 98.26% |
| Holds that are not a whole number of centiseconds | 0 of 7 (900, 180, 180, 900, 600, 2600, 3000 ms) |

So a GIF of this loop has to be quantized. With 256 colours, about 1.7% of
pixels come out approximate. The encoder must ship a quantizer, or we write
one. The timing needs no rounding, because GIF stores delays in centiseconds.

### The candidates (npm registry, 2026-09-26)

"Weekly" is npm's last-week download count on the day it was fetched. No
candidate is in `pnpm-lock.yaml` yet, directly or transitively.

| Package | Latest | Published | License | Runtime deps | Weekly | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `gifenc` | 1.0.3 | 2021-03-07 | MIT | none | 387,247 | **proposed** |
| `omggif` | 1.0.10 | 2019-07-16 | MIT | none | 4,556,454 | no quantizer: takes indexed pixels only |
| `gif-encoder-2` | 1.0.5 | 2019-08-25 | "UNLICENSE" | none | 70,784 | fails `ci:license-check` (not an allowlisted SPDX id) |
| `gifencoder` | 2.0.1 | 2018-12-18 | BSD-3-Clause | `canvas` ^2.2.0 | 17,243 | native addon: not pure JS |
| `modern-gif` | 2.1.0 | 2026-04-16 | MIT | `modern-palette` ^2.0.0 | 11,745 | runner-up (below) |

`gifenc`: MIT, which is on `scripts/ci/license-check.mjs`'s exact allowlist.
It has no dependencies, 15 files and 172,516 bytes unpacked. Its only scripts
are `prepublishOnly`, `serve` and two `dist:*` builds, so installing it runs
nothing: no preinstall, install or postinstall. That also means it needs no
`onlyBuiltDependencies` entry. It works in Node (ESM and CJS). Its quantizer
is a port of PnnQuant.js (pairwise nearest-neighbour clustering). `quantize`
and `applyPalette` take flat RGBA, and `writeFrame`'s `delay` is in
milliseconds. Its README says it does no dithering and suits flat
vector-style graphics rather than photographs. A dark UI screenshot is the
flat kind.

Its risks, stated plainly:

- **Frozen, not maintained.** One release since 2021, and the README badge
  says "experimental". For a devDependency that only an operator-run script
  imports, this matters less. It is never in the dashboard bundle, and a
  package that does not change cannot bring a new regression.
- **No provenance.** The tarball carries no npm attestation, and `dist/` is
  an esbuild bundle of `src/`, so what gets installed is not proven to be the
  repository's source. The check is to rebuild `dist/` from the published
  gitHead 15e2c3e65ed03c977b42fec48de59b05ee9b9f54 with its own `dist:*`
  scripts and diff the result against the tarball, then pin exactly `1.0.3`.
  The lockfile then holds the integrity
  `sha512-xdr6AdrfGBcfzncONUOlXMBuc5wJDtOueE3c5rdG0oNgtINLD+f2iFZltrBRZYzACRbKr+mSVU/x98zv2u3jmw==`.
  A hijacked 1.0.4 would also have to get past
  [DEPENDENCY-POLICY.md](../DEPENDENCY-POLICY.md)'s cooldown, and past a
  review of a first release in five years.

`modern-gif` is the runner-up: MIT, released in 2026, and the only candidate
with npm provenance. It pulls in `modern-palette` (2.0.0, 2024-01-10, no
attestation). Its README shows browser use only (Web Worker, `window`,
`document`) and says nothing about Node. It would need a Node trial before it
could be proposed.

## Decision (proposed)

Add `gifenc`, pinned exactly at `1.0.3`, as a root devDependency. Before
that, do the rebuild-and-diff above once, and record its result in the commit
that adds it. The recorder decodes the frames it already has, quantizes them
with `gifenc`, and writes `demo.gif` next to `demo.png`. The README top embeds
a committed copy at `docs/screens/demo.gif`, so GitHub's own control and
reduced-motion handling apply. If the
operator declines, the README top gets no GIF. The APNG stays available
through the `<picture>` path `readme-motion.test.ts` already enforces.

## Consequences

- One frozen, zero-dependency devDependency. The dashboard bundle and its
  `ci:bundle-size` budget do not change, because only `scripts/docs/` imports
  it.
- The GIF is lossy (about 1.7% of pixels, by the table above) and has no
  dithering. The APNG stays the lossless record of the same loop.
- The GIF's file size is not measured. Measuring it needs the encoder, and
  the encoder is what this record asks to approve. The slice that adds it
  measures the size, and a README hero too heavy to glance at goes back to the
  operator.
- If `gifenc` is ever abandoned for real (for example, a takeover of its npm
  name), the exact pin keeps the reviewed bytes in place until someone lifts
  it on purpose.

## The slice after approval

1. `record-demo-frames.mjs` gains an `encodeGif(frames)` export next to
   `assembleApng`, reusing its decoder. A test checks that the GIF's
   logical-screen size, frame count, delays and loop extension match the
   manifest.
2. The README top embeds `docs/screens/demo.gif` above the three stills.
   `readme-motion.test.ts` exempts GIFs already, so that test does not change.

## Related

[Epic 0030](../epics/0030-lock-on-and-fire.md) (slice 1: the recorder and the
APNG), [DEPENDENCY-POLICY.md](../DEPENDENCY-POLICY.md),
`scripts/docs/record-demo-frames.mjs`,
`apps/dashboard/test/assets/readme-motion.test.ts`,
`scripts/ci/license-check.mjs`.
