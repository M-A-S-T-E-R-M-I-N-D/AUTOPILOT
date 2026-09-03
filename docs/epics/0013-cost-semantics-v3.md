<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0013. Cost semantics v3 — real subscription cost, not API list-price

Status: In progress — slices 1 and 2 landed (FiringRecord now carries `realCostUsd`,
operator-configurable via `AUTOPILOT_SUBSCRIPTION_PRICE_USD` / `AUTOPILOT_USAGE_POOL_DIRS`),
slice 3's docs note, flight-summary-panel UI addition, and fleet-wide "real cost"
header tile all landed; the remaining slice 3 call site (`web/shell.ts`'s own inline
`fmtCost` sites) is still open, blocked on a sibling's live claim on that file

Board task: `web-msw01sww-869dqi` ("COST SEMANTICS v3 (precise, ccusage-method): real
cost = cost_usd x (subscription price / MACHINE-WIDE 30d equiv), denominator from
~/.claude jsonl usage DEDUPED by message id (pool is shared with ope…" — the board title
is truncated past this point; the rest of the sentence was not recoverable from any
in-repo doc at spec time).

**Why this spec exists now:** exactly the situation `docs/epics/README.md` was written
to prevent — a dense, single-line board title with no supporting doc anywhere in the
repo, and a name ("v3") that implies prior versions this repo has no record of. Per that
convention, a task this ambiguous gets a committed spec before any firing starts
implementing, instead of each of several firings re-deriving (and probably disagreeing
on) the formula from the title alone. This spec is that first step — research and
acceptance criteria only, no implementation.

## Context — what cost telemetry already reports today, and why it can mislead

Every dollar figure in this dashboard and in `docs/RESEARCH-LIBRARY.md` /
`docs/SELF-STUDY/PAPER.md` today — "$3980.45 total cost", "$3.79 per ship",
`FiringRecord.costUsd` — traces back to one field: the Claude CLI's self-reported
`total_cost_usd`, read verbatim at `packages/engine/src/adapters/claude-cli.ts:114`
(`costUsd: numOrNull(o['total_cost_usd'])`) and carried through `EnvelopeFacts` /
`FiringRecord` (`packages/engine/src/telemetry.ts`) untransformed into every UI surface
that calls `fmtCost` (`apps/dashboard/src/web/format.ts:24`) — flight rows, flight
summaries, best/worst-flight digests, the Ask panel's own cost caps, and the self-study
paper's cost tables.

That field is **API list-price**, computed by the CLI as if every token were billed
per-request. It is the right number when billing is metered. It is the wrong number
when the operator is on a **flat-rate subscription** (a fixed monthly price covering a
usage pool) — in that world, no firing's list-price total corresponds to money that
actually left anyone's account on that firing. `docs/RESEARCH-LIBRARY.md`'s own
"Firing cost anatomy" section (line ~344) already measures and reports in list-price
terms without flagging the distinction — every "$/ship" trend in this repo's own
research is, today, a proxy metric, not a real one. The board title's "precise" and
"ccusage-method" phrasing name a known fix for this exact class of problem: compute each
unit of work's **share** of total usage over a trailing window, then apportion the
subscription's real, fixed price by that share, rather than trusting the metered
list-price number directly. (`ccusage` is a known community CLI that computes Claude
Code usage/cost by parsing local session transcript JSONL files — named here as prior
art for the method the board title references, not a dependency this repo takes on.)

## Acceptance criteria

- A new derived field — `realCostUsd` — is computed **alongside**, never instead of,
  today's `costUsd`. `costUsd` keeps meaning exactly what it means today (self-reported
  list-price); nothing that already reads it changes behavior. This mirrors epic 0012's
  own "byte-identical when [the new path is] off" discipline: v3 adds a number, it does
  not redefine an existing one out from under every existing caller.
- The formula, per the board title: for a given unit of accounting (one firing, or one
  aggregate like a flight or a self-study window),
  `realCostUsd = costUsd × (subscriptionPriceUsd / machineWide30dListPriceUsd)` —
  i.e. this unit's list-price cost, scaled by (the subscription's real fixed price ÷ the
  total list-price-equivalent usage the subscription covered over the trailing 30 days,
  machine-wide). The denominator is **not** this repo's own usage — it is every project
  sharing the same Claude subscription on the machine, because the subscription's fixed
  price is paying for all of it, not just this repo's slice.
