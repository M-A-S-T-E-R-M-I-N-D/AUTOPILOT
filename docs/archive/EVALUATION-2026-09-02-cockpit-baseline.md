<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

> **ARCHIVED (2026-09-04):** superseded one day later by
> [`../EVALUATION-2026-09-03-cockpit-baseline.md`](../EVALUATION-2026-09-03-cockpit-baseline.md),
> a 94.6%-identical rerun — every delta was measurement jitter, no new findings. Kept for the
> series' completeness. Known measurement bug in this run: the `task | 1 → 20` interaction
> latency baseline of `0.0ms` is almost certainly a bad sample.


# EVALUATION — cockpit baseline, DOM growth + axe by impact + tab stops + attribute payload + duplicate renders + longest task + unique values + specificity + contrast matrix + alarm rate + severity shape + token coverage + i18n tagging coverage + interaction latency (2026-09-02)

COCKPIT PHASE 0 MEASURE (`docs/epics/0015-cockpit-supervisory-control.md`, board
web-mtbpiiur-43tmr3): thirteen rows of the brief's §5 table, twelve measured against the REAL
served surfaces (`renderShell`/`clientJs`, `apps/dashboard/src/web/shell.ts`, plus the
`/tokens.css` stylesheet exactly as `server/routes.ts` composes it, and the theme token
maps exactly as `colorVars()` serves them) in jsdom, and the thirteenth — longest task — in a
real Chromium against the real `createServer` HTTP server, since the Long Tasks API has no
jsdom implementation; all via `scripts/cockpit-metrics.mjs`, not asserted. The last §5
row (INP p75) stays open for a follow-on slice; regenerate this file with
`pnpm run cockpit-metrics`.

## DOM growth per lane / task / row

| axis | fixture size | total DOM nodes | nodes per added unit |
| --- | --- | --- | --- |
| row | 1 → 8 | 251 → 769 | 74.0 |
| task | 1 → 20 | 343 → 477 | 7.1 |
| lane | 1 → 8 | 324 → 450 | 18.0 |

