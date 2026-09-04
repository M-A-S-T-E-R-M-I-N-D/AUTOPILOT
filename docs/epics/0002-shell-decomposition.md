<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0002. Shell decomposition — modularize the five outsized files

Status: Active — slice 1 (shared pure module) done (2026-08-13); slices 2-5 open.
Progress check (2026-08-20): `web/shell.ts` is at 4,271 lines (from 5,102 at the
UNLOCK B peak) with 6 modules extracted to `web/features/` behind the live
auto-discovered barrel; the splice-manifest regression guard
(`test/tooling/generate-splice-manifest.test.ts`) now polices every relative
import so decomposition can't silently regress. Slices 2-5 remain open.
Progress check (2026-08-24): `web/shell.ts` is at 5,033 lines; `web/features/`
now holds 10 discoverable modules (`tour.ts` joined via the sixtieth cut, the
first whole-region move out of `fleetJs()` itself rather than only its own
top-level, no-DOM-half functions; `flight-console.ts` joined via the
sixty-first cut, the second such whole-region move; `docs-viewer.ts` joined
via the sixty-second cut, the third; `round-panel.ts` joined via the
sixty-third cut, the fourth).
Progress check (2026-08-24, continued): `web/shell.ts` is at 4,894 lines;
`web/features/` now holds 11 discoverable modules — `issue-triage.ts` joined
via the sixty-fourth cut, the fifth whole-region move, carrying the KEEPER
issue-triage panel's own pid-keyed `issueTriagePlansByProject` state the same
way the tour/console/docs-viewer cuts already proved extractable. Unlike
those four, this panel's `decisionItemHeadMeta` helper is shared with the
KEEPER PR review panel, which stays inline in `fleetJs()` — rather than
duplicating that splice into the new module, `issueTriageSection` calls it as
a bare hoisted identifier, relying on `shell.ts`'s own remaining splice of
`web/decision-item.ts`, the same cross-module hoisting precedent every
whole-region move already depends on for `el`/`tipChip`/`fmtAgo`.
Progress check (2026-08-24, continued further): `web/shell.ts` is at 4,821
lines; `web/features/` now holds 12 discoverable modules — `backlog.ts`
joined via the sixty-fifth cut, the sixth whole-region move: the project
page's DETECTED BACKLOG panel (`backlogSection`/`renderBacklogBody`, plus its
own `backlogMatchText`/`backlogCandidateMeta` relative-import splices, now
resolved against `web/features/` instead of `shell.ts`). Like `round-panel.ts`,
this panel keeps no module-level state at all — every render fetches fresh —
and unlike `landing.ts`/`release.ts` (still open, since their own EXECUTE
click handlers stay inline in `fleetJs()`), it has no execute click handler of
its own at all: confirming a candidate reuses the task board's own
`data-task-done` action, which stays inline in `fleetJs()`, so this is the
simplest whole-region move since `round-panel.ts`'s own. Since `backlog.ts`
sorts alphabetically before every other module in `web/features/`,
`generate-splice-manifest.test.ts`'s discovery/reconstruction suites gained
it as the FIRST discovered module rather than appended at the tail, shifting
every existing module's index by one — the same mechanical reshuffle a
mid-alphabet insertion (`issue-triage.ts` between `fly.ts` and `locale.ts`)
already exercised, just at the front instead of the middle. Direct unit tests
(`test/web/features/backlog.test.ts`) instead of only indirect DOM-render
coverage (`test/web/backlog-panel.test.ts`, which drives the real client
bundle through fetch/render and needed no changes — zero behavior change,
confirmed by this unchanged pass). Full gate green: typecheck, lint,
format:check, test, build.
Progress check (2026-08-24, continued further): `web/shell.ts` is at 4,772
lines; `web/features/` now holds 14 discoverable modules — `process-health.ts`
joined via the sixty-sixth cut, the seventh whole-region move and the FIRST to
move THREE sibling section functions as one coherent cluster: the project
page's DORA-for-agents, parallel-gate-savings, and warm-session-savings panels
(`doraSection`/`gateParallelSection`/`warmSessionsSection`, plus their own
`doraTileItems`/`gateParallelTileItems`/`warmSessionTileItems`
relative-import splices, now resolved against `web/features/` instead of
`shell.ts`). The source comment `fleetJs()` already carried named these three
as the panels that "each independently hand-rolled this exact seven-line loop
body verbatim", so they are one cluster, not three unrelated regions — the
board's "extract the next coherent cluster" ask taken literally. Like
`round-panel.ts`/`backlog.ts`, none keeps module-level state (every render
reads only the passed card `c`) and none has an execute click handler of its
own; the shared `statTile` helper stays inline in `fleetJs()` (still used by
`renderStatTiles`), called from these panels as a bare hoisted bundle
identifier. `evolutionSection` (the fourth stat-tile panel rendered alongside
them) stays open: its `evaluationTrendWeeks`/`evaluationTrendSummary` helpers
are shared with `evaluationTrendPanel`, which stays inline — a follow-on, not
this cut. `process-health.ts` sorts between `notifications.ts` and `report.ts`,
so `generate-splice-manifest.test.ts`'s discovery/reconstruction suites gained
it as a mid-alphabet insertion (indices shifted from `report.ts` onward), the
same mechanical reshuffle `issue-triage.ts` already exercised. Direct unit
tests (`test/web/features/process-health.test.ts`) instead of only indirect
DOM-render coverage (`test/web/dora-tiles.test.ts`,
`test/web/gate-parallel-tiles.test.ts`, `test/web/fleet-stat-tiles.test.ts`,
which drive the real client bundle and needed no changes — zero behavior
change, confirmed by their unchanged pass). Full gate green: typecheck, lint,
format:check, test, build.
Progress check (2026-08-24, continued further): `web/shell.ts` is at 4,659
lines; `web/features/` now holds 15 discoverable modules — `evolution.ts`
joined via the sixty-seventh cut, the eighth whole-region move and a second
two-function coherent cluster: the project page's "is the agent improving?"
evolution panels (`evaluationTrendPanel`/`evolutionSection`), the
process-health cut's own deferred follow-on — both panels read the same
`evaluationTrendWeeks`/`evaluationTrendSummary` window math off
`c.evaluationLabelDayCounts`, so they move together rather than splitting the
shared splices (`EVAL_TREND_WEEKS`/`EVAL_TREND_DAY_MS`/`EVAL_TREND_WEEK_MS`/
`EVAL_TREND_FLAT_BAND`/`evalDayTs`/`evalDayKey`/`evalWeekStart`/
`evaluationTrendWeeks`/`evaluationTrendSummary`/`evaluationTrendWeekTip`/
`evaluationTrendLabel` from `web/evaluation-trend.ts`,
`evaluationTrendTileItems` from `web/stat-tiles.ts`) across two files — no
splice in this epic is duplicated across two files, the same rule the
issue-triage cut's `decisionItemHeadMeta` relocation already followed. Like
`round-panel.ts`/`process-health.ts`, neither panel keeps module-level state
(every render reads only the passed card `c`) and neither has an execute
click handler of its own; the shared `el`/`statTile` helpers stay inline in
`fleetJs()` (`statTile` still shared with `renderStatTiles` and the
process-health cluster), called from `evolutionSection` as a bare hoisted
bundle identifier. `evolution.ts` sorts between `docs-viewer.ts` and
`flight-console.ts`, so `generate-splice-manifest.test.ts`'s
discovery/reconstruction suites gained it as a mid-alphabet insertion
(indices shifted from `flight-console.ts` onward), the same mechanical
reshuffle `issue-triage.ts`/`process-health.ts` already exercised. Direct
unit tests (`test/web/features/evolution.test.ts`) instead of only indirect
DOM-render coverage (`test/web/evaluation-trend-panel.test.ts`, which drives
the real client bundle and needed no changes — zero behavior change,
confirmed by its unchanged pass; `evolutionSection` itself had only indirect
coverage via `test/web/project-page.test.ts`, also unchanged). Full gate
green: typecheck, lint, format:check, test, build.

Progress check (2026-08-26): `web/shell.ts` is at 4,559 lines; `web/features/`
now holds 16 discoverable modules — `metrics.ts` joined via the sixty-eighth
cut, the ninth whole-region move: the project page's Metrics detail panel
(`metricsSection`) alongside its two sparkline builders (`costSparkline`/
`flightTimelineStrip`), which existed solely to be assembled into that panel
and called from nowhere else in `shell.ts` — so all three move together
rather than splitting the shared splices (`timelineSegments` from
`web/timeline-strip.ts`, `metricsStatItems`/`modelMixItems`/
`modelMixChipMeta` from `web/stat-tiles.ts`) across two files, the same rule
the evolution cut's own comment already followed. Unlike `evolution.ts`,
this cluster's shared helpers (`svgNode`/`sparkBars`/`metricSparkline`/
`flightBarMeta`/`taskMap`/`flightHeadlineOf`) stay inline in `fleetJs()` not
because they're broadly-shared DOM/format primitives alone, but because four
fleet-wide sparkline builders (`fleetCostSpark`/`fleetTurnsSpark`/
`fleetFormSpark`/`fleetCacheSpark`) call them by the same bare identifiers
and stay behind — moving them into `metrics.ts` too would duplicate them
across two files instead of sharing one. None of the three moved functions
keeps module-level state (every render reads only its own arguments) and
none has an execute click handler of its own. `metrics.ts` sorts between
`locale.ts` and `notifications.ts`, so `generate-splice-manifest.test.ts`'s
discovery/reconstruction suites gained it as a mid-alphabet insertion
(indices shifted from `notifications.ts` onward), the same mechanical
reshuffle `evolution.ts` already exercised. Direct unit tests
(`test/web/features/metrics.test.ts`) instead of only indirect DOM-render
coverage (`test/web/flight-timeline-strip.test.ts`, `test/web/model-mix-panel.test.ts`,
which drive the real client bundle and needed no changes — zero behavior
change, confirmed by their unchanged pass). Full gate green: typecheck, lint,
format:check, test, build.

Progress check (2026-08-26, continued): `web/shell.ts` is at 4,212 lines;
`web/features/` now holds 17 discoverable modules — `landing.ts` joined via
the sixty-ninth cut, the tenth whole-region move and the FIRST to carry its
own EXECUTE click handler: the project page's post-flight LANDING card
cluster (`landingCommitRow`/`landingCommitGroupNode`/`flightDebriefSection`/
`renderLandingBody`/`landingSection`), plus the panel's own confirm-guarded
`data-land-execute` click handler. `landing.ts`/`release.ts` were the two
remaining whole-region candidates the metrics cut's own epic note flagged as
still open, precisely because each carries its own EXECUTE handler unlike
every panel moved so far; this cut takes `landing.ts`, leaving `release.ts`
as the next follow-on. Unlike every self-contained cut before it, this
cluster's click handler reads fleet-wide mutable state
(`lastFleetState`/`lastFleetSig`) and calls `renderFleet()`/`refresh()` as
bare hoisted identifiers — the same cross-module hoisted-read shape
`web/features/fly.ts`'s own `lastFleetState` reference already proved safe,
since the served bundle is one concatenated non-module script (`clientJs()`
= `fleetJs()` + `featureModulesJs()`) and neither is read until a click
actually fires, well after the whole script has already run once. Like
`issue-triage.ts`, this cluster keeps its own module-level state
(`landingRestarting`, a pid-keyed map tracking a self-hosted land's
presumed-in-flight rebuild+restart, plus its `LANDING_RESTART_GRACE_MS`
constant) — no read of any OTHER fleet-wide mutable state beyond the two
named above. `flightDebriefSection` is called from nowhere else in
`shell.ts` — it exists solely to be assembled into `renderLandingBody`'s
panel body — so it moves with the rest of the cluster rather than staying
behind, the same "moves together" rule the metrics cut's own sparkline
builders already followed. `flightVerdictOf`/`taskMap`/`flightHeadlineOf`/
`fmtCost`/`fmtDuration`/`el`/`tipChip` all stay inline in `fleetJs()` —
broadly shared across many panels beyond this cluster, already relied on the
same way by `metrics.ts`. `landing.ts` sorts between `issue-triage.ts` and
`locale.ts`, so `generate-splice-manifest.test.ts`'s discovery/reconstruction
suites gained it as a mid-alphabet insertion (indices shifted from
`locale.ts` onward), the same mechanical reshuffle `metrics.ts` already
exercised. Direct unit tests (`test/web/features/landing.test.ts`) instead of
only indirect DOM-render coverage (`test/web/landing-panel.test.ts`, which
drives the real client bundle and needed no changes — zero behavior change,
confirmed by its unchanged pass). Full gate green: typecheck, lint,
format:check, test, build.

Progress check (2026-08-26, continued further): `web/shell.ts` is at 4,042
lines; `web/features/` now holds 18 discoverable modules — `release.ts`
joined via the seventieth cut, the eleventh whole-region move: the project
page's RELEASE panel cluster (`renderReleaseBody`/`releaseSection`), plus
the panel's own confirm-guarded `data-release-execute` click handler.
`landing.ts`/`release.ts` were the two remaining whole-region candidates the
metrics cut's own epic note flagged as still open, precisely because each
carries its own EXECUTE handler unlike every panel moved before them; the
landing cut took `landing.ts` first, and this cut takes `release.ts`,
closing that two-item list — no further whole-region EXECUTE-handler panel
remains flagged open. Unlike `landing.ts`, this cluster keeps no
module-level state of its own, and its click handler reads no fleet-wide
mutable state at all — it only calls `refresh()` as a bare hoisted
identifier on success, the same cross-module hoisted-call shape every
whole-region move in this epic already relies on for `el`/`tipChip`, which
stay inline in `fleetJs()` the same reason they did for `landing.ts`/
`metrics.ts`. `release.ts` sorts between `process-health.ts` and
`report.ts`, so `generate-splice-manifest.test.ts`'s discovery/
reconstruction suites gained it as a mid-alphabet insertion (indices shifted
from `report.ts` onward), the same mechanical reshuffle `landing.ts` already
exercised. Direct unit tests (`test/web/features/release.test.ts`) instead
of only indirect DOM-render coverage (`test/web/release-panel.test.ts`,
which drives the real client bundle and needed no changes — zero behavior
change, confirmed by its unchanged pass). Full gate green: typecheck, lint,
format:check, test, build.

Progress check (2026-08-26, continued further): `web/shell.ts` is at 3,915
lines; `web/features/` now holds 19 discoverable modules — `activity.ts`
joined via the seventy-first cut, the twelfth whole-region move: the project
page's Activity feed panel cluster (`phaseRail`/`phaseDetail`/`flightMap`/
`activitySection`), a FOUR-function coherent cluster (the phase rail, its
"look INTO a phase" drill-down, the files-in-flight map, and the panel
assembler itself). `actRow`/`actIcon` — the per-entry row renderer
`phaseDetail`/`activitySection` both call — stay inline in `fleetJs()`
rather than moving with this cluster: `actRow` is ALSO called by
`firingTimelineSection` (the still-inline "Per-firing trace" panel's
replay/drill-down view), the same "shared helper stays behind, the moved
cluster calls it as a bare hoisted identifier" shape the issue-triage cut's
own `decisionItemHeadMeta` relocation already established — just in the
opposite direction here, since the STILL-INLINE caller is the one that
needs the helper to stay put. `el`/`OFFICE_TIPS`/`openPhases`/`liveFiring`/
`basename` all stay inline too — broadly shared (`liveFiring`/`basename`
are already relied on the same way by `liveWorkerCard`/`officeMapSection`/
`narratorTarget`) or fleet-wide module state (`openPhases`, read here and
written by the `[data-phase-toggle]` click handler that stays inline).
Unlike every prior cut, `activity.ts` sorts BEFORE every other module
(`a` < `b`), so it becomes the FIRST discovered module rather than appended
after an existing one — the same front-of-directory reshuffle `backlog.ts`
(the fifth whole-region move) already exercised, shifting every other
module's index up by one in `generate-splice-manifest.test.ts`'s discovery/
reconstruction suites. Direct unit tests
(`test/web/features/activity.test.ts`) instead of only indirect DOM-render
coverage (`test/web/phase-rail-tooltips.test.ts`,
`test/web/flightmap-tooltips.test.ts`, `test/web/act-label-tooltip.test.ts`,
`test/web/flight-map.test.ts`, `test/web/file-nodes-parity.test.ts`,
`test/web/live-render-section-patch.test.ts`,
`test/web/flightlog-count-tabular-numerals.test.ts`, and the a11y suite's
phase-detail/activity-panel cases, none of which needed changes — zero
behavior change, confirmed by their unchanged pass). Full gate green:
typecheck, lint, format:check, test (6809 tests), build.

Progress check (2026-08-27): `web/shell.ts` is at 3,764 lines; `web/features/`
now holds 20 discoverable modules — `office-map.ts` joined via the
seventy-second cut, the thirteenth whole-region move: the agent office map
panel cluster (`officeSatellites`/`officeMapSection`/`prefersReducedMotion`).
Unlike a "real" TS split of `web/office-map.ts` itself (which that module's
own doc comment explains it deliberately avoids, since a type-checked
`document`/`window`-using function would need a DOM lib this package's
tsconfig doesn't carry), this move is the same shape every other
`web/features/*.ts` cut already uses: DOM code embedded as string content
inside the returned template literal, which TypeScript never type-checks —
so no DOM lib is needed here either. `OFFICE_TIPS` — the one `web/office-map.ts`
constant `officeMapSection` ALSO reads — stays inline in `fleetJs()` instead
of moving with the cluster: it's ALSO read by `liveWorkerCard` (the
still-inline live-worker chip), `renderStatTiles`, and `web/features/
activity.ts`'s own `phaseRail` (already moved), so unlike the rest of the
office constants it isn't cluster-local — the same "shared value stays
behind, the moved cluster calls it as a bare hoisted identifier" shape
`activity.ts`'s own `OFFICE_TIPS` reference already established. `el`/
`liveFiring` stay inline too, broadly shared the same way. `office-map.ts`
sorts between `notifications.ts` and `process-health.ts`, so
`generate-splice-manifest.test.ts`'s discovery/reconstruction suites gained
it as a mid-alphabet insertion (indices shifted from `process-health.ts`
onward), the same reshuffle `issue-triage.ts`/`process-health.ts` already
exercised, plus a `reconstructOfficeMapJs()` helper mirroring `activityJs`'s
own real-relative-import-splice reconstruction. Direct unit tests
(`test/web/features/office-map.test.ts`) instead of only indirect DOM-render
coverage (`test/web/office-map.test.ts` — the pre-existing bundle-level
suite —, `test/web/office-map-geometry.test.ts`,
`test/web/office-satellite-tooltips.test.ts`,
`test/web/office-zone-tooltips.test.ts`, none of which needed changes — zero
behavior change, confirmed by their unchanged pass). Net result: `shell.ts`
drops from 3,915 to 3,764 lines. Full gate green: typecheck, lint,
format:check, test (6819 tests), build.

Progress check (2026-08-27, continued further): `web/shell.ts` is at 3,572
lines; `web/features/` now holds 22 discoverable modules — `flight-summary.ts`
joined via the seventy-fourth cut, the fifteenth whole-region move: the
project page's "Recently shipped" flight summary panel (`flightSummarySection`
alone), the simplest cluster since `round-panel.ts`'s own — no module-level
state at all and no click handler of its own; every render fetches nothing
and reads only the passed project card `c`. Its two splices
(`finishedFlightSummaries` from `shared/flight-summary.ts`,
`flightSummaryLineMeta` from `web/flight-summary-panel.ts`) were used nowhere
else in `shell.ts`, so both move with it rather than staying behind, the same
"moves together" rule the metrics/landing cuts' own comments already
followed. `el`/`fmtCost`/`fmtAgo` stay inline in `fleetJs()` — broadly shared
across many panels beyond this one, called from this cluster as bare hoisted
identifiers, the same shape `round-panel.ts`/`landing.ts` already rely on.
`flightSummarySection(c)` is called from `fleetJs()`'s `renderProjectPage()`
as a bare hoisted identifier, the same cross-module hoisted-call shape every
whole-region move in this epic already relies on. `flight-summary.ts` sorts
between `flight-console.ts` and `fly.ts`, so
`generate-splice-manifest.test.ts`'s discovery/reconstruction suites gained
it as a mid-alphabet insertion (indices shifted from `fly.ts` onward), the
same reshuffle `office-map.ts`/`pr-review.ts` already exercised. Direct unit
tests (`test/web/features/flight-summary.test.ts`) instead of only indirect
DOM-render coverage (`test/web/flight-summary-tooltips.test.ts`,
`test/web/flight-summary-m3-surface.test.ts`, neither of which needed
changes — zero behavior change, confirmed by their unchanged pass). Full
gate green: typecheck, lint, format:check, test, build.

Progress check (2026-08-27, continued): `web/shell.ts` is at 3,622 lines;
`web/features/` now holds 21 discoverable modules — `pr-review.ts` joined via
the seventy-third cut, the fourteenth whole-region move: the KEEPER PR review
panel cluster (`renderPrReviewPanel`/`loadPrReviewPanel`), plus the panel's
own confirm-guarded `data-pr-review-execute` click handler. Unlike every
panel moved before it, this cluster is independent of any flown project — the
KEEPER rituals act on the one canonical repo the dashboard process itself
runs in — so it self-initializes on its own 30s poll timer
(`loadPrReviewPanel()`/`setInterval(...)`) at the bottom of its own module
rather than being called from `renderProjectPage()`, the same self-init shape
`web/features/notifications.ts`'s own `notifyInit()` already established for
a fleet-wide (not per-project) panel. That self-init now runs after
`fleetJs()`'s own `startFleetStream()` call instead of before it — the two
are independent fetches to different endpoints, and `notifications.ts`'s own
init already runs after `startFleetStream()` too, so this is not a new
ordering shape. `decisionItemHeadMeta` (from `web/decision-item.ts`) moves
with this cluster's splice registry even though `web/features/issue-triage.ts`'s
own `issueTriageSection` also calls it, as a bare hoisted identifier rather
than importing/re-splicing it there — moving the splice site out of
`fleetJs()` changes nothing for that caller, since function declarations
hoist across the whole concatenated bundle regardless of which feature
module's text defines them or in what order. `el`/`tipChip` stay inline in
`fleetJs()`, and `translateDom` stays inline in `web/features/locale.ts` —
both broadly shared, called from this cluster as bare hoisted identifiers,
the same shape `release.ts`/`landing.ts` already rely on. `pr-review.ts`
sorts between `office-map.ts` and `process-health.ts`, so
`generate-splice-manifest.test.ts`'s discovery/reconstruction suites gained
it as a mid-alphabet insertion (indices shifted from `process-health.ts`
onward), the same reshuffle `office-map.ts` itself already exercised, plus a
`reconstructPrReviewJs()` helper mirroring `releaseJs`'s own
real-relative-import-splice reconstruction. Direct unit tests
(`test/web/features/pr-review.test.ts`) instead of only indirect DOM-render
coverage (`test/web/pr-review-panel.test.ts`, `test/web/pr-review-panel-i18n.test.ts`,
`test/web/pr-review-execute-tooltip.test.ts`, none of which needed changes —
zero behavior change, confirmed by their unchanged pass). Full gate green:
typecheck, lint, format:check, test (882 impacted tests), build.

