<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# COCKPIT BASELINE — the living measurement doc

> **Convention:** this is the ONE living doc for `scripts/cockpit-metrics.mjs`'s output.
> Earlier runs wrote a brand-new `docs/EVALUATION-<date>-cockpit-baseline.md` every time —
> three dated files, 94.6% mutual overlap, no reader-visible signal beyond "did any number
> move" buried in a full re-dump. This file replaces that pattern: each axis below carries
> its explanation ONCE and a delta-only trend table across every date it has been measured.
> The superseded dated snapshots are kept, unmodified except for a pointer note, in
> [`archive/`](archive/EVALUATION-2026-08-28-cockpit-baseline.md) for provenance.
>
> **Regenerating:** `pnpm run cockpit-metrics` still writes a fresh
> `docs/EVALUATION-<date>-cockpit-baseline.md` — the script itself has not yet been taught
> to append to this file directly (a follow-on slice). Until it is, fold a new run in by
> hand: add one row per axis to the trend tables below, update the "current" figures, then
> move the freshly-generated dated file into `archive/` with the same pointer-note pattern
> used for the three runs already there.

COCKPIT PHASE 0 MEASURE (`docs/epics/0015-cockpit-supervisory-control.md`, board
web-mtbpiiur-43tmr3), measured against the REAL served surfaces (`renderShell`/`clientJs`,
`apps/dashboard/src/web/shell.ts`, plus the `/tokens.css` stylesheet exactly as
`server/routes.ts` composes it, and the theme token maps exactly as `colorVars()` serves
them) in jsdom — except longest-task, which runs in a real Chromium against the real
`createServer` HTTP server, since the Long Tasks API has no jsdom implementation. Three runs
so far: **2026-08-28**, **2026-08-29**, **2026-09-03**. Not asserted — these are measured
snapshots, not CI ratchets; "No ratchet is set yet" throughout means the epic's own rule
("ratchets start at today's measured value, never the ideal") awaits a second stable data
point per axis.

## Known measurement issue — longest-task `task` axis is not yet trustworthy

The real-Chromium longest-task measurement's `task` row has flipped direction across every
run so far: 91.0ms → 0.0ms (08-29), then 0.0ms → 55.0ms (09-03) — the LARGE fixture reading
LOWER than the small fixture in the first run, then the reverse relationship in the next. The
`row` and `lane` axes of the same measurement have stayed flat at 0.0ms → 0.0ms across both
runs. Read the `task` axis of the "longest task (real Chromium)" table below as noise, not
signal, until a run lands within the same order of magnitude as its predecessor.

## headline finding — duplicate-render mutations dropped to zero

Every axis (row/task/lane) mutated the DOM 14 times per identical-state poll tick in both
08-28 and 08-29 — pure churn, no state actually changed. As of 09-03 all three axes read
**0 → 0**: the epic's D2 "dedup renders" DoD clause reads satisfied for this measurement.
See the "duplicate renders" trend table below.

## DOM growth per lane / task / row

- **row** — fleet-grid project cards (`.card`), 1 vs 8 projects.
- **task** — one project's task board (`.task`), 1 vs 20 tasks.
- **lane** — the fleet-wide `#live-workers` chip strip (`.live-worker-chip`, one chip per
  concurrently-flying worktree lane — board web-mtbp0t86-rnimyi's fix), 1 vs 8 lanes on a
  single project. The per-card `.live-worker` panel is a separate, still-single-lane surface
  (`liveFiring()`, not `liveFirings()`) and is not what this axis measures.

| axis | date | fixture size | total DOM nodes | nodes per added unit |
| --- | --- | --- | --- | --- |
| row | 2026-08-28 | 1 → 8 | 246 → 764 | 74.0 |
| row | 2026-08-29 | 1 → 8 | 246 → 764 | 74.0 |
| row | 2026-09-03 | 1 → 8 | 251 → 769 | 74.0 |
| task | 2026-08-28 | 1 → 20 | 439 → 554 | 6.1 |
| task | 2026-08-29 | 1 → 20 | 455 → 570 | 6.1 |
| task | 2026-09-03 | 1 → 20 | 343 → 477 | 7.1 |
| lane | 2026-08-28 | 1 → 8 | 312 → 424 | 16.0 |
| lane | 2026-08-29 | 1 → 8 | 312 → 424 | 16.0 |
| lane | 2026-09-03 | 1 → 8 | 324 → 450 | 18.0 |

No ratchet is set yet. The task axis's node counts dropped between 08-29 and 09-03 (570 →
477 at the large fixture) while its per-unit slope rose slightly (6.1 → 7.1) — a smaller
base render with a steeper marginal cost, worth re-checking once a fourth data point exists.