- **row** — fleet-grid project cards (`.card`), 1 vs 8 projects.
- **task** — one project's task board (`.task`), 1 vs 20 tasks.
- **lane** — the fleet-wide `#live-workers` chip strip (`.live-worker-chip`, one chip per
  concurrently-flying worktree lane — board web-mtbp0t86-rnimyi's fix), 1 vs
  8 lanes on a single project. The per-card `.live-worker` panel is a
  separate, still-single-lane surface (`liveFiring()`, not `liveFirings()`) and is not what
  this axis measures.

No ratchet is set yet — the epic's own rule is "ratchets start at today's measured value,
never the ideal", and this is the first measurement. A follow-on slice should turn the
`perUnit` column into a committed ratchet once a second data point exists to judge drift
against.

## axe violations by impact

Same three fixtures (row/task/lane) run through `axe-core` (WCAG 2.0/2.1/2.2 A+AA rules,
`color-contrast` disabled — jsdom has no layout engine to compute it, asserted separately by
the token package's contrast tests) at each fixture's small and large size. Counted per
AFFECTED NODE, not per rule, so the count scales with fixture size the same way DOM growth
does above.

| axis | fixture size | critical | serious | moderate | minor |
| --- | --- | --- | --- | --- | --- |
| row | 1 → 8 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| task | 1 → 20 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| lane | 1 → 8 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |

`test/web/a11y.test.ts` already asserts zero violations at fixed fixture sizes across the
app's real surfaces — this table adds the same axe pass at the SAME two scales as the DOM-
growth axes above, to see whether violation counts grow with content the way node counts do.

## tab stops

Count of elements reachable via sequential Tab navigation (every native/`tabindex`-bearing
focusable element, minus disabled controls) at each fixture's small and large size. A list
that adds one tab stop per added row/task/lane instead of virtualizing or using a roving-
tabindex container becomes a keyboard trap in practice long before it looks like a problem —
this is the measurement D1's "tab stops via roving tabindex" foundation work will be judged
against.

| axis | fixture size | tab stops | stops per added unit |
| --- | --- | --- | --- |
| row | 1 → 8 | 77 → 238 | 23.0 |
| task | 1 → 20 | 100 → 183 | 4.4 |
| lane | 1 → 8 | 98 → 119 | 3.0 |

No ratchet is set yet, same as the DOM-growth axes — this is the first measurement.

## attribute payload

Sum of every element's attribute name + value string length (characters) at each fixture's
small and large size — the same three fixtures and render harness as DOM growth above, but
counting per-node attribute weight instead of node count. A node count can stay flat while
attribute payload balloons (a growing `data-tip`/`aria-label` string, more classes or
`data-*` attributes stacked onto the same element) — this axis catches that class of
regression, which the node-count axis above cannot.

| axis | fixture size | attribute chars | chars per added unit |
| --- | --- | --- | --- |
| row | 1 → 8 | 15622 → 43114 | 3927.4 |
| task | 1 → 20 | 20200 → 32761 | 661.1 |
| lane | 1 → 8 | 21104 → 28689 | 1083.6 |

No ratchet is set yet, same as the other axes above — this is the first measurement.

## duplicate renders

DOM mutations applied by ONE simulated poll cycle delivering the SAME data already painted —
every interval callback the client registered (the `startFleetStream` fetch poll plus the
pool-client/pr-review panel polls) fires once under a whole-document MutationObserver, with
the stubbed fetch returning the identical state both times. An idempotent client mutates
NOTHING here; every counted mutation is duplicate-render churn (or a per-tick timestamp
rewrite — the same class of churn). This is the baseline the epic's D2 "dedup renders" work
and the DoD's "no duplicate renders" clause are judged against. Counted per mutated node
(childList records contribute added + removed nodes; attribute/characterData records count 1
each) so the number scales with fixture size the same way DOM growth does.

| axis | fixture size | mutations per identical-state tick | mutations per added unit |
| --- | --- | --- | --- |
| row | 1 → 8 | 0 → 0 | 0.0 |
| task | 1 → 20 | 0 → 0 | 0.0 |
| lane | 1 → 8 | 0 → 0 | 0.0 |

No ratchet is set yet, same as the other axes above — this is the first measurement.

## longest task

Longest single main-thread task (Long Tasks API, PerformanceEntry.duration, the browser's own
>50ms-blocks-a-frame definition) observed from navigation through first paint of the SAME
three fixtures (row/task/lane) at each fixture's small and large size — the one row of the
brief's §5 table jsdom cannot answer (no Long Tasks implementation), so this axis runs in a
REAL Chromium (`@playwright/test`, already a devDependency for `apps/dashboard/e2e/`)
against a REAL loopback HTTP server (`createServer`, the exact function
`apps/dashboard/src/index.ts` boots in production) instead of jsdom's `document.write` +
stubbed `fetch`. A `PerformanceObserver` is installed via `page.addInitScript` before
navigation so it is live for the FIRST script the served page runs, then the page is given a
250ms settle window past its `waitSelector` paint to catch trailing hydration work (the real
SSE connect, the pool-client/pr-review panel polls) the jsdom axes above stub out entirely.

| axis | fixture size | longest task |
| --- | --- | --- |
| row | 1 → 8 | 0.0ms → 0.0ms |
| task | 1 → 20 | 55.0ms → 54.0ms |
| lane | 1 → 8 | 0.0ms → 0.0ms |

No ratchet is set yet, same as the other axes above — this is the first measurement. A 0ms
result is not a broken probe: at this fixture scale the client's hydration work may simply
never cross the 50ms Long Tasks threshold — the axis exists to catch the fixture size where it
starts to.

## unique declaration values

Unique values per CSS property across the stylesheet `server/routes.ts` serves at
`GET /tokens.css` (`fontFaceCss() + stylesheet() + layoutCss()`, composed in that exact
order), parsed through jsdom's CSSOM. Custom-property DEFINITIONS (`--*`, the token sheet
itself) are bucketed separately — token definitions are unique by design, while many distinct
values piled onto one standard property is exactly the drift phase 1's ledger will chase.
Measured ONCE, not at two fleet sizes: `/tokens.css` is static text, byte-identical at 1
lane and 8 (the ≥2-sizes constraint exists for metrics that scale with state). Known parser
omission: jsdom's `CSSFontFaceRule` serialization drops `src`, so the font-face data-URI
values (by-design-unique, no drift signal) are absent from the counts.

**97 standard properties, 2867 declarations,
379 unique values** (plus 193
custom-property definitions carrying 135 unique values). Top
12 properties by unique-value count:

| property | declarations | unique values |
| --- | --- | --- |
| `padding` | 147 | 25 |
| `background` | 160 | 20 |
| `margin` | 96 | 14 |
| `opacity` | 44 | 14 |
| `width` | 34 | 13 |
| `border-radius` | 208 | 12 |
| `fill` | 27 | 12 |
| `color` | 261 | 11 |
| `font-size` | 204 | 10 |
| `border` | 114 | 10 |
| `gap` | 104 | 10 |
| `height` | 21 | 10 |

No ratchet is set yet, same as the other axes above — this is the first measurement. A high
unique-value count on a tokenizable property (colors, spacing, radii, durations) marks where
the phase-1 drift ledger should start.

## selector specificity

Specificity of every selector in the same served stylesheet as the unique-values census
above, scored per CSS Selectors 4 (`:not()` counts as its most specific argument;
combinators and `*` count nothing) and bucketed by exact (id, class, type) triple.
Measured ONCE, not at two fleet sizes, for the same reason as the value census —
`/tokens.css` is static text. High-specificity buckets are where override wars and
`!important` escalation start; phase 1's flattening work is judged against this table.

**892 selectors across 737 style rules; max
specificity 1,2,0;
34 selectors carry an ID.**

| specificity (id,class,type) | selectors | example |
| --- | --- | --- |
| 1,2,0 | 15 | `#fly-go:not(:disabled):hover` |
| 1,1,0 | 6 | `#fly-go:disabled` |
| 1,0,0 | 13 | `#fly-folder` |
| 0,3,1 | 18 | `.gh-issue-form button:not(:disabled):hover` |
| 0,3,0 | 60 | `.connect-test:not(:disabled):hover` |
| 0,2,2 | 12 | `.connect-form button:hover::after` |
| 0,2,1 | 41 | `.switch button:hover` |
| 0,2,0 | 149 | `.gh-issue-result:empty` |
| 0,1,2 | 6 | `.connect > summary::-webkit-details-marker` |
| 0,1,1 | 71 | `.brand-mark svg` |
| 0,1,0 | 494 | `:root` |
| 0,0,1 | 5 | `body` |
| 0,0,0 | 2 | `*` |

No ratchet is set yet, same as the other axes above — this is the first measurement.

## contrast matrix

WCAG contrast ratio of every color token against every canvas it renders on — 14 foreground
tokens × the 3 surface tokens, plus `accentText` × the 10 fill tokens it paints text over
(`accentText` never renders on a surface; in dark it IS the surface color, so surface pairs
would report by-design-identical colors as failures) — per theme, computed with the token
package's own `contrastRatio` (the OKLCH→luminance core `themes.test.ts` enforces its
floors with) over the exact values `colorVars()` serves as `--color-*` custom properties.
Floors: **4.5:1** normal text (WCAG 1.4.3), **3:1** large text and non-text UI components
(1.4.11 — borders, chip fills, icons). The tests pin a handful of known-used pairs; this
matrix commits the full picture so phase-1 recon can read which untested pairs sit below
3:1 (never usable as-is) or in [3, 4.5) (non-text/large-text only) without re-deriving it.
Measured ONCE, not at two fleet sizes: theme tokens are static values.

