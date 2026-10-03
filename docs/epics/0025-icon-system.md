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
   ↑/↓: like ⇧ and ⌘ they stay free as key names. **Duplicate badge
   2026-10-01:** Miscellaneous Mathematical Symbols-B (U+2980–U+29FF) sat
   outside every census range, yet the issue triage panel's "⧉ duplicate"
   badge led with U+29C9 as a copy icon, in a font few UIs carry. It leads
   with a newly vendored `copy` now (`issueTriageDecisionIcon`), and the
   census pins the block at zero in web/ and STRINGS. Only the accept
   badge's ✓ stays, one of the three plain marks the census allows.
   **Replay chevrons 2026-10-02:** the Firing Replay's "‹ Prev" and
   "Next ›" buttons (en and he) led and trailed with single guillemets
   (U+2039/U+203A) as chevrons. Prev leads with a newly vendored
   `chevron-left` and Next trails with the existing `chevron-right`, both
   mirrored under `dir="rtl"` like the back link; each label moved into an
   inner `[data-i18n]` span, since `setSweptText()` keeps only a leading
   icon. The census pins a guillemet at a label's edge to zero in web/ and
   STRINGS. The "Settings › HUD bar › Shown" breadcrumb and the phase
   rail's lone `›` separator stay free. **Task row decision buttons
   2026-10-02:** ✓/✗ stay free in result lines and decision badges, but
   the task row's "✓ approve", "✗ reject" and "✓ done" buttons painted
   them as icons beside the trash-2 delete and the arrow reorder buttons.
   Approve and done lead with a newly vendored `check`, reject with the
   existing `x`, and `taskApprove`/`taskReject`/`taskDone` drop the glyph
   in both locales. The census gained a shrink-only list of the button
   faces (`el('button', …, '✓ …')`) that still lead with one: the SOUL
   cards' ratify/dismiss pair (drawn twice) and the backlog's confirm-done
   button. **SOUL and backlog decision buttons 2026-10-02:** the SOUL
   proposal panel's and the fleet-wisdom banner's "✓ ratify" / "✗ dismiss"
   pair lead with the `check` and `x` icons now, and the detected backlog's
   "✓ confirm done" leads with `check`, using the task row's done-button
   shape and its existing `.task-done-btn` sizing rule. `soulRatify`,
   `soulDismiss` and `backlogConfirmDone` drop the glyph in both locales,
   and the button-face census pins zero. **Ritual scrim steps
   2026-10-02:** the busy scrim's gate steps painted ✓/✗ (and …/·) through
   CSS `::before` beside each step label. Each step leads with the PR check
   strip's circle family now (`circle-check`, `circle-x`, `circle-dot`, and
   a plain `circle` for a state the job never named). The icon is the step's
   only mark, so it names its state through the new `ritualStepPass`,
   `ritualStepFail` and `ritualStepRunning` STRINGS, swept by
   `[data-i18n-aria]`. The census pins CSS-painted ✓/✗ at zero. **Lone
   arrows 2026-10-02:** → stays free inside a sentence ("Execute landing →
   main", the release preview's version pair), but the landing branch line's
   merge arrow and the plan chain's step separators painted a lone → as their
   whole face, and under `dir="rtl"`, where those rows run right to left, it
   pointed back at the branch and the previous step. Both draw a newly
   vendored `arrow-right`, mirrored like the back link. The landing arrow is
   the line's only icon-alone mark, so it takes `role="img"`: axe flags an
   `aria-label` on a bare span once no text is left. The census pins a lone →
   face at zero. **Screenshots 2026-10-02:** the README frames still showed
   v0.54.0, whose SOUL cards led with ◇ and ✎ and whose rail had no
   Benchmark. `scripts/docs/capture-screens.mjs` retook every frame under
   `docs/screens/` from the populated fixture at v0.56.0 (`lock-on.png` came
   out byte-identical), and `compose-evolution.mjs` re-ended the strip on
   the new `fleet-terminal.png`. Slice 4's "docs and screenshots refreshed"
   is done. **Phase rail separators 2026-10-02:** the replay chevrons slice
   left the activity phase rail's lone `›` free, but it was the same kind of
   whole-face glyph the lone arrows slice converted, and its span was not
   `aria-hidden`, so it sat as text between the ORIENT/DO/GATE/COMMIT
   buttons. Each separator draws the existing `chevron-right` now,
   decorative and mirrored under `dir="rtl"` like the plan chain's arrows.
   The lone-face census matches `›` as well as → and pins both at zero; the
   "Settings › HUD bar › Shown" breadcrumb stays free. **Close buttons
   2026-10-02 (law 1):** the Ask sheet's and the terminal HUD's close
   buttons each printed a hand-copied x as inline `<svg>` markup, beside the
   snackbar's vendored one. Both print `iconSvg('x')` now, sized by CSS at
   the 20px and 18px their `width`/`height` attributes gave them
   (`1.25rem`, `1.125rem`). `apps/dashboard/test/web/icons.test.ts` gained a
   shrink-only list of the web/ files that still print their own 24-unit
   icon markup: `shell-html.ts` (the subject rail's Feather-derived table
   and the focus toggle) and `shell.ts` (the lucky button's filled clover
   and the Ask button's Feather message-circle). **Ask button 2026-10-02
   (law 1):** the Ask button draws Lucide's `message-circle` through
   `iconSvg`, already vendored for the discussions triage heading, instead
   of Feather's hand-copied one, sized by CSS at
   the 24px (`1.5rem`) its `width`/`height` attributes gave it; its
   aria-label stays its only name. The list is down to `shell-html.ts` and
   the lucky button's clover in `shell.ts`. **Focus toggle 2026-10-02 (law
   1):** the subject rail's Focus button printed Feather's maximize by hand;
   Lucide's `maximize` is the same four corners, so it is vendored and the
   button prints `iconSvg('maximize')` beside its `[data-i18n]` label, still
   sized by the rail's `.subject-link svg` rule like the links beside it.
   `shell-html.ts` is down to its three link builders' Feather-derived
   table. **Subject rail and project tabs 2026-10-02 (law 1):** the rail's
   links, a project page's global links and its tab row print
   `iconSvg(name)` now, the Lucide counterpart of each Feather shape:
   `layout-grid` (Fleet, Overview), `send` (Fly), `square-kanban` (Board),
   `git-branch` (Plan), `chart-scatter` (Benchmark) and
   `chart-no-axes-column` (Data) are newly vendored, and Keeper, Community
   and Docs reuse `inbox`, `users` and `book-open`. The `.subject-link svg`
   and `.project-tab svg` rules still size them. The hand-inlined list is
   down to the lucky button's filled clover in `shell.ts`. **Lucky clover
   2026-10-02 (law 1):** the fly bar's lucky button printed a filled,
   hand-drawn four-leaf clover; it prints a newly vendored Lucide `clover`
   now, stroked in the button's success colour like every other icon. The
   `#fly-lucky svg` rule still sizes it at `1.35em` (as logical sizes now, like
   the Ask button's rule) and still spins it a quarter turn on
   hover and focus; its aria-label stays its only name. The hand-inlined
   list is gone and `apps/dashboard/test/web/icons.test.ts` pins zero: every
   24-unit icon in `src/web/` comes from `icons.ts`. **Awaiting-approval
   docs 2026-10-03:** RUNBOOK §8 still told readers the KEEPER PR review
   card's badge reads "🔒 awaiting approval to run CI" and its link "🔓
   Review & approve on GitHub", though both lead with the vendored `lock`
   and `lock-open` strokes and no terminal line prints either glyph. The
   sentence quotes the painted words and names the icons, and
   `apps/dashboard/test/tooling/icon-system-docs.test.ts` adds 🔒/🔓 to its
   retired-glyph set and holds RUNBOOK to the badge's STRINGS label and the
   link's text. **Near-miss chip docs 2026-10-03:**
   `docs/DOCTRINE-WEAKPOINT-RESEARCH.md` (Lens 4 and Part III's table) still
   named shell.ts's "🩹 recurring near-miss" chip, though the chip leads
   with the vendored `bandage` stroke (`ANOMALY_ICONS`). Both places name it
   by its `ANOMALY_LABELS` text and the icon now, and the docs test holds the
   doc to that; 🩹 itself stays free, since fly.ts still prints the
   near-miss debrief as a `🩹 …` terminal line. **Project status pill
   2026-10-03 (slice 3):** the task row's status pill led with the circle
   family, but the fleet card's project-status pill beside the anomaly chips
   was still a bare word. It leads with the same family now: `circle`
   (registered), `circle-dot` (flying, like an in-progress task),
   `circle-pause` (paused), `circle-question-mark` (needs you, like a task
   awaiting approval) and a newly vendored `moon` (hibernating). Both pills
   take their icon map through one `statusPill()`, decorative beside the
   word, which `setSweptText()` keeps across a locale switch. **Lane card
   focus line 2026-10-03 (slice 3):** the single-lane live worker card's
   "working: …" line led with the `target` icon, but the compact lane card
   a project shows once two lanes fly printed the same line as bare words.
   It leads with the same decorative `target` now, kept across a locale
   switch; the "probably working: …" guess stays iconless on both cards.
   **Live phase pill 2026-10-03 (slice 3):** both live cards headed with a
   bare "orient"/"do"/"gate"/"commit" pill beside the fleet card's iconed
   status pill. One `livePhasePill()` builds it for both now, led by a
   decorative phase icon: `compass` (orient, like the orient-drag chip),
   `pencil` (DO, which counts edit activity), and a newly vendored
   `shield-check` (gate) and `git-commit-horizontal` (commit). An
   unclassified phase keeps the bare word.

## Related

Epic 0021 (the shell's nav already draws strokes), 0026 (the tasks screen, the
first consumer), `docs/README.md` credits.
