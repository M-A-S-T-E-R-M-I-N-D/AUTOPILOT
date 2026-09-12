<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Epic 0017 — Navigation remake: minimal, visual, memorable

**Status:** ACTIVE (operator directive 2026-09-06). Slices 1 and 4 shipped —
`ae2c2419` (census) + `a0bdbc0f` (icon cluster), and the command palette
landed as epic 0021 slice 7 (`242ec633`: a `<dialog>` combobox over a
listbox, ⌘K, items read from the page itself). Slice 5 (deep-page side
rail) is superseded by 0021's subject rail (`c97e82d2`) and its planned
context rail (0021 slice 6). Slices 2 (status-pill consolidation) and 3
(overflow menu absorbing tour/LTS/report/docs) remain, waiting for
`shell.ts` commit velocity to drop (same-file collision discipline). See the
dependency audit's refresh below for the measured state as of 2026-09-07.

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

- **Slice 1 shipped** — `ae2c2419` (`test(dashboard): masthead census — pin
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

### Refresh (firing 228, 2026-09-07 13:30) — what moved since firing 208

The board still carried this report at rank 1 when firing 228 read it, even
though firing 208 tagged it `"completion":"complete"` on `5800a96f`. The close
hook (`markTaskDoneIfShipped`, `apps/dashboard/src/flight/firing-hooks.ts`)
only runs when the firing record's `shipped` flag is true, and `telemetry.ts`
sets that flag only when the gate result was `passed`; firing 208's record
(`docs/SELF-STUDY/DATA-SERIES.md`) carries `shipped: false`, so the close never
fired. Its PROPOSALS — the slice 2-5 backlog above — never reached the board
either: no slice task is on the board as of this refresh. This refresh
re-issues them on its own PROPOSALS line. If the report is still open after
this firing, close it by hand: the audit is delivered, the close path is what
failed.

- **Slice 1 is now fully shipped**, not just its safety net: `a0bdbc0f`
  (`feat(dashboard): epic 0017 nav remake 1/5 — theme/language become
  icon+popover menus`, 12:12) folded the theme and language button rows into
  `<details class="connect theme-menu">` 🎨 and `<details class="connect
  lang-menu">` 🌐 — the same disclosure idiom `#connect`/`#notify`/
  `#foundation` use. `masthead-icon-cluster.test.ts` pins the disclosure
  shells; `masthead-census.test.ts` still pins every underlying control. Both
  pass at HEAD (15 tests).
- **Slice 1's "known follow-up" is absorbed.** Its commit deferred the
  visual-baseline refresh; `7755b0d7` (12:43) regenerated all eight
  CI-canonical baselines after `a0bdbc0f` landed, so the committed screenshots
  already carry the icon cluster. No separate refresh is pending.
- **The blocking condition still does not hold, and it has a second driver.**
  Re-measured at HEAD: 49 i18n commits in the trailing 48h (firing 208 counted
  43), 14 commits to `shell.ts` since 2026-09-06, the last at 12:43 — and that
  one was epic 0018's many-lanes grid (`c1287698`), not i18n. Epic 0018 ("0017
  owns the chrome, 0018 owns the CENTER") is now a second high-frequency writer
  to the same file, so the header's "waits for the i18n sweep to cool off" is
  really a `shell.ts`-velocity condition. Whoever claims slice 2 should
  re-measure `git log --since=<48h> -- apps/dashboard/src/web/shell.ts`, not
  the i18n count alone.
- **Trap: `web/status-pill.ts` is not slice 2.** It is epic 0002's pure
  label/tip/aria math for the fleet card's project-status badge and the task
  board's per-task pill. Slice 2's masthead traffic-light (Claude ∙ gh ∙ OTLP)
  needs its own module beside `shell-html.ts`; growing it into
  `status-pill.ts` would couple two unrelated surfaces.
- Slices 2-5 remain unclaimed on every branch: no commit, no fleet intent
  names them.