### dark

min **1.30** (`border` on `surfaceRaised`) —
6 of 52 cells below 3:1, 0 in
[3, 4.5) (non-text/large-text only), 46 at ≥ 4.5:1 (normal-text ready).

| token | on `surface` | on `surfaceRaised` | on `surfaceSunken` |
| --- | --- | --- | --- |
| `text` | 17.28 | 15.78 | 18.07 |
| `textMuted` | 8.42 | 7.69 | 8.80 |
| `border` | 1.42 | 1.30 | 1.49 |
| `borderStrong` | 2.72 | 2.49 | 2.85 |
| `accent` | 8.66 | 7.91 | 9.06 |
| `success` | 9.61 | 8.78 | 10.05 |
| `warning` | 11.02 | 10.06 | 11.52 |
| `danger` | 6.18 | 5.64 | 6.46 |
| `info` | 8.55 | 7.80 | 8.94 |
| `sevCritical` | 5.67 | 5.18 | 5.93 |
| `sevHigh` | 8.54 | 7.79 | 8.93 |
| `sevMedium` | 11.06 | 10.10 | 11.57 |
| `sevLow` | 8.60 | 7.85 | 9.00 |
| `needsYou` | 7.18 | 6.56 | 7.51 |

| `accentText` on fill | ratio |
| --- | --- |
| `accent` | 8.66 |
| `success` | 9.61 |
| `warning` | 11.02 |
| `danger` | 6.18 |
| `info` | 8.55 |
| `sevCritical` | 5.67 |
| `sevHigh` | 8.54 |
| `sevMedium` | 11.06 |
| `sevLow` | 8.60 |
| `needsYou` | 7.18 |