- The denominator is computed by scanning `~/.claude`'s session transcript JSONL files
  (the same data source `ccusage`-style tools read), summing each recorded message's
  list-price-equivalent cost over a trailing 30-day window, **deduplicated by message
  id** — a resumed session (`docs/epics/0009-warm-sessions.md`) or a retried turn can
  cause the same underlying API response to appear more than once across transcript
  files, and double-counting it inflates the denominator (which *understates* every
  firing's real cost — the wrong direction to be wrong in).
- `subscriptionPriceUsd` (the fixed monthly price) and the pool's scope (which local
  project directories count as "sharing" this subscription) are **operator-supplied
  configuration**, never hardcoded — plan tiers and prices are not this repo's business
  to track or assume, and guessing wrong silently corrupts every downstream number.
- The dashboard surfaces `realCostUsd` next to, not in place of, the existing list-price
  figure wherever `fmtCost` renders a cost the operator might reasonably want the real
  number for (flight summaries and the self-study cost tables are the clearest
  candidates; exact UI placement is a slice-3 decision, not fixed here).
- `docs/RESEARCH-LIBRARY.md`'s "Firing cost anatomy" section and any `docs/SELF-STUDY`
  cost table this epic's slices touch get a one-line note distinguishing list-price from
  real-cost figures, so a future reader doesn't inherit today's ambiguity.

## Constraints

- **Read-only against `~/.claude`.** This epic only ever reads transcript JSONL files to
  sum usage — it never writes to, modifies, or deletes anything under that directory.
- **Numeric aggregation only, no content capture.** The denominator computation extracts
  token/cost fields from other projects' transcripts; it must never surface those other
  projects' prompt or file content into this repo's telemetry, logs, or UI — only the
  summed numbers cross the boundary. Those other projects may have nothing to do with
  this repository or its operator's disclosure expectations for THIS project's data.
- **Graceful absence.** `~/.claude` may not exist, may be unreadable, or may be empty on
  a given machine (a fresh install, a CI runner, a sandboxed dev environment — this very
  flight's own containment rules forbid reading outside its target repo, so this feature
  must not assume its own build/test environment can exercise the real directory).
  Missing or unreadable data means `realCostUsd` is `null` for that record — the
  dashboard falls back to showing only the existing list-price `costUsd`, never a crash,
  never a fabricated number.
- **No new spawn/transport primitive.** This is a local filesystem read and an
  arithmetic reduction — it does not talk to a model, does not use `ClaudeCliModel`, and
  is unrelated to the flight/guard/ask machinery epics 0011/0012 compose.
- **Schema verification before implementation, not assumed here.** This spec names the
  *shape* of the fix (message-id-deduped, 30-day, machine-wide, JSONL-sourced) from the
  board title and general knowledge of how Claude Code session transcripts work, but this
  firing's containment rules forbid reading a real `~/.claude` transcript to confirm the
  exact JSON schema (field names for message id, per-message cost/tokens, timestamp) of
  the CLI version actually installed. **Before slice 1 writes the parser**, that
  implementing firing must inspect a real sample transcript (or authoritative CLI
  documentation) and record what it found — get the schema wrong and the whole feature
  either silently under/over-counts or crashes on first run. This is the same discipline
  epic 0012 applied to the `allowedTools`/`disallowedTools` precedence question before
  its slice 1 shipped.

## Out of scope

- **Backfilling `realCostUsd` onto historical firings.** This epic computes the field
  going forward only; retroactively recomputing every past `FiringRecord` (and thus every
  past "$/ship" figure in `RESEARCH-LIBRARY.md`) is a separate, larger data-migration
  decision this spec does not make.
- **Multi-machine aggregation.** "MACHINE-WIDE" in the board title means this one
  machine's `~/.claude` directory — an operator running fleets across multiple machines
  under one subscription is a real scenario this v1 slice set does not attempt to solve.
- **A maintained per-model price table.** If computing list-price-equivalent cost from
  raw token counts requires per-model $/token rates, this epic reuses whatever the CLI
  or an existing dependency already exposes rather than hand-maintaining a pricing table
  that drifts out of date; if no such source exists, that gap is a blocker to flag in
  slice 1, not a table to invent here.
