<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

> **ARCHIVED (2026-09-05):** the first run of this series, consolidated with its
> successors into [`../COCKPIT-BASELINE.md`](../COCKPIT-BASELINE.md), the one living
> doc with a delta-only trend table. Kept for the series' completeness.

# EVALUATION — cockpit baseline, DOM growth + axe by impact + tab stops + attribute payload + duplicate renders + unique values + specificity + contrast matrix + alarm rate + severity shape + i18n tagging coverage (2026-08-28)

COCKPIT PHASE 0 MEASURE (`docs/epics/0015-cockpit-supervisory-control.md`, board
web-mtbpiiur-43tmr3): eleven rows of the brief's §5 table, measured against the REAL served
surfaces (`renderShell`/`clientJs`, `apps/dashboard/src/web/shell.ts`, plus the
`/tokens.css` stylesheet exactly as `server/routes.ts` composes it, and the theme token
maps exactly as `colorVars()` serves them) in jsdom via
`scripts/cockpit-metrics.mjs`, not asserted. Every other §5 row (INP p75,
longest task, token coverage via
computed-style census) stays open for a follow-on slice;
regenerate this file with `pnpm run cockpit-metrics`.

## DOM growth per lane / task / row

| axis | fixture size | total DOM nodes | nodes per added unit |
| --- | --- | --- | --- |
| row | 1 → 8 | 246 → 764 | 74.0 |
| task | 1 → 20 | 439 → 554 | 6.1 |
| lane | 1 → 8 | 312 → 424 | 16.0 |

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
| task | 1 → 20 | 124 → 207 | 4.4 |
| lane | 1 → 8 | 103 → 152 | 7.0 |

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
| row | 1 → 8 | 15544 → 43036 | 3927.4 |
| task | 1 → 20 | 24574 → 36631 | 634.6 |
| lane | 1 → 8 | 20961 → 27960 | 999.9 |

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
| row | 1 → 8 | 14 → 14 | 0.0 |
| task | 1 → 20 | 14 → 14 | 0.0 |
| lane | 1 → 8 | 14 → 14 | 0.0 |

No ratchet is set yet, same as the other axes above — this is the first measurement.

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

**95 standard properties, 2680 declarations,
356 unique values** (plus 193
custom-property definitions carrying 135 unique values). Top
12 properties by unique-value count:

| property | declarations | unique values |
| --- | --- | --- |
| `padding` | 140 | 24 |
| `background` | 144 | 19 |
| `opacity` | 43 | 14 |
| `margin` | 91 | 13 |
| `border-radius` | 185 | 12 |
| `width` | 31 | 12 |
| `color` | 251 | 11 |
| `font-size` | 193 | 10 |
| `border` | 107 | 10 |
| `gap` | 99 | 10 |
| `border-color` | 70 | 9 |
| `fill` | 23 | 9 |

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

**813 selectors across 691 style rules; max
specificity 1,2,0;
31 selectors carry an ID.**

| specificity (id,class,type) | selectors | example |
| --- | --- | --- |
| 1,2,0 | 12 | `#fly-go:not(:disabled):hover` |
| 1,1,0 | 6 | `#fly-go:disabled` |
| 1,0,0 | 13 | `#fly-folder` |
| 0,3,1 | 11 | `.gh-issue-form button:not(:disabled):hover` |
| 0,3,0 | 56 | `.connect-test:not(:disabled):hover` |
| 0,2,2 | 12 | `.connect-form button:hover::after` |
| 0,2,1 | 31 | `.switch button[aria-pressed='true']` |
| 0,2,0 | 117 | `.gh-issue-result:empty` |
| 0,1,2 | 6 | `.connect > summary::-webkit-details-marker` |
| 0,1,1 | 69 | `.brand-mark svg` |
| 0,1,0 | 473 | `:root` |
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
The phase-1 drift ledger should cross-reference this table against the computed-style
census (still an open row) to prove no such pair is actually painted.

## alarm rate & severity shape

Alarm-styled elements in the SAME painted renders as the DOM-growth axes above, at each
fixture's small and large size. The alarm-selector set is DERIVED from the served
stylesheet, not hand-listed: every resting-state selector whose declarations reference an
attention token (`--color-sev-*`, `--color-needs-you`) — interaction-state selectors
(`:hover`/`:focus`/`:active`) excluded, pseudo-elements matched via their host — so the
census tracks the stylesheet automatically as rules move (derived resting selectors:
critical 13, high 20, needsYou 14, medium 15, low 4). **Rate** is the share of ALL rendered elements painted with
response-demanding ink — critical, high, needs-you (ISA-18.2's definition: an alarm requires
an operator response; medium/low are caution/info ink). **Shape** is the per-token element
distribution the epic's "re-rationalize severity to the shape where critical is rare" is
judged against. An element painted with two buckets' ink counts in both buckets' shape,
once in the rate.

| axis | fixture size | alarm-styled (rate) | critical | high | needs-you | medium | low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| row | 1 → 8 | 4 → 18 (1.6% → 2.4%) | 1 → 8 | 3 → 10 | 0 → 0 | 1 → 1 | 1 → 8 |
| task | 1 → 20 | 5 → 9 (1.1% → 1.6%) | 1 → 1 | 4 → 8 | 0 → 0 | 1 → 1 | 1 → 1 |
| lane | 1 → 8 | 4 → 4 (1.3% → 0.9%) | 1 → 1 | 3 → 3 | 0 → 0 | 1 → 1 | 4 → 11 |

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
| row | 1 → 8 | 44/109 (40.4%) → 121/368 (32.9%) | 21/60 (35.0%) → 28/207 (13.5%) | 4/4 (100.0%) → 4/4 (100.0%) |
| task | 1 → 20 | 49/208 (23.6%) → 49/304 (16.1%) | 21/68 (30.9%) → 21/151 (13.9%) | 5/7 (71.4%) → 5/7 (71.4%) |
| lane | 1 → 8 | 46/144 (31.9%) → 46/193 (23.8%) | 22/87 (25.3%) → 22/136 (16.2%) | 4/4 (100.0%) → 4/4 (100.0%) |

Coverage falls as row/task/lane count grows because the denominator is dominated by
client-rendered FLEET DATA (project names, task titles, activity targets) — content, not
untranslated chrome — while the numerator (tagged static chrome: masthead, searchbar,
flightbar) stays fixed regardless of fleet size. This is expected, not a regression signal;
it marks the boundary between i18n foundation's already-tagged chrome and the still-larger,
per-project/task client-rendered surface `strings.ts`'s own doc comment names as its next,
much larger target. No ratchet is set yet, same as the other axes above — this is the first
measurement.
