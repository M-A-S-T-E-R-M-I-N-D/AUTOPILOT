<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0012. English STRINGS out of the core chunk: English travels with its first caller

Status: Proposed (board `web-mty2qf7u-hn1wsb`: "Design (not a blind move)".
This record measures the split and fixes the fallback contract. It changes
no code. The slices at the end are the implementation.)

## Context

`features/locale.ts`'s `localeJs()` splices the whole of `STRINGS.en` into
the render-blocking core chunk (`/app.js`). `features/locale-data.ts` already
moved the non-English tables to the deferred `/panels.js` (board
ap-mtk2tgvh-0). Every i18n slice since then has raised the core budget in
`scripts/ci/check-bundle-size.mjs`, often by a few hundred bytes. The
budget's own comment names the structural answer ("move the non-English
STRINGS table out of core entirely") as boarded but not done. The title's
figures (191KB raw / 57KB gz) date from 2026-09-12. The measurements below
replace them.

### Measured (2026-09-26, HEAD `abc6db98`)

Method: the built `apps/dashboard/dist`, with each chunk run through the same
esbuild minify (`charset: 'utf8'`) and Node `gzipSync` that
`check-bundle-size.mjs` uses. A key counts as referenced by a chunk when it
appears as a quoted literal (`'k'`, `"k"` or a backtick string) in that
chunk's unminified source, with the STRINGS splice itself left out.

| Quantity | Raw | Gzip |
| --- | --- | --- |
| Core `/app.js` today | 263673 B (257.5KB) | 79083 B (77.2KB) |
| `STRINGS.en` alone (1005 keys, JSON) | 59939 B | 19708 B |
| `STRINGS.he` alone (1005 keys, JSON) | 77099 B | 22441 B |
| Core with `STRINGS.en` emptied | 205796 B | 58961 B |
| Cost of `STRINGS.en` inside core | 57877 B (22%) | 20122 B (25%) |

Where the 1005 English keys are referenced:

- 338 in core's own code: 168 literal `tr()` calls over 141 keys, plus
  `data-i18n*` tags, `setTip` keys and key maps.
- 191 only in `/project.js`.
- 253 in `/panels.js`. With the 228 server-only keys, that leaves 476 keys
  that core and project never reference. No key is shared by project and
  panels without also being in core.
- 228 in no client chunk. The server renders these into the shell
  (`skipToFleet`, `loginClaude`, `tourTip`, …). The client needs their
  English only to repaint after a Hebrew → English switch.
- `/whats-new.js` executes last, so any key it references resolves from an
  earlier chunk.

The scan over-approximates: a key that happens to spell an unrelated literal
in core counts as a core reference. That errs toward keeping English in core,
which costs bytes but is never unsafe. It could miss only keys composed at
runtime, and it found none in the client chunks. (Slice 2c's census proved
that wrong: core composes keys from four stems and one suffix. See slice 2c
below.) The two
`data-i18n="' + key` concatenations (`web/shell.ts`, `web/shell-html.ts`)
are server-side renderers whose keys are literals at their call sites.

### Why "just defer it all" is unsafe

`fleetJs()` in core ends with a top-level `startFleetStream()`. It calls
`refresh()`, which fetches `/api/state` while the parser is still running. When the response
arrives, `renderFleet` runs, and it calls `tr()` for many of the 141 keys.
Deferred scripts run in document order after parsing. The event loop keeps
turning between them, so a fast local `/api/state` response can land before
`/panels.js` has executed. Panels also call `tr()` during their own
self-init: `connect.ts`'s `setTip` runs at chunk execution, before
`locale-data.ts`'s tail. That comment in `connect.ts` already records this
ordering.

This session also checked `tr()` on a key that no table holds, by
evaluating `localeJs()`:

- `tr('noSuchKey')` returns `undefined`, which renders as the text
  "undefined" in a confirm dialog.
- `tr('noSuchKey', 'x')` throws `TypeError: Cannot read properties of
  undefined (reading 'split')` inside whatever click handler called it.

## Options (measured)

Each option says where each English entry lives. "Head" means an
`Object.assign(STRINGS.en, {…})` placed at the start of a deferred chunk.

| Option | Core | `/project.js` | `/panels.js` |
| --- | --- | --- | --- |
| A: all English deferred (panels head) | 205796 / 58961 (−57877 / −20122) | ±0 | +57906 / +18848 |
| **B: English travels with its first caller** | 224013 / 65827 (−39660 / −13256) | +10756 / +3088 | +28960 / +10075 |
| C: core + project keys stay in core | 234741 / 69032 (−28932 / −10051) | ±0 | +28960 / +10075 |