### light

min **1.24** (`border` on `surfaceSunken`) —
6 of 52 cells below 3:1, 6 in
[3, 4.5) (non-text/large-text only), 40 at ≥ 4.5:1 (normal-text ready).

| token | on `surface` | on `surfaceRaised` | on `surfaceSunken` |
| --- | --- | --- | --- |
| `text` | 16.82 | 15.88 | 14.97 |
| `textMuted` | 7.55 | 7.12 | 6.71 |
| `border` | 1.39 | 1.32 | 1.24 |
| `borderStrong` | 2.41 | 2.27 | 2.14 |
| `accent` | 5.39 | 5.09 | 4.80 |
| `success` | 5.31 | 5.01 | 4.72 |
| `warning` | 4.28 | 4.04 | 3.81 |
| `danger` | 5.84 | 5.51 | 5.19 |
| `info` | 5.10 | 4.82 | 4.54 |
| `sevCritical` | 5.87 | 5.54 | 5.23 |
| `sevHigh` | 4.78 | 4.51 | 4.25 |
| `sevMedium` | 5.02 | 4.73 | 4.46 |
| `sevLow` | 5.13 | 4.84 | 4.56 |
| `needsYou` | 6.62 | 6.24 | 5.88 |

| `accentText` on fill | ratio |
| --- | --- |
| `accent` | 5.39 |
| `success` | 5.31 |
| `warning` | 4.28 |
| `danger` | 5.84 |
| `info` | 5.10 |
| `sevCritical` | 5.87 |
| `sevHigh` | 4.78 |
| `sevMedium` | 5.02 |
| `sevLow` | 5.13 |
| `needsYou` | 6.62 |

### terminal

min **1.52** (`border` on `surfaceRaised`) —
3 of 52 cells below 3:1, 3 in
[3, 4.5) (non-text/large-text only), 46 at ≥ 4.5:1 (normal-text ready).

| token | on `surface` | on `surfaceRaised` | on `surfaceSunken` |
| --- | --- | --- | --- |
| `text` | 15.58 | 14.69 | 16.13 |
| `textMuted` | 7.85 | 7.40 | 8.12 |
| `border` | 1.61 | 1.52 | 1.66 |
| `borderStrong` | 3.19 | 3.01 | 3.30 |
| `accent` | 12.94 | 12.21 | 13.39 |
| `success` | 13.84 | 13.05 | 14.32 |
| `warning` | 12.80 | 12.07 | 13.25 |
| `danger` | 6.92 | 6.53 | 7.16 |
| `info` | 11.86 | 11.19 | 12.28 |
| `sevCritical` | 6.72 | 6.34 | 6.96 |
| `sevHigh` | 9.78 | 9.23 | 10.12 |
| `sevMedium` | 12.88 | 12.15 | 13.33 |
| `sevLow` | 11.19 | 10.55 | 11.58 |
| `needsYou` | 9.72 | 9.17 | 10.06 |

