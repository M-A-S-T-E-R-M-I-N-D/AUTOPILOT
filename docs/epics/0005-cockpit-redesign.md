<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0005. Cockpit MX redesign — the whole dashboard, dark-luxury flight deck on a Material-future system

Status: Active

Founder directive (2026-08-13): _"completely rethink UX/UI for more modern… overall, all
the webapp, not only the lists."_ Direction chosen by the founder from three presented
options: **Cockpit** — a dark-luxury aviation flight deck. Refined by the founder the
same day: _"M3 is amazing as a BASE — take it and produce the future of Material, like
M4/M5/MX, or something more innovative."_ So this epic does NOT discard the repo's
Material 3 token infrastructure — it **forks it forward into MX (Material eXtended)**:
AUTOPILOT's own next-generation Material evolution, with the cockpit mood as its first
expression. Not a reskin of one panel; a coherent visual language across every surface,
landed in verifiable slices on top of the epic-0002 module split (redesign a module as
it is extracted, never the 4.7K-line file).

## What makes MX "the future of Material" (not just M3 with dark colors)

- **Tonal color from a seed** — the whole palette (both themes) derives from one seed
  color through a tonal ramp, the way Material's dynamic color works; semantic roles
  (flying/queued/failure/accent) are MAPPED onto the ramp, never hardcoded hexes.
- **Physics motion** — spring-based easing tokens (stiffness/damping pairs, in the
  spirit of Material 3 Expressive) instead of fixed cubic-beziers; state changes feel
  physical, `prefers-reduced-motion` collapses them to instant.
- **Shape morphing** — radius is a live token that responds to state (rest → hover →
  active shifts shape subtly), giving components identity beyond color.
- **Expressive type scale** — a variable-font pair where weight/width respond to
  hierarchy (hero metrics breathe wider, labels condense), tabular numerals throughout.
- **Depth as material** — elevation expressed with layered translucency + border-light
  on dark surfaces, not just shadows; the M3 elevation steps remain the mechanical
  scale underneath.

## Design language (the contract, not a suggestion)

- **Surfaces:** deep layered darks (3–4 elevation steps, real depth via subtle shadow +
  border-light, never flat gray-on-gray). Light theme stays supported and INTENTIONAL
  (a "daylight cockpit", not an inverted afterthought) — both themes ship per slice.
- **Typography:** two families max, self-hosted (CSP `'self'`): a characterful display
  face for headings/identity + a high-legibility text face; **tabular/mono numerals for
  every metric** ($, tokens, turns, percentages — instrument-panel discipline).
- **Color is semantic only:** green = flying/shipped, amber = waiting/queued/paused,
  red = failure/danger, one accent for identity. Decorative color is banned; if a color
  carries no meaning it does not appear.
- **Hierarchy through scale-contrast** (hero numbers vs. quiet labels), intentional
  rhythm (spacing varies with importance — no uniform padding everywhere).
- **States are designed:** hover/focus/active/disabled visibly intentional on every
  interactive element; focus rings that fit the theme, not browser defaults.
- **Motion clarifies:** micro-transitions on state changes (compositor-friendly
  `transform`/`opacity` only), `prefers-reduced-motion` fully respected — the office
  map already sets the precedent.
- **Information density is progressive:** calm by default, deep on demand. Long lists
  NEVER dump raw — group + collapse + "Show all (N)" (the landing panel's 85-commit
  wall is the founding counter-example that triggered this epic).

## Acceptance criteria

- Every meaningful surface (fleet home, project page, fly bar/flight cards, landing
  panel, board, flight log, charts, docs reader, chat/ask) reads as ONE system — the
  before/after should look like a different product, not a themed variant.
- The landing panel groups unmerged commits (by conventional type / task id runs),
  collapsed by default with counts, expandable per group — 85 commits render as a
  handful of scannable rows.
- Charts and stat tiles follow the same language (tabular numerals, semantic color,
  designed empty/loading states) — dataviz is part of the system, not an afterthought.
- axe gate stays green THROUGHOUT (WCAG AA baseline is a floor, not a casualty);
  contrast verified in BOTH themes; keyboard-complete preserved; RTL correctness kept.
- `ci:bundle-size` stays green at 150/45 — the redesign may not buy beauty with bytes.
- Zero behavior change per slice: visual + interaction layer only; every slice passes
  the full gate and ships independently.

## Constraints

- CSP `default-src 'self'` untouchable: fonts self-hosted/vendored, no CDNs, no
  frameworks — the zero-dependency DOM-API client stays (epic 0002 gives it modules).
- Tokens live in `packages/tokens` (extend the existing M3 elevation/shape/motion/state
  infrastructure as the mechanical layer under the cockpit language — do not fork a
  second token system).
- Coordinate with epic 0002 slice 2: a surface is restyled AS its module is extracted;
  no restyling inside the monolith.

## Out of scope

- New features/panels (redesign only), framework adoption, dropping the light theme,
  any a11y regression "temporarily accepted".

## Slices

1. MX token layer (`packages/tokens/mx.ts`, extending — not replacing — `m3.ts`):
   seed-derived tonal palette (dark primary + intentional light), spring motion tokens,
   state-responsive shape scale, self-hosted variable type pair, tabular numerals,
   elevation/spacing scale.
   SHIPPED — `packages/tokens/src/mx.ts` (82a3d33, landed 53f77f1): seed-derived
   tonal ramp (`tonalPalette`/`tone`/`deriveMxTheme`), spring motion tokens
   (`SPRING`, `springOrInstant`), state-responsive shape (`SHAPE_STATE_DELTA`/
   `stateRadius`), and `NUMERIC_VARIANT` for tabular numerals; the self-hosted
   type pair and elevation/spacing scale it extends already existed
   (`apps/dashboard/src/assets/fonts.ts`, `m3.ts`'s `ELEVATION`, `scale.ts`'s
   `SPACE`) per the module's own docstring. Covered by `packages/tokens/test/mx.test.ts`.