(Bytes: raw / gzip. Differences are against today's chunk.)

Total bytes over the wire for each page type:

- **A** mostly relocates bytes: +29 B raw / −1274 B gz on every page type.
  It also races, as above: every core `tr()` before `/panels.js` returns
  `undefined` or throws.
- **B** gives home pages −10700 B raw / −3181 B gz in total, because
  project-only English stops shipping where no project code runs. Project
  pages come out at +56 B raw / −93 B gz, byte-neutral. Render-blocking core
  shrinks by 15% raw and 17% gzip.
- **C** is simpler, with one head only, but saves about a quarter less in
  core. Its page totals are +28 B raw / +24 B gz, so home pages keep paying
  for the 191 project-only keys.

Two further ideas were rejected:

- **D: a separate cacheable `/strings.en.js`.** Loaded render-blocking, it
  adds a critical-path request for the same bytes. Loaded deferred, it is
  option A's race.
- **E: also defer core keys used only at event time (confirm dialogs).** A
  static scan cannot tell call time from paint time, so this needs per-site
  annotation. It is deferred until B's numbers are in and the next budget
  wall is known.

## Decision (proposed)

Adopt **B**, with this fallback contract:

1. **Placement invariant.** Each English entry is emitted in the
   earliest-executing chunk whose source references its key. The order is
   `/app.js` (parser-blocking), then `/project.js`, `/panels.js` and
   `/whats-new.js` (all `defer`, in document order):
   - A key core references stays in `localeJs()`'s core subset.
   - A key only project code references goes at the **head** of
     `/project.js`.
   - Every other key goes at the **head** of `/panels.js`. That includes the
     228 server-rendered-only keys.

   No chunk may reference a key whose English lives in a later chunk. If a
   deferred chunk fails to load, its callers fail with it, so no surviving
   code can ask for English that never arrived.
2. **Head, not tail.** Each deferred English table goes at the start of its
   chunk, before any module's self-init. It must widen `STRINGS.en` in place
   (`Object.assign(STRINGS.en, …)`) and never replace it, because
   reassigning `en` would drop core's subset. `STRINGS.he` stays whole in
   the `locale-data.ts` tail with its re-sweep. Nothing about the Hebrew
   fallback changes.
3. **`tr()` miss rule.** Lookup goes active locale, then `STRINGS.en`, then
   **the key itself**. `tr()` never returns `undefined` and never throws,
   with or without substitutions. The key is returned instead of `''`
   because a blank `confirm()` asks the operator to approve an action it
   does not name, while an echoed key is a visible, greppable bug. The
   census below makes the key echo unreachable for literal keys. The rule
   exists for server-supplied keys (`reasonKey` in the connect compose flow
   and report-from-here) and for any future dynamic call site.
4. **`translateDom()` miss rule: unchanged.** A missing entry is skipped, so
   the English the server rendered stays in place. That is today's
   `if (text && …)` behavior.
5. **Generated, not hand-listed.** A build step derives each chunk's English
   from the same reference scan that produced the numbers above. A new key
   then lands in the right chunk without per-slice bookkeeping. The core
   budget's comment history records 35 raises, many of them for a handful
   of English strings.
6. **Census.** One test asserts three things:
   - Every key each chunk references resolves in its own head or in an
     earlier chunk.
   - The heads together cover `STRINGS.en` exactly once, with no drops and
     no duplicates.
   - Every non-literal `tr(…)` call site in `web/` names its key domain as a
     literal array in the same module. The server-supplied key unions must
     resolve in the chunk that consumes them. (Slice 2c shipped this clause
     in a different form, below.)

## Consequences

Easier:

- Render-blocking core drops about 39.7KB raw / 13.3KB gz.
- Home pages ship about 10.7KB less in total.
- The next core-referenced string costs core only its own bytes. Panel-only
  and project-only strings stop touching the core budget at all.

Harder:

- `/panels.js` grows to about 231.1KB raw / 70.5KB gz. Today it sits at
  202.8KB against a 203KB budget, 167 B under the raw line. The chunk
  budgets therefore move in the same slice as the change: core down to
  ~219KB / ~65KB, panels up to ~232KB / ~71KB.
- `CHUNK_*_BUDGET` is shared by `/project.js` and `/panels.js`, and
  `/project.js` would sit near 115KB (118163 B). Raising the shared line
  would hand it ~115KB of slack nobody asked for, so that slice should split
  the shared line into per-chunk budgets.

Test surface:

- 259 test files evaluate the full `clientJs()`, which concatenates every
  chunk and therefore every English head. They are unaffected.
- Five evaluate `coreClientJs()` and three evaluate `localeJs()` alone.
  Those tests lose non-core English and must opt into the full table.

## Slices

1. **`tr()` miss rule.** Test-first: the `undefined` and `TypeError` above
   are the red tests. It stands alone, is tiny, and is a latent bug whether
   or not B lands. Shipped (board `ap-muhvlma5-0`): `tr()` reads only real
   string entries (`ownText()`, so a key spelling `constructor` or
   `__proto__` also misses) and echoes `String(key)` on a miss.
2. **Generated per-chunk English heads.** Includes the census, the moved and
   split budgets, and the `coreClientJs()`/`localeJs()` test opt-in. This is
   the only slice that moves bytes. It ships in three parts (board
   `ap-muhvlma6-1`):
   - **2a, shipped: the generator and the census, no bytes moved.**
     `web/english-heads.ts` places each key with the reference scan above.
     A key project code shares with `/panels.js` or `/whats-new.js` stays in
     core, because `/project.js` never loads on the home page.
     `test/web/english-heads.test.ts` asserts the census's first two clauses
     over the served chunks. At 1018 keys the scan places 349 in core, 191 in
     the project head and 478 in the panels head.
   - **2b, shipped: the byte move.** `shell.ts`'s chunk composers pass the
     composed chunks through `narrowCoreEnglish()` and `headWithEnglish()`,
     with the placement scanned once per process. The census now reads the
     English each served chunk actually carries. Measured minified, core went
     from 268829 B raw / 80502 B gzip to 229068 / 67222, `/project.js` from
     107507 / 28433 to 118263 / 31521, and `/panels.js` from 208177 / 62209
     to 237238 / 72310. Home pages ship 10700 B raw / 3179 B gzip less in
     total, and project pages come out at +56 B raw / −91 B gzip. The core budget moved
     down to 226KB / 67KB, and the shared chunk line split into
     `PROJECT_*` (118KB / 32KB) and `PANELS_*` (234KB / 72KB). No test
     needed the opt-in. The five `coreClientJs()` suites only exercise
     keys core references, and `localeJs()` still returns the whole table,
     since the narrowing happens in the composer.
   - **2c, shipped: the census's third clause.** A key held in a variable
     is safe when some client literal spells it. English lands no later than
     the chunk holding that literal, whose head runs before any of its code.
     So the clause guards the two ways a key escapes the scan:
     - **Composed keys.** No `tr()` call composes its key inline. Every
       camelCase stem or suffix a chunk joins to a runtime value is a family
       that `web/english-heads.ts` declares (`COMPOSED_KEY_STEMS`,
       `COMPOSED_KEY_SUFFIX`), and each family resolves in full in every
       chunk that composes it. The generator now counts a family member as
       referenced wherever its stem is spelled, and a `…Tip` key wherever
       its base key is.
     - **Server-supplied keys.** `REPORT_REASON_KEYS` and
       `REPORT_COMPOSE_REASON_KEYS` are literal arrays, and each key
       resolves in every chunk that renders a `reasonKey`.

     A literal array at each of the ~35 variable-key call sites was not
     needed. Those sites draw their keys from literals and maps in client
     code, which the scan already reads.

     The census caught a 2b regression. 2b had sent 44 keys from the
     families core composes to the `/panels.js` head: the status-pill tips
     (`labelKey + 'Tip'`), the anomaly popover's words
     (`'anomalyWhat' + suffix`) and the orient-fixation templates. The Tip
     rule also covers `searchTip` and `askTip`, whose base keys core spells.
     The fleet card's first render could echo a raw key as a tip. All 44
     keys are back in core. Measured minified, core is 234731 B raw /
     69324 B gzip (core budget 231KB / 69KB), and `/panels.js` drops to
     233224 / 70864. The reader's blind spot is a lower-case one-word stem
     (`'task' + …` reads as a CSS class).

## Related

- `apps/dashboard/src/web/features/locale.ts`, `locale-data.ts`,
  `web/chunks.ts` (chunk map and defer contract),
  `web/english-heads.ts` (the placement generator),
  `server/client-bundle.ts` (the measured minify).
- `scripts/ci/check-bundle-size.mjs` and
  `apps/dashboard/test/server/client-bundle-size-budget.test.ts`: the budget
  history this record exists to stop extending one string at a time.
- [ADR 0004](0004-gated-slices-over-big-bang.md): why the move ships as
  two gated slices, not one.