## axe violations by impact

Same three fixtures (row/task/lane) run through `axe-core` (WCAG 2.0/2.1/2.2 A+AA rules,
`color-contrast` disabled — jsdom has no layout engine to compute it, asserted separately by
the token package's contrast tests) at each fixture's small and large size. Counted per
AFFECTED NODE, not per rule, so the count scales with fixture size the same way DOM growth
does above. `test/web/a11y.test.ts` already asserts zero violations at fixed fixture sizes
across the app's real surfaces — this table adds the same axe pass at the SAME two scales as
the DOM-growth axes, to see whether violation counts grow with content the way node counts do.

**Zero violations at every impact level (critical/serious/moderate/minor), every fixture,
every fixture size, across all three runs (08-28, 08-29, 09-03).** No trend to show — flat
at zero is the good outcome here.

## tab stops

Count of elements reachable via sequential Tab navigation (every native/`tabindex`-bearing
focusable element, minus disabled controls) at each fixture's small and large size. A list
that adds one tab stop per added row/task/lane instead of virtualizing or using a
roving-tabindex container becomes a keyboard trap in practice long before it looks like a
problem — this is the measurement D1's "tab stops via roving tabindex" foundation work will
be judged against.

| axis | date | fixture size | tab stops | stops per added unit |
| --- | --- | --- | --- | --- |
| row | 2026-08-28 | 1 → 8 | 77 → 238 | 23.0 |
| row | 2026-08-29 | 1 → 8 | 77 → 238 | 23.0 |
| row | 2026-09-03 | 1 → 8 | 77 → 238 | 23.0 |
| task | 2026-08-28 | 1 → 20 | 124 → 207 | 4.4 |
| task | 2026-08-29 | 1 → 20 | 132 → 215 | 4.4 |
| task | 2026-09-03 | 1 → 20 | 100 → 183 | 4.4 |
| lane | 2026-08-28 | 1 → 8 | 103 → 152 | 7.0 |
| lane | 2026-08-29 | 1 → 8 | 103 → 152 | 7.0 |
| lane | 2026-09-03 | 1 → 8 | 98 → 119 | 3.0 |

No ratchet is set yet. The row axis is perfectly flat across all three runs. The lane axis's
per-unit slope more than halved (7.0 → 3.0) between 08-29 and 09-03 — fewer tab stops added
per lane, a genuine improvement worth confirming holds on the next run before crediting it to
specific D1 work.

## attribute payload

Sum of every element's attribute name + value string length (characters) at each fixture's
small and large size — the same three fixtures and render harness as DOM growth above, but
counting per-node attribute weight instead of node count. A node count can stay flat while
attribute payload balloons (a growing `data-tip`/`aria-label` string, more classes or
`data-*` attributes stacked onto the same element) — this axis catches that class of
regression, which the node-count axis cannot.

| axis | date | fixture size | attribute chars | chars per added unit |
| --- | --- | --- | --- | --- |
| row | 2026-08-28 | 1 → 8 | 15544 → 43036 | 3927.4 |
| row | 2026-08-29 | 1 → 8 | 15544 → 43036 | 3927.4 |
| row | 2026-09-03 | 1 → 8 | 15812 → 43304 | 3927.4 |
| task | 2026-08-28 | 1 → 20 | 24574 → 36631 | 634.6 |
| task | 2026-08-29 | 1 → 20 | 27737 → 39794 | 634.6 |
| task | 2026-09-03 | 1 → 20 | 20390 → 32951 | 661.1 |
| lane | 2026-08-28 | 1 → 8 | 20961 → 27960 | 999.9 |
| lane | 2026-08-29 | 1 → 8 | 20961 → 27960 | 999.9 |
| lane | 2026-09-03 | 1 → 8 | 21294 → 28879 | 1083.6 |

No ratchet is set yet — per-unit slopes are stable to flat-rising across the series.

## duplicate renders

DOM mutations applied by ONE simulated poll cycle delivering the SAME data already painted —
every interval callback the client registered (the `startFleetStream` fetch poll plus the
pool-client/pr-review panel polls) fires once under a whole-document MutationObserver, with
the stubbed fetch returning the identical state both times. An idempotent client mutates
NOTHING here; every counted mutation is duplicate-render churn (or a per-tick timestamp
rewrite — the same class of churn). This is the baseline the epic's D2 "dedup renders" work
and the DoD's "no duplicate renders" clause are judged against.

| axis | date | fixture size | mutations per identical-state tick | mutations per added unit |
| --- | --- | --- | --- | --- |
| row | 2026-08-28 | 1 → 8 | 14 → 14 | 0.0 |
| row | 2026-08-29 | 1 → 8 | 14 → 14 | 0.0 |
| row | 2026-09-03 | 1 → 8 | 0 → 0 | 0.0 |
| task | 2026-08-28 | 1 → 20 | 14 → 14 | 0.0 |
| task | 2026-08-29 | 1 → 20 | 14 → 14 | 0.0 |
| task | 2026-09-03 | 1 → 20 | 0 → 0 | 0.0 |
| lane | 2026-08-28 | 1 → 8 | 14 → 14 | 0.0 |
| lane | 2026-08-29 | 1 → 8 | 14 → 14 | 0.0 |
| lane | 2026-09-03 | 1 → 8 | 0 → 0 | 0.0 |

See the headline finding above — every axis dropped from 14 mutations/tick to 0 between
08-29 and 09-03.

## longest task (real Chromium)

Longest single main-thread task (Long Tasks API, `PerformanceEntry.duration`, the browser's
own >50ms-blocks-a-frame definition) observed from navigation through first paint of the SAME
three fixtures at each fixture's small and large size — the one row of the epic brief's §5
table jsdom cannot answer, so this axis runs in a REAL Chromium (`@playwright/test`) against
a REAL loopback HTTP server (`createServer`, the exact function `apps/dashboard/src/index.ts`
boots in production). Not measured in 08-28 (added 08-29).

| axis | date | fixture size | longest task |
| --- | --- | --- | --- |
| row | 2026-08-29 | 1 → 8 | 0.0ms → 0.0ms |
| row | 2026-09-03 | 1 → 8 | 0.0ms → 0.0ms |
| task | 2026-08-29 | 1 → 20 | 91.0ms → 0.0ms |
| task | 2026-09-03 | 1 → 20 | 0.0ms → 55.0ms |
| lane | 2026-08-29 | 1 → 8 | 0.0ms → 0.0ms |
| lane | 2026-09-03 | 1 → 8 | 0.0ms → 0.0ms |

See "Known measurement issue" above — the `task` axis is not yet trustworthy. A 0ms result on
`row`/`lane` is not a broken probe: at this fixture scale the client's hydration work may
simply never cross the 50ms Long Tasks threshold.

## unique declaration values

Unique values per CSS property across the stylesheet `server/routes.ts` serves at
`GET /tokens.css` (`fontFaceCss() + stylesheet() + layoutCss()`, composed in that exact
order), parsed through jsdom's CSSOM. Custom-property DEFINITIONS (`--*`, the token sheet
itself) are bucketed separately. Measured ONCE per run, not at two fleet sizes: `/tokens.css`
is static text. Known parser omission: jsdom's `CSSFontFaceRule` serialization drops `src`,
so font-face data-URI values are absent from the counts.

