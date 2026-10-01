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
4. **Credits.** `LICENSES/ISC.txt` (the complete upstream text — REUSE names
   licence files by SPDX id), `THANKS.md` gains a Lucide line, `docs/README.md`
   names it (on its THIRD-PARTY-LICENSES entry — the index has no separate
   credits section), and REUSE stays green (`reuse lint` in CI).
5. **No emoji in chrome.** A census test lists every emoji-bearing render site;
   the count goes to zero across the slices and the test pins zero.

## Slices

1. `icons.ts` + `LICENSES/ISC.txt` + THANKS; the subject nav and the
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
   exception (see the test's own doc comment). **Law 4 pinned 2026-09-26:**
   `apps/dashboard/test/tooling/icon-system-credits.test.ts` holds THANKS.md,
   `docs/THIRD-PARTY-LICENSES.md` (now with a "Copied into the product"
   section) and `docs/README.md` to naming Lucide and linking
   `LICENSES/ISC.txt`, and no credit surface may claim nothing is vendored.
   **STRINGS census 2026-09-26:** the web/ scan could not see a glyph baked
   into a locale value (`packages/tokens`), so the same test now walks every
   locale's STRINGS and pins the emoji-bearing keys to an exact, shrink-only
   list. The lucky roll's snackbar sentence and refusal line dropped their
   🍀 in both locales. **STRINGS census at zero 2026-09-26:** the report
   menu's Copy element HTML (🧩) and Copy smart context (🧠) labels, the
   last two, lead with the vendored `code-xml` and `braces` icons instead;
   the list is gone and the test pins zero. Core stayed inside its budget
   (230.6KB of 231KB raw), so no raise was needed. **Last painted ⚠
   2026-09-27:** the landing panel's amber "Landed locally, but NOT pushed"
   line leads with `triangle-alert` like its overlap/half-step rows; ⚠
   survives only in the LAND confirm dialog's native text, where no SVG can
   render. **Living docs refreshed 2026-09-27:** RUNBOOK §11/§12 and
   MASTER-PROMPT's Fly-bar table named the Flight console, Detected
   backlog, N blocked, auto-fixed and lucky surfaces by the 🖥️/🔍/🛡️/🔧/🍀
   they dropped; they now give the STRINGS label and the Lucide icon name,
   pinned by `apps/dashboard/test/tooling/icon-system-docs.test.ts` (dated
   epics, ADRs, debriefs and changelogs stay as written). **Law 1 pinned
   2026-09-27:** `notebook-pen` and `clipboard-check`, vendored by the slice
   2 hub for headings that ended up drawing other shapes, rode the core
   bundle's `ICON_SHAPES` JSON with no render site; both are dropped, and
   `apps/dashboard/test/web/icons.test.ts` now fails for any vendored name
   no `src/` file quotes outside the icon data. **Geometric glyph-icons
   2026-09-27:** the emoji ranges never covered Geometric Shapes, yet the
   SOUL cards led "SOUL proposal pending", "SOUL unreviewed" and "Fleet
   wisdom proposal pending" with ◇/◐/◆ exactly as ✦/⚑ had been used; all
   three lead with the evolution panel's `dna` icon now, and the STRINGS
   census pins the block's remaining keys to a shrink-only list (the ▶ Step
   through toggle). **Geometric census at zero 2026-09-29:** the Firing
   Replay toggle's "▶ Step through" (en and he) was the last; it leads with
   a newly vendored `play` icon beside its text, the list is gone and the
   test pins zero. **Miscellaneous Technical census 2026-09-30:** the emoji
   ranges also skipped U+2300–U+23FF, whose ⌚⌛ ⌨ ⏏ ⏩–⏳ ⏸–⏺ are Emoji=Yes
   in Unicode's `emoji-data.txt`, so the census read zero while the triage
   panels' "⏭ skip" badge and the shell's "⏱ try Nt" budget hint still
   painted two of them. The census now matches those code points (⌘ stays a
   key name). web/ is pinned to a shrink-only list of the four sites, which
   wait on a vendored skip and stopwatch icon. STRINGS is pinned at zero.
   **Skip icon 2026-09-30:** the issue triage badge and the discussions
   triage skip rows lead with a newly vendored `skip-forward` instead of ⏭
   (`issueTriageDecisionIcon`, and the discussions renderer keyed off each
   line's `skip` flag); the list is down to the shell's two ⏱
   budget hints, which wait on a stopwatch icon. **Miscellaneous Technical
   census at zero 2026-09-30:** the task row's budget-risk chips ("try Nt"
   and the dimension fallback's "try Nt?") lead with a newly vendored
   `timer` instead of ⏱; the list is gone and the test pins zero in web/ as
   in STRINGS. **PR check strip 2026-09-30 (slice 3's status pills):** the
   Geometric Shapes census only walked STRINGS, so the KEEPER PR review
   check chips' ◐/◌ (running, queued) went unseen in web/. Each chip now
   leads with the task row's circle family instead of ✓/✗/◐/◌/⊘
   (`circle-check`, a newly vendored `circle-x`, `circle-dot`, `circle`,
   `ban`; `circle-question-mark` for an unknown state), and web/ has its
   own Geometric census, a shrink-only list of the three sites left: the
   activity feed's "● live activity" heading and the connect panel's ▸/▾
   report toggle. **Live activity heading 2026-09-30:** the heading leads
   with `circle-dot` (`activityLiveLabel`'s new `icon` field) instead of ●,
   so a live firing reads like a running check and an in-progress task; the
   list is down to the connect panel's ▸/▾. **Geometric web/ census at zero
   2026-09-30:** the connect panel's "Report a bug or request a feature
   upstream" disclosure drew ▸/▾ through a CSS `::before` in place of the
   native details marker it hides; it now leads with a newly vendored
   `chevron-right` (the label moved into an inner `[data-i18n]` span so the
   locale sweep keeps the icon), mirrored under `dir="rtl"` while closed and
   turned down once the form opens. The list is gone and web/ pins zero for
   Geometric Shapes as for the emoji and Miscellaneous Technical blocks.
   **Circular arrows 2026-09-30:** ↺ ↻ (Arrows) and ⟲ ⟳ (Supplemental
   Arrows-A) sat outside every census range, yet the KEEPER PR review
   panel's "↻ Re-run failed" and "⟳ Update branch" maintainer buttons used
   them as icons. Both lead with a vendored stroke now — `refresh-cw` (already
   drawn by the round panel) and a newly vendored `git-merge`, since the
   button merges the base in — and the census gained a circular-arrow block,
   a shrink-only list of what still paints one: the SOUL card's ↺ un-ratify
   button and its tip in web/, the flight log's ⟲ repeated-actions chip, and
   the `soulUnratify`/`startOver` STRINGS in both locales. **Un-ratify
   2026-09-30:** the SOUL card's "↺ un-ratify" chip leads with a newly
   vendored `undo-2` (mirrored under `dir="rtl"` like the back link), the
   ratify tip names it by its words, and `soulUnratify` drops the ↺ in both
   locales; the list is down to the flight log's ⟲ chip in web/ and
   `startOver` in STRINGS. **Circular-arrow web/ census at zero
   2026-09-30:** the per-firing trace row's "⟲ N repeated" chip (the
   trajectory-redundancy signal `firingTimelineRowMeta` composes) leads with
   the already-vendored `repeat` icon, so its label and aria-label carry the
   words alone; web/ pins zero for circular arrows, and only `startOver`
   remains on the STRINGS list. **Plan canvas zoom bar 2026-09-30:**
   Supplemental Arrows-B (U+2900–U+297F, whose ⤴ ⤵ are Emoji=Yes) sat
   outside every census range, and the plan canvas's Fit button painted ⤢
   as its whole face beside the + and − buttons. The three draw newly
   vendored `plus`, `minus` and `maximize-2` strokes as their faces now
   (their STRINGS aria-labels stay the only name), and the census pins the
   block at zero in web/ and STRINGS. **Circular-arrow STRINGS census at
   zero 2026-10-01:** the project page's "↺ Start over" button (en and he)
   was the last; it leads with a newly vendored `rotate-ccw` beside its
   text, and its "Resetting…" busy label swaps the `data-i18n` tag the way
   the GitHub sync button does, so `setSweptText()` keeps the icon through
   the request and any sweep during it. The list is gone and the test pins
   zero. **Sync to GitHub 2026-10-01:** ⇪ (U+21EA) sat outside every census
   range, yet the "⇪ Sync to GitHub" button beside Start over led with it
   as an upload icon (en and he). It leads with a newly vendored
   `cloud-upload` now, since it pushes to a hosted repo, and both buttons'
   busy labels go through one `setTaggedLabel()`, so the icon survives
   "Syncing…", a failed sync and any sweep. The census pins ⇪ at zero in
   web/ and STRINGS; ⇧ and the other white arrows stay free as key names.
   **Reorder buttons 2026-10-01:** the task row's ↑/↓ reorder buttons
   painted plain arrows as their whole faces, the way the zoom bar's +/−
   did. They draw newly vendored `arrow-up` and `arrow-down` strokes now,
   sized like the focus, delete and unpin icons beside them, and each
   button's aria-label stays its only name. No census block was added for
   ↑/↓: like ⇧ and ⌘ they stay free as key names. The screenshots refresh
   (`docs/screens/`) is still open.

## Related

Epic 0021 (the shell's nav already draws strokes), 0026 (the tasks screen, the
first consumer), `docs/README.md` credits.
