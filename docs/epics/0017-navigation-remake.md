<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Epic 0017 — Navigation remake: minimal, visual, memorable

**Status:** SPEC (operator directive 2026-09-06). Implementation waits for the
i18n sweep to cool off `shell.ts` (same-file collision discipline), then lands
in slices.

## The complaint (accurate)

The masthead is TEXT overload: a button per theme, a button per language, two
`<details>` popovers (Connect, Notify) with full forms inline, a gh cluster
(status + LTS + a whole issue FORM), tour, OTLP chip, updated-status. Every new
capability grew a new text control. This does not scale to more languages,
themes, or capabilities — and it reads like a settings page, not a cockpit.

## Target model (researched-modern, cockpit-appropriate)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ✈ AUTOPILOT   [status-pill ●]              ⌘K   🍀 Fly   🎨  🌐  🔔  ⋯ │  ← top bar
└──────────────────────────────────────────────────────────────────────────┘
   deep page: + a slim left rail of project sections (board/log/panels)
```

1. **Icon cluster, popover menus** — one control per DOMAIN, not per option:
   - 🎨 theme: one icon-button opening a 3-option menu (system-aware later).
   - 🌐 language: globe menu listing locales in their own names; scales to N.
   - 🔔 notifications: icon + badge; the quiet-hours form lives in the popover.
   - Connection: ONE status pill (Claude ∙ gh ∙ OTLP folded into one traffic-
     light with a popover for detail/actions) — not three scattered chips.
2. **Primary action stays loud**: 🍀 + Fly-it remain the visually dominant pair.
3. **Overflow `⋯` menu**: tour, LTS check, report-an-issue, docs — everything
   secondary earns a menu row, not masthead real estate.
4. **Command palette (Ctrl/⌘-K)**: jump-to-project, fly, theme, language,
   panel anchors — the power-user spine that lets the visual bar stay minimal.
5. **Side rail on deep pages**: sticky slim icon rail for section jumps
   (board / flight log / gauges / panels), replacing scroll-hunting; top bar
   stays global-only. RTL-mirrored like everything else.
6. **Every icon has a tooltip + aria-label from STRINGS** — icons reduce TEXT,
   never accessibility; keyboard/roving semantics preserved exactly.

## Constraints

- No new dependencies: inline SVG icons (the goggles-mark idiom), CSS
  popovers on the existing designed-states system.
- All existing masthead FUNCTIONS survive relocation — a census test pins the
  inventory (connect/test/login, notify+quiet hours, gh status/LTS/issue,
  theme×3, locale×N, tour, OTLP, updated, update-banner) so the remake cannot
  silently drop one.
- Visual baselines refresh once, deliberately, with the redesign commit.

## Slices

1. Census test first (the safety net), then the icon cluster + popovers.
2. Status-pill consolidation (Claude/gh/OTLP → one).
3. Overflow menu absorbing tour/LTS/report/docs.
4. Command palette.
5. Deep-page side rail.

## Dependency audit (firing 208, 2026-09-07)

Requested via a dashboard "Report from here" task (`report-element-1q0t6o5`):
what actually blocks slices 2-5, what infra already de-risks them, and the
concrete backlog to track them.

### Status

- **Slice 1 shipped** — `9f9d287d` (`test(dashboard): masthead census — pin
  every control before EPIC 0017 nav remake`). `masthead-census.test.ts` pins
  every existing masthead control at markup level (brand, updated status,
  OTLP chip, Connect popover + credential form + gh cluster + issue form,
  theme nav, language nav, notify popover + quiet hours, Foundation heart,
  tour button) so slices 2-5 fail loudly if a relocation silently drops one.
  Slices 2-5 are still unclaimed on any branch as of this audit.

### Blocking dependency — does NOT hold yet

- This epic's own header says implementation "waits for the i18n sweep to
  cool off `shell.ts`." That condition is still false: 43 commits touching
  i18n landed in the 48h before this audit, and `shell.ts` itself was last
  touched same-day (2026-09-07 09:55). The sweep's current targets have moved
  past the masthead itself (searchbar, inbox, live-worker card, flight log —
  the masthead is already fully `data-i18n`-tagged per the census test), but
  it is still editing `shell.ts` at high frequency. Whoever claims slice 2
  should re-check commit velocity on `shell.ts` immediately before starting,
  not rely on this snapshot.

### Reusable infra already in place (lowers slice risk)

- `shell-html.ts` already extracts `themeButtons()`/`langButtons()` out of
  `shell.ts` — slice 2's popover menus have a natural home to grow into
  rather than needing a fresh module split.
- The "designed states" CSS convention in `layout-css.ts` (rest/hover/focus/
  active, each pinned red-first by its own `*-designed-states.test.ts`) is
  the established idiom — every new icon-cluster control should follow it,
  not invent a new one.
- `scripts/i18n/find-rtl-hazards.mjs` (+ `find-rtl-hazards.test.ts`) already
  statically flags physical CSS (`margin-left`, `right`, `border-top-left-
  radius`, `text-align: right`, `float: left`) in favor of logical
  properties — new nav CSS gets this guard for free, which matters most for
  slice 5's "RTL-mirrored like everything else" requirement.
- `packages/tokens/src/locales.ts` carries only two locales today (`en`,
  `he`; `he` is RTL) — the globe menu's "scales to N" claim (target-model
  point 1) is untested past N=2. Not a blocker, but worth a real check once
  a third locale exists.
- Keyboard patterns this remake needs already exist elsewhere: roving
  tabindex / composite-widget semantics in `tabs.ts`, and a `role="tree"`
  keyboard-navigable structure in `pipeline-tree-html.ts`. Slice 4 (command
  palette) and slice 5 (side rail) should reuse these idioms rather than
  design new keyboard semantics from scratch.

### Net-new work (no existing scaffolding)

- **Command palette (Ctrl/⌘-K)** — nothing like it exists in the dashboard
  today; slice 4 is a from-scratch build, constrained to inline SVG/CSS only
  (no new dependencies, per the epic's constraints).
- **Deep-page side rail** — no generic section-jump rail exists. The closest
  precedent, `pipeline-panel.ts`'s tree sidebar, is scoped to the D4
  pipeline view only and not reusable as-is for board/log/panel anchors.

### Backlog (see PROPOSALS on this firing's record)

1. Slice 2 — status-pill consolidation (Claude/gh/OTLP → one traffic-light,
   popover for detail/actions).
2. Slice 3 — overflow `⋯` menu absorbing tour/LTS-check/report-issue/docs.
3. Slice 4 — command palette (Ctrl/⌘-K): jump-to-project, fly, theme,
   language, panel anchors.
4. Slice 5 — deep-page side rail (RTL-mirrored) for board/log/panel
   section jumps.
5. Gate check — before claiming slice 2, re-verify `shell.ts` commit
   velocity from the i18n sweep has actually dropped; this audit's 43-
   commits/48h reading is a snapshot, not a standing fact.