| date | standard properties | declarations | unique values | custom-property defs | custom unique values |
| --- | --- | --- | --- | --- | --- |
| 2026-08-28 | 95 | 2680 | 356 | 193 | 135 |
| 2026-08-29 | 95 | 2680 | 356 | 193 | 135 |
| 2026-09-03 | 97 | 2875 | 379 | 193 | 135 |

CSS grew between 08-29 and 09-03 (new panels/overlays landed elsewhere in the codebase); the
custom-property token definitions themselves haven't moved. Current top-12 properties by
unique-value count (2026-09-03): `padding` 147/25, `background` 159/20, `margin` 96/14,
`opacity` 44/14, `width` 34/13, `border-radius` 212/12, `fill` 27/12, `color` 261/11,
`font-size` 204/10, `border` 114/10, `gap` 104/10, `height` 21/10. No ratchet is set yet.

## selector specificity

Specificity of every selector in the same served stylesheet as the unique-values census
above, scored per CSS Selectors 4 (`:not()` counts as its most specific argument; combinators
and `*` count nothing) and bucketed by exact (id, class, type) triple. Measured ONCE per run,
not at two fleet sizes, for the same reason as the value census.

| date | selectors | style rules | max specificity | selectors with an ID |
| --- | --- | --- | --- | --- |
| 2026-08-28 | 813 | 691 | 1,2,0 | 31 |
| 2026-08-29 | 813 | 691 | 1,2,0 | 31 |
| 2026-09-03 | 891 | 738 | 1,2,0 | 34 |

Selector count grew in step with the CSS growth noted above; max specificity has not
regressed past 1,2,0 in any run. No ratchet is set yet.

## contrast matrix