- **Changing what `costUsd` means, or removing it from any existing call site.** See
  Acceptance criteria — `realCostUsd` is additive.
- **Any UI beyond a labeled number.** Charting, historical trend lines, or a dedicated
  cost-analysis page for `realCostUsd` are future slices if the operator wants them, not
  part of landing the field itself.

## Slices

1. **Schema verification + the read-only aggregator.** Shipped. This firing's own
   containment rules forbade reading a real `~/.claude` transcript directly (confirmed
   live: a `~/.claude`-referencing command was blocked), so schema verification instead
   used the Constraints section's documented fallback — authoritative external
   documentation — rather than guessing: the `ccusage` project's own docs
   (ccusage.com/guide/cost-modes) and public issue history
   (ryoppippi/ccusage#4, #58, #866, #888) confirmed the transcript JSONL shape (one
   `~/.claude/projects/<encoded-path>/<session-id>.jsonl` file per session; a
   pre-calculated `costUSD` field per entry; `message.id` + `requestId` as the dedup key
   for branched/resumed-session duplicates, formed as `JSON.stringify([messageId,
   requestId])` to avoid collisions across differing id pairs and distinguish `null` from
   empty string) and, critically, surfaced a real bug class to design around: ccusage#888
   found that keeping the FIRST entry for a repeated key undercounts, because a transcript
   can append an intermediate usage snapshot before a larger final one. `packages/engine/src/usage-pool.ts`
   (pure: `parseTranscriptLine`, `parseTranscriptJsonl`, `dedupeTranscriptEntries`,
   `sumListPriceCostUsd`) keeps the LATEST-timestamped entry per dedupe key instead of the
   first, deliberately avoiding that bug. `packages/engine/src/adapters/usage-pool-scan.ts`
   (`scanUsagePoolListPriceUsd`) is the impure half — recursively reads `*.jsonl` files
   under a set of caller-supplied directories and sums via the pure core; a missing or
   unreadable directory contributes nothing (`totalUsd: null` only when NOT ONE directory
   in the set was readable — a readable-but-empty pool sums to a real `0`, per the
   Constraints' null-vs-zero distinction). Both are unit-tested against fixture strings /
   temp-directory fixtures only, never real `~/.claude` data. **Not yet done, and a real
   blocker for slice 2**: the schema above is derived from external docs, not verified
   against an actual installed-CLI transcript sample — a firing not under this
   containment restriction (or an operator, manually) should confirm field names before
   `realCostUsd` is trusted for anything beyond a labeled dashboard estimate.
2. **Wire `realCostUsd` into telemetry.** Shipped.
   `packages/engine/src/usage-pool.ts`'s `computeRealCostUsd(costUsd, subscriptionPriceUsd,
   machineWide30dListPriceUsd)` implements the Acceptance criteria's formula as a pure,
   unit-tested function — null-safe on every missing input and on a non-positive pool
   denominator (never a fabricated or divide-by-zero number). `FiringRecord.realCostUsd`
   (`telemetry.ts`) is now populated by `buildFiringRecord` from two new `FiringContext`
   fields, `subscriptionPriceUsd` and `machineWide30dListPriceUsd`, kept as plain data so
   this module stays pure. `firing.ts` threads `config.subscriptionPriceUsd`
   (`EngineConfig`, new field, defaulting to `null`/unconfigured) and
   `FiringInput.machineWide30dListPriceUsd` into that context. `loop.ts` computes the pool
   total via the new optional `LoopDeps.scanUsagePool` effect exactly ONCE per flight
   (before its firing loop starts, not per firing — a filesystem scan is comparatively
   expensive and the pool barely moves within one flight) and threads the same value to
   every firing. The composition root, `apps/dashboard/src/fly.ts`, wires the real
   `scanUsagePoolListPriceUsd` adapter and resolves both `subscriptionPriceUsd` and
   `usagePoolDirs` from two new env vars via
   `apps/dashboard/src/flight/usage-pool-config.ts`
   (`AUTOPILOT_SUBSCRIPTION_PRICE_USD`, `AUTOPILOT_USAGE_POOL_DIRS`) — both unset by
   default, so the whole feature stays opt-in and `realCostUsd` stays `null` on every
   firing until an operator configures both. **Still open**: the schema caveat above (field
   names sourced from `ccusage` docs, never verified against a real installed-CLI
   transcript) — this flight's own containment rules forbid reading `~/.claude` too (same
   restriction slice 1 hit), so an operator or a firing outside this containment should
   confirm it before treating `realCostUsd` as more than a labeled estimate.
3. **Surface it.** Partially shipped: the `RESEARCH-LIBRARY.md`/`SELF-STUDY` list-price-
   vs-real-cost note landed (both are hand-written prose sections, outside
   `SELF-STUDY/PAPER.md`'s auto-generated `DATA:SUMMARY`/`DATA:CHART`/`DATA:SERIES`
   blocks, so neither needed the generator script touched). The "Recently shipped"
   flight summary panel now carries `realCostUsd` end to end — `shared/flight-summary.ts`'s
   `FlightSummaryEntry`/`FlightSummary` and `flight-summary-panel.ts`'s
   `FlightSummaryLineInput`/`flightSummaryLineMeta` all thread the field through
   (`null`-safe on the nullish check, not falsy, so a real `0` still renders), and
   `web/features/flight-summary.ts`'s `flightSummarySection` renders a second
   `.flight-summary-cost` chip reading "real $X.XX" whenever it is non-null — all
   without touching `web/shell.ts` itself, since `flightSummarySection(c)` stays a
   bare hoisted-identifier call there (same `.toString()` embedding every other
   splice in this cluster uses). The fleet-wide header bar's raw-count tiles got the
   same treatment: `packages/store/src/read.ts`'s `firingStats` now sums
   `real_cost_usd` per project (`FiringStats.realCost`, `null` — never a fabricated
   `0` — when not one firing in the window carries it), `read/fleet.ts`'s
   `ProjectAggregate.realCost`/`FleetTotals.realCost` roll that up fleet-wide the
   same null-vs-summed way, and `web/stat-tiles.ts`'s `totalsTileItems` appends an
   eighth "real cost" tile only once the total is a real number — an unconfigured
   fleet (the common case today) still renders exactly the seven tiles it always
   has, no permanent "—" chip. Again no `web/shell.ts` edit needed: `renderTotals`
   already loops over `totalsTileItems`'s array generically (no hardcoded tile
   count), and `.totals` is `flex-wrap` (`layout-css.ts`), not a fixed grid.
   **Still open**: `web/shell.ts`'s own inline `fmtCost` call sites — real `shell.ts`
   source text, not a splice, so still waiting on a firing free of a live claim on
   that file — and any other pure-tile-item panel (`roundStatItems`,
   `metricsStatItems`) the Acceptance criteria's "wherever `fmtCost` renders a cost"
   language would also cover.

## Related

- `packages/engine/src/usage-pool.ts`, `packages/engine/src/adapters/usage-pool-scan.ts` —
  slice 1's pure aggregator and read-only directory scanner.
- `packages/engine/src/adapters/claude-cli.ts:114` — where today's list-price `costUsd`
  originates (`total_cost_usd`, self-reported by the CLI).
- `packages/engine/src/telemetry.ts` (`EnvelopeFacts`, `FiringRecord`) — the record this
  epic's `realCostUsd` field extends.
- `apps/dashboard/src/web/format.ts:24` (`fmtCost`) — the shared formatter every existing
  cost display calls; slice 3's UI additions reuse it for the new field too.
- `docs/RESEARCH-LIBRARY.md` "Firing cost anatomy" — the existing list-price-only cost
  analysis this epic's note (Acceptance criteria) contextualizes, and the section any
  future real-cost re-analysis would extend.
- `docs/SELF-STUDY/PAPER.md` §"Self-reported vs. verified fields" — documents `cost_usd`
  as self-reported today; this epic adds a second, differently-derived cost field
  alongside it, not a replacement.
- `docs/epics/0009-warm-sessions.md` — session resumption is the concrete mechanism that
  makes message-id deduplication necessary (a resumed session's transcript can overlap
  with its parent's).
- `docs/epics/README.md` — the spec-before-implementation convention this file follows.
- `docs/epics/0012-agentic-ask-escalation.md` — precedent for flagging a
  verify-against-reality question (there: CLI tool-precedence; here: transcript schema)
  as a named pre-slice-1 blocker rather than guessing in the spec.
