<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0015. Cockpit supervisory control — the COCKPIT MASTER BRIEF, reconciled to this repo

Status: Active — Phase 0 (measure) open; nothing ships unmeasured.

The operator supplied a research-backed brief (2026-08-27) for taking the
dashboard from information-rich/decision-poor to a supervisory-control
interface, plus a node-graph lens. This epic is that brief **reconciled
against decisions this repo already made and facts verified against the
tree** — where the brief and a recorded decision agree, the decision is cited
and closed; where the brief's `[OBSERVED]` leads could be checked, they are
marked CONFIRMED or KILLED below. The brief's method stands: measure first,
change through the token layer, evidence before opinion, gate-green slices.

## Prior decisions — KEPT, not re-litigated

| Brief says | Repo already decided | Verdict |
| --- | --- | --- |
| No React / no UI framework / no chart library; inline SVG | `docs/ECOSYSTEM-RESEARCH.md` §1 (no framework under the core loop) + the entire `web/` idiom | **KEPT** — identical conclusions, independently reached |
| DTCG token source of truth | `@autopilot/tokens` already exists: `themes.ts` (3 themes), `m3.ts` (M3 elevation/shape/motion/state-layers), `css.ts` emits `[data-theme]` blocks | **ADAPTED** — the token source of truth is `@autopilot/tokens`. Extend it (semantic tier, missing state tokens); a DTCG export is a later slice only if something consumes it |
| `elkjs` pre-approved, needs an ADR | `docs/ENGINEERING-DOCTRINE.md` package-vetting ritual | **KEPT** — elkjs enters through the vetting ritual + ADR, like every dependency |
| Graph = projection of OTLP spans, GenAI conventions | OTLP export already shipped (`flight/otlp.ts`, `/api/state` `otlpConfigured`) | **KEPT** — `spansToGraph` builds on the existing exporter; missing data = span-attribute task in the engine, no new schema |
| Bundle/perf budgets never regress | Founder ruling recorded 2026-08-12: "budgets STAY" (150KB/45KB) | **KEPT** — GREEN again as of `245505b9` (revert of the tabsJs splice that had pushed `/app.js` to 212.2KB/60.7KB); measured 2026-08-29: 149.4KB raw / 44.4KB gzip, ~0.4% headroom on both axes — the next core-bundle addition needs the chunk splitter, not more inline code |
| High-contention files on one lane, serially | Measured 2026-08-27: `web/shell.ts` 60 both-sides merges, `package.json` 33, `web/layout-css.ts` 28 | **CONFIRMED with numbers** — these three are single-lane-serial; the area partitioner does NOT protect them (different areas all edit shell.ts — board task "INTENT COLLISION SURVIVES AREA PARTITIONING") |
| Every UI slice adds an a11y assertion | `test/web/a11y.test.ts` exists | **KEPT** |
| Visual suite: baselines in the CI environment | Lead #22 **CONFIRMED**: snapshots are `*-chromium-win32.png` — platform-tagged, generated on this box | open defect, D1 |

## Leads — confirmed / killed / still open (brief §14)

CONFIRMED against the tree, task-ready:

- **#7 emoji as icons** — 9 in `shell.ts` + more in features (🚨 🛡️ 🔁 ✦ 🎯).
- **#12 severity weighted high** — open findings 8 high / 8 medium / 1 low;
  priority carries no information at that shape.
- **#22 platform-tagged snapshots** — `visual-populated.spec.ts-snapshots/*-win32.png`.
- **#24 contention files** — the three above, with merge counts.
- **#25 >2 themes** — `THEME_NAMES = ['dark','light','terminal']`; whether
  `terminal` varies more than colour → check during §6.5.
- **NEW (operator-reported 08-27, not in the brief): token double duty, live.**
  `.flight-slice-chip` (`web/layout-css.ts:648`) uses `--color-accent-text` —
  the "text ON an accent surface" token — as "accent-coloured text" on a
  normal surface: dark-on-dark in dark theme, light-on-light in light.
  Unreadable, user-reported. This is the exact §6.4 defect class, already in
  production. First contrast-matrix row.