WCAG contrast ratio of every color token against every canvas it renders on — 14 foreground
tokens × the 3 surface tokens, plus `accentText` × the 10 fill tokens it paints text over —
per theme, computed with the token package's own `contrastRatio` over the exact values
`colorVars()` serves. Floors: **4.5:1** normal text (WCAG 1.4.3), **3:1** large text and
non-text UI components (1.4.11). Measured ONCE per run: theme tokens are static values.

**Identical across all three runs (08-28, 08-29, 09-03) — theme tokens have not changed.**

| theme | min ratio (pair) | below 3:1 | in [3, 4.5) | ≥ 4.5:1 (of 52 cells) |
| --- | --- | --- | --- | --- |
| dark | 1.30 (`border` on `surfaceRaised`) | 6 | 0 | 46 |
| light | 1.24 (`border` on `surfaceSunken`) | 6 | 6 | 40 |
| terminal | 1.52 (`border` on `surfaceRaised`) | 3 | 3 | 46 |

A below-3:1 cell is not automatically a defect: it is a pair no rendered surface may use —
cross-reference against the token coverage census below to confirm no such pair is actually
painted. Full per-token-pair ratios live in the latest archived snapshot
([`archive/EVALUATION-2026-09-03-cockpit-baseline.md`](archive/EVALUATION-2026-09-03-cockpit-baseline.md))
since they haven't moved since 08-28.

## token coverage via computed-style census

Every color-relevant declaration (`color`, `background`/`background-color`, `border*-color`,
`outline-color`, `fill`, `stroke`) in the served stylesheet, classified per the epic's Phase 1
vocabulary: **covered** references a design token; **drifted** hardcodes a literal that
normalizes to the same value as a token (duplicates one instead of referencing it);
**uncovered** hardcodes a literal matching no known token. Not measured in 08-28 (added
08-29).

| date | covered | drifted | uncovered | keyword values | unparsed |
| --- | --- | --- | --- | --- | --- |
| 2026-08-29 | 453 | 0 | 2 | 38 | 0 |
| 2026-09-03 | 491 | 0 | 3 | 41 | 0 |

Uncovered selectors, 2026-08-29: `.tour-overlay`, `.browse-overlay` (both
`background: rgba(0, 0, 0, 0.5)`). 2026-09-03 adds one more of the same pattern:
`.report-dialog-overlay`. No ratchet is set yet — an empty drifted/uncovered table would not
prove full coverage either, since this census only sees the served stylesheet.

## alarm rate & severity shape

