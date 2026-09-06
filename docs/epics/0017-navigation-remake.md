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