- **NEW (operator-reported 08-27): one live pilot for N lanes.**
  `read/fleet.ts:562` computes `liveFiring(p)` per PROJECT; lanes are
  per-worktree within one project, so 8 concurrent lanes collapse into one
  live-worker card. Verified feasible with existing data: lane identity is
  already in `firing_id` (`fly-autopilot--fleet-5:firing-51`) and in the
  events rows — per-lane cards are a read-model projection, no schema change.
  Board: "FLEET COCKPIT SHOWS 1 PILOT FOR 8 LANES" (high). This is the
  operator's first-priority item.
- **#1 whole-view live region — re-verdicted from WEAKENED (measured 08-28).**
  The earlier grep counted only the four `setAttribute('aria-live', …)` sites;
  the inline HTML template carries 14 more (18 total in `shell.ts`, plus 4 in
  `features/`), and one IS the whole view: `<main id="fleet"
  aria-live="polite" aria-busy="true">` (`shell.ts:3311`, there since the
  first auto-refreshing UI, bdfd27a5). The client drops `aria-busy` to
  `"false"` on first paint (`shell.ts:2569,2901`) and never re-raises it, so
  every later rewrite inside the main is announcement-eligible — at 8 fleet
  rows the region holds 584 of 762 document nodes (77%). Measured nuance
  (jsdom probe over the slice-5 duplicate-renders harness): an
  identical-state tick mutates **0** nodes inside `#fleet` — the grid
  renderer is same-state idempotent — while all 14 per-tick mutations hit
  scoped controls outside it, two of which (`#updated`, `#fly-status`) are
  themselves polite live regions among the every-tick targets. Task-ready,
  two cuts: drop `aria-live` from `<main>` in favour of the DoD's single
  announcer, and stop rewriting live-region content when the value is
  unchanged. The duplicate-renders axis in `scripts/cockpit-metrics.mjs`
  now measures the idempotence claim directly: mutations during an
  identical-state poll tick, counted per fixture size (whole-document
  measurements; a follow-on refinement could drill into #fleet-specific
  mutations to verify that subsystem separately).

Everything else in §14 stays an open lead: confirm with a measurement before
writing a task, delete the row if already fixed.

## Acceptance criteria

The brief's §11 Definition of Done, verbatim in spirit: proven by
`scripts/cockpit-metrics.mjs` and the gate, not by assertion — a11y (AA,
axe-clean per page × 3 themes × locales, one announcer, 2.5.8 targets,
contrast matrix committed incl. 3:1 non-text), performance (INP p75 +
long-task within CWV; graph layout off-main-thread), clarity (no duplicate
renders, windows stated, alarm lifecycle, palette + URL-addressable views),
design system (authority map, rendered-output token coverage rising,
no double-duty tokens, `color-scheme` declared, ratchet at measured values),
pipeline view (tree sidebar first, deterministic layout, span projection,
one selection model), process (baseline doc closed out, §14 empty).

## Constraints

- Everything in "Prior decisions" above.
- `SLICE_BUDGET = 1` slice per firing; a slice that moves no measured number
  is decoration and does not ship.
- Ratchets start at today's measured value, never the ideal.
- Additive before subtractive; alias old token names before touching
  consumers; codemod + output land in one commit.
- New declarations reference tokens — no exceptions, including "just for now".
- The metrics script runs at ≥2 fleet sizes (1 lane and the largest
  launchable) — several metrics scale with N and a single size hides it.

## Phase order