| `accentText` on fill | ratio |
| --- | --- |
| `accent` | 12.94 |
| `success` | 13.84 |
| `warning` | 12.80 |
| `danger` | 6.92 |
| `info` | 11.86 |
| `sevCritical` | 6.72 |
| `sevHigh` | 9.78 |
| `sevMedium` | 12.88 |
| `sevLow` | 11.19 |
| `needsYou` | 9.72 |

No ratchet is set yet, same as the other axes above — this is the first measurement. A
below-3:1 cell is not automatically a defect: it is a pair no rendered surface may use.
The phase-1 drift ledger should cross-reference this table against the token coverage
census below to prove no such pair is actually painted.

## token coverage via computed-style census

Every color-relevant declaration (`color`, `background`/`background-color`,
`border*-color`, `outline-color`, `fill`, `stroke`) in the same served stylesheet as the
unique-values/specificity censuses above, classified per the epic's Phase 1 vocabulary
(covered/drifted/uncovered): **covered** references a design token (`var(--color-*)`);
**drifted** hardcodes a literal that normalizes to the SAME value as one of the token
package's own theme colors — should be a `var(--color-*)` reference but duplicates one
instead; **uncovered** hardcodes a literal matching no known token — genuinely untracked ink.
Values normalized through jsdom's own `CSSStyleDeclaration` parser (`#fff` and
`rgb(255, 255, 255)` collapse to the same string) so spelling does not fake drift. Keyword
values (`transparent`, `currentColor`, `inherit`, `none`, ...) carry no fixed color and are
excluded from all three buckets — there is no ink to cover.

**493 covered, 0 drifted,
3 uncovered** (plus 41 keyword
values and 0 declarations jsdom could not parse as a color — both
excluded from the buckets above).

### drifted — hardcoded literal duplicates a token

| property | value | selector | duplicates |
| --- | --- | --- | --- |
| — | — | — | — |

### uncovered — hardcoded literal matches no token

| property | value | selector |
| --- | --- | --- |
| `background` | `rgba(0, 0, 0, 0.5)` | `.report-dialog-overlay` |
| `background` | `rgba(0, 0, 0, 0.5)` | `.tour-overlay` |
| `background` | `rgba(0, 0, 0, 0.5)` | `.browse-overlay` |

No ratchet is set yet, same as the other axes above — this is the first measurement. An empty
drifted/uncovered table would not be proof of full token coverage either: this census only
sees the SERVED stylesheet, not the token package's own internal values (already
token-covered by definition) or any future inline style — see the doc comment on
`measureTokenColorCensus` for why an inline-style-driven census is unnecessary in this
codebase today.

## alarm rate & severity shape

Alarm-styled elements in the SAME painted renders as the DOM-growth axes above, at each
fixture's small and large size. The alarm-selector set is DERIVED from the served
stylesheet, not hand-listed: every resting-state selector whose declarations reference an
attention token (`--color-sev-*`, `--color-needs-you`) — interaction-state selectors
(`:hover`/`:focus`/`:active`) excluded, pseudo-elements matched via their host — so the
census tracks the stylesheet automatically as rules move (derived resting selectors:
critical 13, high 21, needsYou 14, medium 15, low 4). **Rate** is the share of ALL rendered elements painted with
response-demanding ink — critical, high, needs-you (ISA-18.2's definition: an alarm requires
an operator response; medium/low are caution/info ink). **Shape** is the per-token element
distribution the epic's "re-rationalize severity to the shape where critical is rare" is
judged against. An element painted with two buckets' ink counts in both buckets' shape,
once in the rate.

| axis | fixture size | alarm-styled (rate) | critical | high | needs-you | medium | low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| row | 1 → 8 | 4 → 18 (1.6% → 2.3%) | 1 → 8 | 3 → 10 | 0 → 0 | 1 → 1 | 1 → 8 |
| task | 1 → 20 | 5 → 9 (1.5% → 1.9%) | 1 → 1 | 4 → 8 | 0 → 0 | 1 → 1 | 1 → 1 |
| lane | 1 → 8 | 4 → 4 (1.2% → 0.9%) | 1 → 1 | 3 → 3 | 0 → 0 | 1 → 1 | 4 → 11 |