Freshness check (2026-08-27, continued further): `web/shell.ts` is back up to
3,810 lines — net +238 since the flight-summary cut's 3,572 snapshot above —
and `web/features/` still holds exactly 22 discoverable modules (unchanged;
verified against `web/features/index.ts`'s `FEATURE_MODULE_FUNCTIONS` list).
No decomposition cut regressed: the growth is ordinary feature work landing
in `fleetJs()` after that snapshot (REPORT-FROM-HERE extended to the Landing
and Tasks regions, an out-of-band land-gate alarm chip, KEEPER pool-client
claims queueing a local board task) plus one sync-back merge conflict
resolution (`b3659d4d`) that re-added 153 lines a divergent branch had
touched. This epic's line count is racing ongoing feature development, not
monotonically shrinking — later progress checks should expect the same
saw-tooth pattern rather than read a same-or-higher count as a regression.

Progress check (2026-08-28): `web/shell.ts` is at 3,663 lines; `web/features/`
now holds 24 discoverable modules — `publicity.ts` joined via a SHELL HUB
RELIEF whole-region move: the Publicity affordances panel
(`renderPublicityPanel`/`loadPublicityPanel`, plus its own
`publicityAffordanceTip` relative-import splice, now resolved against
`web/features/` instead of `shell.ts`). Independent of any flown project —
the affordances describe the ONE repo the dashboard process itself runs
in — so like `pr-review.ts`/`pool-client.ts` it self-initializes at the
bottom of its own module rather than being called from
`renderProjectPage()`; unlike those two it is a slow-changing fact (flips
once, on the public-day) so it loads once instead of riding a poll timer,
the same single-shot self-init `notifications.ts`'s `notifyInit()` already
established. That self-init now runs after `fleetJs()`'s own
`startFleetStream()` call instead of before it — the two are independent
fetches to different endpoints, the same ordering `pr-review.ts`'s/
`pool-client.ts`'s own self-inits already established for a fleet-wide
panel relative to `fleetJs()`'s tail. `el` stays inline in `fleetJs()` —
broadly shared, called from `renderPublicityPanel` as a bare hoisted
identifier. `publicity.ts` sorts between `process-health.ts` and
`release.ts`, so `generate-splice-manifest.test.ts`'s discovery/
reconstruction suites gained it as a mid-alphabet insertion (indices
shifted from `release.ts` onward). Direct unit tests
(`test/web/features/publicity.test.ts`) instead of only indirect
DOM-render coverage (`test/web/publicity-panel.test.ts`,
`test/web/a11y.test.ts`'s publicity-panel case, neither of which needed
changes — zero behavior change, confirmed by their unchanged pass). Full
gate green: typecheck, lint, format:check, 7,177 tests, build.
`ci:bundle-size` stays pre-existing RED (211.1KB/61.2KB against the
150.0KB/45.0KB budget) — the reopened BUNDLE DIET task, unaffected by this
line-count-focused cut and out of scope for it (owned separately).

Progress check (2026-08-24 continued): Epic documentation now captures cuts
62-84, extending the feature-module extraction pattern (search-history,
stat-tiles, connect-panel, landing-panel, flight-log-rows, and others) to
cover every remaining intra-panel math/text/metadata extraction. Cuts
62-84 close hand-sync duplications (statTileAriaLabel, flightCostAgoMeta,
guardDenialChipMeta, decisionItemHeadMeta across sibling panels) and fill
remaining direct-unit-test coverage gaps. PARALLEL UNLOCK A/B work adds the
splice-manifest discovery and byte-for-byte reconstruction tooling, proven
to regenerate all five nested bundle-composing functions plus the two
outer assembler-functions (clientJs/renderShell) from manifest + glue alone,
shadow-safe against parameter/destructured/local-binding/switch/var-hoisting
shadowing. Feature-module directory-glob discovery (discoverFeatureModules)
is built but not yet wired into clientJs(). Shell.ts unchanged across the
entire range (zero behavior change). Remaining: actual extraction of the
five nested bundle functions into a features/ directory and wiring clientJs()
to live directory-glob discovery instead of hand-written splice sites.

`docs/EVALUATION-2026-08.md` §3.2: the repo violates its own 800-line law in exactly
five places, and the largest (`web/shell.ts`, 4,761 lines) is simultaneously the bundle-
budget breach, the only hand-sync duplication site, and an a11y-regression hiding spot.
One epic fixes structure, budget, and duplication together.

## Acceptance criteria

- No src file over 800 lines (generated assets like `font-data.ts` exempt, marked so).
- The client is real ES modules (feature-per-module: fleet, project page, flight bar,
  office map, docs reader, chat/ask, release panel …) — served CSP-`'self'`-compatibly
  (native modules or a build-time concat step; no framework, no CDN).
- Pure logic shared by server and client (callsigns, landing preview, verdict/headline
  helpers) lives in ONE shared module imported by both — the "kept in sync by hand"
  comments are gone because the pattern is gone.
- `ci:bundle-size` passes at the ORIGINAL budgets (150KB raw / 45KB gzip for `/app.js`)
  via code-splitting — non-critical views load on demand. BUNDLE DIET's DELIVERABLE is
  satisfied by this epic, not by raising budgets.
- `server.ts`, `fly.ts`, `read/source.ts`, `store/read.ts` each split along their
  existing seams (handlers-per-module, rituals-per-module, read-model-per-domain).
- Zero behavior change: the axe gate, every existing test, and the visual surfaces stay
  green throughout — decomposition ships as verifiable slices, never a big-bang rewrite.

## Constraints

- CSP `default-src 'self'` is untouchable — module loading must not add origins,
  inline scripts, or eval.
- The un-fakeable chain and all existing containment guards are untouched.
- Slices must stay individually gate-verifiable (a slice = one module extracted + its
  tests moved/added + everything green).

## Out of scope

- Any framework adoption, bundler adoption beyond the minimal split/concat needed,
  visual redesign, or new features.

## Slices

1. **Done.** Shared pure module (`web/shared/`) — the hand-synced helpers now live in
   `shared/callsign.ts`, `shared/flight-summary.ts` (headline resolution, embedded into
   the client bundle via `.toString()` — see `flight-summary-parity.test.ts`),
   `shared/live-firing.ts`, and `src/gate-commands.ts`; every "kept in sync by hand"
   admission this audit could find is gone because the duplication itself is gone.
2. Client feature-module split of `shell.ts` + on-demand loading of heavy panels.
   **In progress** — first cut: `web/office-map.ts` holds the office map's pure
   geometry (constants + `officeZoneX`/`officeTargetFor`/`officeEase`), spliced into
   `fleetJs()` via the same `.toString()`/`JSON.stringify()` pattern slice 1 proved,
   with direct unit tests (`office-map-geometry.test.ts`) instead of only indirect
   DOM-render coverage. The SVG-drawing half of the office map stays inline pending a
   deliberate call on giving the client a DOM-lib tsconfig boundary (today only
   `tsconfig.typecheck.json`/e2e carry `"DOM"`; the emitting build config does not).
   Second cut: `web/format.ts` holds the six DOM-free formatting helpers
   (`fmtBytes`/`fmtCost`/`fmtTokens`/`fmtAgo`/`fmtElapsed`/`fmtDuration`), spliced in
   the same way, with direct unit tests (`format.test.ts`) covering value formatting
   and (via fake timers) the clock-based ones. Third cut: `web/heatmap.ts` holds the
   contribution heatmap's pure day-bucketing logic (`heatDayKey`/`heatDayStart`/
   `heatmapDays`/`heatClass`/`heatLabel`), spliced the same way, with direct unit
   tests (`heatmap-geometry.test.ts`); `heatmapDays` takes verdict classification via
   a caller-supplied `verdictOf` rather than importing `flightVerdictOf` from
   `shell.ts`, mirroring the existing `metricSparkline(log, tasks, valueOf, ...)`
   injection pattern. Fourth cut: `web/flight-metrics.ts` holds the pure
   per-flight/per-task classification helpers (`flightVerdictOf`/`taskMap`/
   `taskBurnOf`) that `flightGroupRow`, the sparkline builders, the flight-log/
   trace renderers, and the TASK BURN chip all called by name, spliced the same
   way, with direct unit tests (`flight-metrics.test.ts`) instead of only
   indirect DOM-render coverage (`task-burn-chip.test.ts`, `spark-tooltip.test.ts`).
   Fifth cut closes a slice-1-style gap the second cut's own comment had flagged as a
   follow-on: `shared/file-nodes.ts` (not `web/`, since it has a server counterpart)
   holds `activityFileNodes`, the flight map's file-collapsing logic — previously
   hand-duplicated between `read/fleet.ts` (server) and `shell.ts`'s local
   `fileNodes`/`baseName` (client). It takes basename resolution via a caller-supplied
   `nameOf` rather than importing `basename` from `shared/narrator.ts`, the same
   injection pattern `heatmapDays`/`verdictOf` already proved — a real cross-module
   import there type-checks fine but breaks once Vitest's SSR transform rewrites it to
   a `__vite_ssr_import_N__` reference that doesn't survive `.toString()` extraction,
   so shared modules stay import-free by rule, not just by precedent. Direct unit tests
   (`fleet.test.ts`) plus a parity test (`file-nodes-parity.test.ts`) regression-test
   both copies stay identical.
   Sixth cut: `web/markdown.ts` holds the Docs viewer's pure Markdown
   line-classification/parsing helpers (`splitTableRow`/`isFence`/`isHeading`/
   `isListItem`/`isSvgStart`/`isTableStart`/`isBlockStart`) that `renderMarkdown`
   calls by name, spliced the same way, with direct unit tests
   (`markdown-parsing.test.ts`) instead of only indirect DOM-render coverage
   (`docs-chart-svg.test.ts`). The DOM-building half (`appendInline`/
   `sanitizeChartNode`/`renderChartSvg`/`renderMarkdown` itself) stays inline,
   same reason the office map's SVG-drawing half did.
   Seventh cut: `web/activity-log.ts` holds the humanized activity feed's pure
   grouping/lookup/formatting helpers (`groupByFiring`/`firingLogEntry`/
   `actMeta`) that the per-firing timeline and the MICRO-ACTION TELEMETRY chip
   call by name, spliced the same way, with direct unit tests
   (`activity-log.test.ts`) instead of only indirect DOM-render coverage
   (`activity-feed.test.ts`). `actMeta` takes `fmtTokens` via injection rather
   than importing it from `web/format.ts`, the same `heatmapDays`/`verdictOf`
   pattern the fifth cut's `file-nodes.ts` used.
   Eighth cut: `fleetCacheShareOf` (the cache-read-share ratio the CACHE-READ
   SHARE stat tile and its spark both read) moved from a hand-typed function
   inline in `fleetJs()` into `web/flight-metrics.ts` alongside the other
   per-flight classification helpers it already sat next to conceptually,
   spliced the same way, with direct unit tests added to the existing
   `flight-metrics.test.ts` instead of only indirect DOM-render coverage
   (`fleet-stat-tiles.test.ts`).
   Ninth cut: `web/card-sections.ts` holds `cardSectionSigs`, the fleet
   card's pure per-section diff-signature helper — the live-blink fix that
   lets `renderCard` rebuild only the section whose own data changed instead
   of the whole card on every SSE tick — spliced the same way, with direct
   unit tests (`card-sections.test.ts`) instead of only indirect DOM-render
   coverage (`live-render-section-patch.test.ts`). `detailSectionSigs`, the
   Details panel's own per-subsection counterpart, stays inline for now
   since it reads several module-level state maps (`openPhases`,
   `openFirings`, `flightLogExtra`, …) that would need the same injection
   treatment `heatmapDays`/`actMeta` already proved — a follow-on cut, not
   this one.
   Tenth cut closes the follow-on the ninth cut's own comment flagged:
   `web/detail-sections.ts` holds `detailSectionSigs`, the Details panel's
   own per-subsection diff-signature helper (the `cardSectionSigs`
   counterpart) — spliced the same way, with direct unit tests
   (`detail-sections.test.ts`) instead of only indirect DOM-render coverage
   (`live-render-section-patch.test.ts`). It reads the module-level
   disclosure-state maps (`flightLogExtra`, `flightLogMore`,
   `openFlightLogAll`, `openFlightRow`, `flightLogLoading`, `openPhases`,
   `openFirings`) that had blocked it in the ninth cut via the same
   caller-supplied-value injection pattern `heatmapDays`/`actMeta` proved —
   a new `detailSectionSigsFor(c)` wrapper in `shell.ts` does the per-id map
   lookups and stays the one place that reads those maps by id.
   Eleventh cut finishes what the first cut's own comment deferred: the
   office map's SVG-drawing half stayed inline because `document`/`window`
   need a DOM lib the build tsconfig doesn't carry, but `officeSatellites`'
   per-satellite orbit-position math (`officeSatellitePos` — the angle/cos/
   sin that turns "i-th of n subagents" into an {x, y}) was itself DOM-free
   and had only ever been covered indirectly through the rendered `<circle>`
   attributes (`office-satellite-tooltips.test.ts`). It now lives in
   `web/office-map.ts` alongside `officeZoneX`/`officeTargetFor`/`officeEase`,
   spliced the same `.toString()` way, with direct unit tests added to
   `office-map-geometry.test.ts`; the loop that turns each position into a
   `<circle>` element stays inline in `shell.ts`.
   Twelfth cut: `web/lang-bar.ts` holds `langBarSegments`, the fleet card's
   language-bar pure segment math (byte-share percentage + rank-dimmed
   opacity, zero-byte languages dropped) that `langBar` previously computed
   inline before building each `<span class="langseg">`, spliced the same
   way, with direct unit tests (`lang-bar.test.ts`) instead of only indirect
   DOM-render coverage (`gauge-langbar-tooltips.test.ts`). The DOM-building
   half (`langBar` itself) stays inline, same reason the office map's
   SVG-drawing half did.
   Thirteenth cut: `web/gauge.ts` holds `gaugeSegments`, the fleet card's
   severity-gauge pure segment math (critical-to-low ordering, zero-count
   severities dropped) that `gaugeBar` previously computed inline before
   building each `<span class="seg">`, spliced the same way, with direct
   unit tests (`gauge.test.ts`) instead of only indirect DOM-render coverage
   (`gauge-langbar-tooltips.test.ts`). The DOM-building half (`gaugeBar`
   itself, including its "no open findings" special case) stays inline,
   same reason the language bar's did.
   Fourteenth cut: `web/sparkline.ts` holds `sparkBars`, the per-bar geometry
   (x/y/width/height, floored at 1px tall, plus the series max/total) that
   every metric sparkline (cost, fleet-wide ship form, turns, cache-read
   share, ...) shares via `metricSparkline` — previously computed inline
   before building each `<rect>`, spliced the same way, with direct unit
   tests (`sparkline.test.ts`) instead of only indirect DOM-render coverage
   (`spark-tooltip.test.ts`). The DOM-building loop (`metricSparkline`
   itself — element creation, verdict class, tooltip attributes) stays
   inline, same reason the severity gauge's did. `flightTimelineStrip`'s
   own width-encoded segment math is a distinct shape (proportional-width,
   not equal-width) and stays a follow-on, not this cut.
   Fifteenth cut closes that follow-on: `web/timeline-strip.ts` holds
   `timelineSegments`, the FLIGHT TIMELINE strip's pure width-encoded
   segment math (left-to-right x/width proportional to each firing's share
   of the total duration, floored at a 1ms-equivalent share, `null` when no
   firing has real duration data) that `flightTimelineStrip` previously
   computed inline before building each `<rect>`, spliced the same way,
   with direct unit tests (`timeline-strip.test.ts`) instead of only
   indirect DOM-render coverage (`flight-timeline-strip.test.ts`). The
   DOM-building loop (`flightTimelineStrip` itself — element creation,
   verdict class, tooltip attributes) stays inline, same reason
   `metricSparkline`'s did.
   Sixteenth cut: `web/flight-progress.ts` holds `flightProgressOf`, the fly
   bar's TOTAL flight-level progress bar's pure math (percent complete
   against whichever target the flight was launched with — a total $ budget
   or a fixed firing count — plus an ETA derived from this flight's own
   average landed-firing duration, falling back to the project's full
   history) that `renderTotalProgress` previously computed inline before
   writing the label/`aria-valuenow`/fill width, spliced the same way, with
   direct unit tests (`flight-progress.test.ts`) instead of only indirect
   DOM-render coverage (`flight-total-progress.test.ts`). It takes
   fmtCost/fmtDuration via injection rather than importing them from
   `./format.ts`, the same `actMeta`/`heatmapDays` pattern. The DOM-writing
   half (`renderTotalProgress` itself — element visibility, `aria-*`
   attributes, fill width) stays inline, same reason the flight timeline
   strip's DOM-building loop did.
   Seventeenth cut: `web/phase-rail.ts` holds `phaseCounts`, the fleet card's
   phase-rail pure per-phase activity-count math (ORIENT/DO/GATE/COMMIT
   tallies off each activity's `phase` field) that `phaseRail` previously
   computed inline before building each phase segment button, spliced the
   same way, with direct unit tests (`phase-rail.test.ts`) instead of only
   indirect DOM-render coverage (`phase-rail-tooltips.test.ts`). The
   DOM-building loop (`phaseRail` itself — button creation, `aria-*`
   attributes, the OFFICE_TIPS-derived tooltip text) stays inline, same
   reason the severity gauge's and language bar's did.
   Eighteenth cut: `web/live-progress.ts` holds `liveProgressOf`, the live
   worker card's per-firing progress bar's pure math (the other half of
   web-msnt5ccp-9bx2ix `flight-progress.ts` left open — that one covers the
   fly bar's TOTAL flight-level progress; this one covers the PER-FIRING
   progress on the live worker card) — elapsed time for the still-live
   firing against this project's own average past-firing duration, capped
   at 100% for the ARIA range with a real overrun called out in the label
   instead of clipped, that `liveWorkerCard` previously computed inline
   before writing the label/`aria-valuenow`/fill width, spliced the same
   way, with direct unit tests (`live-progress.test.ts`) instead of only
   indirect DOM-render coverage (`live-worker-progress.test.ts`). It takes
   fmtElapsed/fmtDuration via injection rather than importing them from
   `./format.ts`, the same `flightProgressOf`/`actMeta` pattern. The
   DOM-writing half (`liveWorkerCard` itself — label/bar/fill element
   creation, `aria-*` attributes) stays inline, same reason
   `renderTotalProgress`'s DOM-writing half did.
   Nineteenth cut: `web/task-queue.ts` holds `taskFocusActive`/
   `taskQueueCounts`, the Tasks card's pure open/closed tallies — whether any
   task carries the operator's WIP-limit-1 focus lock, how many tasks are
   workable (`queued`/`in_progress`, feeding the ↑/↓ reorder buttons'
   "position X of Y" tips), and how many done/deferred tasks the paginated
   "Load more done" history currently reveals — that `tasksSection`
   previously computed inline with three hand-rolled loops before building
   each task row, spliced the same way, with direct unit tests
   (`task-queue.test.ts`) instead of only indirect DOM-render coverage
   (`task-history-more-tooltip.test.ts`). The per-row DOM-building loop
   itself (drag handle, reorder/focus buttons, status pill, chips) stays
   inline, same reason the phase rail's did.
   Twentieth cut closed a genuine hand-sync duplication, not just an inline
   block: `shared/live-firing.ts` (not `web/`, since it has a server
   counterpart) gained `liveFiringOf`, the aggregate "what is the live
   firing doing right now" computation — phase/tool/target, the recent-
   action/turn counts, the operator's focus task, the narrator line, and the
   average past-firing duration — that `web/shell.ts`'s own `liveFiring`
   used to hand-retype as a full second copy of `read/fleet.ts`'s
   `liveFiring` (the comment there literally said "Mirrors liveFiring
   (read/fleet.ts)"). `read/fleet.ts`'s `liveFiring` is now a thin wrapper
   calling `liveFiringOf` with its own `firingCallsign`/`narratorLine`/
   `countTurns` imports; `web/shell.ts` splices `liveFiringOf` in via the
   same `.toString()` pattern and wraps it with a small client-only
   `liveFiring(c)` that adds the `probableTask` queue-head fallback
   (client-only — no server consumer reads it, so it stays outside the
   shared core, the same split `flightProgressOf`/`renderTotalProgress`
   uses between pure math and DOM-adjacent glue). `callsignOf`/
   `narratorLineOf`/`countTurnsOf` are caller-supplied rather than imported
   inside `liveFiringOf`, the same `heatmapDays(..., verdictOf)` injection
   pattern already used elsewhere. Direct unit coverage comes from
   `read/fleet.test.ts`'s pre-existing `liveFiring` suite (now exercising
   the shared core through the unchanged wrapper) plus new assertions added
   to `live-firing-parity.test.ts` that render the live worker card through
   `clientJs()` and check it against `liveFiringOf()` computed directly —
   the same shape `file-nodes-parity.test.ts` proved for the fifth cut.
   Twenty-first cut: `web/flight-log-rows.ts` holds `flightLogDisplayRows`,
   the Flight log panel's pure slice-run grouping — walking the newest-first
   flight log and folding runs of 2+ consecutive `completion === 'slice'`
   entries sharing the same open task (`item`) into one expandable group row
   instead of repeating the task's title once per firing (operator:
   "identical epic titles x15 read as duplication") — that `flightLogNode`
   previously computed inline before capping it to the visible-row window and
   building each `<li>`, spliced the same way, with direct unit tests
   (`flight-log-rows.test.ts`) instead of only indirect DOM-render coverage
   (`flightlog-slice-aware.test.ts`). The visible-row cap (`Math.min` against
   `FLIGHTLOG_COMPACT_ROWS`/`openFlightLogAll[c.id]`) and the per-row
   DOM-building loop itself stay inline, same reason the task queue's did.
   Twenty-second cut: `web/phase-rail.ts` gained `phaseDetailRows` alongside
   the existing `phaseCounts` it already sat next to conceptually — the
   phase rail's "look INTO orient/do/gate/commit" detail view's pure
   activity-filtering math (newest-first scan, missing/empty phase bucketed
   as `other`, capped at `PHASE_DETAIL_CAP`) that `phaseDetail` previously
   computed inline with a hand-rolled loop and a bare `20` magic number
   before building each activity row, spliced the same way, with direct
   unit tests added to `phase-rail.test.ts`. Unlike every prior cut in this
   slice, this one had no DOM-render regression coverage at all beforehand —
   not even an indirect one — closing a genuine test gap, not just an
   inline-to-module move. The DOM-building loop itself (heading text, empty
   state, `actRow` calls) stays inline, same reason the task queue's did.
   Twenty-third cut: `web/heatmap.ts` gained `heatCellPos` alongside the
   existing day-bucketing helpers it already sat next to conceptually — the
   contribution heatmap's pure per-cell grid geometry (week/day-of-week index
   turned into an SVG x/y position) that `contributionHeatmap` previously
   computed inline with a hand-rolled `week`/`dow` pair before building each
   `<rect>`, spliced the same way, with direct unit tests added to
   `heatmap-geometry.test.ts`. Like the twenty-second cut, this one had no
   direct test coverage at all beforehand — `contribution-heatmap.test.ts`
   asserted cell classes/tooltips but never the `x`/`y` grid placement itself.
   The DOM-building loop itself (element creation, class/tooltip attributes)
   stays inline, same reason the severity gauge's and phase rail's did.
   Twenty-fourth cut: `web/fly-hint.ts` holds `flyHintText`, the fly bar's
   live HINT sentence math (the operator-facing plan summary a fixed
   firing-count budget or a total-$ budget renders into: "N firing(s) × $X
   each — spends up to $Y total" or "Keeps firing while the remaining $X can
   fund another $Y firing — ≈ up to N firing(s)", plus the per-firing $/turn
   caps clause) that `flyInit`'s `updateFlyHint` previously computed inline
   across two branches, spliced the same way, with direct unit tests
   (`fly-hint.test.ts`). Like the twenty-second and twenty-third cuts, this
   one had no test coverage at all beforehand — there was no flightbar/fly-hint
   DOM test, direct or indirect. The DOM-reading/writing half (`updateFlyHint`
   itself — reading the four input elements' values and `flyMaxTurns`, writing
   `flyHintEl.textContent`) stays inline, same reason `renderTotalProgress`'s
   DOM-writing half did.
   Twenty-fifth cut: `web/task-queue.ts` gained `moveTaskOrder` alongside the
   existing `taskFocusActive`/`taskQueueCounts` it already sat next to
   conceptually — the Tasks card's ↑/↓ reorder buttons' pure move-and-splice
   math (new 0-based position, `null` when the id is missing or the move
   would run off either end) that the `[data-task-move]` click handler
   previously computed inline before POSTing the new order, spliced the same
   way, with direct unit tests added to `task-queue.test.ts`. Like the
   twenty-second through twenty-fourth cuts, this one had no direct test
   coverage at all beforehand — `task-action-button-tooltips.test.ts` only
   asserts the buttons' `data-tip`/`aria-label`, never the reorder outcome.
   The DOM-reading/writing half (`domTaskOrder`, the click handler itself,
   `commitTaskOrder`'s fetch/live-region announce) stays inline, same reason
   the task queue's own nineteenth cut left its per-row DOM-building loop in
   place.
   Twenty-sixth cut: `web/search-history.ts` holds `rememberedHistory`, the
   search/ask bar's pure remembered-query list math (drop any prior
   occurrence of the submitted query, move it to the front, cap the result
   at `SEARCH_HISTORY_MAX` entries) that `rememberSearchQuery` previously
   computed inline with a filter/unshift/length-cap sequence before
   persisting it to `localStorage`, spliced the same way, with direct unit
   tests (`search-history-list.test.ts`) instead of only indirect DOM-render
   coverage (`search-history.test.ts`, which drives the real client bundle
   through submit/ask events and reads `localStorage`/the `#search-history`
   `<datalist>` back out). The `localStorage` read/write and
   `renderSearchHistory`'s `<option>`-building loop stay inline, same reason
   the task queue's own nineteenth cut left its per-row DOM-building loop in
   place.
   Twenty-seventh cut: `web/stat-tiles.ts` holds `doraTileItems`/
   `gateParallelTileItems`, the per-project DORA-for-agents panel's and the
   parallel-gate-savings panel's pure `[value, label, tip]` tile-item math —
   two near-identical hand-typed arrays `doraSection`/`gateParallelSection`
   each built inline before looping to create every `.stat-tile` — spliced
   the same way, with direct unit tests (`stat-tiles.test.ts`) instead of
   only indirect DOM-render coverage (`dora-tiles.test.ts`,
   `gate-parallel-tiles.test.ts`). Both functions take `fmtDuration` via
   injection rather than importing it from `./format.ts`, the same
   `flightProgressOf`/`actMeta` pattern. The DOM-building loop itself
   (element creation, `aria-*` attributes) stays inline in both sections,
   same reason the severity gauge's and phase rail's did; `renderTotals`
   and `renderStatTiles` share the same tuple-array shape but are a
   follow-on, not this cut.
   Twenty-eighth cut closes that follow-on: `web/stat-tiles.ts` gained
   `totalsTileItems`/`statTileItems` alongside the DORA/gate-parallel pair
   it already sat next to conceptually — the fleet-wide header bar's
   raw-count tiles (projects/flying/firings/shipped/cost/open findings/need
   you) and derived-rate tiles (cost-per-shipped/ship rate/streak/avg
   turns/cache-read share) pure `[value, label, tip]` item math that
   `renderTotals`/`renderStatTiles` previously computed inline, spliced the
   same way, with direct unit tests added to `stat-tiles.test.ts` instead of
   only indirect DOM-render coverage (`fleet-stat-tiles.test.ts`). Each
   derived-rate tile also carries a spark built from the fleet's merged
   firing series (`fleetCostSpark`/`fleetFormSpark`/`fleetTurnsSpark`/
   `fleetCacheSpark`) — DOM nodes, so they stay out of the pure tuple and are
   built as a separate array `renderStatTiles` zips back in by index, same
   reason sparks stay out of `sparkBars`. The DOM-building loop itself
   (element creation, `aria-*` attributes) stays inline in both functions,
   same reason the severity gauge's and phase rail's did.
   Twenty-ninth cut: `web/flights.ts` holds `activeFlights`/`flightsSig`, the
   fly bar's per-flight-row pure filtering and diff-signature math — which
   folders the registry has something live to report for (running/paused/
   queued), and a signature that changes only on an enter/leave or a
   running/paused/queued state crossing — that `renderFlights` previously
   computed inline with two hand-rolled loops before deciding whether to
   rebuild the row list, spliced the same way, with direct unit tests
   (`flights.test.ts`) instead of only indirect DOM-render coverage
   (`multi-flight-cards.test.ts`). Like the twenty-second through
   twenty-fourth/twenty-fifth cuts, this one had no direct test coverage at
   all beforehand. The per-row DOM-building loop itself (`flightRow`,
   `renderFlights`'s child-list rebuild) stays inline, same reason the task
   queue's and flight log's did.
   Thirtieth cut closed a hand-sync duplication the prior cuts had already
   fixed the *module* for but not every call site: `firingTimelineSection`
   (per-firing trace rows) and `flightLogNode` (flight log rows) each
   hand-rolled their own `{id: task}` lookup loop inline instead of calling
   `taskMap` — the exact helper `web/flight-metrics.ts` already exports and
   `metricSparkline`/`costSparkline` already call, spliced into the same
   `fleetJs()` scope. Both call sites now call `taskMap(c.tasks)` directly;
   no new module needed since the shared helper already existed — this was a
   missed-callsite fix, not a fresh extraction. Regression coverage comes
   from the existing `firing-timeline-tooltips.test.ts` and flight-log tests
   that render both sections through the real client bundle.
   Thirty-first cut: `web/flight-progress.ts` gained `sessionFlightDataFor`
   alongside the existing `flightProgressOf` it already sat next to
   conceptually — the fly bar's TOTAL flight-level progress bar's other
   upstream input, the flying project's own landed-this-session firings
   (filtered by `at >= s.startedAt`) plus the historical average duration
   fallback (`averageFiringDurationMs`) — that `renderTotalProgress`
   previously computed inline with a hand-rolled project-status scan and a
   filter loop before calling `flightProgressOf` itself, spliced the same
   way, with direct unit tests added to `flight-progress.test.ts` instead of
   only indirect DOM-render coverage (`flight-total-progress.test.ts`). It
   takes `averageFiringDurationMs` via injection rather than importing it
   from `shared/live-firing.ts`, the same `flightProgressOf`/`actMeta`
   pattern. The DOM-writing half (`renderTotalProgress` itself) stays
   inline, same reason it did before.
   Thirty-second cut: `web/search-history.ts` gained `searchProjectsSig`
   alongside the existing `rememberedHistory` it already sat next to
   conceptually — the search bar's project `<select>` diff-signature math
   (id + display name/slug per project, joined) that `syncSearchProjects`
   previously computed inline before deciding whether to rebuild the
   `<option>` list, spliced the same way, with direct unit tests added to
   `search-history-list.test.ts`. Like the twenty-second through
   twenty-fifth/twenty-ninth cuts, this one had no test coverage at all
   beforehand — no test asserted that an unchanged project set leaves the
   `<select>` untouched (preserving a mid-typed selection) versus a changed
   set rebuilding it. The DOM-rebuilding half (`syncSearchProjects` itself
   — `<option>` creation, restoring `current`) stays inline, same reason
   the task queue's and flight log's per-row DOM-building loops did.
   Thirty-third cut: `web/task-queue.ts` gained `probableTaskTitle` alongside
   the existing `taskFocusActive`/`taskQueueCounts`/`moveTaskOrder` it
   already sat next to conceptually — the live worker card's honest best
   guess at "what this firing is probably working" (the title of the first
   `queued`/`in_progress` task, i.e. the queue head) when no task carries an
   explicit focus lock, that the client's `liveFiring(c)` wrapper previously
   computed inline with a hand-rolled `for` loop before handing the result to
   `liveWorkerCard`/`officeMapSection`, spliced the same way, with direct
   unit tests added to `task-queue.test.ts` instead of only indirect
   DOM-render coverage (`worker-task.test.ts`, `live-firing-parity.test.ts`).
   `liveFiring` itself stays a thin client-only wrapper around
   `liveFiringOf` (the twentieth cut's shared core) — same split
   `flightProgressOf`/`renderTotalProgress` uses between pure math and
   DOM-adjacent glue.
   Thirty-fourth cut: `web/flights.ts` gained `typedFolderFlightStatus`
   alongside the existing `activeFlights`/`flightsSig` it already sat next
   to conceptually — the fly bar's per-poll reduction of the registry's full
   flight list against the folder currently typed into the launch form
   (whether IT is running/queued, so the Go button and folder/mode/budget
   inputs lock only for that folder and never for some other flying folder,
   plus which entries are running regardless of folder, so the total-
   progress bar can tell the one-flight-running case apart from zero/many)
   that `flyInit`'s `paint(s)` previously computed inline with a hand-rolled
   `for` loop before writing the Go button state and picking
   `renderTotalProgress`'s argument, spliced the same way, with direct unit
   tests added to `flights.test.ts` instead of only indirect DOM-render
   coverage (`multi-flight-cards.test.ts`). The DOM-writing half (`paint`
   itself — Go/Stop/Pause button state, disabling the form inputs,
   `renderTotalProgress`'s own attribute writes) stays inline, same reason
   `renderTotalProgress`'s own DOM-writing half did.
   Thirty-fifth cut: `web/stat-tiles.ts` gained `cardStatItems`/
   `metricsStatItems` alongside the DORA/gate-parallel/totals/stat-tile pairs
   it already sat next to conceptually — every project card's `.card-stats`
   row's pure value/label/tip tile math (firings/shipped/ship rate, plus a
   conditional "recent form" tile once the project has 5+ firings of
   history) and the project detail page's Metrics panel's own `.card-stats`
   row math (total cost/tokens/ship rate) that `cardStats`/`metricsSection`
   previously computed inline before looping to build each `.stat`, spliced
   the same way, with direct unit tests added to `stat-tiles.test.ts`
   instead of only indirect DOM-render coverage (`stat-chip-tooltips.test.ts`).
   `metricsStatItems` takes `fmtCost`/`fmtTokens` via injection rather than
   importing them from `./format.ts`, the same `doraTileItems`/`actMeta`
   pattern. The DOM-building loop itself (`stat()` element creation) stays
   inline in both functions, same reason the DORA/gate-parallel panels' did.
   Thirty-sixth cut: `web/fleet-view.ts` gained `fleetStateSig`, the fleet
   grid's own dirty-check diff signature (hashing `totals`/`projects`/`empty`,
   `generatedAt` deliberately excluded since the live stream ticks every
   ~1.5s even when nothing moved) that `renderFleet` previously computed
   inline as a bare `JSON.stringify({...})` before deciding whether to skip
   the rebuild, spliced the same way, with direct unit tests
   (`fleet-view.test.ts`) instead of only indirect DOM-render coverage. This
   is the same diff-signature pattern `flights.ts`'s `flightsSig` and
   `search-history.ts`'s `searchProjectsSig` proved, applied to the fleet
   grid — one of the "remaining panels" the thirty-fifth cut's note flagged
   as still open; the panel's own DOM-building/patch logic (`renderFleet`
   itself) stays inline, same reason it did before.
   Thirty-seventh cut: `web/ask-stream.ts` holds `splitSseFrames`/
   `applyAskStreamFrame`, the Ask feature's pure SSE frame-decode math —
   splitting an ever-growing decoded buffer into complete `\n\n`-terminated
   frames plus the trailing partial one, and parsing a single `data: {...}`
   frame against the answer accumulated so far into the next accumulated
   answer (or `null` for a non-`data:` line, unparsable JSON, or a payload
   with neither `delta` nor `done`) — that `pumpAskStream`'s nested
   `handleFrame`/`pump` previously computed inline before calling
   `renderAnswer`, spliced the same way, with direct unit tests
   (`ask-stream.test.ts`) instead of only indirect DOM-render coverage
   (`ask-markdown.test.ts`, `ask-sources-tooltip.test.ts` — neither of which
   ever exercised the malformed-frame-is-ignored paths or a buffer split
   across a chunk boundary). `pumpAskStream` itself stays inline — it owns
   the `reader`/`decoder` I/O, the `renderAnswer` DOM call, and the
   recursive `pump()` promise chain — same reason `renderTotalProgress`'s
   DOM-writing half did.
   Thirty-eighth cut: `web/flight-log-rows.ts` gained `flightDetailLine`
   alongside the existing `flightLogDisplayRows` it already sat next to
   conceptually — the Flight log panel's expanded-row detail sentence (
   verdict, kind, sha, turns, cost, plus a verdict-specific caveat clause
   explaining WHY a reverted/checkpointed/turn-capped/errored/unverified
   firing ended the way it did) that `flightLogNode` previously computed
   inline with five hand-rolled branches before writing it to the open row's
   `.textContent`, spliced the same way, with direct unit tests added to
   `flight-log-rows.test.ts` instead of only indirect DOM-render coverage
   (`project-page.test.ts` covered the base case and the unverified+
   failedCheck branch; `flightlog-row-tooltips.test.ts` never asserted the
   joined text at all). It takes `fmtCost` via injection rather than
   importing it from `./format.ts`, the same `flightProgressOf`/`actMeta`
   pattern. The reverted+failedCheck, checkpointed, turn-capped, errored, and
   unverified-without-failedCheck branches had no test coverage at all
   beforehand — closing a genuine test gap, not just an inline-to-module
   move. The DOM-writing half (element creation, `aria-*` attributes) stays
   inline, same reason the flight timeline strip's and severity gauge's did.
   Thirty-ninth cut: `web/flight-log-rows.ts` gained `flightGroupSummary`
   alongside the existing `flightLogDisplayRows`/`flightDetailLine` it
   already sat next to conceptually — the pure summary math behind a
   slice-run group row (task-title resolution with a fallback to the raw
   task id, the total spend summed across every slice in the run, and the
   synthetic `groupId` the flight-row click delegation opens/closes by)
   that `flightGroupRow` previously computed inline before building any DOM,
   spliced the same way, with direct unit tests added to
   `flight-log-rows.test.ts` instead of only indirect DOM-render coverage
   (`flightlog-slice-aware.test.ts`, which only ever asserted the rendered
   `.flight-item`/`.flight-cost` text, never the summary values themselves —
   a genuine test gap, same shape as the twenty-second through twenty-fourth
   cuts). It takes `verdictOf` via injection rather than importing
   `flightVerdictOf` from `web/flight-metrics.ts`, the same
   `heatmapDays`/`actMeta` pattern. The per-member DOM-building loop and the
   group row's own element creation stay inline, same reason the task
   queue's and flight log's own per-row loops did.
   Fortieth cut: `web/flights.ts` gained `flightRowStatusText` alongside the
   existing `activeFlights`/`flightsSig`/`typedFolderFlightStatus` it already
   sat next to conceptually — the fly bar's per-folder status sentence for one
   live/paused/queued flight row (running, budget-mode-aware, with the
   fleet-watchdog suffix RING-0 FLEET WATCHDOG (web-msqhh7kh-ptjodv) needs;
   queued; or paused) that `flightRow` previously computed inline as a
   three-way string-building branch before writing it to the row's
   `.fly-flight-status` span, spliced the same way, with direct unit tests
   added to `flights.test.ts` instead of only indirect DOM-render coverage
   (`multi-flight-cards.test.ts`, `flight-total-progress.test.ts` — neither
   ever asserted the queued/paused text or the fleet-watchdog suffix in
   isolation). The Pause/Stop/Cancel/Resume button-building half of
   `flightRow` stays inline, same reason the task queue's and flight log's
   per-row DOM-building loops did.
   Forty-first cut: `web/release-panel.ts` holds `releaseExecuteResult`, the
   RELEASE panel's EXECUTE result-message math (the "✓ Released — <details>"
   success sentence, its attestation-failed and milestone-tag notes, and the
   "✗ <details or error>" failure sentence) that the `[data-release-execute]`
   click handler previously computed inline across two branches before
   writing `resultEl.className`/`resultEl.textContent`, spliced the same way,
   with direct unit tests (`release-panel-result.test.ts`) instead of only
   indirect DOM-render coverage (`release-panel.test.ts`'s "RELEASE EXECUTE"
   suite, which already exercised every branch through the real client
   bundle). The DOM-reading/writing half (the click handler itself — confirm
   dialog, disabled/text bookkeeping, the fetch call, `refresh()`) stays
   inline, same reason `updateFlyHint`'s did.
   Forty-second cut: `web/live-progress.ts` gained `liveWorkerCountLabel`/
   `liveWorkerTurnLabel` alongside the existing `liveProgressOf` it already
   sat next to conceptually — the live worker card's "N recent action(s)
   seen" and "elapsed · ~N turn(s) so far" line math that `liveWorkerCard`
   previously computed inline across two hand-rolled pluralization branches
   before writing them to the card's `.live-worker-count`/`.live-worker-turns`
   elements, spliced the same way, with direct unit tests
   (`live-worker-labels.test.ts`) instead of only indirect DOM-render
   coverage (`live-worker-count-tooltip.test.ts`, `live-worker-turns.test.ts`).
   `liveWorkerTurnLabel` takes `fmtElapsed` via injection rather than
   importing it from `./format.ts`, the same `liveProgressOf`/`actMeta`
   pattern. The DOM-writing half (`liveWorkerCard` itself — element creation,
   `data-tip`/`aria-label` attributes) stays inline, same reason
   `renderTotalProgress`'s DOM-writing half did.
   Forty-third cut: `web/landing-panel.ts` holds `landingExecuteResult`, the
   LANDING panel's EXECUTE result-message math (the "✓ Landed — <details>"
   success sentence and the "✗ <details or error>" failure sentence) that
   the `[data-land-execute]` click handler previously computed inline across
   two branches before writing `resultEl.className`/`resultEl.textContent`,
   spliced the same way, with direct unit tests
   (`landing-panel-result.test.ts`) — the release panel's own EXECUTE result
   (forty-first cut) already had this treatment, and the landing panel's was
   its exact structural counterpart, just simpler (no attestation/milestone
   sub-results). `landing-execute-restart.test.ts` only ever asserted the
   bare success text through the real client bundle; the failure branch
   (details, error fallback, generic "landing failed." message) had no test
   coverage at all beforehand — closing a genuine test gap, same shape as
   the twenty-second through twenty-fourth cuts. The DOM-reading/writing
   half (the click handler itself — confirm dialog, disabled/text
   bookkeeping, the fetch call, the self-restart affordance, `refresh()`)
   stays inline, same reason `releaseExecuteResult`'s click handler did.
   Forty-fourth cut: `web/connect-panel.ts` holds `connectModeMeta`, the
   CONNECT popover's per-auth-mode copy math (whether the credential field
   is shown, plus its label/placeholder/hint for `api-key`/`oauth-token`/
   `subscription`) that `connectInit`'s local `meta(mode)` previously
   computed inline across three branches before `applyMode` read it to write
   `secretEl`/`secretLabel`/`hintEl`, spliced the same way (into `connectJs()`
   rather than `fleetJs()` — same treatment `fly-hint.ts`/`flights.ts` got
   inside `flyJs()`), with direct unit tests (`connect-panel.test.ts`)
   instead of no coverage at all — `connect-body-m3-surface.test.ts` only
   ever asserted the popover's CSS, never the per-mode field state, closing a
   genuine test gap, same shape as the twenty-second through twenty-fourth
   cuts. The DOM-reading/writing half (`applyMode`/`render`/`load`, the
   click/submit handlers) stays inline, same reason `updateFlyHint`'s did.
   Forty-fifth cut closed a genuine hand-sync duplication, not just an
   inline-to-module move (the same shape as the twentieth/fifth cuts):
   `shared/backlog-match.ts` (not `web/`, since it has a server counterpart)
   gained `backlogMatchText`, the `≈ <sha> "<subject>"[ matched via changed
   files, not subject text]` fragment that `fly.ts`'s end-of-flight
   reconciliation console line and `renderBacklogBody`'s DETECTED BACKLOG
   panel each hand-retyped independently — `fly.ts` now calls it directly,
   and `web/shell.ts` splices its real compiled source in via `.toString()`.
   The panel's own client-only tooltip copy (the confirm button's tip, and
   the chip's "too weak a signal"/"never applied automatically" sentences)
   moved into a new `web/backlog-panel.ts` module as `backlogCandidateMeta`,
   taking `backlogMatchText` via injection rather than importing it — the
   same `heatmapDays(..., verdictOf)` pattern — with direct unit tests
   (`backlog-match.test.ts`, `backlog-panel-meta.test.ts`) instead of only
   indirect DOM-render coverage (`backlog-panel.test.ts`, which asserted the
   chip's visible text/button presence but never its `data-tip`/`aria-label`
   sentences at all — a genuine test gap, same shape as the twenty-second
   through twenty-fourth cuts — now closed there too). The per-candidate
   `<li>`-building loop itself stays inline, same reason the task queue's and
   flight log's own per-row loops did.
   Forty-sixth cut: `web/task-queue.ts` gained `taskBurnLabel`/`taskRunawayTip`
   alongside the existing `taskFocusActive`/`taskQueueCounts`/`moveTaskOrder`/
   `probableTaskTitle` it already sat next to conceptually — the Tasks card's
   TASK BURN chip's text+tip (pluralized "slice(s)"/"firing(s) has/have",
   wall-time clause only when `wallMs > 0`) and the TASK ECONOMICS runaway
   chip's tooltip sentence that `tasksSection` previously computed inline
   across two branches before building each chip, spliced the same way, with
   direct unit tests added to `task-queue.test.ts` instead of only indirect
   DOM-render coverage (`task-burn-chip.test.ts`, `task-runaway-chip.test.ts`).
   Both take `fmtCost`/`fmtDuration` via injection rather than importing them
   from `./format.ts`, the same `flightProgressOf`/`actMeta` pattern. Like the
   twenty-second through twenty-fourth cuts, part of this had no coverage at
   all beforehand: `task-runaway-chip.test.ts` only ever exercised
   `firingCount: 14`, never `firingCount: 1` — the new test locks in the
   existing "1 firings" (no singular branch) sentence exactly as the source
   already wrote it, a pre-existing grammar quirk this zero-behavior-change
   cut intentionally leaves alone. The chip-building half (`tipChip` calls)
   stays inline, same reason the severity gauge's and phase rail's did.
   Forty-seventh cut: `web/gauge.ts` gained `cardGaugeLabels` alongside the
   existing `gaugeSegments` it already sat next to conceptually — the fleet
   card's gauge-label row's pure text math (the pluralized "N open
   finding(s)" count and the "last activity" timestamp, falling back to "no
   activity yet") that `cardGauge` previously computed inline across two
   statements before building each `.gauge-label span`, spliced the same way,
   with direct unit tests added to `gauge.test.ts` instead of only indirect
   DOM-render coverage (`gauge-label-tooltips.test.ts`, which only ever
   exercised the plural `openFindings: 3` branch — the singular "1 open
   finding" branch and the `lastActivityAt` falsy → "no activity yet"
   fallback had no test coverage at all beforehand, a genuine test gap the
   same shape as the twenty-second through twenty-fourth cuts closed
   elsewhere). It takes `fmtAgo` via injection rather than importing it from
   `./format.ts`, the same `flightProgressOf`/`actMeta` pattern. The
   DOM-building half (`cardGauge` itself — element creation, `data-tip`/
   `aria-label` attributes) stays inline, same reason the severity gauge's
   own `gaugeBar` did.
   Forty-eighth cut: `web/activity-log.ts` gained `activityLiveLabel`
   alongside the existing `groupByFiring`/`firingLogEntry`/`actMeta` it
   already sat next to conceptually — the activity feed's own heading text
   ("● live activity" while a firing is actually in progress, or "last
   flight — debrief" once nothing is live, plus the `<h4>` class and
   hover/focus tip that go with each) that `activitySection` previously
   computed inline across two ternary statements before building the
   `<h4>`, spliced the same way, with direct unit tests added to
   `activity-log.test.ts`. Unlike most cuts in this slice,
   `act-label-tooltip.test.ts` already exercised both the live and idle
   branches — text, tip, and aria-label — through the real client bundle,
   so this cut closes no coverage gap on its own; it only adds the direct
   unit coverage the module's siblings already carry, the same "no gap, but
   still worth the direct coverage" shape the thirtieth/forty-first cuts'
   already-covered branches left in place. It takes `isLive` as a plain
   boolean rather than reading `liveFiring(c)` itself, the same
   `heatmapDays(..., verdictOf)`-style injection every shared/web module in
   this epic uses to stay import-free. The DOM-building half
   (`activitySection` itself — element creation, `phaseRail`/`phaseDetail`/
   `flightMap`/per-row activity list) stays inline, same reason the severity
   gauge's and phase rail's did.
   Forty-ninth cut: `web/stat-tiles.ts` gained `roundSinceLabel`/
   `roundStatItems` alongside the DORA/gate-parallel/totals/stat-tile/card/
   metrics tile pairs it already sat next to conceptually — the CURRENT
   ROUND panel's "since &lt;tag&gt;" chip text/aria-label pair and its
   firings/shipped/cost/ship-rate chip text/tip/aria-label triples (a
   `tipChip`-argument-order tuple, `RoundStatItem`, distinct from the other
   functions' `stat()`-argument-order `StatTileItem` since this panel builds
   `tipChip`s directly) that `renderRoundBody` previously computed inline
   across a tagName branch and a hand-rolled `tipChip` sequence, spliced the
   same way, with direct unit tests added to `stat-tiles.test.ts` instead of
   only indirect DOM-render coverage (`round-panel.test.ts`). Both take
   `fmtAgo`/`fmtCost` via injection rather than importing them from
   `./format.ts`, the same `doraTileItems`/`actMeta` pattern. The
   DOM-building half (`renderRoundBody` itself — element creation, the
   no-tag/fetch-failure fallback messages) stays inline, same reason the
   DORA/gate-parallel panels' did.
   Fiftieth cut: `web/flight-map.ts` holds `fnodeTip`, the "files in flight"
   map's per-node tooltip/aria-label text math (path, pluralized touch count,
   most-recent tool) that `flightMap` previously computed inline as a bare
   string concatenation before writing it to each `<li>`'s `data-tip`/
   `aria-label`, spliced the same way, with direct unit tests
   (`flight-map.test.ts`) instead of only indirect DOM-render coverage
   (`flightmap-tooltips.test.ts`). Unlike most cuts in this slice, it has no
   server counterpart even though its input (`FileNode`) comes from
   `shared/file-nodes.ts` — the tooltip text itself is client-only, so it
   lives in `web/` rather than `shared/`, same reason `flight-metrics.ts`
   does. The DOM-building loop itself (`flightMap` — element creation, the
   `fnode-count` badge) stays inline, same reason the task queue's and flight
   log's own per-row loops did.
   Fifty-first cut closed a genuine hand-sync duplication, not just an
   inline-to-module move (the same shape as the twentieth/forty-fifth cuts):
   `web/flight-metrics.ts` gained `flightBarMeta` alongside the existing
   `flightVerdictOf`/`taskMap`/`taskBurnOf`/`fleetCacheShareOf` it already sat
   next to conceptually — the per-firing spark/timeline bar's tooltip +
   aria-label metadata (verdict CSS class, truncated sha, resolved title, the
   "reverted — &lt;failedCheck&gt;" caveat, and the pluralized turns label)
   that `metricSparkline` and `flightTimelineStrip` each hand-retyped as an
   identical ten-line block before writing `class`/`aria-label`/`data-tip-*`
   attributes on every `<rect>`, spliced the same way, with direct unit
   tests added to `flight-metrics.test.ts` instead of only indirect
   DOM-render coverage (`spark-tooltip.test.ts`,
   `flight-timeline-strip.test.ts`, neither of which caught that the two
   blocks could silently drift apart from each other — the exact drift bug
   class `flightVerdictOf`/`flightHeadlineOf`'s own doc comments already
   warn about, here fixed pre-emptively rather than after an operator-visible
   bug). It takes `headlineOf` via injection rather than importing
   `flightHeadlineOf` from `shared/flight-summary.ts`, the same
   `heatmapDays`/`actMeta` pattern; `flightVerdictOf` itself is called
   directly since it already lives in the same module. `valueLabel` is the
   caller's own already-formatted value string (`fmtValue(f)` in
   `metricSparkline`, `fmtCost(f.cost || 0)` in `flightTimelineStrip`) rather
   than an injected formatter, since each caller already owns how it formats
   its own value. The DOM-building loop itself (element creation, `x`/`y`/
   `width`/`height`, `svg.appendChild`, `flightTimelineStrip`'s `pid`-
   conditional `data-flight-row`/`data-flight-pid` block) stays inline in
   both functions, same reason the severity gauge's and phase rail's did.
   Fifty-second cut: `web/connect-panel.ts` gained `connectStatusMeta`
   alongside the existing `connectModeMeta` it already sat next to
   conceptually — the CONNECT popover's live status display math (the
   status-line text/CSS class, connection-dot class, and toggle-button
   label, keyed off CLI-missing / connected / not-logged-in / no-credential
   branching) that `connectInit`'s nested `render(s)` previously computed
   inline across four DOM-writing statements, spliced the same way, with
   direct unit tests added to `connect-panel.test.ts` instead of no
   coverage at all — no test, direct or indirect, ever exercised this
   branching, the `connect-ok`/`connect-bad` class selection, or the
   `!s || typeof s.mode !== 'string'` fallback before this, a true
   zero-coverage gap the same shape as the twenty-second through
   twenty-fourth cuts. `statusClass` is `undefined` (not empty-string) in
   the fallback case specifically so `render(s)` can skip writing
   `statusEl.className` there, preserving the original inline code's
   behavior of leaving that class untouched on a malformed payload rather
   than overwriting it — a zero-behavior-change constraint the extraction
   had to thread through the return shape itself. The DOM-writing half
   (`render(s)` itself — element property assignment, the early return that
   skips `modeEl`/`applyMode`) stays inline, same reason the release panel's
   and landing panel's EXECUTE-result click handlers did.
   Fifty-third cut: `web/landing-panel.ts` gained `landingDiffstatItems`/
   `landingCommitFilesMeta` alongside the existing `landingExecuteResult` it
   already sat next to conceptually — the post-flight LANDING card's
   diffstat line's three `tipChip` text/tip/aria-label(/class) tuples
   (pluralized "N file(s) changed", "+N insertions", "-N deletions") and
   each commit row's files span's pluralized label + hover/focus tip (first
   8 file paths joined by ", " with a trailing "…" once truncated, or "No
   file list for this commit" when the commit carries none) that
   `renderLandingBody` previously computed inline before appending each chip
   and writing each `<span>`'s textContent/`data-tip`, spliced the same way,
   with direct unit tests (`landing-panel-diffstat.test.ts`) instead of only
   indirect DOM-render coverage (`landing-panel.test.ts`, which only ever
   exercised the plural/multi-file branches — the singular "1 file"/
   "1 insertion" branches, the >8-files truncation, and the empty-file-list
   fallback had no coverage at all before this, a genuine test gap the same
   shape as the twenty-second through twenty-fourth cuts closed elsewhere).
   Neither function needs the injection pattern — both are plain string/
   array math with no `fmtCost`/`fmtAgo`/etc. collaborator. The DOM-building
   half (`renderLandingBody` itself — element creation, the branch/base/
   arrow line, `tabindex`/`data-tip`/`aria-label` attributes, the EXECUTE
   button) stays inline, same reason the severity gauge's and phase rail's
   did.
   Fifty-fourth cut: `web/stat-tiles.ts` gained `liveWorkerChipMeta` alongside
   the existing `liveWorkerItems` it already sat next to conceptually — the
   fleet-wide "flying now" rollup's per-chip text/tip/aria-label triple
   (project name + optional model, a phase-tip lookup with a "not yet
   classified" fallback, and the pluralized-model aria sentence) that
   `renderLiveWorkers` previously computed inline across four statements
   before calling `tipChip`, spliced the same way, with direct unit tests
   added to `stat-tiles.test.ts` instead of only indirect DOM-render coverage
   (`live-workers-rollup.test.ts`, which only ever asserted `data-tip` was
   truthy — never its actual text — and never exercised the "phase not yet
   classified" fallback at all, a genuine test gap the same shape as the
   twenty-second through twenty-fourth cuts). It takes `officeTips` via
   injection rather than importing `OFFICE_TIPS` from `web/office-map.ts`,
   the same `doraTileItems`/`actMeta` pattern. The DOM-building half
   (`renderLiveWorkers` itself — element creation, `tipChip` call) stays
   inline, same reason the severity gauge's and phase rail's did.
   Fifty-fifth cut: `web/flight-log-rows.ts` gained `sliceChipMeta` alongside
   the existing `flightLogDisplayRows`/`flightDetailLine`/`flightGroupSummary`
   it already sat next to conceptually — the isolated slice firing's "slice of
   &lt;task&gt;" chip text/tip/aria-label triple (the task title truncated at
   40 chars in the visible label, kept whole in both the hover tip and the
   aria-label) that `flightLogNode` previously computed inline as a single
   ternary expression before calling `tipChip`, spliced the same way, with
   direct unit tests added to `flight-log-rows.test.ts` (including the 40/41-
   char truncation boundary) instead of only indirect DOM-render coverage
   (`flightlog-slice-aware.test.ts`, which asserted the chip's rendered text
   for one short title but never its tip/aria-label, and never a title long
   enough to truncate — a genuine test gap, same shape as the twenty-second
   through twenty-fourth cuts). The 40-char cutoff stays a bare literal
   (mirrors `landingCommitFilesMeta`'s bare 8-file cutoff) rather than a named
   module-level constant — a constant declared outside the function body
   doesn't survive the `.toString()` splice into `fleetJs()` (only the
   function's own source text gets embedded), the same constraint that made
   `phaseDetailRows`' `PHASE_DETAIL_CAP` a re-declared `var` plus an explicit
   call-site argument instead of a captured outer reference. The per-row
   DOM-building loop itself (`flightLogNode`'s lookup of `sliceTask`/
   `sliceTaskTitle` and the `tipChip` call) stays inline, same reason the task
   queue's and flight log's own per-row loops did.
   Fifty-sixth cut: `web/flight-metrics.ts` gained `firingTimelineRowMeta`
   alongside the existing `flightVerdictOf`/`taskMap`/`taskBurnOf`/
   `fleetCacheShareOf`/`flightBarMeta` it already sat next to conceptually —
   the project page's "Per-firing trace" row's text/tip/aria-label math (the
   headline resolved via `flightHeadlineOf` or a firingId-derived fallback,
   truncated to 64 chars for display while the tip/aria stay full-length; the
   callsign chip's tip/aria, skipped for the "unattributed" sentinel; the
   verdict chip's class/tip/aria, `null` when no flight-log entry matches;
   the pluralized event count; and the "started" relative-time aria-label)
   that `firingTimelineSection` previously computed inline across five
   statements before building each row, spliced the same way, with direct
   unit tests added to `flight-metrics.test.ts` instead of only indirect
   DOM-render coverage (`firing-timeline-tooltips.test.ts`, which never
   exercised the 64-char truncation boundary, the no-flight-log-entry
   fallback path, or the "unattributed" sentinel's callsign-skip — a genuine
   test gap, same shape as the twenty-second through twenty-fourth cuts). It
   takes `flightHeadlineOf`/`fmtAgo` via injection rather than importing them
   from `shared/flight-summary.ts`/`./format.ts`, the same `flightBarMeta`
   pattern this module's own sibling already uses; `flightVerdictOf` itself
   is called directly since it already lives in this same module. The
   DOM-building loop itself (row/button creation, the open-firing detail
   `<ul>`) stays inline, same reason the severity gauge's and phase rail's
   did.
   Fifty-seventh cut: `web/flight-log-rows.ts` gained `flightLogRowMeta`
   alongside the existing `flightLogDisplayRows`/`flightDetailLine`/
   `flightGroupSummary`/`sliceChipMeta` it already sat next to conceptually —
   the fleet grid card's per-firing flight-log row's verdict-dot tip/aria,
   headline chip (truncated to 64 chars for display, full-length tip/aria),
   and commit-sha chip text/tip/aria-label triple. Unlike every prior cut,
   this wasn't computed inline in only one place: `flightLogNode`'s own rows
   and `flightGroupRow`'s per-member rows each built the identical math by
   hand, a genuine duplication (not just an untested inline computation) the
   same shape as the twenty-second through twenty-fourth cuts' test-gap
   pattern — both call sites now share the one function, with direct unit
   tests added to `flight-log-rows.test.ts` covering the truncation boundary
   and the no-sha case. The DOM-building itself (element creation, the
   cost/ago chips, the slice/autoformat chips, the expanded-row detail panel)
   stays inline at both call sites, same reason the severity gauge's and
   phase rail's did.
   Fifty-eighth cut: `web/task-queue.ts` gained `taskTitleTip`/`taskMoveTip`
   alongside the existing `taskFocusActive`/`taskQueueCounts`/`moveTaskOrder`/
   `probableTaskTitle`/`taskBurnLabel`/`taskRunawayTip` it already sat next to
   conceptually — the task row's title span's "Added &lt;ago&gt;[ · operator
   priority N]" tip+aria-label pair, and the ↑/↓ reorder buttons' "Move
   "&lt;title&gt;" earlier/later (position X of Y)" tip (shared as both
   `data-tip` and `aria-label`) — that `tasksSection` previously computed
   inline across three statements before writing them to the title span and
   each reorder button, spliced the same way, with direct unit tests added to
   `task-queue.test.ts` instead of only indirect DOM-render coverage
   (`task-title-tooltip.test.ts`, which already exercised both the
   with-priority and without-priority branches of the title tip;
   `task-action-button-tooltips.test.ts`, which only ever asserted the
   reorder buttons' `data-tip` was truthy and matched their own
   `aria-label` — never the "position X of Y" text itself, a genuine test
   gap the same shape as the twenty-second through twenty-fourth cuts). It
   takes `fmtAgo` via injection rather than importing it from `./format.ts`,
   the same `taskBurnLabel`/`taskRunawayTip` pattern. The DOM-writing half
   (element creation, `data-task-move`/`type` attributes) stays inline, same
   reason the severity gauge's and phase rail's did.
   Fifty-ninth cut: `web/flight-summary-panel.ts` holds `flightSummaryLineMeta`,
   the project page's "Recently shipped" flight summary line's text/tip/
   aria-label math (headline, cost, an optional closed-task chip — `null`
   fields when the flight closed no task — and the relative timestamp) that
   `flightSummarySection` previously computed inline across four statements
   before building each `<span>`, spliced the same way, with direct unit
   tests (`flight-summary-panel.test.ts`) instead of only indirect DOM-render
   coverage (`flight-summary-tooltips.test.ts`). Its input is the
   `FlightSummary` shape `shared/flight-summary.ts`'s `finishedFlightSummaries`
   already produces, but the tooltip text itself is client-only, so it lives
   in `web/` rather than `shared/`, same reason `flight-map.ts`'s `fnodeTip`
   does. It takes `fmtCost`/`fmtAgo` via injection rather than importing them
   from `./format.ts`, the same `flightBarMeta`/`actMeta` pattern. The
   DOM-building loop itself (element creation, `data-tip`/`aria-label`
   attributes) stays inline, same reason the flight log's and task queue's
   own per-row loops did.
   Sixtieth cut: `web/card-facts.ts` holds `factsMeta`, the fleet card's
   "Details" panel facts-list Gate/Backup rows' text/tip/aria-label math
   (each row's value text, a static explanatory tip, and an aria-label that
   interpolates the value — `null` when the project carries no such fact)
   that `factsNode` previously computed inline across two conditional blocks
   before appending each `<dd>`, spliced the same way, with direct unit
   tests (`card-facts.test.ts`) covering both facts present and each absent
   individually, instead of only indirect DOM-render coverage
   (`detail-facts-tooltips.test.ts`, which only ever exercised both facts
   present together, never either one absent — a genuine test gap the same
   shape as the twenty-second through twenty-fourth cuts). No injected
   collaborator needed — unlike most of this epic's cuts, both rows are
   pure string math with no `fmtCost`/`fmtAgo`-style formatter dependency.
   Distinct from `detail-sections.ts`, whose `detailSectionSigs` already had
   a `facts` field but only for that subsection's diff signature, never its
   rendered text. The DOM-building half (`factsNode` itself — element
   creation, the childNodes-length empty check) stays inline, same reason
   the severity gauge's and phase rail's did.
   Sixty-first cut: `web/stat-tiles.ts` gained `cardMetaItems` alongside the
   DORA/gate-parallel/totals/stat-tile/card/metrics/round tile pairs it
   already sat next to conceptually — the fleet card's `.card-meta` row's
   pure text/tip/aria-label triples for the primary-language, file-count,
   and total-size chips that `cardMeta` previously computed inline across
   three `tipChip` calls, spliced the same way, with direct unit tests added
   to `stat-tiles.test.ts` instead of only indirect DOM-render coverage
   (`stat-chip-tooltips.test.ts`, which only ever asserted the three
   `.card-meta .chip` elements carried a truthy `data-tip`/`aria-label` —
   never their actual text, a genuine test gap the same shape as the
   twenty-second through twenty-fourth cuts). It reuses `roundStatItems`'
   `RoundStatItem` tipChip-argument-order type rather than declaring a new
   one, since the shape is identical. It takes `fmtBytes` via injection
   rather than importing it from `./format.ts`, the same
   `doraTileItems`/`actMeta` pattern. The DOM-building half (`cardMeta`
   itself — element creation, the `tipChip` calls) stays inline, same
   reason the severity gauge's and phase rail's did.
   Sixty-second cut: `web/search-history.ts` gained `searchHitMeta` alongside
   `rememberedHistory`/`searchProjectsSig` it already sat next to
   conceptually — the code-search results list's per-hit `data-tip`/
   `aria-label` pair (language + relevance score rounded to one decimal,
   path prefixed onto the aria-label) that `searchInit`'s `render` closure
   previously computed inline across one statement before writing it to
   each `<li>`, spliced the same way, with direct unit tests added to
   `search-history-list.test.ts` instead of only indirect DOM-render
   coverage (`search-hit-tooltips.test.ts`, which only ever exercised one
   score, 3.256 — never a score that rounds down instead of up, an
   already-round score, or a zero score, a genuine test gap the same shape
   as the twenty-second through twenty-fourth cuts). Like
   `rememberedHistory`/`searchProjectsSig` before it (thirty-second cut),
   `searchInit` itself lives inside `searchJs()`'s generated-client-JS
   template literal rather than being real compiled TS, so the call site
   embeds `searchHitMeta`'s real compiled source via `.toString()` instead
   of calling the import directly — the same drift-proof pattern, not a
   new one. The DOM-writing half (`<li>` creation, the path/snippet spans)
   stays inline, same reason the severity gauge's and phase rail's did.
   Sixty-third cut: `web/live-progress.ts` gained `liveWorkerHeadMeta`
   alongside the existing `liveProgressOf`/`liveWorkerCountLabel`/
   `liveWorkerTurnLabel` it already sat next to conceptually — the live
   worker card head's callsign chip (always shown) tip/aria-label pair and
   model chip (shown only once the firing carries a model, `null`
   otherwise — the same condition `liveWorkerCard` previously branched on
   before appending that chip at all) tip/aria-label pair that
   `liveWorkerCard` previously computed inline across two `tipChip` calls,
   spliced the same way, with direct unit tests added to
   `live-worker-labels.test.ts` instead of only indirect DOM-render coverage
   (`live-worker-tooltips.test.ts`, which only ever asserted the callsign
   chip's tip was truthy and its aria-label contained a substring — never
   its full tip text — a genuine test gap the same shape as the
   twenty-second through twenty-fourth cuts). Neither field needs the
   injection pattern — both are plain string math with no `fmtCost`/
   `fmtAgo`-style formatter dependency. The DOM-building half
   (`liveWorkerCard` itself — element creation, the `tipChip` calls) stays
   inline, same reason the severity gauge's and phase rail's did.
   Sixty-fourth cut: `web/release-panel.ts` gained `releaseVersionItems`
   alongside the existing `releaseExecuteResult` it already sat next to
   conceptually — the RELEASE preview line's two `tipChip` text/tip/aria-label/
   class quadruples (current → planned version, and the bump kind) that
   `renderReleaseBody` previously computed inline before appending each chip,
   spliced the same way, with direct unit tests
   (`release-panel-version.test.ts`) instead of only indirect DOM-render
   coverage (`release-panel.test.ts`'s "RELEASE preview" suite, which only
   ever asserted the rendered `.release-line` text content, never either
   chip's `data-tip`/`aria-label` — a genuine test gap the same shape as the
   twenty-second through twenty-fourth cuts). It reuses `landing-panel.ts`'s
   `LandingDiffstatItem` tuple shape (renamed per-module as
   `ReleaseVersionItem`) rather than declaring a new one, since both are a
   fixed-length `tipChip`-argument-order array. The DOM-building half
   (`renderReleaseBody` itself — element creation, the muted-fallback
   branches, the milestone-tag input/EXECUTE button) stays inline, same
   reason the severity gauge's and phase rail's did.
   Sixty-fifth cut: `web/stat-tiles.ts` gained `modelMixChipMeta` alongside
   the existing `modelMixItems` it already sat next to conceptually — the
   Metrics panel's MODEL MIX row's per-model chip text/tip/aria-label triple
   (percentage rounding, the "N of M tracked firing(s) ran &lt;model&gt;" tip
   sentence) that `metricsSection` previously computed inline across two
   statements inside its per-model loop before calling `tipChip`, spliced
   the same way, with direct unit tests added to `stat-tiles.test.ts`
   instead of only indirect DOM-render coverage (`model-mix-panel.test.ts`,
   which only ever asserted the rendered chip text/truthy tip for a two-model
   mix — never a single-model 100% mix, never the tip/aria-label's actual
   text — a genuine test gap the same shape as the twenty-second through
   twenty-fourth cuts). `total` is the caller's own already-summed
   tracked-firing count taken via injection rather than this function
   deriving it from the full `modelMixItems(...)` result itself, the same
   `roundSinceLabel`/`actMeta` pattern. The DOM-building half (`metricsSection`
   itself — element creation, the mix-total summation loop) stays inline,
   same reason the severity gauge's and phase rail's did.
   Sixty-sixth cut: `web/gauge.ts` gained `gaugeSegmentMeta` alongside the
   existing `gaugeSegments`/`cardGaugeLabels` it already sat next to
   conceptually — the severity gauge's per-segment hover/focus tip ("N
   &lt;kind&gt;") and aria-label ("&lt;kind&gt;: N") text that `gaugeBar`
   previously computed inline across two `setAttribute` calls inside its
   per-segment loop, spliced the same way, with direct unit tests added to
   `gauge.test.ts` instead of only indirect DOM-render coverage
   (`gauge-langbar-tooltips.test.ts`, which only ever asserted the segment's
   `data-tip`/`aria-label` were truthy — never their actual text, a genuine
   test gap the same shape as the twenty-second through twenty-fourth cuts).
   The all-clear segment's static "No open findings" copy stays inline since
   it has no per-segment data to format, and the DOM-building loop itself
   (element creation, `role`/`tabindex` attributes) stays inline, same reason
   the language bar's and phase rail's did.
   Sixty-seventh cut: `web/task-queue.ts` gained `taskFocusTip`/`taskActionTip`
   alongside the existing `taskTitleTip`/`taskMoveTip` it already sat next to
   conceptually — the task row's 🎯 focus-toggle button's "Focus the
   autopilot on .../Release focus from ..." tip and the four terminal action
   buttons' (approve/reject a proposed task; done/delete an open one) own
   "Verb ... task" tip that `tasksSection` previously computed inline across
   five separate string-concatenation statements before writing each to its
   button's `data-tip`/`aria-label`, spliced the same way, with direct unit
   tests added to `task-queue.test.ts` instead of only indirect DOM-render
   coverage (`task-action-button-tooltips.test.ts`, which asserted each
   button's rendered tip text through the real client bundle but never called
   the pure string math directly — a genuine test gap the same shape as the
   twenty-second through twenty-fourth cuts). `taskActionTip` takes a
   `TaskActionKind` discriminant (`'approve' | 'reject' | 'done' | 'delete'`)
   rather than four separate functions since all four are the same "verb +
   quoted title" shape, the same `taskMoveTip`-takes-`dir` pattern already
   used one function over. The DOM-writing half (button creation,
   `data-task-approve`/`data-task-delete`/etc. attributes) stays inline, same
   reason the severity gauge's and phase rail's did.
   Sixty-eighth cut: `web/docs-panel.ts` holds `docFileTip`, the Docs reader
   panel's per-file button's "Currently viewing …"/"Open …" tip+aria-label
   text that `docsSection` previously computed inline as a single ternary
   expression before writing it to each `<button>`'s `data-tip`/`aria-label`,
   spliced the same way, with direct unit tests (`docs-panel.test.ts`)
   instead of only indirect DOM-render coverage (`docs-file-tooltip.test.ts`,
   which only ever exercised the closed-file "Open …" branch — the
   currently-open "Currently viewing …" branch had no coverage at all
   beforehand, a genuine test gap the same shape as the twenty-second through
   twenty-fourth cuts). The button's className/`aria-pressed` bookkeeping and
   the DOM-building loop itself (`docsSection`'s fetch/`forEach`, element
   creation) stay inline, same reason the task queue's and flight log's own
   per-row loops did.
   Sixty-ninth cut: `web/console-panel.ts` holds `consoleLinesAriaLabel`, the
   raw flight CONSOLE panel's log `<pre>`'s pluralized "N line(s) of raw
   flight process output" aria-label text that `renderConsoleBody` previously
   computed inline as a single ternary expression before writing it to the
   `<pre>`'s `aria-label`, spliced the same way, with direct unit tests
   (`console-panel.test.ts`) instead of only indirect DOM-render coverage
   (`flight-console.test.ts`, which only ever exercised a 2-line log ("2
   lines") — the singular "1 line" branch had no coverage at all beforehand,
   a genuine test gap the same shape as the twenty-second through
   twenty-fourth cuts). The DOM-building half (`renderConsoleBody` itself —
   element creation, the empty-state fallback) stays inline, same reason the
   task queue's and flight log's own per-row loops did.
   Seventieth cut: `web/flight-log-rows.ts` gained `flightGroupHeadMeta`
   alongside the existing `flightGroupSummary`/`flightLogRowMeta` it already
   sat next to conceptually — the slice-run group row's collapsed HEAD's
   verdict-dot/headline/cost/relative-timestamp tip+aria-label text that
   `flightGroupRow` previously computed inline across four `setAttribute`
   pairs before appending each span, spliced the same way, with direct unit
   tests added to `flight-log-rows.test.ts` instead of only indirect
   DOM-render coverage (`flightlog-slice-aware.test.ts`, which only ever
   asserted the group row's className and click-to-expand behavior — never
   any of its four spans' `data-tip`/`aria-label` text, a genuine test gap
   the same shape as the twenty-second through twenty-fourth cuts, distinct
   from `flightLogRowMeta` above which covers the group's expanded MEMBER
   rows, not its collapsed head). It takes `fmtCost`/`fmtAgo` via injection,
   the same `flightDetailLine` pattern already used one function below. The
   DOM-building half (`flightGroupRow` itself — element creation, the
   expand/collapse member loop) stays inline, same reason the severity
   gauge's and phase rail's did.
   Seventy-first cut: `web/card-actions.ts` holds `cardRemoveTip`/
   `startOverTip`, the fleet card's "Remove" button's and the project detail
   page's "Start over" button's own tip (shared as both `data-tip` and
   `aria-label`) that `cardActions`/`renderProjectPage` each previously built
   inline as a single string concatenation before writing it to their
   respective button, spliced the same way, with direct unit tests
   (`card-actions.test.ts`) instead of only indirect DOM-render coverage
   (`card-remove-tooltip.test.ts`, `start-over-tooltip.test.ts`, neither of
   which ever called the pure string math directly — a genuine test gap the
   same shape as the twenty-second through twenty-fourth cuts). Grouped into
   one module since both are the same "explain this destructive-ish button"
   shape, the same `taskTitleTip`/`taskMoveTip` pairing pattern. The
   DOM-writing half (button creation, `data-remove`/`data-start-over`
   attributes) stays inline at both call sites, same reason the severity
   gauge's and phase rail's did.
   Seventy-second cut: `web/task-queue.ts` gained `taskHistoryMoreMeta`
   alongside the existing `taskQueueCounts` it already sat next to
   conceptually — the closed-task "Load more done" pagination button's visible
   text ("Load more done (showing X of Y)") and its shared tip/aria-label
   ("Reveal N more done/deferred tasks", `N` clamped to whatever's left of
   `historyChunk`) that `tasksSection` previously computed inline across two
   statements before writing them to the button, spliced the same way, with
   direct unit tests added to `task-queue.test.ts` instead of only indirect
   DOM-render coverage (`task-history-more-tooltip.test.ts`, which only ever
   exercised one case — 16 closed tasks, chunk 15 — never the button's own
   `.textContent`, and never a case where the remaining count is clamped by
   `historyChunk` itself rather than by `closedTotal - closedVisible`, a
   genuine test gap the same shape as the twenty-second through
   twenty-fourth cuts). `taskQueueCounts` (nineteenth cut) already extracted
   this button's numeric tallies; this closes the text/tip half its own note
   had left inline. No injected collaborator needed — plain string
   concatenation and `Math.min` arithmetic over already-computed numbers, the
   same "no injection needed" shape as the sixty-third cut's
   `liveWorkerHeadMeta`. The DOM-building half (button creation, the
   `closedTotal > closedVisible` guard) stays inline, same reason the task
   queue's own per-row loops did.
   Seventy-third cut: `web/flights.ts` gained `flightActionAriaLabel` alongside
   the existing `activeFlights`/`flightsSig`/`typedFolderFlightStatus`/
   `flightRowStatusText` it already sat next to conceptually — the fly bar's
   per-flight-row Pause/Stop/Cancel/Resume buttons' folder-specific aria-label
   (also used as the hover/focus tip) that `flightRow` previously computed
   inline as four separate string-concatenation statements, one per branch,
   spliced the same way, with direct unit tests added to `flights.test.ts`
   instead of only indirect DOM-render coverage (`multi-flight-cards.test.ts`,
   which asserted each button's `textContent`/click-to-POST behavior but never
   its `aria-label` text — a genuine test gap the same shape as the
   twenty-second through twenty-fourth cuts). It takes a `FlightActionKind`
   discriminant (`'pause' | 'stop' | 'cancel' | 'resume'`) rather than four
   separate functions, the same `taskActionTip`-takes-`TaskActionKind` pattern
   the sixty-seventh cut already proved. The DOM-writing half (button
   creation, `data-*`/click-handler wiring, `targetedAction`'s fetch call)
   stays inline, same reason the severity gauge's and phase rail's did.
   Seventy-fourth cut: `web/status-pill.ts` holds `statusPillMeta`, the fleet
   card's project-status badge's and the task board's per-task status pill's
   shared label/tip/aria-label math (underscore-to-space label, and — only
   when the caller's tip map carries an entry for the status — the "Status:
   &lt;label&gt; — &lt;tip&gt;" aria-label) that `statusPill` previously
   computed inline before writing `tabindex`/`data-tip`/`aria-label` to the
   pill, spliced the same way, with direct unit tests (`status-pill.test.ts`)
   instead of only indirect DOM-render coverage
   (`status-pill-tooltips.test.ts`, which only ever exercised one project
   status and one task status — never a status absent from the tip map, and
   never the non-global `.replace` boundary on a status with two underscores,
   a genuine test gap the same shape as the twenty-second through
   twenty-fourth cuts). `statusPill` is called from both `cardHead` (project
   cards) and `tasksSection` (task rows) with different tip maps — the one
   function was already shared, so this cut extracts its math rather than
   deduplicating call sites, unlike the twentieth/forty-fifth/fifty-seventh
   cuts. The DOM-writing half (`statusPill` itself — element creation,
   `tabindex` bookkeeping) stays inline, same reason the severity gauge's and
   phase rail's did.
   Seventy-fifth cut closed a genuine hand-sync duplication, not just an
   inline-to-module move (the same shape as the twentieth/forty-fifth/
   fifty-first cuts): `web/stat-tiles.ts` gained `statTileAriaLabel`
   alongside the `StatTileItem`-producing functions it already sat next to
   conceptually — the `label + ': ' + value + ' — ' + tip` `aria-label`
   string that `doraSection`, `gateParallelSection`, `renderTotals`, and
   `renderStatTiles` in `web/shell.ts` each independently retyped, byte-for-
   byte identical, right before writing it to every `.stat-tile`/`.total`
   cell, spliced the same way, with a direct unit test
   (`stat-tiles.test.ts`) instead of only indirect DOM-render coverage
   (`dora-tiles.test.ts`/`gate-parallel-tiles.test.ts`/
   `fleet-stat-tiles.test.ts`, which only ever asserted the attribute was
   truthy, never its actual format — and `renderTotals`'s own `.total`
   cells had no `aria-label` coverage at all before this, a genuine test
   gap the same shape as the twenty-second through twenty-fourth cuts).
   Each of the four call sites now calls `statTileAriaLabel(items[i])`
   instead of re-deriving the string, so the four copies can no longer
   drift apart. The DOM-building loop itself (element creation, `data-tip`)
   stays inline in all four functions, same reason the severity gauge's and
   phase rail's did.
   Seventy-sixth cut: `web/phase-rail.ts` gained `phaseTipText` alongside the
   existing `phaseCounts`/`phaseDetailRows` it already sat next to
   conceptually — the phase rail's per-segment tip/aria-label text (the
   `OFFICE_TIPS` explanation for the phase, plus its pluralized activity
   count) that `phaseRail` previously computed inline as a single string
   concatenation before writing it to each segment's `data-tip`/`aria-label`,
   spliced the same way, with direct unit tests added to `phase-rail.test.ts`
   instead of only indirect DOM-render coverage
   (`phase-rail-tooltips.test.ts`, which only ever asserted the string
   through the rendered DOM, never by calling the pure text math directly —
   a genuine test gap the same shape as the twenty-second through
   twenty-fourth cuts). It takes `officeTips` via injection rather than
   importing `OFFICE_TIPS` from `web/office-map.ts`, the same
   `liveWorkerChipMeta`/`heatmapDays` pattern. The DOM-building half
   (`phaseRail` itself — button creation, `aria-*` attributes, the
   phase-name/phase-count spans) stays inline, same reason the severity
   gauge's and language bar's did.
   Seventy-seventh cut: `web/lang-bar.ts` gained `langSegMeta`/`langLegendLine`
   alongside the existing `langBarSegments` it already sat next to
   conceptually — the Languages panel's per-segment hover/focus tip/
   aria-label text ("typescript — 75%" / "typescript: 75 percent, 3.0 KB")
   and the plain-text legend `<li>` line below the bar ("typescript — 12
   files, 3.0 KB") that `langBar`/`languagesNode` previously computed inline
   as string concatenations before writing them to each segment's
   `data-tip`/`aria-label` and each legend item's text, spliced the same
   way, with direct unit tests added to `lang-bar.test.ts` instead of only
   indirect DOM-render coverage (`gauge-langbar-tooltips.test.ts`, which only
   ever asserted `data-tip`/`aria-label` were truthy through the rendered
   DOM, never their exact text — and the legend line had no test coverage at
   all beforehand, a genuine test gap the same shape as the twenty-second
   through twenty-fourth cuts). Both take `fmtBytes` via injection rather
   than importing it from `./format.ts`, the same `cardGaugeLabels`/`actMeta`
   pattern. The DOM-building half (`langBar`'s segment-element creation,
   `style.flex`/`style.opacity`; `languagesNode`'s legend-list build) stays
   inline, same reason the severity gauge's and phase rail's did.
   Seventy-eighth cut: `web/anomaly.ts` holds `anomalyChipMeta`, the fleet
   card's needs-you anomaly chip's label/tip/aria-label math (the rule name
   from `ANOMALY_LABELS` — falling back to the raw kind for any kind the map
   carries no entry for — plus the evidence sentence as both the hover/focus
   tip and the aria-label) that `anomalyChip` previously computed inline
   before calling `tipChip`, spliced the same way, with direct unit tests
   (`anomaly.test.ts`) instead of only indirect DOM-render coverage
   (`anomaly-chip.test.ts`, which only ever asserted `data-tip` was truthy
   and contained a substring of the evidence — never the exact label/
   aria-label text, and never a kind absent from the label map, a genuine
   test gap the same shape as the twenty-second through twenty-fourth cuts).
   It takes the label map via injection rather than importing `ANOMALY_LABELS`
   from `shell.ts` itself (there is nowhere else to import it from — the map
   only ever lived inline), the same `statusPillMeta`-takes-`tips` pattern.
   The DOM-building half (`anomalyChip` itself — the `tipChip` call) stays
   inline, same reason the severity gauge's and phase rail's did.
   Seventy-ninth cut closed a genuine hand-sync duplication the seventy-fifth
   cut's own doc comment had already flagged the shape of but missed an
   instance of: `web/stat-tiles.ts`'s `statTileAriaLabel` — the
   `label + ': ' + value + ' — ' + tip` `aria-label` string the seventy-fifth
   cut deduplicated across `doraSection`/`gateParallelSection`/`renderTotals`/
   `renderStatTiles` — was still independently re-derived by `stat()`, the
   lower-level `.stat` element builder `cardStats`/`metricsSection` call,
   since it doesn't route through any of those four. `stat()` now calls
   `statTileAriaLabel([String(value), label, tip])` instead, spliced right
   before its own definition (the new earliest call site in file order,
   ahead of `doraSection`'s), so the splice for the four original call sites
   was removed rather than duplicated. `stat-chip-tooltips.test.ts`'s
   `.card-stats .stat` case only ever asserted `aria-label` was truthy, never
   its exact format — closed by asserting it against
   `cardStatItems(...).map(statTileAriaLabel)` directly, the same test-gap
   shape the twenty-second through twenty-fourth cuts closed elsewhere.
   Eightieth cut closed a genuine hand-sync duplication, not just an
   inline-to-module move (the same shape as the twentieth/forty-fifth/
   fifty-first cuts): `web/flight-log-rows.ts` gained `flightCostAgoMeta`
   alongside the existing `flightLogRowMeta`/`flightGroupHeadMeta` it already
   sat next to conceptually — the `flight-cost`/`flight-ago` chip pair's
   tip+aria-label math that `flightGroupRow`'s per-member loop ("Spend for
   this slice" / "When this slice happened") and `flightLogNode`'s own
   per-row loop ("Total spend for this firing" / "When this firing happened")
   each hand-typed independently before this — same `'cost: ' + fmtCost(...)`/
   `'happened ' + fmtAgo(...)` aria-label formula in both, differing only in
   the tip wording, the exact drift-prone shape `flightBarMeta`'s own doc
   comment already warned about. The caller-specific tip text is passed in
   rather than derived, the same split `flightDetailLine`'s bits array
   already leaves to its caller; `fmtCost`/`fmtAgo` come via injection, the
   same `flightGroupHeadMeta` pattern. Direct unit tests added to
   `flight-log-rows.test.ts`; both call sites had only indirect DOM-render
   coverage before (`flightlog-slice-aware.test.ts`, `project-page.test.ts`).
   The DOM-building half (element creation, `.flight-cost`/`.flight-ago`
   text content) stays inline in both call sites, same reason the task
   queue's and flight log's own per-row loops did.
   Eighty-first cut: `web/connect-panel.ts` gained `connectTestResultMeta`
   alongside the existing `connectModeMeta`/`connectStatusMeta` it already
   sat next to conceptually — the CONNECT popover's "Test" button's result
   math (status-line text/class, connection-dot class, toggle-button label,
   keyed off the `/api/connection/test` payload's `authenticated`/`detail`
   fields) that the `testBtn` click handler's fetch callback previously
   computed inline across three statements, spliced the same way, with
   direct unit tests added to `connect-panel.test.ts` instead of no
   coverage at all — no test, direct or indirect, ever exercised this
   handler's branching before this, a true zero-coverage gap the same shape
   as the fifty-second cut closed for `connectStatusMeta`. Unlike
   `connectStatusMeta`, there is no malformed-payload guard to preserve — a
   missing/falsy payload simply reports as not-authenticated with an empty
   detail, the same "falsy narrows to the same branch" shape the original
   inline `p && p.authenticated`/`p && p.detail` guards already had. The
   DOM-reading/writing half (the click handler itself — the `fetch` call,
   the "testing..." interim text, the `.catch` fallback) stays inline, same
   reason `connectStatusMeta`'s own `render(s)` wrapper did.
   Remaining panels (fleet grid, project page, docs reader), true ES modules,
   and on-demand loading are still open.

   Eighty-second cut: `web/heatmap.ts` gained `heatTip` alongside the
   existing `heatDayKey`/`heatDayStart`/`heatmapDays`/`heatClass`/
   `heatLabel`/`heatCellPos` it already sat next to conceptually — the
   contribution heatmap's per-cell `data-tip`/`aria-label` text (the
   calendar date plus `heatLabel`'s tallies) that `contributionHeatmap`
   previously computed inline as a bare string concatenation before writing
   it to each `<rect>`, spliced the same way, with direct unit tests added
   to `heatmap-geometry.test.ts` instead of only indirect DOM-render
   coverage (`contribution-heatmap.test.ts`, which already asserted the
   full "2026-08-01 — no firings" text through the rendered SVG but never
   the composing function directly). The DOM-building loop itself (element
   creation, `x`/`y`/`class`/`data-day` attributes) stays inline, same
   reason the severity gauge's and phase rail's did.

   Eighty-third cut closed a genuine hand-sync duplication, not just an
   inline-to-module move (the same shape as the twentieth/forty-fifth/
   seventy-ninth cuts): `web/anomaly.ts` gained `guardDenialChipMeta`
   alongside the existing `anomalyChipMeta` it already sat next to
   conceptually — the guard-denial chip's label/tip/aria-label triple (the
   containment/read-hygiene guard's tool-call denial count, "🛡️ N blocked")
   that `firingTimelineSection` (per-firing trace rows) and the flight-log
   row builder each hand-retyped as an identical block before appending the
   chip, spliced the same `.toString()` way, with direct unit tests added
   to `anomaly.test.ts` instead of only indirect DOM-render coverage
   (`flight-guard-chip.test.ts`, `firing-timeline-chips.test.ts`, neither of
   which ever asserted the exact label/tip/aria-label text or caught that
   the two blocks could silently drift apart from each other — the same
   drift-bug class the fifty-first cut's `flightBarMeta` fixed pre-emptively
   for the spark/timeline tooltip block). The truthy-`guardDenials` gate
   stays inline at each call site, the same "gate stays inline, meta stays
   pure" split `anomalyChipMeta`'s own caller (`anomalyChip`) already uses.
   Eighty-fourth cut closed another genuine hand-sync duplication, this time
   spanning two SIBLING panel modules rather than two call sites in the same
   function: `web/decision-item.ts` (new module) holds `decisionItemHeadMeta`,
   the KEEPER decision panels' shared per-item head math — a "#N" number
   chip's data-tip/aria-label pair plus a decision badge's text/tip/
   aria-label/class — that `renderIssueTriageBody` and `renderPrReviewPanel`
   each hand-retyped as an identical block (only the noun and CSS-class
   prefix swapped) before appending each list item's head. Neither
   `issue-triage-panel.ts` nor `pr-review-panel.ts` conceptually owns the
   other's domain, so this shared math got its own sibling module rather than
   living in either panel's — the noun pair ("GitHub issue"/"issue" vs
   "GitHub PR"/"pull request"), CSS-class prefix ("issue-triage"/"pr-review"),
   and each panel's own already-resolved decision label
   (`issueTriageDecisionLabel`/`prReviewDecisionLabel`) are caller-supplied
   rather than imported, the same `heatmapDays(..., verdictOf)` injection
   pattern used elsewhere in this epic. Spliced into `fleetJs()` the standard
   `.toString()` way (once, ahead of both call sites — function declarations
   hoist, so the PR-review panel's later call site resolves fine), with
   direct unit tests (`decision-item.test.ts`) instead of only indirect
   DOM-render coverage (`keeper-panel-number-tooltips.test.ts`, which never
   asserted the exact tip/aria-label text or the decision badge's own
   tip/aria-label/class, nor caught that the two panels' blocks could
   silently drift apart from each other — the same drift-bug class the
   eighty-third cut's `guardDenialChipMeta` fixed). Both panels' per-row
   DOM-building loop and the truthy/empty-state gates stay inline, same
   reason every prior cut's DOM-building half did.

   Eighty-fifth cut (PARALLEL UNLOCK B, web-mstevobb-bp7qtv — the operator's
   "flip the switch" focus) resumed the SHELL HUB RELIEF whole-region-move
   shape the sixtieth–sixty-fifth cuts established, on the last big
   self-contained region still sitting inline in `fleetJs()`: the project
   page's "Firing activity" contribution heatmap (`contributionHeatmap`, its
   `heatRovingIndex` roving-tabindex module state, and its two
   document-delegated keydown/focusin handlers) moved out of `fleetJs()`
   entirely into `web/features/activity-heatmap.ts` as a new discoverable
   feature module. Like `tour.ts`/`flight-console.ts`, it keeps its own
   module-level state (`heatRovingIndex`) and its own delegated handlers, with
   no read of `lastFleetState` or any other fleet-wide mutable state
   `fleetJs()` owns — the self-containment those cuts already proved
   extractable. It carries the nine `web/heatmap.ts` splices with it
   (`HEATMAP_WEEKS`/`HEATMAP_DAY_MS` via `JSON.stringify()`, and
   `heatDayKey`/`heatDayStart`/`heatmapDays`/`heatClass`/`heatLabel`/
   `heatCellPos`/`heatTip` via `.toString()`), now resolved relative to
   `web/features/` instead of `shell.ts`, the same shape `round-panel.ts`'s
   own splices already proved. `flightVerdictOf` stays spliced in `shell.ts`
   (`fleetJs()`'s flight rows and log rows still call it) and is referenced by
   `activity-heatmap.ts` as a bare, unimported hoisted identifier — the same
   shared-helper-stays-put shape the eighty-fourth cut's `decisionItemHeadMeta`
   and the issue-triage cut already used. `contributionHeatmap(c)` itself
   stays called from `fleetJs()`'s `renderProjectPage()` as a bare, unimported
   identifier, safe for the concatenated-script hoisting reason every
   whole-region move relies on. Since `activity-heatmap.ts` sorts
   alphabetically first in `web/features/`,
   `generate-splice-manifest.test.ts`'s discovery/reconstruction/directory-
   manifest suites gained it as the FIRST discovered module (shifting every
   other module's index by one), plus a `reconstructActivityHeatmapJs()`
   helper mirroring `roundPanelJs`'s own real-relative-import-splice
   reconstruction. It rides `PROJECT_PAGE_FEATURES` in `web/chunks.ts` (its
   sole caller is `renderProjectPage()`), so the render-blocking core chunk
   sheds the heatmap bytes too, and `pr-review.test.ts`'s security-census
   benign allow-list gained it as a GET-only/no-fetch pure display panel
   (`setAttribute`-only SVG, zero `innerHTML`). Indirect DOM coverage
   (`contribution-heatmap.test.ts`) drove the real client bundle unchanged —
   zero behavior change, confirmed by that unchanged pass. Net result:
   `shell.ts` drops from 3,682 to 3,566 lines. Full gate green: typecheck,
   lint, format:check, test:impacted, build.

   PARALLEL UNLOCK A: `scripts/codemod/split-top-level-regions.mjs`
   (`pnpm run codemod:split-regions <input-file> [output-dir]`) is a
   deterministic codemod that cuts a source file at its top-level statement
   boundaries into ordered `.region` files + a `manifest.json`, verified
   byte-for-byte reassembly-safe against `shell.ts` itself (both in-memory and
   through a disk round trip — see `split-top-level-regions.test.ts`). It does
   NOT do the semantic extraction each cut above does by hand (pure-logic
   module + injection pattern + direct unit tests) — it only proves `shell.ts`
   can be mechanically chunked so the *remaining panels* above, or slices 3-5,
   can hand independent regions to parallel agents instead of one cut at a
   time through this single file.

   PARALLEL UNLOCK B: every cut above wires its extracted module into
   `clientJs()` the same hand-written way — an import plus a
   `${sharedX.toString()}` (or `JSON.stringify(sharedX)`) splice line at the
   right position — which makes `shell.ts` the one convergence point every
   feature-module addition edits, twice, no matter how independent the
   feature is. `scripts/codemod/generate-splice-manifest.mjs`
   (`pnpm run codemod:splice-manifest <input-file> [output-file]`) discovers
   that entire registry mechanically: it walks `shell.ts`'s AST, finds every
   relative-module import spliced in via `.toString()`/`JSON.stringify()`,
   and emits an ordered manifest of `{modulePath, exportedName, localName,
   kind, enclosingFunction, position}` — 136 entries today, one per splice
   site, each cross-checked to resolve to a real file with no module spliced
   in twice (see `generate-splice-manifest.test.ts`). Like PARALLEL UNLOCK A,
   it does NOT yet change how splicing happens — `shell.ts` is untouched, zero
   behavior change — it only proves the import↔splice-site wiring is readable
   off the AST by rule rather than known only by convention, the necessary
   precondition before a later cut can have the client assembler walk a
   generated manifest directly instead of requiring a hand-written registry
   entry per feature module — the point where the convergence point actually
   dissolves.

   The manifest's first real consumer: `verifySpliceManifestAgainstOutput`
   (same file) proves the discovered manifest is not just AST shape that
   happens to be parseable, but an accurate description of a bundle that was
   ACTUALLY assembled this way — for every entry, in manifest order, it
   resolves the entry's real binding (dynamically imports `modulePath`, reads
   `exportedName` off it) and confirms its true `.toString()`/
   `JSON.stringify()` content appears in `clientJs()`'s real served output at
   or after where the previous entry's match ended. A dedicated test
   ("verifying the real assembled clientJs() bundle against the manifest")
   runs this against the live file today: 0 unmatched entries. This is the
   round-trip check PARALLEL UNLOCK A's byte-for-byte reassembly test did for
   region-splitting — the manifest is now provably trustworthy ground truth a
   later automated assembler can drive off of, not just a snapshot that could
   silently drift from what `clientJs()` actually ships. The assembler
   itself — `clientJs()`'s ~4900 lines of hand-written splice call sites
   interleaved with literal glue markup across `switcherJs`/`fleetJs`/
   `connectJs`/`flyJs`/`searchJs` — is still untouched; having it read the
   manifest at runtime needs the glue text captured too (not just the splice
   points), which is real ES-module loading territory, same "still open"
   item this doc already tracks below.

   That "0 unmatched entries" claim exposed a real gap once cross-checked
   against every relative import `shell.ts` actually declares: 16 of
   `web/office-map.ts`'s numeric constants (`OFFICE_W`/`OFFICE_H`/
   `OFFICE_ZONE_W`/… plus `PHASE_DETAIL_CAP`/`DEFAULT_FILE_NODE_CAP`/
   `NARRATOR_TARGET_CAP`/`LIVE_SUBAGENT_CAP`/`STALE_TASK_DAYS` from their own
   modules) splice into `clientJs()` as a bare `${WIDTH}` template-literal
   interpolation rather than `.toString()`/`JSON.stringify()` — a third
   splice shape the detector's own doc comment claimed didn't exist
   ("their real values/compiled source via `JSON.stringify()`/`.toString()`,
   not a hand-retyped copy") but silently missed entirely, undercounting the
   registry by 16 real splice sites (136 → 152). `findSpliceManifest` now
   recognizes a bare relative-import identifier used as a `TemplateSpan`
   expression as a third `kind: 'templateLiteral'` entry, and
   `verifySpliceManifestAgainstOutput` checks it against the value's raw
   `String()` conversion (what `${binding}` actually produces at runtime)
   rather than `JSON.stringify()`. Direct unit tests cover the new detection
   branch plus a regression test locking in that all 16 previously-missed
   `office-map.ts` constants are now discovered; the real-`shell.ts`
   integration test's "0 unmatched entries" claim now actually covers them
   too. A manifest tool that silently undercounts its own registry is worse
   than no manifest — a future automated assembler driving off it would ship
   a bundle missing these constants with no signal anything was wrong; this
   closes that gap before anything is built on top of it.

   A fourth splice shape closed the same gap for the last stragglers: cross-
   checking every relative import `shell.ts` declares against the manifest's
   152 discovered entries found 3 imports still unaccounted for —
   `fontFaceCss`/`PRELOAD_FONT_PATHS` (legitimately server-side-only HTML
   generation, never spliced into the client bundle at all) and
   `SUBAGENT_TOOLS`, which genuinely IS spliced into `clientJs()` but as
   `new Set(${JSON.stringify([...SUBAGENT_TOOLS])})` — a `ReadonlySet`
   re-serialized through an array-spread before `JSON.stringify()`, not the
   bare-identifier `JSON.stringify(binding)` shape the detector already knew.
   `findSpliceManifest` now recognizes `JSON.stringify([...binding])` (an
   array literal with exactly one spread element wrapping a relative-import
   identifier) as a fourth `kind: 'jsonStringifySpread'` entry, and
   `verifySpliceManifestAgainstOutput` checks it against
   `JSON.stringify([...value])` rather than `JSON.stringify(value)` — the
   distinction matters because `SUBAGENT_TOOLS`'s real binding is a `Set`,
   and `JSON.stringify()` on a `Set` directly serializes to `'{}'`, not the
   array `clientJs()` actually embeds. Direct unit tests cover the new
   detection branch (plus a negative case: a multi-element or non-spread
   array literal must not match) and lock in that `SUBAGENT_TOOLS` is now
   discovered against the real `shell.ts`; the manifest now accounts for
   153 of the file's 155 relative-import bindings, with the remaining 2
   confirmed as the legitimate server-only HTML-generation case.

   The manifest's own doc comment had flagged what was still missing: it
   proves WHAT each splice resolves to, not the literal "glue" text around
   it — the other half needed before a future assembler can read a generated
   manifest instead of `clientJs()`'s ~4900 lines of hand-interleaved splice
   sites and markup. `captureAssemblySegments` (same file) walks
   `switcherJs`/`fleetJs`/`connectJs`/`flyJs`/`searchJs`'s top-level
   `return \`...\`.trim();` body into ordered literal `segments` plus the
   `slots` (source text + position) of every `${...}` substitution between
   them; `reassembleSegments` is its inverse. A byte-for-byte test proves
   `segments` + resolved slot values reproduce each of the five functions'
   real output exactly: 153 of the 155 substitutions across them resolve via
   the existing splice manifest, and a new `localTopLevelConstLiteral`
   helper (plus a small known-exception resolver in the test) accounts for
   the remaining two — `fleetJs()`'s bare `${REFRESH_MS}` (a same-file local
   const, no import at all) and `switcherJs()`'s `${names}` (a package
   import from `@autopilot/tokens`, not a relative one) — rather than
   silently leaving them unaccounted for. Manifest + glue text together are
   now proven sufficient to mechanically reconstruct the entire assembled
   bundle byte-for-byte; `shell.ts` itself remains untouched, zero behavior
   change.

   The composition itself is now a single reusable function rather than
   something re-derived by hand per call site: `assembleFunctionFromManifest`
   (same file) composes `findSpliceManifest` + `captureAssemblySegments` +
   `reassembleSegments` into the one operation a future auto-discovery
   assembler needs — given a function's source, resolved splice bindings
   (via the new `resolveManifestBindings`, which dynamically imports each
   manifest entry's real module, deduped by module+export), and a
   caller-supplied resolver for the rare non-splice slot, it reconstructs
   that function's real assembled output directly from the manifest and glue
   text in one call, the same `heatmapDays(..., verdictOf)`-style injection
   every shared/web module in this epic uses. `generate-splice-manifest.test.ts`'s
   "reconstructing shell.ts's five bundle-composing functions" suite now
   calls this function directly against the real file instead of re-deriving
   the same manifest-plus-slots stitching inline — proving the composed
   operation, not just its two separate halves, reproduces real production
   output byte-for-byte — plus direct fixture-level unit tests for both new
   functions, including `resolveManifestBindings`'s dedup path (never
   actually exercised by the real-`shell.ts` tests, since the manifest itself
   is already proven duplicate-free). `shell.ts` remains untouched: this is
   the function a build-time or runtime assembler would call, not the
   assembler wired into `clientJs()` yet.

   `assembleFunctionFromManifest` still took raw source text and re-derived
   segments/slots/entries via a fresh AST parse on every call — fine for a
   test suite re-reading `shell.ts`, wrong shape for an actual assembler,
   which would have a previously-generated manifest available (e.g. read back
   from a written JSON file), not the TypeScript source or a parser. Two
   closing pieces: `buildAssemblyManifest` (same file) composes
   `findSpliceManifest` + `captureAssemblySegments` into the single
   serializable artifact a written-to-disk manifest needs — `buildSpliceManifest`
   alone only carried the splice registry (WHAT resolves to what), not the
   literal glue segments/slots AROUND each substitution, so a manifest.json
   written from it was not yet sufficient for reconstruction without also
   re-parsing the source; `buildAssemblyManifest` closes that gap by capturing
   both halves together, keyed by function name. `assembleFromManifest` (same
   file) is `assembleFunctionFromManifest`'s manifest-native counterpart: it
   takes an `AssemblyManifest` object instead of source text and resolves a
   named function's real output from it directly, no AST parse involved. Both
   assemblers now share one reconstruction core (`assembleFromSegments`,
   internal) instead of duplicating the slot-resolution loop, so the two
   entry points (source-driven for today's tests, manifest-driven for a real
   future assembler) can never drift apart silently. Direct fixture-level
   tests cover both new functions (including that they agree with each other
   given the same inputs), plus a real-`shell.ts` regression alongside the
   existing "reconstructing shell.ts's five bundle-composing functions" suite
   proving `buildAssemblyManifest` + `assembleFromManifest` reproduce all five
   real bundle functions' output exactly, from the manifest alone. `shell.ts`
   remains untouched, zero behavior change.

   The CLI entry point itself had fallen behind these composed helpers: `main()`
   still wrote a manifest via the older `buildSpliceManifest` (the splice
   registry alone, no glue segments) against a bare `<input-file>` argument —
   there was no way to pass it the five bundle-composing function names, so
   the artifact it actually produced on disk was never the complete
   `AssemblyManifest` the tests above already proved sufficient for
   reconstruction. `discoverAssemblyFunctionNames` (same file) closes the last
   hand-maintained list this needed: it walks `sourceText`'s top-level function
   declarations and keeps the ones shaped like an assembler — a single
   top-level `return \`...\`;` (optionally `.trim()`-ed) template literal, the
   exact shape `captureAssemblySegments` already required — sharing one
   `topLevelReturnTemplate` helper with it so discovery and capture can never
   disagree on what counts. Run against the real `shell.ts` it finds seven such
   functions, not just the five originally named by hand: the known
   `switcherJs`/`fleetJs`/`connectJs`/`flyJs`/`searchJs`, plus `clientJs`
   itself (which assembles those five into the served bundle) and
   `renderShell` (the full HTML document, itself template-literal-assembled
   from server-only pieces like `PRELOAD_FONT_PATHS`) — both genuinely
   assembler-shaped, previously excluded only because no one had added them to
   a hand-typed list. `main()` now calls `discoverAssemblyFunctionNames` then
   `buildAssemblyManifest` with the result, so `pnpm run codemod:splice-manifest
   <input-file>` emits the complete artifact — splice registry AND glue
   segments, for every assembler-shaped function the file actually contains —
   for any input file, no hand-maintained function-name list required. Direct
   unit tests cover the discovery fixture shapes (plain top-level return,
   `.trim()`-wrapped, a non-template return, a no-substitution template
   literal, and a nested function's own return not leaking to its enclosing
   function) plus a real-`shell.ts` regression locking in the seven discovered
   names and proving every one of them is captured by
   `captureAssemblySegments` without throwing. `shell.ts` remains untouched,
   zero behavior change.

   The two functions discovery newly found had only been proven capturable,
   not reconstructible: the byte-for-byte suite stopped at the five nested
   assembler functions, leaving `clientJs()` (the served bundle) and
   `renderShell()` (the full HTML document) — the functions that assemble
   THEM — unverified. A new test proves `clientJs()` reconstructs exactly by
   composing `assembleFromManifest` two levels deep: each of the five nested
   functions is first reconstructed from the manifest's own splice entries
   and glue segments (the same proof the existing suite already gives), then
   `clientJs()`'s own five call-expression slots (`${switcherJs()}`,
   `${fleetJs()}`, ...) — none of them relative-import splices, since they're
   same-file function calls, a genuinely different slot shape from every
   splice kind `findSpliceManifest` classifies — resolve to those already-
   reconstructed (and internally `.trim()`-ed, matching each function's own
   `.trim()`-wrapped return) outputs via an injected resolver, with no
   fallback to calling the real functions directly. This is the concrete
   proof a manifest-driven assembler can recurse through nested assembler
   functions, not just flat relative-import splices — the shape `clientJs()`
   itself needs since it assembles the other five rather than importing
   shared modules directly. `renderShell()` — the seventh discovered
   function, and the only one with no server/client counterpart — stays an
   explicit follow-on: its slots include local variables computed from
   function calls (`v`/`anchor`) and a `.map().join()` expression over
   `PRELOAD_FONT_PATHS`, non-splice shapes this suite's resolver doesn't yet
   know, not the flat relative-import or nested-assembler-call shapes closed
   so far.

   That follow-on is now closed: `renderShell()` turns out to have zero
   relative-import splice entries at all (`findSpliceManifest` returns none
   for it) — every one of its 6 slots is a distinct non-splice shape: a bare
   package-import binding (`DEFAULT_THEME`), a `.map().join()` over the
   relative-import `PRELOAD_FONT_PATHS`, a same-file exported function call
   assigned to a local (`v` = `assetVersion()`, appearing twice), a local var
   computed from a ternary over an unexported same-file helper (`anchor`, via
   `escapeAttr`), and a call to that unexported helper directly
   (`themeButtons()`). Since `escapeAttr`/`themeButtons` are not exported (and
   stay that way — zero behavior change), the test resolver replicates their
   known formula against real `@autopilot/tokens` values, the same "teach it
   the exact formula, fail loudly on anything else" contract
   `resolveNonSpliceSlot` already uses for `switcherJs()`'s `names` slot. A
   byte-for-byte test proves `assembleFromManifest` reproduces `renderShell()`'s
   real output exactly, from the manifest alone, for both the fleet-mode
   (`project` undefined) and project-mode (`project: 'p1'`) call — the first
   proof in this suite that exercises the `anchor` slot's non-empty branch.
   All seven of `shell.ts`'s discovered assembler functions are now proven
   byte-for-byte reconstructible from the manifest alone.

   Every reconstruction proof above still fed `assembleFromManifest` the live
   in-memory object `buildAssemblyManifest` returned — never the manifest as
   `main()` actually produces it, `JSON.stringify(manifest, null, 2)` written
   to disk. `assembleFromManifest`'s own doc comment claims a manifest works
   "exactly as it would be read back from a written-to-disk JSON file", a
   claim no test had exercised through real serialization. A new "disk round
   trip" suite writes the real `shell.ts` manifest to a temp file and reads it
   back via `JSON.parse` before reconstructing from it: `fleetJs()` (the flat
   splices-plus-non-splice-slot shape) and `clientJs()` (the two-level nested-
   assembler-call composition) both still reproduce their real output
   byte-for-byte off the round-tripped object. `shell.ts` remains untouched,
   zero behavior change.

   Every existing test called `buildAssemblyManifest`/`discoverAssemblyFunctionNames`
   as library functions; `main()` itself — argv parsing, the usage-error exit
   path, wiring `discoverAssemblyFunctionNames`'s result into
   `buildAssemblyManifest`, the default-output-path fallback, and the
   console summary — was never actually executed by any test, so the real
   `codemod:splice-manifest` npm script dev/CI workflows invoke had no
   end-to-end coverage. A new subprocess suite spawns the real script:
   the no-args usage/exit-1 path, an explicit output path, the default
   `<input>.splice-manifest.json` fallback, and a check that the written
   manifest matches `buildAssemblyManifest` called directly on the same
   fixture. Running the CLI for real surfaced two genuine CLI-UX bugs
   `main()` had carried since it was first written: both `readFileSync(inputFile)`
   and `writeFileSync(outputFile)` had no try/catch, so a missing/unreadable
   input file or an output path in a nonexistent directory crashed with a raw
   ENOENT stack trace instead of the same clean stderr message + `exit(1)`
   the missing-argument case already got. Both now report
   `cannot read input file: <path> (<reason>)` / `cannot write output file:
   <path> (<reason>)` before exiting 1, with direct tests locking in both
   messages.

   Discovery itself had two real crash/misfire bugs, found the same way —
   exercising the tool against realistic multi-branch/class-bearing source,
   not just the five known bundle-composing functions. First: a top-level
   function with more than one top-level template-literal return threw
   uncaught out of `topLevelReturnTemplate`, and `discoverAssemblyFunctionNames`
   let that propagate — one unrelated multi-branch function anywhere in a
   ~4900-line file like `shell.ts` would have aborted discovery of every
   function after it, not just excluded the offending one. It's now caught
   per-function and excluded, the same treatment as a function with no
   template-literal return at all (`captureAssemblySegments` still throws,
   since it's asked to capture one specific function the caller already
   believes is assembler-shaped). Second: `topLevelReturnTemplate`'s
   nested-scope skip list excluded `FunctionDeclaration`/`FunctionExpression`/
   `ArrowFunction`/`MethodDeclaration` so a nested function's own return is
   never mistaken for the enclosing function's top-level one, but a class's
   `GetAccessorDeclaration`/`SetAccessorDeclaration`/`ConstructorDeclaration`
   are the same kind of nested scope and were missing from that list — a
   class defined inside an otherwise assembler-shaped function whose own
   accessor or constructor also returned a substituted template literal
   falsely tripped the "more than one top-level template-literal return"
   guard, throwing `captureAssemblySegments` and silently excluding the real
   assembler function instead of the offending nested one. Both fixes add
   the three missing node kinds/the catch-and-exclude behavior, with direct
   fixture-level regression tests; `shell.ts` remains untouched, zero
   behavior change.

   `findSpliceManifest` had one more real correctness gap besides the crash/
   misfire bugs above: it matches identifiers by name only, with no scope
   resolution, so a nested helper whose own parameter happens to share an
   import's local name — `function helper(sharedX) { return
   sharedX.toString(); }` inside an assembler function — was misattributed as
   a splice of the top-level `sharedX` import, a false-positive entry rather
   than the undercounting false negatives the earlier three splice-shape
   fixes closed. Unlike a missing entry, a false one doesn't reliably fail
   `verifySpliceManifestAgainstOutput` either: its expected serialized value
   can coincidentally reappear elsewhere in the assembled output, letting a
   corrupt manifest still report "0 unmatched entries". A new
   `isShadowedByParameter` check walks an identifier's enclosing function
   chain for a same-named parameter before trusting a name match, applied
   uniformly at all four splice-shape call sites via a shared
   `resolveImportBinding` helper, with direct regression tests for the
   `toString()` and `templateLiteral` shapes. Local `let`/`const` shadowing
   an import the same way is a narrower, rarer follow-on left open here, same
   as this doc's other explicit follow-on notes. `shell.ts` remains
   untouched, zero behavior change.

   That follow-on is now closed too: the same misattribution happens for a
   nested helper's own local `let`/`const` declaration, not just a parameter —
   `function helper() { const sharedX = f(); return sharedX.toString(); }`
   shadows the import exactly the same way, but the parameter-only check
   didn't catch it. `isShadowedByParameter` is renamed
   `isShadowedByLocalBinding` and now also walks each enclosing block's own
   `let`/`const` declarations (not nested deeper blocks, which aren't in scope
   at the usage site), checked by presence rather than declaration order —
   the same "resolves regardless of textual position" semantics block scoping
   actually has. Direct regression tests cover both the `toString()` and
   `templateLiteral` shapes for a local shadow, plus a negative case proving a
   same-named declaration in a *sibling* block (not an ancestor of the usage)
   still correctly splices. `shell.ts` remains untouched, zero behavior
   change.

   One more shadowing gap remained in the same two binding sites the prior
   two fixes already covered: `isShadowedByLocalBinding` checked
   `ts.isIdentifier(param.name)`/`ts.isIdentifier(decl.name)` only, so a
   destructured parameter or local declaration — `function helper({ sharedX
   }) { return sharedX.toString(); }`, or `const { sharedX } =
   computeLocal();` — went undetected entirely, since a destructured
   binding's name is an `ObjectBindingPattern`/`ArrayBindingPattern`, not a
   plain `Identifier`. A new `bindingNameDeclares` helper recurses through a
   `ts.BindingName` (handling nested patterns and rest/omitted elements) and
   replaces both identifier-only checks uniformly, closing the gap for
   parameters and local declarations at once rather than as two separate
   fixes. Direct regression tests cover both binding sites; `shell.ts`
   remains untouched, zero behavior change.

   A `catch` clause's own binding closed the same false-positive class for
   its own shape (`catch (sharedX) { return sharedX.toString(); }`), and a
   `for`/`for-of`/`for-in` loop's own declaration list closes it for the
   last remaining binding site: `isShadowedByLocalBinding` walked function
   parameters, block-level `let`/`const` statements, and catch-clause
   bindings, but a loop's declaration list sits directly on the
   `ForStatement`/`ForOfStatement`/`ForInStatement` node itself, never
   wrapped in a `VariableStatement` inside a `Block` — so
   `for (const sharedX of items) { return sharedX.toString(); }` (and the
   `for-in`/plain-`for` and destructured-loop-variable variants) went
   undetected entirely, the same misattribution class every binding-site fix
   above already closed for its own shape. The same ancestor walk now also
   checks a `for`/`for-of`/`for-in` node's `initializer` (when it is a
   `VariableDeclarationList`, not a plain assignment expression like
   `for (i = 0; ...)`) via the existing `bindingNameDeclares` helper, so
   destructured loop variables are covered for free. Direct regression tests
   cover `for-of`, `for-in`, plain `for`, a destructured `for-of` binding,
   and a sibling-block negative case (a loop variable in a non-enclosing
   block must not suppress a real splice); `shell.ts` remains untouched,
   zero behavior change.

   That "shadow-safe" claim turned out to be one binding shape short: the
   block-scoped check `isShadowedByLocalBinding` added only recognized a
   `VariableStatement` (`let`/`const`), not a local `function`/`class`
   declaration sitting directly in the same block — `function helper() {
   function sharedX() {} return sharedX.toString(); }` (and the same shape
   for a local `class sharedX { ... }`) went undetected entirely, the same
   false-positive class every binding-site fix above already closed for its
   own shape. The block-scoped branch now also checks each block statement
   for a `FunctionDeclaration`/`ClassDeclaration` whose own name matches,
   alongside the existing `let`/`const` check. Direct regression tests cover
   both the function-declaration and class-declaration shadow shapes, plus a
   sibling-block negative case (a function declaration in a non-enclosing
   block must not suppress a real splice); `shell.ts` remains untouched, zero
   behavior change.

   That "shadow-safe" claim turned out to be one binding shape short again: a
   `const`/`let` declared inside one `switch` case (without its own `{ }`
   braces) shares its lexical scope with every other clause of the same
   `switch` statement (spec 13.12.11's `BlockDeclarationInstantiation` runs
   over all clauses combined), but the block-scoped check only ever walked a
   `ts.isBlock`'s own statements — a `CaseClause`/`DefaultClause` holds its
   statements directly, never wrapped in a `Block` — so `switch (x) { case 1:
   const sharedX = f(); return sharedX.toString(); }` went undetected
   entirely, the same false-positive class every binding-site fix above
   already closed for its own shape. The block-scoped declaration scan was
   factored into a shared `statementsDeclare` helper and a new
   `ts.isCaseBlock` branch now checks it across every clause of the enclosing
   switch (not just the one the identifier sits in), matching the spec's
   shared-scope semantics. Direct regression tests cover a braceless case
   declaration plus a sibling-switch negative case (a non-enclosing switch's
   own case declaration must not suppress a real splice); `shell.ts` remains
   untouched, zero behavior change.

   That "shadow-safe" claim turned out to be one binding shape short one
   last time: every fix above treated shadowing as a block-scoping problem —
   walking enclosing `Block`/`CaseBlock` ancestors and matching each one's OWN
   statements, correct for `let`/`const`, which really are block-scoped. `var`
   is not: it hoists to the nearest enclosing function regardless of nesting
   depth, so `function helper() { if (x) { var sharedX = f(); } return
   sharedX.toString(); }` shadows the import for the WHOLE function even
   though the declaration sits in a sibling block the identifier never
   descends from — the ancestor-block walk simply never visits it, the same
   false-positive class every binding-site fix above already closed for its
   own shape. A new `varDeclaredInBody` helper recursively scans an enclosing
   function's entire body for a `var` declaring the name — at any nesting
   depth, including inside `if`/loop/switch bodies, but never descending into
   a nested function's own body, which owns its own `var` scope — checked
   alongside that function's parameters, the same point `isShadowedByLocalBinding`
   already checked them. Direct regression tests cover the hoisted-shadow case
   plus a negative case (a `var` declared inside a *nested* function must not
   leak out to shadow the enclosing one, the mirror image of the sibling-block
   negative cases above); `shell.ts` remains untouched, zero behavior change.
   Every parameter/declaration/catch/loop/local-function-or-class/switch-case/
   var-hoisting binding site `findSpliceManifest` can walk past is now
   shadow-safe.

   What's still open: turning `clientJs()`'s own hand-interleaved splice call
   sites into calls that actually go through the manifest-driven assembler (or
   an ES-module-loading equivalent) at build or runtime — real
   architecture-boundary work, not a mechanical extraction, the same "still
   open" item tracked below under the remaining panels/on-demand loading work.

   That "real architecture-boundary work" now has a concrete shape, not just a
   label — checking what actually blocks wiring `clientJs()`/`renderShell()`
   to the assembler as their *live* code path (rather than adding a 20th
   verification test) surfaces two real blockers, not one. First: the
   deployment model itself rules out today's assembler shape as a runtime
   dependency. `@autopilot/dashboard`'s `package.json` ships only
   `"files": ["dist"]`, built via `tsc -b`; `dist/` carries compiled `.js`
   and `.d.ts` declarations, never `.ts` source. `findSpliceManifest`/
   `captureAssemblySegments` work by parsing TypeScript *source text* with
   the `typescript` compiler — a devDependency of the repo root, not a
   dependency of the dashboard package, which today depends on nothing
   heavier than `esbuild`. Calling into that machinery from `clientJs()`/
   `renderShell()` — even once, lazily, cached the way `minifiedClientJs()`
   already caches its own esbuild pass — means either shipping `.ts` sources
   in the published package or adding the full TypeScript compiler as a new
   runtime dependency of a server that currently has none: a real dependency
   decision, not a mechanical wiring change, and not this firing's call to
   make unilaterally.

   Second, and more important: even a build-time-safe version of the flip —
   generate the manifest once via the existing CLI, embed it as a plain data
   literal `tsc -b` compiles normally, zero runtime parsing — would not
   actually dissolve the convergence point PARALLEL UNLOCK B exists to
   remove. The manifest is captured by parsing `shell.ts`'s *already
   hand-written* splice call sites; regenerating it after adding a feature
   still requires hand-editing `shell.ts` first to add that splice line, the
   exact edit this unlock is meant to make unnecessary. Wiring `clientJs()`
   to a manifest that still needs that same hand-edit before it reflects a
   new module would prove the assembler is "live" while leaving the actual
   promised benefit — a new feature is a new file, zero shared-file edits —
   undelivered: the enabler alone, re-labeled as the deliverable.

   The real fix neither this slice nor the 19 before it attempted: extract
   `switcherJs`/`fleetJs`/`connectJs`/`flyJs`/`searchJs` out of `shell.ts`
   into their own files under a features directory, and give `clientJs()` a
   directory-glob discovery step (not an AST-of-`shell.ts` one), so a new
   feature is a new file the glob picks up on its own — the only shape where
   "adding a module touches zero shared files" is actually true, and the
   only shape where a live wire-up costs no new runtime dependency (the
   compiled sibling `.js` files already ship in `dist`, resolved the same
   static-import way `shell.ts` already resolves every shared pure module
   today). That is a real extraction of ~4,900 lines of production,
   request-serving code against a zero-regression bar — genuinely the next
   slice, not a same-firing add-on. `shell.ts` is unchanged this firing; the
   task stays open.

   The directory-glob discovery half of that real fix can be built and
   proven standalone, without touching `shell.ts` first: `discoverFeatureModules`
   (`scripts/codemod/generate-splice-manifest.mjs`) scans every top-level
   `.ts`/`.mts` file in a directory (`.d.ts` excluded, non-recursive — a
   features directory is expected to hold one module per file) and reports
   which ones export at least one assembler-shaped function, reusing
   `discoverAssemblyFunctionNames` per file rather than re-deriving the
   "is this assembler-shaped" check a second way. Today's discovery is
   anchored to one hand-known input file (`shell.ts`); this is the missing
   mechanical piece the prior paragraph's analysis named — the actual
   precondition for "a new feature is a new file, zero shared-file edits" —
   built and fixture-tested on its own first, the same "prove it's mechanical
   first" order `discoverAssemblyFunctionNames` itself was built in before any
   real caller depended on it. Direct unit tests (`generate-splice-manifest.test.ts`'s
   new `discoverFeatureModules` suite) cover multiple files sorted by name, a
   file exporting more than one assembler-shaped function, a file with none at
   all, `.d.ts`/non-TypeScript exclusion, and an empty directory. `shell.ts`
   remains untouched, zero behavior change; the actual extraction into a
   features directory — and wiring `clientJs()` to read this discovery output
   — stays the open next slice.

   That "reports which ones export at least one assembler-shaped function"
   claim wasn't actually true: `discoverAssemblyFunctionNames` checks shape
   only, not export status — correct for its own contract, since shell.ts's
   local functions are called by name in the same file whether or not they
   carry `export` — but `discoverFeatureModules` reused it unfiltered, so a
   non-exported top-level function that happened to be assembler-shaped was
   reported as a discovered feature even though no future assembler could
   ever `import` it. A new `exportedFunctionNames` helper (same file) collects
   the top-level function declarations that actually carry an `export`
   modifier via `ts.getCombinedModifierFlags`, and `discoverFeatureModules`
   now intersects `discoverAssemblyFunctionNames`'s shape-only result against
   it rather than trusting shape alone — the same "discovery claims more than
   it delivers" bug class the splice-manifest's own undercounting/shadowing
   fixes above already closed, here a false positive instead of a false
   negative. `discoverAssemblyFunctionNames` itself is untouched, so its own
   real-shell.ts regression (all seven discovered functions are already
   exported there) still holds. Direct regression tests cover a file mixing
   an exported and a non-exported assembler-shaped function (only the
   exported one is reported) and a file whose only match is non-exported (the
   file is omitted entirely, the same as one with no assembler-shaped
   function at all). `shell.ts` remains untouched, zero behavior change.

   `discoverFeatureModules`'s own file filter had the matching gap one layer
   down: its exclusion only checked `entry.name.endsWith('.d.ts')`, but the
   inclusion filter explicitly scans `.mts` files too —
   `'types.d.mts'.endsWith('.d.ts')` is `false`, so a `.d.mts` declaration
   file slipped past the exclusion its own doc comment promised
   ("Declaration files (`.d.ts`) are excluded"), the same "excludes less than
   it delivers" bug class the splice-manifest's own undercounting/shadowing
   fixes closed repeatedly above, here for the directory scan rather than the
   AST walk. The filter now also excludes `.d.mts`, and the doc comment names
   both extensions. Direct regression test covers a `.d.mts` file carrying a
   genuine template-literal-returning function body (syntactically valid even
   though it wouldn't type-check as a real declaration file) alongside a real
   `.ts` module, locking in that only the real module is discovered.
   `shell.ts` remains untouched, zero behavior change.

   `discoverFeatureModules` itself still only reported WHICH files export
   assembler-shaped functions, not each one's splice registry or glue text —
   the exact gap `buildAssemblyManifest` already closed for a single known
   file by composing `discoverAssemblyFunctionNames` with
   `captureAssemblySegments`. A new `buildFeatureModulesManifest` performs
   that same composition per discovered file, so a features directory yields
   one serializable `{directoryPath, modules: AssemblyManifest[]}` manifest
   describing every module in it — the missing link between "discovery
   proven standalone" and "a real assembler has a manifest to read", built
   fixture-tested TDD-first (red confirmed via `buildFeatureModulesManifest is
   not a function` before the implementation existed) the same way every
   prior primitive in this saga was. Direct unit tests
   (`generate-splice-manifest.test.ts`'s new `buildFeatureModulesManifest`
   suite) cover per-file `AssemblyManifest` order matching discovery order, a
   real relative-import splice captured with its correct `modulePath`/
   `exportedName`/`kind`, a file exporting multiple functions keyed
   correctly, and an empty directory. The CLI's declaration file
   (`scripts/codemod/generate-splice-manifest.d.mts`) gained the matching
   `FeatureModulesManifest` type and function signature — a checked-JS module
   with a hand-maintained `.d.mts` needs both kept in sync, the same
   constraint every export added to this file has had to satisfy. Nothing yet
   calls this from the CLI's `main()`; `shell.ts` remains untouched, zero
   behavior change — the actual extraction into a features directory, and
   wiring `clientJs()`/the CLI to read this manifest, stays the open next
   slice.
   `main()` now closes that gap for a directory input: it `statSync`s
   `<input-file-or-directory>` and, when the path is a directory, calls
   `buildFeatureModulesManifest` instead of the single-file
   `buildAssemblyManifest` path, writing the resulting
   `FeatureModulesManifest` to `<directory>.feature-modules-manifest.json`
   (or an explicit output path, same fallback shape the single-file case
   already had) and printing a matching "N feature module(s), N assembler
   function(s)" summary. The single-file path is otherwise unchanged — same
   `cannot read input file`/`cannot write output file` clean-error messages,
   now shared between both branches via a new `writeManifestOrExit` helper
   instead of duplicated try/catch blocks — and the usage line now reads
   `<input-file-or-directory>` to say so. Built TDD-first against the real
   CLI subprocess suite (three new tests red — `EISDIR: illegal operation on
   a directory, read` from the old file-only `readFileSync` path — before
   the directory branch existed): writes a manifest + summary for a
   directory input, the same default-output-path fallback the file case
   already proved, and a parity check against `buildFeatureModulesManifest`
   called directly on the same fixture directory. `shell.ts` remains
   untouched, zero behavior change — the CLI can now emit either manifest
   shape depending on what it's pointed at, but nothing yet extracts
   `shell.ts`'s own five feature functions into files for it to discover,
   which stays the open next slice.
   `exportedFunctionNames` (the export filter `discoverFeatureModules` relies
   on) had one more real undercounting gap, the same "excludes less than it
   delivers" bug class the `.d.mts` and unexported-function fixes above
   already closed: it only recognized an `export` modifier sitting directly on
   the `FunctionDeclaration` node itself, so a function declared without
   `export` and exported later via a standalone `export { name };` (or aliased
   `export { name as alias };`) statement — a real TypeScript export shape,
   just a less common one than inline `export function` — carried no such
   modifier and was silently reported as non-exported, dropping an
   importable feature module. `exportedFunctionNames` now also walks each
   top-level `ExportDeclaration` with no `moduleSpecifier` (a re-export like
   `export { name } from './other.js'` isn't a local declaration at all, so
   it's skipped) and adds each named export's LOCAL name —
   `propertyName ?? name`, since `name` alone is the external alias for
   `export { local as alias }`, not what `discoverAssemblyFunctionNames`
   reports. Direct regression tests cover the plain and aliased standalone
   `export { ... }` shapes plus the re-export negative case. `shell.ts`
   remains untouched, zero behavior change.
   `exportedFunctionNames` had one more standalone-export shape it missed,
   the same "excludes less than it delivers" bug class as the standalone
   `export { name };` fix above: `export default name;` parses as a distinct
   AST node kind (`ExportAssignment`), not the `ExportDeclaration` that fix's
   `NamedExports` walk already covers, and the referenced
   `FunctionDeclaration` itself carries no `export` modifier either (only
   `export default function foo() {}` — already covered by the inline check —
   does) — so a function exported this way fell through both checks and was
   silently reported as non-exported, dropping an importable feature module.
   `exportedFunctionNames` now also recognizes a top-level `ExportAssignment`
   with `isExportEquals` false (i.e. `export default`, not the CommonJS-style
   `export =`, which never legitimately appears in this repo's real-ES-module
   feature modules) whose expression is a plain identifier, adding that
   identifier's text — the only expression shape that can refer to a local
   function declaration by name. Direct regression test covers the standalone
   `export default name;` shape. `shell.ts` remains untouched, zero behavior
   change.
   `exportedFunctionNames` had the mirror-image bug from every fix above: all
   of those closed UNDER-counting gaps (a real value export silently dropped);
   this one was an OVER-counting false positive. A type-only export — a whole
   `export type { ... };` statement, or a single `export { type name };`
   specifier inside an otherwise-normal export list (the isolatedModules-safe
   combined syntax) — is elided entirely at compile time, so the emitted JS
   carries no runtime export under that name at all; `import { name }` against
   it resolves to `undefined`, not the function. The NamedExports walk never
   checked `ExportDeclaration.isTypeOnly` or each `ExportSpecifier`'s own
   `isTypeOnly`, so both shapes were reported as real, importable feature
   modules even though no future assembler could actually import them — a
   correctness gap in the opposite direction from every prior fix in this
   list, closed the same way: check the flag TypeScript already exposes for
   it. Direct regression tests cover the whole-statement `export type { ... };`
   form and the per-specifier `export { type name, other };` form mixed with a
   real value export in the same statement. `shell.ts` remains untouched, zero
   behavior change.
   `generateFeatureModulesIndexSource` (same file) closes the missing
   static-import counterpart `discoverFeatureModules`'s own doc comment had
   flagged as still open: a pure function of a features directory's current
   file listing that generates the TypeScript source of a barrel file —
   one `import { ... } from './<module>.js';` line per discovered module
   (`.mjs` for a `.mts` module) plus one ordered
   `export const FEATURE_MODULE_FUNCTIONS: Array<() => string> = [...]` —
   instead of the hand-typed `switcherJs`/`connectJs`/`flyJs`/`searchJs`
   import list `shell.ts` carries today. This is the artifact a later cut can
   have `clientJs()` import instead of five hand-written names, the last
   mechanical piece before that shared-file convergence point actually
   dissolves; it does not read or write `shell.ts` itself, and does not
   write anything to disk (a pure string-in-string-out function, same as
   every other primitive in this file before a real caller depended on it —
   CLI wiring to write it to disk stays an explicit follow-on, not this cut).
   Direct unit tests cover the import-line-per-module and
   one-file-multiple-functions shapes already proven for
   `discoverFeatureModules`, the `.mts` → `.mjs` specifier mapping, an empty
   directory, and a real-`src/web/features/` regression locking in the exact
   four import lines (`connect.ts`/`fly.ts`/`search.ts`/`switcher.ts`, in
   that file-name order) plus a `ts.transpileModule` syntax check proving the
   generated source is not just string-shaped but actually valid TypeScript.
   `shell.ts` remains untouched, zero behavior change.
   That "CLI wiring... stays an explicit follow-on" is now closed:
   `--emit-index <features-dir> [output-file]` — the exact invocation
   `generateFeatureModulesIndexSource`'s own doc comment already advertised as
   how to regenerate its output — is now a real `main()` branch, not just a
   documented promise. It resolves/`statSync`s the directory (a clean
   `cannot read input directory: <path> (<reason>)` error, same shape every
   other `main()` branch already uses, when it's missing; a clean
   `--emit-index requires a directory, got a file: <path>` error when it's not
   a directory at all), calls `generateFeatureModulesIndexSource` directly, and
   writes the result to `<features-dir>/index.ts` by default (or an explicit
   output path) via a new shared `writeFileOrExit` helper that
   `writeManifestOrExit` now delegates to, rather than each branch owning its
   own try/catch around `writeFileSync`. A new CLI subprocess suite (six
   tests, same shape as the existing single-file/directory-manifest suites
   above) covers the no-directory usage error, the missing-directory and
   file-instead-of-directory clean errors, the unwritable-output-path clean
   error, an explicit output path whose content matches
   `generateFeatureModulesIndexSource` called directly on the same fixture,
   and the `<directory>/index.ts` default. This is the last mechanical piece
   PARALLEL UNLOCK B's own analysis named — a features directory can now
   regenerate its own static-import barrel with one command — but wiring
   `clientJs()` to actually import that barrel instead of its five
   hand-written feature-module names, and extracting `fleetJs`
   itself into `web/features/`, stay the open next slice; `shell.ts` remains
   untouched, zero behavior change.
   `web/features/index.ts` itself is now generated and committed (via
   `--emit-index`), with `generate-splice-manifest.test.ts`'s new "the
   committed web/features/index.ts matches regenerating it fresh from the
   real directory" test guarding it against drift — a hand-edit, or a
   new/removed feature module regenerating a different barrel, fails there
   instead of shipping a stale `FEATURE_MODULE_FUNCTIONS` array. (The CLI's
   raw output isn't prettier-formatted; the test formats the fresh source
   through `prettier.format` before comparing, the same step a real
   regeneration workflow would run.) Nothing imports it yet — attempting the
   actual `clientJs()` rewire this same firing surfaced two real blockers,
   not mechanical ones:
   First, concatenation order is not free to change. `clientJs()`'s five
   calls are hand-ordered `switcherJs, fleetJs, connectJs, flyJs, searchJs`
   today; `FEATURE_MODULE_FUNCTIONS` discovers in directory order
   (`connect, fly, search, switcher`). Swapping `clientJs()` to
   `` `${FEATURE_MODULE_FUNCTIONS.map((fn) => fn()).join('\n')}\n${fleetJs()}` ``
   moved `fleetJs()`'s top-level `var lastFleetState = null;` (still declared
   inside `shell.ts`, never spliced) to run AFTER `flyJs()`'s `flyInit()` —
   which reads `lastFleetState.projects` synchronously during its own
   initial paint — and broke `flight-total-progress.test.ts` (3 real
   assertion failures: `aria-valuenow` stuck at `0`/`'0'` instead of the
   expected computed percentage). Putting `fleetJs()` FIRST in the
   concatenation (before the discovered barrel, whatever order the barrel
   itself is in) fixed it — confirmed by rerunning that suite green. So the
   real constraint a future assembler must honor isn't "any order is fine
   because these are independent modules" — it's "whatever declares
   `lastFleetState` must run before whatever reads it," a dependency that's
   invisible to `discoverFeatureModules` (which only looks at exports, not
   cross-module reads of shell-scoped globals) and will only get worse once
   more modules are extracted. Untangling that read (the same
   caller-supplied-value injection pattern `heatmapDays`/`actMeta`/
   `flightProgressOf` already use elsewhere in this epic) before or during
   `fleetJs`'s own extraction is what actually removes the ordering
   constraint; simply discovering files does not.
   Second, `generate-splice-manifest.test.ts`'s own byte-for-byte
   reconstruction suite ("reconstructing shell.ts's one remaining
   bundle-composing function... clientJs: reconstructs the served bundle by
   composing its five nested assembler functions purely from the manifest",
   plus its disk-round-trip twin) hard-codes `clientJs()`'s current shape: a
   single top-level `` return `...`; `` template literal whose every `${...}`
   slot is a bare `<fnName>()` call, resolved by stripping the parens and
   looking the name up in a hand-built `nestedOutputs` map. Rewriting
   `clientJs()` to read `FEATURE_MODULE_FUNCTIONS` — whether inline as a
   `.map().join()` slot, or via a local variable computed before the
   `return` (the exact shape this suite's own comments call out as
   `renderShell()`'s "documented follow-on", never attempted for
   `clientJs()`) — produces a slot shape `captureAssemblySegments`/
   `resolveNonSpliceSlot` cannot resolve today: `clientJs: no known
   resolution for non-splice slot` `featureModules` (the local-variable
   shape) in both the in-memory and disk-round-trip reconstruction tests.
   Teaching the resolver a generic `<arrayExpr>.map(fn => fn()).join(sep)`
   shape (or restructuring the barrel to expose one more single-call-shaped
   wrapper function and teaching the resolver that one name) is real,
   additional design work on the test tooling itself, not a mechanical
   follow-on — so it stays part of the open next slice alongside the
   `lastFleetState` fix and the `fleetJs` extraction, rather than a
   same-firing add-on. `shell.ts` remains untouched, zero behavior change;
   both attempts were reverted after `flight-total-progress.test.ts` and the
   reconstruction suite caught them.
   Fifty-sixth cut closed that open next slice by taking the second of the
   two options its own write-up named: `generateFeatureModulesIndexSource`
   now also emits `featureModulesJs()` — a plain wrapper function alongside
   `FEATURE_MODULE_FUNCTIONS` that does the `.map((fn) => fn()).join('\n')`
   composition itself, so every caller-facing slot stays a bare `<fnName>()`
   call, the one non-splice shape `resolveNonSpliceSlot`/`clientJs()`'s own
   reconstruction test already knew how to resolve — no generic AST shape
   needed in the codemod's production resolver after all. `shell.ts`'s
   `clientJs()` now reads `import { featureModulesJs } from
   './features/index.js';` instead of four hand-written feature-module
   imports, and its body is `` `${fleetJs()}\n${featureModulesJs()}` `` —
   `fleetJs()` first (the ordering fix the prior attempt already validated:
   `fleetJs()`'s `lastFleetState` must be declared before `flyJs()`'s
   `flyInit()` reads it), the discovered barrel after. This is the actual
   dissolution of the convergence point PARALLEL UNLOCK B's whole write-up
   was building toward: a new feature module under `web/features/` now needs
   zero `shell.ts` edits — add the file, regenerate `index.ts` via
   `--emit-index`, done. `generate-splice-manifest.test.ts`'s two
   `clientJs()` reconstruction suites (in-memory and disk-round-tripped) now
   compose a `featureModulesJs` entry into their `nestedOutputs` map by
   joining the same four already-reconstructed feature outputs in the same
   directory order `FEATURE_MODULE_FUNCTIONS` uses, rather than teaching
   `assembleFromManifest` a `.map().join()` slot shape — proving the manifest
   still accounts for the real bundle without the resolver itself changing.
   The "accounts for every relative-import binding" regression guard's
   `KNOWN_NON_SPLICE_IMPORTS` set collapses from four names
   (switcherJs/connectJs/flyJs/searchJs) to one (`featureModulesJs`), since
   `clientJs()` now only imports the one barrel function. Moving
   `switcherJs()` from first to last in the concatenation is safe because it
   is fully self-contained — its `THEMES`/`applyTheme`/`savedTheme`
   declarations are referenced nowhere else in the bundle (confirmed by
   grep), unlike `fleetJs()`'s `lastFleetState`. `fleetJs` extraction itself
   — the other half of the prior attempt's open next slice — stays a
   follow-on: `web/features/index.ts` is generated and would need `fleetJs`
   to become a real discoverable feature module first, a design change to
   the shared `lastFleetState` read the prior attempt already identified as
   the actual blocker there, not touched by this cut.
   Fifty-seventh cut answered PARALLEL UNLOCK A2's honest reseed of this
   slice (web-mstevob6-8nu257 had closed complete while `shell.ts` sat at
   ~4,900 lines — the codemod tooling above was a real enabler, but wiring a
   pure-logic helper's *reconstruction* into a manifest never once shrank the
   file whose line count the acceptance criteria actually measure, since
   every prior cut left the DOM-building half — the bulk of each function —
   inline by design): `web/layout-css.ts` now holds `layoutCss()`, the
   ~540-line static CSS template literal previously declared inside
   `shell.ts` itself. Unlike every earlier cut, this one moves the WHOLE
   function, not a pure-logic half paired with a DOM-building half left
   behind — there is no DOM-building half, `layoutCss()` is a single template
   literal with zero `${}` interpolation of any binding, so nothing was left
   to leave inline. It also needed no `.toString()`/`JSON.stringify()` splice
   treatment at all, unlike the fifty-six cuts before it: `layoutCss()` is
   never part of `clientJs()`'s browser-executed bundle in the first place —
   `server/routes.ts`'s `GET /tokens.css` handler and `shell.ts`'s own
   `assetVersion()` (a content-hash helper, not the bundle itself) are its
   only callers, both server-side — so a plain `import { layoutCss } from
   './layout-css.js'` is both correct and the simplest possible extraction.
   The eleven external consumers that previously imported `layoutCss` off
   `shell.js` (`server/routes.ts` plus ten `*-m3-surface.test.ts`/
   `*-m3-shape.test.ts` CSS-rule assertion tests, and `first-run-tour.test.ts`
   which also imports `renderShell`/`clientJs`) now import it from
   `web/layout-css.js` directly instead — the same "import the real module,
   not through shell.ts" convention `format.ts`'s `fmtCost` etc. already
   established, rather than adding a re-export shim to `shell.ts`.
   `generate-splice-manifest.test.ts`'s relative-import regression guard
   gained `layoutCss` in `KNOWN_NON_SPLICE_IMPORTS` alongside
   `fontFaceCss`/`PRELOAD_FONT_PATHS`, the same server-side-only-generation
   category. Net result: `shell.ts` drops from 4,245 to 3,705 lines in one
   cut — more than the accumulated effect of the fifty-six cuts before it
   combined — because this is the first cut in the slice to actually delete
   text from the file instead of only proving a pure-logic half could be
   read back out of it. It does not by itself close PARALLEL UNLOCK A2:
   `shell.ts` is still ~4.6x the 800-line law, and every DOM-building half
   the prior cuts left inline is exactly the kind of region-with-no-pure/DOM
   split this reseed calls out as the real remaining work — but it proves
   the "extract a whole region, not just its pure sliver" move the reseed
   asked for is possible wherever a region turns out to have no DOM half to
   split off in the first place, and banks a real, measured line-count win
   doing it. Full gate green: typecheck, lint, format:check, 3272 tests,
   build, and `ci:bundle-size` (119.4KB raw / 35.0KB gzip, unchanged from
   budget — confirming `layoutCss()` was never shipped in `/app.js` to begin
   with).
   Fifty-eighth cut closed the last two same-file-unexported helpers
   `renderShell()` called by name: `web/shell-html.ts` now holds
   `themeButtons`/`escapeAttr`, the theme-switcher nav's per-theme `<button>`
   markup and the generic HTML-attribute escaper — same shape as the
   fifty-seventh cut's `layoutCss()` move (a whole function, no DOM-building
   half to leave behind, never part of the browser-executed `/app.js` bundle
   since both only ever run server-side inside `renderShell()`), so a plain
   `import { themeButtons, escapeAttr } from './shell-html.js'` was enough,
   no `.toString()`/`JSON.stringify()` splice treatment needed. Direct unit
   tests (`shell-html.test.ts`) cover both — `escapeAttr` had no coverage at
   all before this, direct or indirect, a genuine test gap the same shape the
   twenty-second through twenty-fourth cuts closed elsewhere; `themeButtons()`'s
   output was already covered indirectly through `renderShell()` in
   `routes.test.ts`. `generate-splice-manifest.test.ts`'s relative-import
   regression guard gained `themeButtons`/`escapeAttr` in
   `KNOWN_NON_SPLICE_IMPORTS` alongside `layoutCss`, and its `renderShell()`
   reconstruction suite's `resolveRenderShellSlot` now calls the real
   imported functions directly instead of hand-replicating their formula
   against `@autopilot/tokens` — the one remaining hand-retyped pair in that
   suite, now gone. Net result: `shell.ts` drops from 3,705 to 3,690 lines —
   a smaller win than the fifty-seventh cut's since these two helpers were
   always small, but it closes out every extractable whole-region,
   no-DOM-half candidate `renderShell()`/`assetVersion()` themselves offered;
   `renderShell()`'s own HTML template body and `assetVersion()`'s hash
   computation remain the last two top-level functions in `shell.ts` outside
   `fleetJs()`/`clientJs()`, both too entangled with the manifest-tracked
   assembler shape to move without also redesigning
   `generate-splice-manifest.test.ts`'s reconstruction resolver — a
   deliberate design call, not a mechanical follow-on, left open same reason
   the `fleetJs()` extraction and the DOM-lib tsconfig boundary are. Full
   gate green: typecheck, lint, format:check, test, build.
   Fifty-ninth cut: `web/office-map.ts` gained `officeTweenPos` alongside the
   existing `officeZoneX`/`officeTargetFor`/`officeEase`/`officeSatellitePos`
   it already sat next to conceptually — the live-firing dot's per-frame
   eased-interpolation math (clamp elapsed-time-ratio into `t`, run it
   through `officeEase`, lerp `from`→`target` on both axes) that
   `officeMapSection`'s `requestAnimationFrame` tween callback previously
   computed inline before writing `dot`'s `cx`/`cy` attributes, spliced the
   same way, with direct unit tests added to `office-map-geometry.test.ts`
   (t=0 is `from` exactly, t=1 is `target` exactly, midpoint matches
   `officeEase(0.5)`) instead of only indirect DOM-render coverage
   (`office-map.test.ts`, which only ever asserted the tween's *settled* end
   position, never a mid-tween value). It calls `officeEase` directly by
   same-module reference rather than taking it as an injected parameter, the
   same precedent `officeTargetFor`'s own call to `officeZoneX` already set.
   The impure/DOM-adjacent half (`Date.now()`, the `dot.setAttribute` calls,
   and the `requestAnimationFrame`/`officeMapRaf` scheduling) stays inline,
   same reason the office map's SVG-drawing half did. Full gate green:
   typecheck, lint, format:check, test, build.
   Sixtieth cut (SHELL HUB RELIEF, web-mt69bego-etc8te) answered the
   fifty-sixth cut's own reseed with a whole-region move, not another
   pure-logic sliver: the first-run guided tour (`tourFocusable`/
   `closeTour`/`onTourKeydown`/`paintTour`/`openTour`/`maybeAutoOpenTour`,
   plus its `TOUR_STEPS`/`tourStepMeta` splice and the masthead `#tour-btn`
   click delegate) moved out of `fleetJs()` entirely into
   `web/features/tour.ts` as a whole new discoverable feature module — the
   same shape `switcher.ts`/`connect.ts` already proved, not a
   pure-logic-half-plus-inline-DOM-half split. Unlike every prior cut in
   this slice, the tour dialog was fully self-contained (its own local
   `tourStep`/`tourLastFocus`/`tourEl` state, no read of `lastFleetState` or
   any other fleet-wide mutable state `fleetJs()` owns) — the exact "region
   with no pure/DOM split needed, and no shared-state entanglement" shape
   the fifty-sixth cut's `fleetJs()` note had flagged as the actual blocker
   for further whole-function moves out of `fleetJs()`. `maybeAutoOpenTour()`
   stays called from `fleetJs()`'s `renderFleet()` as a bare, unimported
   identifier in that function's own served text — safe because `clientJs()`
   concatenates `fleetJs()` + `featureModulesJs()` into one non-module
   script, so `maybeAutoOpenTour`'s hoisted `function` declaration is
   defined in the shared top-level scope by the time `renderFleet()`
   actually invokes it (async, after the whole script has already run
   once), the same hoisting-across-concatenation precedent `switcher.ts`'s
   `applyTheme`/`search.ts`'s calls to `fleetJs()`'s `el()` already relied
   on. `web/tour.ts`'s own module doc comment (which used to say the dialog
   "stays inline in `fleetJs()`") and a stale `shell.ts` comment referencing
   "the same TOUR_STEPS convention above" (no longer accurate once
   TOUR_STEPS left `fleetJs()`) were both updated to match. Direct unit
   tests (`test/web/features/tour.test.ts`) instead of only indirect
   DOM-render coverage (`tour.test.ts`, `tour-button-tooltips.test.ts`,
   `first-run-tour.test.ts`, all of which exercise the tour through the real
   client bundle and needed no changes — zero behavior change, confirmed by
   this unchanged pass). `generate-splice-manifest.test.ts`'s feature-module
   discovery/reconstruction suites gained `tour.ts` as a seventh discovered
   module alongside the existing six, plus a `reconstructTourJs()` helper
   mirroring `connectJs`'s/`searchJs`'s own real-relative-import-splice
   reconstruction (TOUR_STEPS/tourStepMeta resolved against `web/features/`
   rather than `SHELL_DIR`). Net result: `shell.ts` drops from 5,342 to
   5,230 lines. Full gate green: typecheck, lint, format:check, 6,640
   tests, build (`ci:bundle-size` still fails a pre-existing budget
   overrun — 199.9KB raw / 56.0KB gzip against the 150.0KB/45.0KB budget,
   unchanged before and after this cut — the epic's own acceptance
   criterion, not a regression this line-count-focused cut addressed).
   Sixty-first cut (SHELL HUB RELIEF, web-mt69bego-etc8te) repeated the
   sixtieth cut's whole-region-move shape on the next self-contained
   candidate: the project page's Flight console panel
   (`flightConsoleSection`/`renderConsoleBody`, plus its own local
   `consoleLoaded` project-id-keyed state and the `consoleLinesAriaLabel`
   splice) moved out of `fleetJs()` entirely into
   `web/features/flight-console.ts` as a new discoverable feature module.
   Like the tour dialog, the console panel was fully self-contained — its
   own `consoleLoaded` map, declared and used only inside this one block,
   no read of `lastFleetState` or any other fleet-wide mutable state
   `fleetJs()` owns — the same "no pure/DOM split needed, and no
   shared-state entanglement" shape the tour cut proved extractable.
   `flightConsoleSection(pid)` stays called from `fleetJs()`'s
   `renderProjectPage()` as a bare, unimported identifier, safe for the
   same hoisting-across-concatenation reason `tour.ts`'s
   `maybeAutoOpenTour` call site already relies on. Direct unit tests
   (`test/web/features/flight-console.test.ts`) instead of only indirect
   DOM-render coverage (`flight-console.test.ts`, which drives the real
   client bundle through expand/fetch/retry and needed no changes — zero
   behavior change, confirmed by this unchanged pass).
   `generate-splice-manifest.test.ts`'s feature-module discovery/
   reconstruction suites gained `flight-console.ts` as an eighth
   discovered module (sorted between `connect.ts` and `fly.ts`), plus a
   `reconstructFlightConsoleJs()` helper mirroring `tourJs`'s own
   real-relative-import-splice reconstruction (`consoleLinesAriaLabel`
   resolved against `web/features/` rather than `SHELL_DIR`). Net result:
   `shell.ts` drops from 5,230 to 5,173 lines. Full gate green: typecheck,
   lint, format:check, test:impacted (853 tests), build.
   Sixty-second cut (SHELL HUB RELIEF, web-mt69bego-etc8te) repeated the
   sixtieth/sixty-first cuts' whole-region-move shape on the next
   self-contained candidate: the project page's Docs reader panel
   (`docsSection`/`loadDoc`, plus its own local `openDoc` project-id-keyed
   state and the `[data-doc-open]` click delegate) moved out of `fleetJs()`
   entirely into `web/features/docs-viewer.ts` as a new discoverable feature
   module. Like the console panel, the docs reader was fully self-contained —
   its own `openDoc` map, declared and used only inside this one region
   (including the click delegate that reads/writes it), no read of
   `lastFleetState` or any other fleet-wide mutable state `fleetJs()` owns —
   the same "no pure/DOM split needed, and no shared-state entanglement"
   shape the tour and console cuts already proved extractable. `docsSection`
   still carries a real relative-import splice of its own (`docFileTip` from
   `../docs-panel.js`, embedded via `.toString()`), now resolved relative to
   `web/features/` instead of `shell.ts`, the same shape `flight-console.ts`'s
   `consoleLinesAriaLabel` splice already proved. `docsSection(pid)` stays
   called from `fleetJs()`'s `renderProjectPage()` as a bare, unimported
   identifier, safe for the same hoisting-across-concatenation reason
   `flight-console.ts`'s `flightConsoleSection` call site already relies on;
   `loadDoc`'s own call to `renderMarkdown` (declared in `search.ts`, a
   feature module concatenated in a different position) works the same way —
   every top-level `function` declaration in the concatenated non-module
   script hoists to the shared scope regardless of which feature module
   physically declares it, so call order among feature modules was never the
   real constraint (only `fleetJs()`'s own `lastFleetState` read, fixed
   before the fifty-sixth cut, was). A stray one-line comment fragment left
   behind by the sixty-first cut ("// The raw flight CONSOLE ... GET",
   orphaned when the rest of that comment moved to `flight-console.ts`) was
   removed as part of this same edit, since it sat directly inside the region
   being touched. Direct unit tests (`test/web/features/docs-viewer.test.ts`)
   instead of only indirect DOM-render coverage (`docs-file-tooltip.test.ts`,
   `docs-panel.test.ts`, `docs-panel-m3-surface.test.ts`, all of which drive
   the real client bundle through `clientJs()`/`renderShell()` and needed no
   changes — zero behavior change, confirmed by this unchanged pass).
   `generate-splice-manifest.test.ts`'s feature-module discovery/
   reconstruction suites gained `docs-viewer.ts` as a ninth discovered module
   (sorted between `connect.ts` and `flight-console.ts`), plus a
   `reconstructDocsViewerJs()` helper mirroring `flightConsoleJs`'s own
   real-relative-import-splice reconstruction (`docFileTip` resolved against
   `web/features/` rather than `SHELL_DIR`). Net result: `shell.ts` drops from
   5,173 to 5,085 lines. Full gate green: typecheck, lint, format:check,
   test:impacted (855 tests), build.
   Sixty-third cut (SHELL HUB RELIEF, web-mt69bego-etc8te) repeated the
   sixtieth/sixty-first/sixty-second cuts' whole-region-move shape on the next
   self-contained candidate: the project page's CURRENT ROUND panel
   (`roundSection`/`renderRoundBody`) moved out of `fleetJs()` entirely into
   `web/features/round-panel.ts` as a new discoverable feature module. Unlike
   the tour dialog, console panel, and docs reader, this panel keeps no
   module-level state at all — no `pid`-keyed map survives between renders,
   an even simpler case of the same "no read of `lastFleetState` or any other
   fleet-wide mutable state `fleetJs()` owns" self-containment those cuts
   already proved extractable. `roundSection(pid)` stays called from
   `fleetJs()`'s `renderProjectPage()` as a bare, unimported identifier, safe
   for the same hoisting-across-concatenation reason `docsViewerJs`'s
   `docsSection` call site already relies on. `roundSinceLabel`/
   `roundStatItems` (from `web/stat-tiles.ts`) keep their real
   relative-import splice via `.toString()`, now resolved relative to
   `web/features/` instead of `shell.ts`, the same shape `docs-viewer.ts`'s
   `docFileTip` splice already proved. Direct unit tests
   (`test/web/features/round-panel.test.ts`) instead of only indirect
   DOM-render coverage (`round-panel.test.ts`, which drives the real client
   bundle through fetch/render and needed no changes — zero behavior change,
   confirmed by this unchanged pass). `generate-splice-manifest.test.ts`'s
   feature-module discovery/reconstruction suites gained `round-panel.ts` as
   a tenth discovered module (sorted between `notifications.ts` and
   `search.ts`), plus a `reconstructRoundPanelJs()` helper mirroring
   `docsViewerJs`'s own real-relative-import-splice reconstruction. Net
   result: `shell.ts` drops from 5,085 to 5,033 lines. Full gate green:
   typecheck, lint, format:check, test, build.
   Sixty-fourth cut (SHELL HUB RELIEF, web-mt69bego-etc8te) repeated the
   sixtieth/sixty-first/sixty-second/sixty-third cuts' whole-region-move shape
   on the next self-contained candidate: the project page's KEEPER
   issue-triage panel (`issueTriageSection`/`renderIssueTriageBody`/
   `loadIssueTriageBody`, plus its own pid-keyed `issueTriagePlansByProject`
   map and the `[data-issue-triage-execute]` click delegate) moved out of
   `fleetJs()` entirely into `web/features/issue-triage.ts` as a new
   discoverable feature module. Like the console panel, this one keeps its
   own module-level state — `issueTriagePlansByProject`, read by the execute
   click handler after the preview render populates it — the same
   self-contained-state shape the tour/console/docs-viewer cuts already
   proved extractable: no read of `lastFleetState` or any other fleet-wide
   mutable state `fleetJs()` owns. Unlike every prior whole-region move,
   though, this panel shares one helper — `decisionItemHeadMeta` — with a
   panel that does NOT move: the KEEPER PR review panel, which stays inline
   in `fleetJs()` since it isn't itself project-scoped. Rather than
   duplicate `decisionItemHeadMeta`'s `.toString()` splice into the new
   module (no other splice in this epic is duplicated across two files),
   `renderIssueTriageBody` calls it as a bare, unimported identifier, and the
   splice itself stays in `shell.ts` — relocated to sit next to the PR review
   section, its one remaining consumer there — relying on the same
   concatenated-script hoisting every whole-region move already depends on
   for `el`/`tipChip`/`fmtAgo`, just crossing from `fleetJs()`'s own text
   into a feature module's text instead of between two feature modules.
   `issueTriageSection(pid)` itself stays called from `fleetJs()`'s
   `renderProjectPage()` as a bare, unimported identifier, safe for the same
   reason. Direct unit tests (`test/web/features/issue-triage.test.ts`,
   including a test that the module's output references
   `decisionItemHeadMeta(` without ever declaring
   `function decisionItemHeadMeta(` itself) instead of only indirect
   DOM-render coverage (`issue-triage-execute-tooltip.test.ts`,
   `issue-triage-panel.test.ts`, both of which drive the real client bundle
   and needed no changes — zero behavior change, confirmed by this unchanged
   pass). `generate-splice-manifest.test.ts`'s feature-module discovery/
   reconstruction suites gained `issue-triage.ts` as an eleventh discovered
   module (sorted between `fly.ts` and `locale.ts`), plus a
   `reconstructIssueTriageJs()` helper mirroring `roundPanelJs`'s own
   real-relative-import-splice reconstruction. Net result: `shell.ts` drops
   from 5,033 to 4,894 lines. Full gate green: typecheck, lint, format:check,
   6,715 tests, build.
   Sixty-fifth cut (SHELL HUB RELIEF, web-mt69bego-etc8te) repeated the
   sixtieth through sixty-fourth cuts' whole-region-move shape on the next
   self-contained candidate: the project page's DETECTED BACKLOG panel
   (`backlogSection`/`renderBacklogBody`, plus its own `backlogMatchText`
   (`shared/backlog-match.ts`) and `backlogCandidateMeta`
   (`web/backlog-panel.ts`) relative-import splices) moved out of `fleetJs()`
   entirely into `web/features/backlog.ts` as a new discoverable feature
   module. Like `round-panel.ts`, this panel keeps no module-level state at
   all — every render fetches fresh and paints from the response — and unlike
   every whole-region move so far it has no execute click handler of its own:
   confirming a candidate reuses the task board's own `data-task-done`
   action, which stays inline in `fleetJs()` since it acts on the board, not
   this panel. `backlogSection(pid)` itself stays called from `fleetJs()`'s
   `renderProjectPage()` as a bare, unimported identifier, safe for the same
   concatenated-script hoisting reason every whole-region move already
   depends on for `el`/`tipChip`. Direct unit tests
   (`test/web/features/backlog.test.ts`) instead of only indirect DOM-render
   coverage (`test/web/backlog-panel.test.ts`, which drives the real client
   bundle through fetch/render and needed no changes — zero behavior change,
   confirmed by this unchanged pass). Since `backlog.ts` sorts alphabetically
   before every other file in `web/features/`,
   `generate-splice-manifest.test.ts`'s feature-module discovery/
   reconstruction suites gained it as the FIRST discovered module (shifting
   every other module's index by one) rather than appended at the tail, plus
   a `reconstructBacklogJs()` helper mirroring `roundPanelJs`'s own
   real-relative-import-splice reconstruction. Net result: `shell.ts` drops
   from 4,894 to 4,821 lines. Full gate green: typecheck, lint, format:check,
   test, build.
3. `server.ts` → router + handler modules.
   **In progress** — first cut: `server/github-execute.ts` holds the CONNECT
   popover's three GitHub write handlers (`handleGithubSyncExecute`,
   `handleGithubIssueExecute`, `handleGithubPrExecute`) plus their
   `GithubSyncExecuteApi`/`GithubIssueExecuteApi`/`GithubPrExecuteApi` types
   and per-endpoint rate-limit constants, mirroring the exact shape the
   `ask.ts` extraction already proved for this slice: a fully self-contained
   seam (each handler already delegates its real work to `github/execute.ts`/
   `github/issue-execute.ts`/`github/pr-execute.ts`; `server.ts` only ever
   parsed the request and called the injected API) with no shared state
   pulling it back into `server.ts`. `server.ts` re-exports the three API
   types so existing importers of the contract keep working unchanged, same
   as `ask.ts`'s `AskApi`/`AskStreamApi` re-export. No test file moved —
   like `handleAsk`/`handleAskStream`, these three had no direct unit tests
   of their own; `server.test.ts` already exercises them through the real
   HTTP route dispatch (`createServer`), which is unchanged by the move.
   Net result: `server.ts` drops from 2,437 to 2,178 lines. Full gate green:
   typecheck, lint, format:check, 6,244 tests, build.
   Second cut: `server/gh-connection.ts` holds the connect screen's two
   GitHub read endpoints (`handleGhStatus`, `handleGhLts`) plus their
   `GhApi`/`GhLtsApi` types and the LTS endpoint's rate-limit constants,
   the same self-contained-seam shape as the first cut: both handlers only
   ever parsed the request and called the injected API, with no shared
   state pulling them back into `server.ts`. `server.ts` re-exports
   `GhApi`/`GhLtsApi` so existing importers of the contract keep working
   unchanged, same as the first cut's `GithubSyncExecuteApi` re-export. No
   test file moved — like the first cut's three handlers, these two had no
   direct unit tests of their own; `server.test.ts` already exercises
   `handleGhStatus` through the real HTTP route dispatch (`createServer`),
   unchanged by the move. Net result: `server.ts` drops from 2,178 to 2,104
   lines. Full gate green: typecheck, lint, format:check, 201 server.test.ts
   tests, build.
   Third cut: `server/pool-client.ts` holds the contributor-pool and
   publicity endpoints — pool browse (`GET /api/pool-client`), pool claim
   (`POST /api/pool-client/execute`), and publicity affordances (`GET
   /api/publicity`) — plus their `PoolClientApi`/`PoolClientExecuteApi`/
   `PublicityApi` types and the execute endpoint's rate-limit constants, the
   same self-contained-seam shape as the first two cuts. Grouped together
   rather than split by read/write like the prior two cuts because both
   panels (epic 0007 "PLATFORM 6/7" and "7/7") are the CONTRIBUTOR
   POOL/PUBLICITY chrome pair and share no state with anything else
   `server.ts` keeps. `server.ts` re-exports the three types so existing
   importers of the contract keep working unchanged, same as the first two
   cuts. Unlike those, this cut moved its test file: `test/server/
   pool-client.test.ts` holds 19 direct unit tests exercising all three
   handlers, replacing the four `GET /api/publicity` tests `server.test.ts`
   previously carried inline (`handlePoolClient`/`handlePoolClientExecute`
   had no direct tests before — only indirect coverage through
   `createServer`'s real HTTP route dispatch, which `server.test.ts` still
   keeps). Net result: `server.ts` drops from 2,575 to 2,427 lines. Full
   gate green: typecheck, lint, format:check, 237 pool-client.test.ts +
   server.test.ts tests, build.