0. **MEASURE** — `scripts/cockpit-metrics.mjs` + `docs/COCKPIT-BASELINE.md`, the one
   living doc with a delta-only trend table (superseded dated snapshots archived under
   `docs/archive/`)
   (brief §5 table: tab stops, DOM growth per lane/task/row, attribute
   payload, axe by impact, INP p75, longest task, alarm rate, severity shape,
   i18n coverage, duplicate renders, token coverage via computed-style census,
   unique values, specificity, contrast matrix). Board task carries the
   EPIC-SPEC marker for this file.
   Shipped so far: **thirteen of the table's rows** land via `pnpm run cockpit-metrics`
   (current baseline `docs/COCKPIT-BASELINE.md`): (1–3) DOM growth
   per row/task/lane, (4) axe violations by impact, (5) tab stops, (6) attribute
   payload, (7) duplicate renders, (8) unique declaration values, (9) selector
   specificity, (10) WCAG contrast matrix over theme token maps, (11–12) alarm rate
   and severity shape (derived from resting-state selectors in the served stylesheet
   referencing attention tokens), (13) i18n tagging coverage (checked against
   `web/features/locale.ts`'s sweep targets), (14) token coverage via
   computed-style census (of the declarations whose resting selector matches at
   least one element in a painted render, the share referencing a design token
   (`var(--*)`) versus a raw literal — measured 45–51% across the row/task/lane
   fixtures, with the top raw-value properties (`display`, `font-weight`,
   `font-family`, `font-style`, `font-variant`, `line-height`, `cursor`, layout
   keywords, …) tabulated to seed the phase-1 drift ledger), (15) interaction
   latency (an INP-p75 proxy: one simulated click per tab-stop element,
   synchronous dispatch duration timed; jsdom never paints, so processing
   duration is the only INP component that exists there), and (16) longest task
   (max main-thread block among bundle eval, poll-tick drains, and dispatches,
   measured in real Chromium via the Long Tasks API since jsdom has no
   implementation), with the interaction-latency fold math unit-tested in
   `scripts/cockpit-metrics-interaction.mjs`. Still open from the table: INP p75
   (the full metric, not the proxy).
1. **DESIGN SYSTEM RECON** (brief §6) — authority map, css-analyzer baseline,
   computed-style census (covered/drifted/uncovered), interface inventory
   (chips/pills/badges/tiles first — this product's plural categories),
   token audit (double-duty hunt — one confirmed instance already),
   theme-axis analysis (`color-scheme` check is lead #23 — cheap, first),
   contrast matrix (3 themes), drift ledger. **The ledger is the migration
   order.**
2. **RESEARCH** — only what changes a decision; the brief's §13 sources are
   pre-verified; write `docs/UX-DOCTRINE.md` one line per source.
3. **WRITE THE BOARD** — brief §8 grammar; file scope in the title so
   contention can be scheduled; re-rationalize severity to the shape where
   critical is rare.
4. **EXECUTE** — D1 foundation (live regions, tab stops via roving tabindex,
   accessible-name caps, tooltips per 2.4.11, target size 2.5.8, tokens from
   the ledger, RTL — merge with the deferred-now-requeued Hebrew/i18n task,
   SVG icon set replacing emoji), D2 rationalize (hero metric, dedup renders,
   windows, **alarm lifecycle**, IA, per-lane live cards), D3 navigate
   (palette, URL state, virtualized lists, stream diff-patch — land the e2e
   gate task first), D4 pipeline view (model → worker layout → tree sidebar →
   canvases → file lens; the file lens is what pays for the epic, and the
   fleet lens is where inter-lane communication becomes visible), D5 polish.

## Out of scope

The brief's anti-goals, all of them: no framework, no new metric surfaces, no
redesign during recon, no big-bang stylesheet rewrite, no non-token values,
no second app for the graph, no hardcoded runtime counts, no editor canvas,
no force layout.

## Related

- The operator's original brief (2026-08-27 session) — this file is its
  repo-reconciled form; where they differ, this file wins because its claims
  are verified here.
- `docs/ECOSYSTEM-RESEARCH.md` (framework decision), `docs/ENGINEERING-DOCTRINE.md`
  (package vetting), `docs/EVALUATION-2026-08-27-silent-gate.md` (gate-side
  context), epic 0002 (shell decomposition — the bundle-weight prerequisite),
  epic 0005 (cockpit redesign v1 — superseded by this epic's phases D1–D5).
- Board anchors: FLEET COCKPIT SHOWS 1 PILOT (high) · NO VISIBLE INTER-LANE
  COORDINATION (high) · INTENT COLLISION SURVIVES AREA PARTITIONING (high) ·
  BUNDLE DIET REOPENED (high) · SHELL DECOMP 2/5 ES-module split (requeued) ·
  interactivity audit v2, i18n/Hebrew RTL, COCKPIT 6/6 motion (requeued from
  deferred — still load-bearing, now anchored to this epic).

## Operator directives — 2026-08-28 (priority overrides)

Three directives from the operator, overriding the default phase order where
they conflict:

1. **The node-based canvas moves UP.** D4's pipeline view — a node-graph lens
   with swappable layouts — is now a first-class priority, not a
   phase-4-after-everything item. The slice order stays the brief's (pure
   `spansToGraph` model → worker layout → tree sidebar → canvases), but work
   may begin as soon as Phase 0's remaining collectors land, in parallel with
   D1. Layout swappability (per-lens layered/compact modes) is part of the
   acceptance, not a follow-on.
2. **Right-click "Report from here", element-level.** The existing per-region
   REPORT-FROM-HERE grows a `contextmenu` entry point: right-click any
   element captures that element's DOM subtree, matched CSS (computed +
   authored where derivable), the owning feature module (the chunk map knows
   it), and any recent console/script error — attached automatically to the
   report. This is the operator's chosen affordance for "something looks
   wrong RIGHT HERE".
3. **Minimal · clear · bold · tabs.** The overall direction is MORE minimal
   and bolder than the current density; the project page's IA decision (D2
   item 13) is settled: **tabs** — Process (live flight) · Evaluations ·
   Releases · Runtime — URL-addressable, replacing the single long scroll.
   Research the best tab semantics (APG tabs pattern, roving tabindex,
   deep-linkable panels) before building.

## Operator directives — 2026-09-02 (course correction, verbatim intent)

The operator reviewed the shipped REPORT-FROM-HERE and rejected its shape:

> "ה-REPORT FROM HERE ממש מוזר — הכוונה הייתה שלא יהיה מלא טפסים של REPORT
> אלא טופס אחד שמופעל ולוכד בדיוק את כל האינפורמציה כאשר לוחצים מקש ימני
> נפתחות אפשרויות... וכל ה-UX/I הכללי חלש מאוד."

1. **ONE report dialog, not eight panels.** The eight per-region
   `reportFromHereSection` forms cluttering the project page are the wrong
   affordance and must go. The replacement: a SINGLE hidden dialog
   (`role="dialog"`, aria-modal, Esc/✕ closes) rendered once per project
   page. Right-click anywhere → a small custom context menu opens (this now
   DOES preventDefault; Shift+right-click preserves the browser menu) with
   "📮 Report from here". Choosing it opens the one dialog with EVERYTHING
   already captured and visible: the clicked element, its owning region +
   module sources (resolve via `resolveOwningModule` against the shell's
   `REPORT_REGIONS` — the served bundle is one script, the client can read
   that top-level literal directly, no attribute plumbing), the DOM/CSS
   snapshot, and recent console errors. The operator only types the
   description and picks the action — capture is automatic, never a button.
   The per-panel "use last capture" button, the sibling-tagging
   `reportTagRegions`/MutationObserver machinery, and the eight
   `renderProjectPage()` call sites are all superseded and should be removed
   (bundle shrinks; the region containers get a direct
   `data-report-region` attribute at render instead).
2. **The overall UX/UI is WEAK — treat that as a standing red gate.** Every
   surface slice must justify itself against "minimal, clear, bold": fewer
   always-open forms, fewer duplicated affordances, hierarchy over density.
   When a directive here conflicts with an older slice's shape, this
   section wins.
3. **The autopilot must WORK this section.** These directives are board
   fuel: keep a FOCUS task open per item until the operator confirms the
   shape on a live dashboard, and let evaluations measure against them.
