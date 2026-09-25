<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mufun4np-1`: the fly bar's total-progress numerator still pools every lane, split confirmed

Board: "VERDICT split `web-mufoniqd-4gkft2`: fly-bar total-progress numerator
(flight-progress.ts `sessionFlightDataFor`) pools ALL concurrent lanes'
firings from one shared project flightLog against a single lane['s plan]."
This is a VERDICT task — a prior firing's proposal about another task, not
buildable work itself. Per the VERDICT-processing protocol, this firing's
unit is to verify the claim against the current code, propose the concrete
follow-on slices, and complete this task with the evidence — not to attempt
the underlying fix.

## Verification of the claim

1. **The root cause is real and still unfixed.** `sessionFlightDataFor`
   (`apps/dashboard/src/web/flight-progress.ts`) reads
   `flying.flightLog` — the ONE array the DB keeps per **project**
   (`mapFlightEntries(store.db, p.id)`, `apps/dashboard/src/read/project-detail.ts`)
   — and filters it only by `f.at >= startedAt`. PARALLEL UNLOCK C lets
   several fleet lanes fly the *same* project folder concurrently
   (`flight/registry.ts`'s `#runnerFor`/`spawnFlight` takes a distinct
   `instanceId` per lane), and every lane's landed firings sync back into
   that one shared project record. Nothing in `FiringLogRow`
   (`packages/store/src/read.ts:119`) or the row it is built from carries a
   lane/instance identifier, so `sessionFirings` has no way to tell "my
   lane's firing" from "a sibling's" — it is structurally a fleet-wide pool,
   not a per-lane session window.
2. **Only the `firings`-mode display was patched, not the root cause or the
   `totalBudgetUsd` path.** `git log` on this file shows the most recent
   commit, `c90cdf45` ("clamp the fly bar's firings-done count to its own
   lane's plan"), explicitly scoped itself to the firings-count label: it
   clamps `pct` and the displayed `done` figure to `s.firings`. It did **not**
   touch:
   - `flightProgressOf`'s `totalBudgetUsd` branch — `spentSoFar` sums `cost`
     across every pooled `sessionFirings` entry and is rendered via
     `fmtCost(spentSoFar)` completely unclamped (`flight-progress.ts:101-112`).
     Since `spawnFlight`'s `totalBudgetUsd` is a per-lane launch parameter
     (`control/flight-watchdog.ts`, `flight/runner.ts:62`), not a fleet-wide
     figure, a budget-mode flight can show cumulative spend past its own
     total once siblings land firings inside its window — the same class of
     bug the firings path had, just not clamped at all.
   - The ETA math — `avgDurationMs` is derived from the pooled
     `sessionFirings`' own durations (`flight-progress.ts:131-137`), and
     `remainingFirings`'s `avgCost` (budget mode, line 142) is computed from
     pooled `spentSoFar`/`firingsCompleted`. Even after the firings-mode
     display clamp, a lane's ETA still leans on sibling lanes' potentially
     very different per-firing cost/duration, not its own pace.
3. **The fix is not a one-line clamp — it needs data the schema doesn't
   carry today.** `instanceId` exists at the spawn/log-file layer
   (`flightLogFileName(projectId, instanceId?)`, `flight/lock.ts`) but is
   dropped before a firing becomes a DB row: `FiringLogRow` has no lane
   column, so `mapFlightEntries` cannot tag or filter by originating lane.
   Properly scoping `sessionFirings` to "this lane only" — the actual fix,
   vs. clamping the symptom — requires plumbing a lane identifier through
   the ingest write path, a store schema change, and the read/web shapes
   that consume it. That is a materially larger, cross-cutting change than
   a single firing, which is exactly what a "split" verdict is for.

## VERDICT

**Confirmed, and the split call is correct.** The firings-mode display
clamp (`c90cdf45`) is real and shipped, but it is a symptom patch on one of
three affected surfaces. Recommending three independently-shippable
follow-on slices:

- **(a) Clamp the `totalBudgetUsd` path the same way.** Mirror the
  firings-mode treatment: clamp `pct` (already done) and clamp the
  displayed `spent`/`progressBit` figure to `s.totalBudgetUsd` so a
  budget-mode flight cannot show spend past its own total. Small, low-risk,
  no schema change — the same shape as the already-landed fix, just the
  other branch of `flightProgressOf`.
- **(b) Attribute a firing to its originating lane end-to-end.** Plumb the
  `instanceId` `spawn-flight.ts`/`flight/lock.ts` already carry at spawn
  time into the ingested firing record (store schema column + write path),
  and expose it on `FiringLogRow`/`FlightLogFiring`. This is the actual
  capability gap — new schema and write-path plumbing, not new wiring
  around an existing shape — and should land before (c).
- **(c) Scope `sessionFlightDataFor` to the current lane using (b)'s data.**
  Once a lane identifier is available, filter `flightLog` by
  `instanceId === thisLane` instead of only `f.at >= startedAt`, so
  `sessionFirings`, `spentSoFar`, and the ETA's `avgDurationMs`/`avgCost`
  all reflect this lane's own pace — retiring the clamps from (a) as
  display-only band-aids once the numerator itself is correct.

This firing does not attempt any of (a)-(c) — (b) is the load-bearing
schema decision the other two depend on, and each is its own firing-sized
unit. Per the VERDICT-processing protocol, this firing's own unit is the
verification and the proposals above, not the underlying fix.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file plus the regenerated
`docs/debriefs/README.md` index, added with a scoped `git add` of exactly
those two paths — the only files this firing touched. Pure documentation:
`docs/` is excluded from `prettier --check .` (`.prettierignore`) and from
ESLint's configured `files` globs (`eslint.config.js` targets only
`*.ts`/`*.mjs`/`*.js`), so it adds no source or test code and
`typecheck`/`test`/`build` are structurally unaffected by it.