4. `fly.ts` → orchestration + rituals + wiring modules.
5. `read/source.ts` + `store/read.ts` → per-domain read-model modules.
   **In progress** — first cut: `read/mutate.ts` holds the 15 store-mutation
   wrappers (`createTaskInStore`, `ensureStoreMigrated`, and their siblings)
   that previously sat at the tail of `read/source.ts` — a fully self-contained
   seam (single consumer, `server/main.ts`'s API wiring) sharing no logic with
   the gather/read-model half `read/source.ts` keeps. Tests split the same
   way: `test/read/mutate.test.ts` holds their 51 direct unit tests, moved
   verbatim from `test/read/source.test.ts`, which keeps the two tests that
   legitimately span both modules (the read-only-`openStore`-adoption spy
   test and a `readBacklogCandidates` fixture that seeds via
   `createTaskInStore`) by importing across the new module boundary. Net
   result: `read/source.ts` drops from 1,519 to 1,207 lines. Still over the
   800-line law — the remaining gather/read-model half needs its own
   per-domain split, the follow-on cut this slice's own title names.
   Full gate green: typecheck, lint, format:check, test, build.
   Freshness check (2026-09-03): `read/source.ts` had already fallen to 802
   lines (2 over the 800-line law) by the time this cut landed — the
   on-demand single-project reads this slice's first-cut note flagged as
   `read/source.ts`'s "remaining gather/read-model half" had, in the
   meantime, moved to `read/project-detail.ts` (visible in
   `test/read/source.test.ts`'s own imports) without this chronicle
   recording it; this note closes that documentation gap rather than
   re-narrating a cut already made. Second cut: `read/persisted-events.ts`
   holds the nine persisted-event parsers (`parseFamilyRunaways` ..
   `parseLandedEvents`) that previously sat inline in `read/source.ts` —
   each takes a project's already-fetched `events` rows for one event type
   (family-runaway, intent-collision, near-miss-recurring, guard-denial,
   sync-back-refusal, land-gate-alarm, convergence-red, e2e-land-block,
   landed) and JSON.parses/validates them into a typed array, a
   self-contained cluster sharing no state with the DB-gather loop
   `read/source.ts` keeps beyond the `Store` handle itself. Unlike every
   prior cut in this epic, this cluster had NO test coverage at all
   beforehand — direct or indirect: neither `test/read/source.test.ts`'s own
   `readFleet` suite nor any other test asserted these nine parsers'
   output, only the raw SQL readers one layer below them (`packages/store/
   test/read.test.ts`) and the `ProjectAggregate` fields they feed
   (`test/read/anomalies.test.ts`, `test/web/notifications.test.ts`,
   `test/flight/near-miss.test.ts`) via hand-built fixtures that never
   exercised the parse/dedup/malformed-payload logic itself. Direct unit
   tests (`test/read/persisted-events.test.ts`, 30 cases) now cover each
   parser's happy path, its dedup rule (family/near-miss-recurring/intent-
   collision keep the row inserted LAST — `familyRunawayEvents` et al. order
   by `id DESC`, not `created_at`, a detail the first attempt at this test
   got wrong and had to fix), the intent-collision 48h freshness window, and
   malformed/missing-field payload skipping. `apps/dashboard/test/flight/
   pr-review.test.ts`'s `read/` security census gained the new file to its
   `BENIGN_READ` allow-list (pure parse, no store writes, no I/O of its
   own). Net result: `read/source.ts` drops from 802 to 480 lines, clearing
   the 800-line law with headroom. Full gate green: typecheck, lint,
   format:check, test:impacted, build.

Freshness check (2026-08-30): `web/shell.ts` is at 3,555 lines (down from the
publicity.ts cut's 3,663 snapshot above) and `web/features/` now holds 27
discoverable modules (up from 24; verified against `web/features/index.ts`'s
`FEATURE_MODULE_FUNCTIONS` list). The gap is new feature work landing as its
OWN discoverable module from day one instead of growing `fleetJs()` first and
waiting for a later whole-region cut: `coordination.ts` (82 lines, the FLEET
COORDINATION panel, 2026-08-28), `firing-timeline.ts` (459 lines, the
Per-firing trace panel, extracted 2026-08-28), `pool-client.ts` (289 lines,
the KEEPER contributor-pool client panel, 2026-08-27/28), and `pipeline.ts`
(234 lines, the D4 Fleet/Files pipeline canvas + sidebar, web-mtdc6wq3-5wuc6i,
2026-08-29) — the newest client-facing panels are shipping decomposition-clean
rather than adding to the debt this epic tracks. Separately, `web/tabs.ts`
(the APG tabs primitive spliced via `tabsJs()`, D2.13) joined as a shared
primitive alongside `office-map.ts`/`format.ts`, not a discoverable feature
module — the same non-panel-specific-helper shape those already established.
A run of `web/`-wide roving-tabindex accessibility fixes (D1: spark bars,
heat cells, office-map zones/satellites, DETECTED BACKLOG rows, eval-trend
bars, flight-timeline strip, flight-log rows, language bar) also landed
across `shell.ts` and several `web/features/*.ts` modules in the same window
— accessibility hardening within already-decomposed code, not a decomposition
regression.

Freshness check (2026-09-02): `web/shell.ts` line count and module count
unchanged since 2026-08-30; the recent work has been orthogonal hardening
and feature enhancements within the already-decomposed structure. Since the
last check, **accessibility work** (D1 ATTRIBUTE PAYLOAD + D1 TAB-STOP ROVING +
COCKPIT 6/6) landed: eliminated hand-retyped tip duplications across
trace-row/flight-map/phase-rail/activity-heading/switcher aria-labels (D1
ATTRIBUTE PAYLOAD fixes in shell.ts + features/*.ts), added roving-tabindex
for fleet-coordination lines + per-firing trace rows + contribution-heatmap
grid (D1 TAB-STOP ROVING), and paired button/link focus-visible states with
hover (COCKPIT 6/6 hover/focus pairing on fly bar, SOUL button, card/back
links, browse rows). **i18n sweep** for the fly bar's client-generated text
(status messages, budget labels, Cancel/Resume rows, data-tip tooltips) via
new `data-i18n-tip` attribute sweep. **Feature work**: real-cost (v3) surfaced
on fleet-wide header bar + flight summary panel; new token-coverage metrics
(computed-style census) + INP-p75 / longest-task collectors in cockpit-metrics
PHASE 0. **KEEPER PLATFORM 4/7** hardening: multiple PR state/merge/approval/
label/review/queue handling fixes (7 fixes since 2026-08-30). **REPORT
UNIFICATION** axe-scan coverage for right-click menu + dialog. **UX weakness
sweep**: collapsed two always-open forms (Inbox note, Contribute upstream PR).
No decomposition regression: all hardening + feature additions landed orthogonal
to the shell/features split, so `shell.ts`'s 3,555 line snapshot (3,555 lines)
and module count (27 discoverable + tabs + shared primitives) remain unchanged.
The epic's acceptance criteria continue to hold: shell.ts is shrinking toward
the 800-line law boundary but remains well above it (originally 4,761 → now
3,555, -1,206 lines = -25%); feature modules are discovered and spliced
automatically; shared pure-logic modules live once; zero behavior-change
verification (gate green throughout).

Freshness check (2026-09-03): `web/shell.ts` is now at 3,578 lines (up from the 2026-09-02 snapshot of 3,555 lines) and `web/features/` now holds 30 discoverable modules (up from 27; verified against `web/features/index.ts`'s `FEATURE_MODULE_FUNCTIONS` list). The growth since the last check reflects three new feature modules: `activity-heatmap.ts` (the contribution heatmap, extraction from the eighty-fifth cut that was code-complete in the firing-302 checkpoint but newly recorded in the chronicle), and `report-capture-client.ts`/`report-menu.ts` (the REPORT UNIFICATION right-click menu and report-capture client — new feature work landing as discoverable modules from day one, same pattern as the 2026-08-30 check's coordination/firing-timeline/pool-client/pipeline modules). The line-count delta (+23 from 3,555 → 3,578) reflects the new modules' content plus incidental hardening/feature work landing orthogonally across the split. The epic's acceptance criteria continue to hold: shell.ts is shrinking toward the 800-line law boundary but remains well above it (originally 4,761 → now 3,578, -1,183 lines = -25%); feature modules are discovered and spliced automatically; shared pure-logic modules live once; zero behavior-change verification (gate green: typecheck, lint, format:check, test:impacted, build all passing).

Post-freshness evolution (2026-09-03, continued): an 8-lane fleet round exposed a **chunk composition order bug** in the bundle assembly. `clientJs()` was concatenating chunks alphabetically (coreClientJs + panelsClientJs + projectClientJs), but test/jsdom evaluation requires the browser execution order (coreClientJs + projectClientJs + panelsClientJs) — the deferred `/panels.js` chunk's `Object.assign(STRINGS, …)` was evaluating before the core `/app.js` chunk's `let STRINGS` declaration, landing in a temporal dead zone. This was silent in production (the chunks load with their own execution order via script tags) but broke 550 jsdom tests. `clientJs()` now composes in the contractual browser order (commit c63e5713); the splice-manifest reconstruction still uses the chunk membership constants from `web/chunks.ts`, so the composition order is data-driven and future-safe. Two lanes' orthogonal extractions (activity-heatmap + persisted-events split) were united in this same merge, recorded via rerere. This is a consequence of the chunk-based architecture this epic designed: once the shell splits into separately-composable chunks, the composition order matters — a non-issue when the whole bundle was one concatenated string.

Freshness check (2026-09-03, continued again): `web/shell.ts` is now at 3,647 lines (up from the same-day 3,578 snapshot two paragraphs up, +69) and `web/features/` still holds exactly 30 discoverable modules (verified against `web/features/index.ts`'s `FEATURE_MODULE_FUNCTIONS` list) — no new feature module landed in this window; `git diff --stat` against the prior freshness-check commit confirms every changed path under `apps/dashboard/src/web/` was a modification to an already-extracted file (`connect-panel.ts`, `flight-progress.ts`, `flights.ts`, `layout-css.ts`, `publicity-panel.ts`, `shell.ts`, and ten existing `features/*.ts` modules), zero additions. The ~40-commit batch behind the delta is four orthogonal threads, none of them decomposition work: **COCKPIT 6/6** designed-states polish (pool-client Fly button, fly-bar lucky button, publicity anchor chips, pipeline tree rows, checkbox-label trio, landing group toggle, outline-chip trio, masthead pills join the shared hover/focus/active family), **D1 TAB-STOP ROVING** accessibility hardening (roving tabindex added to the activity-feed rows, live-worker card lines, fleet-card meta chips/stat tiles, LANDING panel lines, Docs viewer chart bars/points, and Ask panel tool-activity chips), an **i18n sweep** translating CONNECT-popover and fly-bar client-generated strings via injected `tr()`, and a new feature — the 🍀 **I'm-feeling-lucky launch calibrator** (probes the machine, fills a right-sized flight; themed SVG clover icon) — shipped as inline fly-bar/fly-feature code rather than a new discoverable module, which is why the module count held at 30 despite real new functionality landing. No decomposition regression: the epic's acceptance criteria continue to hold on the same terms as the prior check — shell.ts is shrinking in relative terms (originally 4,761 → now 3,647, -1,114 lines = -23%) but remains well above the 800-line law boundary; feature modules are discovered and spliced automatically; shared pure-logic modules live once; gate green throughout this window (typecheck, lint, format:check, test:impacted, build).

REGISTRY DERIVATION VERDICT processed (2026-09-04, ap-mtlf58gi-1): board task
web-mteostss-7u5oaq (REGISTRY DERIVATION) named two hand-maintained registries
this epic's own discovery tooling should be deriving instead —
`generate-splice-manifest.test.ts`'s ~30 hand-typed `*_TS` path constants, and
`web/chunks.ts`'s hand-typed `FEATURE_JS_BY_NAME`/`PROJECT_PAGE_FEATURES`/
`DEFERRED_OPERATOR_FEATURES`. A prior firing's verdict (ap-mtlf58gi-1) judged
the combined task too large for one firing and split it into slice 1
(ap-mtm2kspi-0, the test file's constants) and slice 2 (ap-mtm2kspj-1,
`chunks.ts`'s registries). This pass verified that verdict against the current
code rather than building either slice fresh. Slice 1 is shipped: `generate-
splice-manifest.test.ts` now builds a `FEATURE_TS_BY_BASENAME` map from
`discoverFeatureModules(FEATURES_DIR)` and every `*_TS` constant resolves
through a `featureTs()` lookup that throws loudly on a missing/renamed module,
replacing the 30 hand-joined path lines the original task named. Slice 2 is
NOT shipped, and a design pass (not an implementation attempt) found it isn't
the mechanical "wire it up" its title implies — two real blockers, the same
"attempted it, found a real blocker, deferred it precisely" shape every prior
cut in this chronicle used:
First, the only existing codegen surface, `generateFeatureModulesIndexSource`
(already backing the committed `web/features/index.ts` barrel), emits ONLY a
flat ordered `FEATURE_MODULE_FUNCTIONS` array plus one combined
`featureModulesJs()` wrapper — no basename-keyed export at all.
`chunks.ts`'s `FEATURE_JS_BY_NAME` needs a basename → function RECORD, a
shape the generator has never produced; extending it is real, additional
codegen design work, not a config toggle. (Verified this shape is at least
valid: rerunning `discoverFeatureModules` against the real `features/`
directory confirms all 30 modules export exactly one assembler function each,
so a 1:1 basename → function record has no per-module ambiguity to design
around.) Second, `apps/dashboard/package.json` ships only `"files": ["dist"]`
— `scripts/codemod/generate-splice-manifest.mjs` is dev tooling that is never
packaged with the dashboard, so `chunks.ts` (production source) cannot import
`discoverFeatureModules` directly at runtime the way the test files do; any
derivation has to land in the CHECKED-IN generated `web/features/index.ts`
barrel — the same committed-artifact pattern that file already established
for `FEATURE_MODULE_FUNCTIONS` — not a live directory scan from `chunks.ts`
itself. Separately (not a blocker, a scope clarification):
`PROJECT_PAGE_FEATURES`/`DEFERRED_OPERATOR_FEATURES` are not derivable at all
— they encode which PAGE calls each module, a call-site fact
`discoverFeatureModules`'s static export analysis has no way to see. Those two
arrays stay hand-curated; the mechanical safety net they need already exists
and needs no new work — `chunks.test.ts`'s "keeps the chunk lists disjoint and
inside the map" test already fails loudly if either list names a module
`FEATURE_JS_BY_NAME` doesn't have. Verdict on ap-mtlf58gi-1: CONFIRMED — the
split was warranted, and slice 2 as originally scoped still bundled a real
design decision with a mechanical one. The narrowed next slice: extend
`generateFeatureModulesIndexSource` to also emit a basename-keyed record into
the generated `web/features/index.ts` barrel, then wire `chunks.ts`'s
`FEATURE_JS_BY_NAME` to import that record instead of its 29 hand-written
imports plus hand-built object literal, leaving
`PROJECT_PAGE_FEATURES`/`DEFERRED_OPERATOR_FEATURES` untouched. No code
changed this pass — `chunks.ts`, `generate-splice-manifest.mjs`, and
`web/features/index.ts` remain exactly as they were; ap-mtlf58gi-1 closes on
this evidence, ap-mtm2kspj-1 stays open scoped to that narrowed shape.

## Related

- `docs/EVALUATION-2026-08.md` (the data), BUNDLE DIET board item (subsumed DELIVERABLE),
  `docs/PATTERNS-AND-STANDARDS.md` (the 800-line law), epic 0001 (multi-flight UI will
  land inside the decomposed client — coordinate slice 2 with PARALLEL FLIGHTS 4/6).