Reading the shape: the `medium`/`low` buckets include DOUBLE-DUTY ink — e.g. activity
chips painted with `--color-sev-low`/`--color-sev-medium` as mere category colors
(`.act-file`/`.act-search`, no severity semantics) — so a count there is not
automatically caution/info signal; that conflation is exactly the double-duty token drift
the epic's phase-1 audit hunts ("one confirmed instance already"). No ratchet is set yet,
same as the other axes above — this is the first measurement.

## i18n tagging coverage

Same three fixtures (row/task/lane) as the axes above, checked at each fixture's small and
large size against `web/features/locale.ts`'s OWN `translateDom()` sweep targets rather
than a hand-picked selector list, so a new sweep attribute added there is picked up here for
free. Three independent candidate pools, one per sweep: elements carrying their OWN
non-whitespace text (tagged by `[data-i18n]` or `[data-i18n-template]`), elements with an
`aria-label` (tagged by `[data-i18n-aria]`), and elements with a `placeholder` (tagged by
`[data-i18n-placeholder]`). `data-tip` hover text is out of scope by design (`strings.ts`:
"stays English-only for now") and never enters any pool here.

| axis | fixture size | text tagged/total | aria-label tagged/total | placeholder tagged/total |
| --- | --- | --- | --- | --- |
| row | 1 → 8 | 45/115 (39.1%) → 122/374 (32.6%) | 21/55 (38.2%) → 28/202 (13.9%) | 4/4 (100.0%) → 4/4 (100.0%) |
| task | 1 → 20 | 61/161 (37.9%) → 61/276 (22.1%) | 24/65 (36.9%) → 24/129 (18.6%) | 5/7 (71.4%) → 5/7 (71.4%) |
| lane | 1 → 8 | 47/157 (29.9%) → 47/220 (21.4%) | 22/76 (28.9%) → 22/111 (19.8%) | 4/4 (100.0%) → 4/4 (100.0%) |

Coverage falls as row/task/lane count grows because the denominator is dominated by
client-rendered FLEET DATA (project names, task titles, activity targets) — content, not
untranslated chrome — while the numerator (tagged static chrome: masthead, searchbar,
flightbar) stays fixed regardless of fleet size. This is expected, not a regression signal;
it marks the boundary between i18n foundation's already-tagged chrome and the still-larger,
per-project/task client-rendered surface `strings.ts`'s own doc comment names as its next,
much larger target. No ratchet is set yet, same as the other axes above — this is the first
measurement.
## interaction latency (INP p75 proxy) & longest task

One simulated click dispatched on EVERY tab-stop element — the exact population the
tab-stops axis counts, so the two axes describe one keyboard surface — in the same painted
renders as the DOM-growth axes, with each dispatch's synchronous processing duration timed.
**INP p75** is the nearest-rank 75th percentile of those durations, a PROXY for field INP:
jsdom runs handlers synchronously and never paints, so of INP's three components (input
delay, processing duration, presentation delay) only processing duration exists here.
**longest task** is the longest uninterrupted main-thread block observed anywhere in the
render's lifecycle: the client bundle's initial synchronous eval, a poll tick drained
through its microtask render continuations (an upper bound — the drain lumps every
continuation into one block), or the slowest single interaction dispatch. Anchor default
actions are suppressed via a capture-phase `preventDefault` (jsdom cannot navigate);
handlers themselves still run.

| axis | fixture size | interactions | INP p75 (ms) | INP max (ms) | longest task (ms) |
| --- | --- | --- | --- | --- | --- |
| row | 1 → 8 | 77 → 238 | 1.19 → 1.03 | 5.55 → 15.72 | 15.71 → 16.21 |
| task | 1 → 20 | 100 → 183 | 1.11 → 1.01 | 9.77 → 11.97 | 15.90 → 16.01 |
| lane | 1 → 8 | 92 → 92 | 1.18 → 1.06 | 11.45 → 12.41 | 15.88 → 15.73 |

These are wall-clock timings on the measuring machine — noisy run-to-run and
machine-dependent, unlike every count above. This dated snapshot is the SHAPE baseline
(how latency scales from the small to the large fixture), not a CI ratchet; the epic's
"ratchets start at today's measured value" rule applies once a second data point exists
to judge stability against.