2. Landing panel: group + collapse + Show-all(N) + cockpit styling (the founding pain).
   SHIPPED — 3d349ae: `landingCommitRuns` (`web/landing-panel.ts`) folds runs of
   2+ consecutive commits sharing a `(BOARD <task-id>)` trailer or Conventional-
   Commits type into a collapsed group with a keyboard-operable "Show all (N)"
   toggle (`aria-expanded`/`aria-controls`, axe-clean), styled with MX tokens
   (`--radius-md`, `--space-*`, `--color-border`/`-surface-raised`/`-accent`)
   and designed hover/focus-visible states.
3. Fleet home + fly bar/flight cards (the first screen an operator sees).
   In progress — shipped so far: fly-bar success status uses the semantic
   `--color-success` token instead of a borrowed severity color (8c6c67a),
   and live flight rows + their Pause/Stop/Cancel/Resume buttons carry the
   same designed hover/active treatment the fly-bar CTAs and fleet-home
   project cards already had (9fb7932). Hero-number scale IS already applied
   to the fleet-home totals/stat-tiles (`.total-n`/`.stat-tile-n`,
   `layout-css.ts`) — pre-dates this slice, not newly added by it. The
   dashboard-wide semantic-color pass is done: `--color-sev-low` no longer
   stands in for "success/shipped/accepted" anywhere — connect/GitHub-sync/
   landing/release/PR-review/issue-triage ok-results, the merge/accept
   badges, done-task chip and button, the "recently shipped" task badge,
   diff insertions, the ship heatmap gradient, and the flight-verdict
   shipped chip/sparkline all now read `--color-success`; the four
   remaining `--color-sev-low` uses (`.seg-low`'s severity-gauge tier,
   `.act-file`/`.fnode-do`/`.live-phase-do`'s category tags) are genuine
   non-success semantics and were left alone.
   The DELIVERABLE screenshot proof's mechanical half is now CLOSED
   (c3d7955): the 2026-08-20 audit noted that `visual.spec.ts`'s
   `fleet-{dark,light}` baselines only ever render the EMPTY fleet
   (`e2e-server.ts`'s deliberate `buildFleetView(now, [])`) and that a
   populated-state proof would need a second, hand-authored fixture — that
   fixture exists: `apps/dashboard/src/e2e-server-populated.ts` serves a
   deterministic populated fleet, and `e2e/visual-populated.spec.ts` checks
   in `fleet-populated-{dark,light}-chromium-win32.png` baselines that
   render the fly bar, a live worker card, and status badges in BOTH themes
   (browser-clock relative-time labels masked, so runs stay reproducible).
   Future regressions in the restyled surfaces are caught mechanically.
   What no fixture can decide — "does the restyle actually look RIGHT" —
   remains the slice's only open item. 🟣 Human-required: operator to
   review the populated fleet view in both themes (the checked-in
   `visual-populated` baselines, or live via `pnpm dashboard:demo`) and
   either bless it as the deliverable or say what still reads wrong.
4. Project page: board, flight log, worker card, phase rail.
   In progress — shipped so far is the designed-states pass over the project
   page's interactive controls, each slice pinned red-first by a stylesheet
   test: phase-rail segments (d4455226), flight-log firing/diff toggles
   (bf3c7e86), the board's SOUL-surface controls — proposal summary,
   ratify/dismiss, un-ratify undo (323ae563) — the SOUL editor's own
   disclosure toggle (401858d6), the project card's Details disclosure
   summary (363fe294), and the flight-log replay bar's prev/next buttons
   (117388d1) plus its exit button (532a3e77). All carry the same MX
   language: rest on the state-responsive shape token with a
   compositor-friendly radius/shadow transition, shape-morph radius +
   `--elevation-level-1` lift on hover/focus-visible, pressed radius flat
   on `:active`, `prefers-reduced-motion` collapsing the transitions
   globally. Tabular-numeral discipline now covers the worker card's
   action-count/turn lines (`.live-worker-count`/`.live-worker-turns`) and
   the flight log's ticking started-ago label (`.firing-ago`), pinned by
   `worker-card-tabular-numerals.test.ts` — believed then to be the last
   metric lines on those two surfaces without `font-variant-numeric` while
   siblings (`.firing-count`, `.phase-count`) already carried it. One more
   survived that sweep: the flight ROW's own ticking ago label
   (`.flight-ago`, rendered via `fmtAgo` on the flight log's top-level rows
   AND the fleet page's flight cards) shipped with neither
   `font-variant-numeric` nor the mono family its row-mates
   `.flight-cost`/`.flight-turns` use — closed, pinned red-first in the
   same test file. The flight-summary panel's own ticking ago label
   (`.flight-summary-ago`, the same `fmtAgo` text via
   `flightSummaryLineMeta`) was the last of that family still without the
   discipline — its row-mate `.flight-summary-cost` already carried
   tabular-nums — closed, pinned red-first in the same test file.
   Depth-as-material
   now reaches the worker card's own surface: `.live-worker` — the one
   raised, bordered, card-like panel shipping with no elevation while every
   sibling raised panel (`.flight-summary`, `.landing-panel`, `.round-panel`,
   `.heatmap-wrap`, …) already rested on `--elevation-level-1` — carries the
   same step, pinned by `worker-card-depth.test.ts`; the populated-light
   visual baselines were re-captured (the dark pair stayed within diff
   tolerance — a level-1 shadow is near-invisible on dark surfaces).
   Semantic-color discipline is now pinned per surface
   (`project-page-semantic-color.test.ts`, same idiom as the chart pin):
   board task chips (done/mark-done-CTA = success and never the borrowed
   severity green, in-progress = accent), flight-log verdict chips
   (shipped = success, reverted/turn-capped/timed-out/errored = danger,
   unverified/checkpointed = amber, verdict-carrying = accent), the
   worker card's accent-identified raised surface plus its
   commit-accent/gate-amber phase tags, and the phase rail's accent-on
   segment. The contrast side of that discipline is now pinned too
   (`packages/tokens/test/themes.test.ts`): `success` joined the
   sev*/needsYou small-text loop (the semantic-color pass made it a
   text color everywhere ok/shipped reads green), and the verdict
   chips' accentText-on-fill pairs (success/sevHigh/sevMedium) are
   asserted ≥ 4.5:1 in every theme — light accentText-on-sevHigh
   clears the floor by only 0.28, so the pin guards a real cliff.
   The per-surface hierarchy pass (content stronger than chrome) has
   started: the flight log's firing rows no longer paint headline and
   count/ago metadata in one muted tone — the headline rests at full
   `--color-text` strength against the quiet row chrome (3c57ca20, pinned
   by `flightlog-row-hierarchy.test.ts`), and the board's task rows carry
   the same pair explicitly — `.task-title` at full text strength (it
   previously held only by inheritance from body) against the muted
   pill/chip/drag-handle chrome, pinned by `board-row-hierarchy.test.ts`.
   The worker card already reads content-over-chrome (narrator at explicit
   `--color-text`, its count/turn lines carry the `muted` class in markup) —
   that pair is now pinned like its siblings' by
   `worker-card-hierarchy.test.ts`, closing per-surface hierarchy
   verification across all four of this slice's named surfaces.
   The phase rail's value-contrast pair — deferred while the populated
   visual-baseline family was a flagged landing-risk zone — is now closed:
   that zone cleared (the family was re-captured in dcb641e4 and no fleet
   claim names it), so `.phase-count` reads explicitly at full
   `--color-text` against the segment's muted chrome, with the accent-filled
   `.phase-on` segment restoring its count to `--color-accent-text` to keep
   contrast on the accent surface; pinned red-first by
   `phase-rail-hierarchy.test.ts`. All four populated visual baselines were
   re-captured — the rail renders on the fleet page's live flight card as
   well as the project page, so the whole family shifted, not just the
   `project-populated` pair.
   The flight log's FLIGHT rows (the top-level list — distinct from the
   firing rows `flightlog-row-hierarchy.test.ts` covers) shipped
   hierarchy-flat the other way round: `.flight-head` inherits full body
   color, so the headline AND its cost/turns/ago metadata read in one
   full-strength tone, only the sha muted. Closed: `.flight-item` now
   explicit at full `--color-text`, `.flight-cost`/`.flight-turns`/
   `.flight-ago` muted like their firing-row siblings, and the secondary
   `.flight-real-cost` muted under its existing 0.75 opacity so it stays a
   step quieter than the cost it annotates; pinned red-first by
   `flight-row-hierarchy.test.ts`. No visual-baseline recapture needed:
   the populated project baseline captures `demo-checkout-web`, whose
   fixture `flightLog` is empty, and the fleet page keeps card details
   collapsed — no checked-in baseline renders these rows.
   A follow-up audit found one designed-states gap the earlier shape-morph
   pass had missed: the board's reorder/focus/done/approve/delete buttons
   (`.task-move`/`.task-focus-btn`/`.task-done-btn`/`.task-approve-btn`/
   `.task-delete-btn`) paired their shape-morph/elevation feedback with
   `:hover` only, unlike every sibling control on the page (`.connect-test`,
   `.gh-issue-form button`, `.tour-actions button`, `.browse-actions button`,
   `.soul-review-btn`) which fire the same feedback on `:focus-visible` too
   — a keyboard-only operator tabbing to those five controls got zero visual
   feedback landing on them. Closed: each hover rule now shares its
   selector list with the matching `:focus-visible` rule, pinned red-first
   in `task-board-shape-morph.test.ts`.
   The open-ended "remaining surface details" audit is now CLOSED: a full
   stylesheet pass over the four named surfaces found every cockpit
   discipline — designed states, tabular/mono numerals, semantic color,
   depth, content-over-chrome hierarchy — already shipped and pinned by
   the tests named above. The one borderline item found (`.stat-n`, the
   card's secondary stat row, carries weight-600 + tabular numerals + a
   muted-xs label but no hero font-size) is intentional calm-by-default
   density, not a gap — hero scale belongs to `.total-n`/`.stat-tile-n`,
   not to every metric on the page. The deliverable's mechanical half
   already exists: the project-page axe suite (`a11y.test.ts`'s
   project-page describe block — board, budget-risk chip, eval-trend
   states), the both-themes token-contrast pins (`themes.test.ts`), and
   the `project-populated-{dark,light}` visual baselines. What no test
   can decide — "does the project page actually read as transformed" —
   is the slice's only open item, the same end-state slice 3 reached.
   🟣 Human-required: operator to review the project page in both themes
   (the checked-in `project-populated` baselines, or live via
   `pnpm dashboard:demo`) and either bless it as the deliverable or say
   what still reads wrong.
5. Charts/dataviz pass: tiles, sparklines, heatmap, histograms in the system language.
   In progress — the chart language the semantic-color pass already shipped is
   now pinned mechanically (`charts-cockpit-language.test.ts`): sparkline
   verdict fills and heatmap cells carry semantic tokens only (the ship
   gradient is ONE success hue at rising opacity, a no-data bar reads
   border-neutral), and the tile numerals (`.total-n`/`.stat-tile-n`/`.stat-n`)
   stay tabular. The `.gauge-label` numeral gap noted earlier (severity counts
   rendered without `font-variant-numeric`, deferred while a sibling instance
   held `layout-css.ts`) is now closed — pinned alongside the other tile
   numerals in `charts-cockpit-language.test.ts`.
   The designed-empty-states pass has started: the eval-trend's verdict-free
   week marker (`.eval-trend-empty`, the focusable 2px baseline rect
   `evaluationTrendPanel` renders "mirroring the heatmap's heat-empty
   convention") shipped with NO stylesheet rule at all — it painted in the
   SVG default fill, black, in both themes, and carried no focus ring despite
   being `tabindex="0"` like its bar siblings. Closed red-first in
   `charts-cockpit-language.test.ts`: it now reads the shared no-data neutral
   (`--color-border`, the `.heat-empty`/`.spark-no` convention) with the
   designed accent focus ring. No visual-baseline recapture needed: the
   populated e2e fixture has no `evaluationLabelDayCounts`, so no checked-in
   baseline renders the panel.
   The fleet card's severity gauge — a named dataviz surface whose `.seg-*`
   segments the semantic-color pass already mapped onto the sev tokens, and
   whose no-findings state (`gaugeBar`'s single `.seg-clear` segment) already
   reads the shared no-data neutral (`--color-border`, the
   `.heat-empty`/`.spark-no`/`.eval-trend-empty` convention rather than a
   tempting decorative "all-clear green") — was the one chart whose segment
   colors and empty state `charts-cockpit-language.test.ts` did not yet pin.
   Now pinned there beside its sparkline/heatmap/eval-trend siblings:
   `.seg-critical/high/medium/low` on the matching `--color-sev-*` tokens
   (guarding the deliberate "`.seg-low` stays severity, not success" choice)
   and `.seg-clear` on `--color-border`. Test-only, no `layout-css.ts` edit.
   The designed empty/loading-states audit is now CLOSED: every dataviz
   surface that can render with no data (sparkline/timeline/lang-bar) already
   follows the "skip rather than fake it" convention documented on their own
   modules (returns `null`, nothing paints), and every surface that renders a
   partial-empty marker WITHIN a populated chart (heatmap's `.heat-empty`,
   the eval-trend's `.eval-trend-empty`, the severity gauge's `.seg-clear`)
   now carries the shared no-data-neutral styling above; the one async-fetch
   loading state in this surface family (the firing-replay trace/diff fetch)
   already carries its own designed pulse (`.firing-trace-loading`,
   `layout-css.ts`). What no test can decide — "do the charts actually read
   as ONE system in both themes" — is the slice's only open item, the same
   end-state slices 3/4 reached. 🟣 Human-required: operator to review the
   dataviz surfaces (fleet-card gauge, project-page heatmap/eval-trend/
   sparklines) in both themes (`pnpm dashboard:demo`) and either bless them
   as the deliverable or say what still reads wrong.
6. Motion + designed-states sweep across all interactive elements, both themes.
   In progress — the SOUL editor's "Propose edit" submit button
   (`.soul-editor-form button`) shared its base filled-button styling
   (position/overflow/elevation/transition) with `.connect-form button`,
   `.connect-login`, `.task-add button`, and `.inbox-add button`, but was
   left out of their shared M3 state-layer group (`::after` shine overlay +
   hover/focus/active opacity + elevation lift/flatten) — it rendered with
   zero hover or active feedback, a raw browser default, pinned red-first by
   `soul-editor-cta-designed-states.test.ts`. The `.soul-review-btn` gap that
   survey also found (the "◐ SOUL unreviewed" badge-button, `shell.ts`, had no
   hover/active while its `.soul-ratify-btn`/`.soul-dismiss-btn`/
   `.soul-unratify-btn` siblings already did) is closed: it carries the same
   needs-you wash + shape-morph radius + elevation lift on hover and pressed-
   flat active as its ratify sibling, pinned red-first by
   `soul-review-btn-designed-states.test.ts`. The tour dialog's nav buttons
   (`.tour-actions button`, incl. the filled `.tour-next`) and the
   browse-a-folder modal's footer buttons (`.browse-actions button`, incl.
   the filled `.browse-use`) — the survey's "share a base rule but no
   hover/active" pair — are closed: both groups carry the MX shape-morph +
   `--elevation-level-1` hover/focus-visible pair with pressed-flat active
   (`:not(:disabled)`-guarded, the `.fly-flight-actions button` /
   `.landing-execute` idiom; the filled CTAs receive radius + shadow through
   their `!important` border/background overrides), pinned red-first by
   `tour-browse-cta-designed-states.test.ts`. The tour buttons' rest radius
   swapped `--radius-sm` for `--shape-extra-small` (both 4px) so the state
   tokens pair with their own rest value. The survey's last named gap — the
   "Open pull request" submit button (`shell.ts`'s `ghPrForm`, which reuses
   the CONNECT popover's `.gh-issue-form` class rather than owning its own —
   so it inherited that class's base rule but none of the MX state-layer
   treatment) — is closed: `.gh-issue-form button` now carries the same
   shape-morph + `--elevation-level-1` hover/focus-visible pair with
   pressed-flat active, reaching both that submit and the CONNECT popover's
   bug-report submit it shares markup with, pinned red-first by
   `gh-issue-form-cta-designed-states.test.ts`.
   A follow-up audit of the CONNECT popover's own outline buttons found one
   more gap the shared-class sweep above hadn't reached: `.connect-test`
   (`shell.ts`'s `#connect-test`/`#gh-lts-check` — "Test connection" and
   "Check for updates") shares the same outline-button shape as
   `.gh-issue-form button` / `.tour-actions button` / `.browse-actions button`
   but shipped with a single static rule and zero hover/focus/active
   feedback next to its filled sibling `.connect-login`. Closed (373c2e8f):
   it joins the same shape-morph + `--elevation-level-1` pair with
   pressed-flat active, pinned red-first by
   `connect-test-cta-designed-states.test.ts`. That closes the sweep's
   named-gap survey — every interactive element found sharing a base rule
   without its siblings' state-layer treatment now carries one.
   One control escaped that survey's frame entirely: `.card-remove` (the
   project card's Remove button) owns its rule ALONE, so the shared-base-rule
   sweep never inspected it, and its partial feedback (danger fill on
   hover/focus-visible, paired back in firing 156) kept it out of the
   zero-feedback stragglers list too. It carried none of the MX language its
   near-twin `.task-delete-btn` has — no radius/shadow transition, no
   shape-morph + `--elevation-level-1` lift, no pressed-flat active — and its
   hover rule fired even while `:disabled`, unlike every guarded sibling.
   Closed red-first in `card-remove-designed-states.test.ts`: it joins the
   family idiom keeping its danger fill, with the `:not(:disabled)` guard
   (the pairing pin in `hover-focus-visible-pairing.test.ts` now tracks the
   guarded selector).
   Two more hover-only stragglers escaped both surveys the same way: the
   browse-a-folder modal's LIST buttons — `.browse-entry` (every subfolder
   plus the ".. (up)" button) and `.browse-drive` (the drive switchers),
   real `<button>`s in `features/fly.ts` — carried a hover wash
   (surface fill + border) with no `:focus-visible` twin, while their
   modal-mates `.browse-actions button` pair both states in one selector
   list. A keyboard operator tabbing through the folder list got only the
   generic outline, none of the wash. Closed red-first in
   `hover-focus-visible-pairing.test.ts`: both selectors joined the
   pairing pin's tracked list and the hover rule now fires on
   `:focus-visible` too.
   The compositor-only contract's last unpinned surface is closed:
   `compositor-only-transitions.test.ts` banned layout-bound `transition:`
   properties but never looked inside `@keyframes` bodies, so a future
   `@keyframes` animating `width` would have shipped green — keyframe steps
   are now pinned STRICTER than transitions (transform/opacity only, since
   every keyframe animation in the stylesheet loops infinitely and a
   paint-bound property there repaints every frame forever), with a parser
   self-check proving the assertion can go red.
   A third audit found a split-feedback gap the straggler surveys above
   missed because it isn't hover-only — it's hover-vs-focus INCONSISTENT:
   the M3 filled-button family (`.connect-form button`, `.connect-login`,
   `.task-add button`, `.inbox-add button`, `.soul-editor-form button`)
   shares two separate feedback rules, and only one of them pairs
   `:focus-visible`. The `::after` state-layer shine correctly fires on
   `:hover`/`:focus-visible`/`:active` alike, but the sibling box-shadow
   elevation-lift rule (`box-shadow: var(--elevation-level-2)`) right below
   it fired on `:hover` only — a keyboard operator tabbing to any of these
   five buttons (the CONNECT popover's submit, Login, the board's "+" add
   button, the inbox add button, SOUL editor's "Propose edit" submit) got
   the subtle shine but not the elevation depth cue a mouse operator gets.
   Closed red-first in `hover-focus-visible-pairing.test.ts`: all five
   selectors joined the pairing pin's tracked list, and the elevation rule
   now pairs `:hover`/`:focus-visible` per selector, the same idiom
   `.gh-issue-form button`/`.connect-test`/`.tour-actions button` already use.
   A fourth audit found the shape-morph + `--elevation-level-1` idiom's own
   origin left out of its own pairing: `#fly-go`/`#fly-stop`/`#fly-pause`
   (the fly bar's flight-control CTAs — the buttons that actually start,
   stop, and pause a flight) and `.fly-flight-actions button` (a live
   flight row's Pause/Stop) each carried a `:not(:disabled):hover` rule
   with no `:focus-visible` twin, while every descendant that copied their
   "structural twin" idiom — `#search-go`/`#ask-go`, `.landing-execute` et
   al, `.task-move` — already paired both states. A keyboard operator
   tabbing to the controls that govern a flight got zero shape-morph or
   elevation feedback. Closed red-first in
   `hover-focus-visible-pairing.test.ts`: all four selectors joined the
   pairing pin's tracked list, and the hover rule now fires on
   `:focus-visible` too.
   A fifth audit found two more classes of straggler the surveys above
   never reached because both live outside `layout-css.ts`'s named
   "shared-base-rule" and "flight-control" clusters: the SOUL panel's
   `.soul-review-btn`/`.soul-ratify-btn`/`.soul-dismiss-btn`/
   `.soul-unratify-btn` (each already had its own designed-states test —
   `soul-designed-states.test.ts` / `soul-review-btn-designed-states.test.ts`
   — pinning hover/active shape-morph, but neither suite asserted a
   `:focus-visible` twin, so the gap shipped invisibly under green tests),
   and two plain navigation anchors — the project card's title link
   (`.card-link`, `shell.ts`'s `cardHead`) and the project page's "← Fleet"
   back link (`.back a`) — whose hover-only underline+color feedback left a
   keyboard operator tabbing to either link with zero confirmation before
   pressing Enter to navigate. Closed red-first in
   `hover-focus-visible-pairing.test.ts`: all six selectors joined the
   pairing pin's tracked list, the hover rule now fires on `:focus-visible`
   too, and the two designed-states suites' own `ruleFor` helpers were
   widened to match a shared selector-list rule the same way the pairing
   suite's already does (a selector may open its own rule or sit in a
   comma-joined list with its new `:focus-visible` twin).
   A sixth audit flipped the search: every prior finding was a `:hover` rule
   missing its `:focus-visible` twin. `.console-title` (the Flight console
   `<summary>`, `features/flight-console.ts`) and `.report-title` (the
   report-from-here `<summary>`, `features/report.ts`) are the mirror gap —
   a bare `:focus-visible { outline: ... }` rule with NO `:hover` counterpart,
   so a mouse operator got zero feedback that these disclosure triangles are
   clickable. Both are structurally identical to `.detail summary`/
   `.soul-editor-summary`/`.soul-proposal-summary` — the same `<summary>`-
   toggle role, already carrying the full shape-morph + `--elevation-level-1`
   hover/focus-visible pair with pressed-flat `:active` — so the fix reuses
   that idiom, folding the standalone outline into it (the background +
   shape-morph + elevation IS the focus indicator every sibling summary
   relies on). Closed red-first in `hover-focus-visible-pairing.test.ts`;
   rest-state pixels do not move (only `border-radius` + `transition` added
   at rest, same as every prior shape-morph adoption). Noted but not fixed
   that round: `.spark-bar` (`layout-css.ts`) — the flight-history SVG
   `rect`s — had the identical bare-focus-outline shape, but as an SVG
   element its mouse-hover feedback (if any) needed its own idiom (fill/
   stroke, not box-shadow/background), a design decision left open rather
   than guessed at. Closed below by a ninth audit.
   A ninth audit closes the `.spark-bar` gap noted above: its bare
   `:focus-visible { outline: ... }` rule now pairs with `:hover` using an
   SVG-native `stroke`/`stroke-width` idiom instead of the box-shadow/
   background treatment its text/background siblings use — a colored edge
   around the specific bar under the pointer or keyboard focus, leaving the
   bar's own semantic verdict `fill` (`.spark-shipped` et al.) untouched, so
   the highlight reads as "this bar" without recoloring what it means.
   Pinned red-first by `hover-focus-visible-pairing.test.ts`'s ninth-audit
   entry.
   Still open: the sweep's "both themes" and deliverable proof, the same
   end-state slices 3/4/5 reached.
   A follow-up mechanical audit (firing 221) extended the
   `hover-focus-visible-pairing.test.ts` pin — the same file that closed the
   `.tour-btn`/`#fly-browse-btn`/`.card-remove` gaps — to the fly bar's own
   primary controls and the SOUL review surface: `#fly-go`/`#fly-stop`/
   `#fly-pause`, `.fly-flight-actions button`, and `.soul-review-btn`/
   `.soul-ratify-btn`/`.soul-dismiss-btn`/`.soul-unratify-btn` all carried
   their shape-morph + elevation-lift feedback on `:hover` only, unlike their
   own structural twins (`#search-go`/`#ask-go`, `.task-move` et al.,
   `.soul-proposal-summary`) which already paired it with `:focus-visible` —
   a keyboard-only operator tabbing to any of these 8 controls got zero
   visual feedback landing on them. Closed: each now shares its hover
   selector with the matching `:focus-visible` selector, pinned red-first in
   the extended `hover-focus-visible-pairing.test.ts`.
   Firing 236 gave the sweep's third pillar (`prefers-reduced-motion`
   honored) its own pin: the global kill switch (`*, *::before, *::after`
   with transition/animation/scroll-behavior `!important`-killed) was only
   asserted incidentally, and the one existence guard
   (`firing-trace-loading-state.test.ts`) was vacuous — `indexOf` returning
   -1 fed `slice(-1)`, whose one-character tail can never equal `''`, so
   "a reduced-motion guard exists" could not go red.
   `reduced-motion-kill-switch.test.ts` now brace-walks the block with a
   real absence signal (self-checked red-capable) and the vacuous guard
   asserts the index. The same firing's stylesheet audit found the LAST
   hover-only stragglers — `.card-link`, `.back a`, `.browse-entry`/
   `.browse-drive` — but left the CSS untouched: two sibling lanes held
   layout-css.ts that firing, so the pairing fix waits for a firing that
   finds the file free.
   Firing 252 found it free and closed those four: `.card-link`, `.back a`,
   and `.browse-entry`/`.browse-drive` now share their hover selector with
   the matching `:focus-visible` selector, pinned red-first in the same
   extended `hover-focus-visible-pairing.test.ts`. No hover-only stragglers
   remain in the audit's scope; `.switch button` and `.connect > summary`
   (state-less rather than hover-only — no pointer feedback either) stay
   open as their own designed-states slice.
   That named slice is now closed, widened to the masthead pill FAMILY:
   `.switch button`, `.connect > summary`, and `.tour-btn` (the third
   masthead pill, structurally identical — its earlier pairing fix gave it
   the same color-only feedback the other two had) each brightened text on
   hover/focus-visible but carried none of the MX state language: no
   elevation cue, no pressed state, no transition. Shape-morph is
   deliberately OUT for this family — `stateRadius` no-ops `full` radius
   (a pill has no corner to morph, `packages/tokens/src/css.ts`), so no
   `--shape-full-*` state tokens exist and the pills keep `--radius-full`
   in every state. The pill idiom is therefore elevation alone: rest
   carries the box-shadow transition, hover/focus-visible lift to
   `--elevation-level-1`, `:active` flattens pressed — the same
   lift/flatten cycle the shape-morphing siblings pair with their radius
   shift. Pinned red-first by `masthead-pill-designed-states.test.ts`;
   the pairing pin's tracked selectors kept their shared
   hover/focus-visible lists.
   A fresh mechanical audit (firing 348) walked every `cursor: pointer`
   selector in `layout-css.ts` for missing hover / focus-visible / active /
   transition and found an outline-chip trio the shared-base-rule surveys
   never reached because each owns its rule alone: `#fly-browse-btn` (the
   fly bar's Browse… button, `shell.ts`), `.docs-file` (the Docs panel's
   per-file chips, `features/docs-viewer.ts`), and `.report-dialog-close`
   (the report-from-here dialog's ✕, `features/report-menu.ts`). All three
   already paired hover with focus-visible (Browse is on the pairing pin's
   list) but carried only a recolor — no shape-morph, no elevation cue, no
   pressed state, no transition — next to structural twins
   (`.task-delete-btn`, `.replay-nav-btn`, `#fly-go`) that read the full MX
   language. Closed: each now carries the shape-morph + `--elevation-level-1`
   hover/focus-visible pair with pressed-flat `:active`, keeping its own
   recolor (accent border on the chips, surface wash on the ✕). None of the
   three is ever disabled, so no `:not(:disabled)` guard — the pairing pin's
   `#fly-browse-btn` entry keeps its shape. `.docs-file`'s rest radius swaps
   `--radius-sm` for `--shape-extra-small` (both 4px) so the state tokens pair
   with their own rest value; `.docs-file.on` stays after the hover pair so
   the open doc keeps its accent through hover/press (rule order pinned).
   Pinned red-first by `outline-chip-designed-states.test.ts`. The same
   audit's remaining names — `.landing-group-toggle` (borderless surface-
   raise idiom, `--radius-md` rest), `.pipeline-item` (a listbox option, not
   a button), and the checkbox labels `.notify-enable` / `.github-sync-public`
   / `.release-ghrelease` (browser-default checkbox inputs) — are different
   idioms each wanting its own decision, left for their own slices.
   The first of those three is closed: `.landing-group-toggle` (the LANDING
   panel's collapsed commit-group row, a real `<button>` toggle in
   `features/landing.ts`) turned out not to want its own decision at all —
   it is a structural twin of `.flight-head` (the flight log's own group-row
   toggle: same full-width borderless button, same border +
   `--color-surface-raised` hover wash), which already carries the full MX
   language on the `--shape-small` role. It now shares that exact idiom:
   shape-morph + `--elevation-level-1` lift on hover/focus-visible,
   pressed-flat `:active`, the radius/shadow transition at rest. Rest radius
   swaps `--radius-md` for `--shape-small` (both 8px) so the state tokens
   pair with their own rest value — rest-state pixels do not move. Never
   disabled, so no `:not(:disabled)` guard. Pinned red-first by
   `landing-group-toggle-designed-states.test.ts`, which also asserts the
   toggle's hover/active bodies are byte-identical to `.flight-head`'s so the
   pair cannot drift apart. `.pipeline-item` (listbox option) and the three
   checkbox labels stay open as their own slices.
   The checkbox-label trio is closed: `.notify-enable` (notification
   settings), `.github-sync-public` (CONNECT popover), and `.release-ghrelease`
   (release panel) each wrap a native checkbox `<input>` in a muted-text
   `<label>` with `cursor: pointer` but carried zero hover/focus feedback on
   the label itself. Since focus lands on the child `<input>`, not the label,
   the fix follows the `.fly-flight`/`.card` idiom (`:hover, :focus-within`)
   rather than `:focus-visible`, brightening text to `--color-text` the same
   "plain content, nothing to shape-morph" way `.card-link`/`.back a` already
   do — one shared rule across all three so the trio cannot drift apart.
   Pinned red-first by `checkbox-label-designed-states.test.ts`. `.pipeline-item`
   (listbox option) stays open as its own slice.
   That last named slice is closed: `.pipeline-item` (the pipeline tree's
   `role="treeitem"` rows, `pipeline-tree-html.ts`, selection wired by
   `features/pipeline.ts`) already paired hover with focus-visible (the D4
   pin in `layout-css.test.ts` tracks it) but carried only an accent
   border-color recolor — no shape-morph, no elevation cue, no pressed
   state, no transition — next to its structural twins `.phase` (phase-rail
   segment) and `.report-ctx-menu-item` (report context-menu row), both
   transparent-bordered rows that recolor their border on hover and already
   read the full MX language. It now shares that idiom: shape-morph +
   `--elevation-level-1` lift on hover/focus-visible, pressed-flat `:active`,
   the radius/shadow transition at rest. Rest radius was already
   `--shape-extra-small`, so rest-state pixels do not move; a `<div>`, never
   disabled, so no `:not(:disabled)` guard. The `[aria-selected]` /
   `[data-connected]` rules stay after the hover pair so a selected row keeps
   its surface fill through hover/press (rule order pinned). Pinned red-first
   by `pipeline-item-designed-states.test.ts`, which also asserts its active
   body is byte-identical to `.phase:active` so the pair cannot drift. That
   closes every name the firing-348 `cursor: pointer` audit surfaced.
   A follow-up audit flipped the frame again: the `cursor: pointer` walk can
   only see elements that DECLARE a pointer cursor, and an `<a href>` takes
   its pointer from the UA — the same blind spot that hid `.card-link` /
   `.back a` from the earlier surveys. Walking every `:hover` rule for a
   missing `:active` / rest transition instead surfaced `.publicity-link-live`
   (the PUBLICITY panel's live repo/watch/star/discussions chips, real
   `<a href target="_blank">` anchors built by `features/publicity.ts`): it
   paired hover with focus-visible but carried only an accent recolor (border
   + text) — no shape-morph, no elevation cue, no pressed state, no
   transition — while its structural twin `.docs-file` (an outline chip on the
   same `--shape-extra-small` rest radius with the same accent-border hover)
   reads the full MX language. Closed: it shares that idiom — shape-morph +
   `--elevation-level-1` lift on hover/focus-visible, pressed-flat `:active`,
   the radius/shadow transition at rest. The transition sits on the `-live`
   class, NOT the shared `.publicity-link` base, so the dormant variant (an
   `aria-disabled` `<span>` with `cursor: default`) stays state-free — a
   designed state there would promise an interaction that never comes.
   Rest-state pixels do not move. Pinned red-first by
   `publicity-link-designed-states.test.ts`, which also asserts the active
   body is byte-identical to `.docs-file:active` and that neither the dormant
   class nor the shared base ever grows a hover/focus/active rule. The same
   `:hover`-rule walk found no other straggler: `.task-approve-btn` stacks on
   `.task-done-btn` in the markup (`shell.ts`) and inherits its full idiom,
   `.stat-tile` / `.card` / `.fly-flight` are the lift-only container idiom
   (nothing to press), and the SVG `rect`s keep their stroke idiom.
   A third frame closed the last blind spot both walks share: each audits
   EXISTING rules (`cursor: pointer` declarations, `:hover` selectors), so a
   control with NO rule at all is invisible to both. Cross-referencing every
   interactive tag in the markup sources (`shell.ts`, `features/*.ts`)
   against the stylesheet's state selectors surfaced exactly one: `#fly-lucky`,
   the fly bar's 🍀 "I'm feeling lucky" button (`shell.ts`, driven by
   `features/fly.ts`), rendered as a raw UA-default `<button>` — UA font, UA
   radius, UA borders, zero hover/focus/active/disabled feedback — wedged
   between the Lanes field and the fully-styled `#fly-go` / `#fly-browse-btn`
   siblings. Closed: it shares `#fly-browse-btn`'s outline-chip idiom
   (shape-morph + `--elevation-level-1` lift on hover/focus-visible,
   pressed-flat `:active`, the radius/shadow transition at rest) and, because
   `fly.ts` disables it for the `/api/lucky` round-trip, `#fly-go`'s
   `:disabled` phase behind the `:not(:disabled)` guards. Pinned red-first by
   `fly-lucky-designed-states.test.ts` (active body byte-identical to
   `#fly-browse-btn:active`, disabled body byte-identical to
   `#fly-go:disabled`) and by a new `#fly-lucky:not(:disabled)` entry in
   `hover-focus-visible-pairing.test.ts`. The same cross-reference found no
   other rule-less control: every other hit was a form field already carrying
   its base rule (`.fly-form input`, `.connect-form select` et al.), a
   `<summary>` covered by an ancestor-scoped rule (`.connect > summary`,
   `.detail summary`), or the `role="tab"` buttons `tabs.ts` renders — a
   primitive no surface mounts yet (only `tab-route.ts` imports its type), so
   not a live control; whichever slice first mounts a tablist owes it the
   idiom then.
   That cross-reference had its own blind spot: it read the tag and the
   class on the same line, so a `createElement('button')` whose `className`
   is assigned a statement or two later looked anonymous — and an anonymous
   button matches nothing. Walking every `createElement('button')` in the
   feature modules to its eventual className surfaced one more rule-less
   live control: `.pool-client-fly`, the Pool panel's post-claim "Fly" button
   (`features/pool-client.ts` appends it to the `.pool-client-item` after a
   claim that queued a local board task, and disables it for the `/api/fly`
   round-trip). It rendered as a raw UA-default `<button>` — UA font, UA
   radius, UA borders, stretched across the item's column flexbox, zero
   hover/focus/active/disabled feedback — directly under the success line, in
   the exact spot the fully-styled `.pool-client-execute` Claim CTA it
   replaces had just vacated. Closed: it IS a panel execute CTA (a
   filled-accent button that fires a POST and disables during the
   round-trip), so it SHARES the Claim rules rather than copying their
   bodies — the rest and `:disabled` rules via selector list, and a seat in
   the combined execute-CTA family block (transition at rest, shape-morph +
   `--elevation-level-1` lift on hover/focus-visible behind the
   `:not(:disabled)` guard, pressed-flat `:active`). Its one own declaration
   parks it at the column end (`align-self: flex-end`), where the Claim row's
   flex-end actions row sat. Pinned red-first by
   `pool-client-fly-designed-states.test.ts` — whose rule parser is
   list-aware, since a selector living only inside shared lists has no
   `sel {` of its own for the sibling suites' `indexOf` helpers to find, and
   which asserts each state lives in the SAME rule as the Claim CTA's — and
   by a new `.pool-client-fly:not(:disabled)` entry in
   `hover-focus-visible-pairing.test.ts`. The same createElement walk found
   no other orphan: every other late-classed button (`.browse-use`,
   `.tour-next`, the browse dialog's cancel/close, the tour's back/skip, the
   GitHub-issue and start-over CTAs) resolves to a family rule its own
   designed-states suite already pins.
   Still open:
   the sweep's "both themes" and deliverable proof, the same end-state
   slices 3/4/5 reached.

## Related

- Founder's design-quality rules (anti-template policy; "at least four required
  qualities" — this spec commits to hierarchy, rhythm, depth, typography, semantic
  color, designed states, and clarifying motion).
- Epic 0002 (shell decomposition — the structural enabler and sequencing partner).
- **Supersedes** board item `web-msm66jkf-1v7wk6` ("M3 component pass v2") — its intent
  (restyle ALL surfaces coherently) lives on here with a chosen direction; the M3 token
  plumbing it named is reused as this epic's mechanical layer.
- `docs/EVALUATION-2026-08.md` §3.3–3.4 (usability/a11y findings).