Alarm-styled elements in the SAME painted renders as the DOM-growth axes, at each fixture's
small and large size. The alarm-selector set is DERIVED from the served stylesheet, not
hand-listed. **Rate** is the share of ALL rendered elements painted with response-demanding
ink — critical, high, needs-you (ISA-18.2's definition). **Shape** is the per-token element
distribution the epic's "re-rationalize severity to the shape where critical is rare" is
judged against.

| axis | date | fixture size | alarm-styled (rate) | critical | high | needs-you | medium | low |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| row | 2026-08-28 | 1 → 8 | 4 → 18 (1.6% → 2.4%) | 1 → 8 | 3 → 10 | 0 → 0 | 1 → 1 | 1 → 8 |
| row | 2026-08-29 | 1 → 8 | 4 → 18 (1.6% → 2.4%) | 1 → 8 | 3 → 10 | 0 → 0 | 1 → 1 | 1 → 8 |
| row | 2026-09-03 | 1 → 8 | 4 → 18 (1.6% → 2.3%) | 1 → 8 | 3 → 10 | 0 → 0 | 1 → 1 | 1 → 8 |
| task | 2026-08-28 | 1 → 20 | 5 → 9 (1.1% → 1.6%) | 1 → 1 | 4 → 8 | 0 → 0 | 1 → 1 | 1 → 1 |
| task | 2026-08-29 | 1 → 20 | 5 → 9 (1.1% → 1.6%) | 1 → 1 | 4 → 8 | 0 → 0 | 1 → 1 | 1 → 1 |
| task | 2026-09-03 | 1 → 20 | 5 → 9 (1.5% → 1.9%) | 1 → 1 | 4 → 8 | 0 → 0 | 1 → 1 | 1 → 1 |
| lane | 2026-08-28 | 1 → 8 | 4 → 4 (1.3% → 0.9%) | 1 → 1 | 3 → 3 | 0 → 0 | 1 → 1 | 4 → 11 |
| lane | 2026-08-29 | 1 → 8 | 4 → 4 (1.3% → 0.9%) | 1 → 1 | 3 → 3 | 0 → 0 | 1 → 1 | 4 → 11 |
| lane | 2026-09-03 | 1 → 8 | 4 → 4 (1.2% → 0.9%) | 1 → 1 | 3 → 3 | 0 → 0 | 1 → 1 | 4 → 11 |

Raw element counts are flat to the point of complete stability across all three runs; rate
percentages drift by tenths of a point as the shared denominator (total rendered elements)
grows. Derived resting alarm selectors: critical 13, high 20→21 (09-03 added one), needsYou
14, medium 15, low 4 throughout. The `medium`/`low` buckets include DOUBLE-DUTY ink (e.g.
activity chips painted with `--color-sev-low`/`--color-sev-medium` as mere category colors,
no severity semantics) — the epic's phase-1 audit already tracks this conflation. No ratchet
is set yet.

## i18n tagging coverage

Same three fixtures as the axes above, checked against `web/features/locale.ts`'s OWN
`translateDom()` sweep targets. Three independent candidate pools: elements carrying their
OWN non-whitespace text (`[data-i18n]`/`[data-i18n-template]`), elements with an `aria-label`
(`[data-i18n-aria]`), and elements with a `placeholder` (`[data-i18n-placeholder]`). `data-tip`
hover text is out of scope by design. Not measured in 08-29 (present in 08-28, then again in
09-03).

| axis | date | fixture size | text tagged/total | aria-label tagged/total | placeholder tagged/total |
| --- | --- | --- | --- | --- | --- |
| row | 2026-08-28 | 1 → 8 | 44/109 (40.4%) → 121/368 (32.9%) | 21/60 (35.0%) → 28/207 (13.5%) | 4/4 (100.0%) → 4/4 (100.0%) |
| row | 2026-09-03 | 1 → 8 | 45/115 (39.1%) → 122/374 (32.6%) | 21/55 (38.2%) → 28/202 (13.9%) | 4/4 (100.0%) → 4/4 (100.0%) |
| task | 2026-08-28 | 1 → 20 | 49/208 (23.6%) → 49/304 (16.1%) | 21/68 (30.9%) → 21/151 (13.9%) | 5/7 (71.4%) → 5/7 (71.4%) |
| task | 2026-09-03 | 1 → 20 | 61/161 (37.9%) → 61/276 (22.1%) | 24/65 (36.9%) → 24/129 (18.6%) | 5/7 (71.4%) → 5/7 (71.4%) |
| lane | 2026-08-28 | 1 → 8 | 46/144 (31.9%) → 46/193 (23.8%) | 22/87 (25.3%) → 22/136 (16.2%) | 4/4 (100.0%) → 4/4 (100.0%) |
| lane | 2026-09-03 | 1 → 8 | 47/157 (29.9%) → 47/220 (21.4%) | 22/76 (28.9%) → 22/111 (19.8%) | 4/4 (100.0%) → 4/4 (100.0%) |

Coverage falls as row/task/lane count grows because the denominator is dominated by
client-rendered FLEET DATA (project names, task titles, activity targets), not untranslated
chrome — expected, not a regression signal. Both tagged AND total counts rose on the task/lane
axes between 08-28 and 09-03 (more chrome added and tagged), roughly preserving the coverage
percentage. No ratchet is set yet.

## interaction latency (INP p75 proxy) & longest task (jsdom)

One simulated click dispatched on EVERY tab-stop element — the exact population the tab-stops
axis counts — in the same painted renders as the DOM-growth axes, with each dispatch's
synchronous processing duration timed. **INP p75** is the nearest-rank 75th percentile of
those durations, a PROXY for field INP (jsdom runs handlers synchronously and never paints, so
only processing duration exists here). **longest task** here is jsdom's own upper-bound proxy
— distinct from the real-Chromium Long Tasks measurement above. First measurement, 2026-09-03
only — no trend yet.

| axis | fixture size | interactions | INP p75 (ms) | INP max (ms) | longest task (ms) |
| --- | --- | --- | --- | --- | --- |
| row | 1 → 8 | 77 → 238 | 1.31 → 1.09 | 6.89 → 20.86 | 15.96 → 20.86 |
| task | 1 → 20 | 100 → 183 | 1.05 → 1.07 | 9.04 → 14.04 | 15.81 → 16.08 |
| lane | 1 → 8 | 92 → 92 | 1.07 → 1.08 | 10.27 → 14.98 | 15.97 → 15.80 |

These are wall-clock timings on the measuring machine — noisy run-to-run and
machine-dependent, unlike every count above. This is the SHAPE baseline (how latency scales
from the small to the large fixture), not a CI ratchet.
