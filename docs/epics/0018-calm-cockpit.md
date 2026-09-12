<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Epic 0018 — Calm Cockpit: layout stability, tabs, and the many-lanes view

**Status:** DONE (2026-09-12). All four slices shipped: 1 — the stability
laws (`3236b264`, `5ad80787`: bounded scroll containers; `4391c5fa`,
`8e2eda0a`: project-page sections and render state survive unrelated
ticks); 2 — the many-lanes grid (`c1287698`); 3 — center tabs, delivered as
epic 0021 slice 5 (`6d0fe572`: Overview · Board · Keeper · Plan · Docs · Data,
one subject at a time, each with its own scroll; the Keeper subject absorbs
triage, PR review, mirror pass, backlog and coordination); 4 — the anti-CLS
e2e budget (`7f308457`). Filed 2026-09-06 mid-flight as SPEC under the
shell.ts collision discipline (0017 owns the chrome, 0018 the CENTER);
tracking issue #28 closes with this note.

## The operator's pain, verbatim-faithful

1. Reading a doc in the DOCS panel while a flight runs: sibling panels grow/
   shrink, the page reflows, the reading position jumps — worst case the
   viewer state resets ("נסגר"). Scroll sizes must not change under the reader.
2. Blinking everywhere under parallel runs: the detected-lag chip, near-miss/
   guard chips, panels that repaint identical facts. "סופר מעצבן ומציק".
3. The live-worker card shows ONE lane while five fly; the masthead's
   "flying now" list names lanes but says nothing about WHAT each is doing.
4. The center is one long stack; verdict areas (issue triage) hold prime
   space after they've settled. Time to break it into tabs/sections.

## Doctrine — THE LAYOUT STABILITY LAWS (tests enforce, not taste)

- **A panel never resizes the page.** Every live-updating region owns a
  fixed-height (or max-height) scroll container; growth scrolls INSIDE it.
- **The reader is sacred.** The docs viewer (and any open `<details>`/dialog)
  must survive every fleet tick with scroll position and open-state intact —
  renders are state-preserving in-place patches, never replaceChildren on a
  region containing reader state.
- **Repaint only on value change.** The D2 idempotent-tick rule (cockpit 0015)
  extends to EVERY chip and counter: identical fact ⇒ zero DOM writes ⇒ zero
  flicker. The lag chip, near-miss chip, guard chip get explicit dedup tests.
- **No animated attention without an event.** Pulsing/blinking is reserved for
  a genuinely NEW fact (single pulse, then steady). Steady states are steady.
- **Anti-CLS budget in e2e**: a scripted 60s populated-flight scroll test
  asserts cumulative layout shift ≈ 0 outside the user's own actions.

## The center becomes tabs

Project page center splits into stable tabs (the 0017 side-rail is the
switcher on deep pages; plain tab row until it lands):
`Overview` (gauges, live workers) · `Board` · `Flight log` · `Keeper`
(PR review + issue triage + approvals — settled verdicts collapse to a
one-line badge history) · `Docs` (the protected reading room) · `Data`
(charts/series). Each tab keeps its own scroll; switching never reflows
siblings. Triage-skip entries live as collapsed badges with reasons on
demand — informative, never squatting.

## The many-lanes view

Replace the single live-worker card with a **lane grid** (one compact card
per active lane): callsign + model + phase chip + CURRENT TASK title +
last-action line + elapsed/progress bar. Data: each lane's flight log +
instance registry already carry this; a small read-side aggregator serves
`lanes[]` on the existing state poll. The masthead "flying now" list links
each name to its card. Five agents in parallel should read like a real
squadron board — who, on what, how far — at a glance.

## Slices

1. Stability laws first: scroll-container audit + docs-viewer state
   preservation + the chip dedup tests (lag/near-miss/guard) — kills the
   worst pain with zero visual redesign.
2. Lane grid read-side (`lanes[]` aggregator) + the grid cards.
3. Center tabs with per-tab scroll; Keeper tab absorbs triage/PR/approvals
   with settled-verdict collapse.
4. Anti-CLS e2e budget test (the law that keeps it fixed forever). Shipped:
   `e2e/anti-cls.spec.ts` freezes the clock, pumps 60s of fake-time fleet
   ticks plus a scripted scroll against the populated project page, and
   asserts the Layout Instability API's cumulative score stays at zero.
