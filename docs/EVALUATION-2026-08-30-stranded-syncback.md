<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# EVALUATION — the 38-commit strand, and what the round it stranded actually shipped (2026-08-30)

## What happened

A full fleet round (hebrew/rtl tour i18n, VERDICT auto-requeue part a, four KEEPER
fail-closed guards, cockpit phase-0 slices 11–12, ~240 direct unit tests) ended with
**every commit parked on `autopilot/flight-worktree-fly-autopilot`** — 38 commits the
operator's LANDING card could only describe as a divergence warning. The operator
experienced it as "the dashboard isn't showing the latest work".

## Root cause

The flight-end sync-back merge hit **content conflicts** in 6 files (`.gitignore`,
`pr-review.ts` + its test, epic 0007's log, `strings.ts`, `cockpit-metrics.mjs`) —
this checkout and the worktree had both evolved the same regions (this checkout landed
the durable-landing-job + census rounds while the fleet flew). `syncWorktreeBranch`
correctly refuses to auto-resolve conflicts; the flight retried it every firing and
logged **21 identical refusal warnings**, then ended. Nothing escalated: no task, no
inbox entry — a log line nobody reads mid-flight, and a panel banner that reads as a
caution, not as "a whole round is stranded".

The prior fix in this area (`web-msupuosk-gjll3p`, the flight-end retry) only covers
the *dirty-checkout* refusal, which clears by itself. A *conflict* refusal never does.

## Contributing factor — parallel evolution of contended files

The conflicts were the SAME files this checkout's own sessions keep touching
(`pr-review.ts` censuses, `cockpit-metrics.mjs` slices). Two of the six needed
semantic resolution (duplicate predicate names for the same guard; a UNION merge that
had to be re-balanced by hand). This is the standing fleet-scaling constraint
([[autopilot-fleet-scaling-blocker]]): leases guard TASKS, nothing guards FILES across
the operator-checkout/worktree boundary.

## Also found in the recovered round

- **The fleet raised the core bundle budget 150/45KB → 160/48KB** (`e7eb7007`,
  "gate was red fleet-wide") rather than dieting. Accepted on review: the i18n tour
  wiring is operator-priority work and the raise is honest and visible — but a lane
  loosening a ratchet unilaterally is worth watching. The per-firing registry-guards
  leg now runs the budget test on every firing, so any future creep is caught in the
  firing that causes it, not at landing.
- `scripts/_debug-tabstops.mjs` and `test/server/_scratch-size.test.ts` — two lane
  debugging scratch files landed inside checkpoints (both deleted). Lane prompts may
  need a "scratch files never get committed" note if a third appears.

## Fixes shipped with this evaluation

1. **Stranded-work escalation** (`fly.ts`): a flight whose FINAL sync-back still
   refuses now files one high-severity `needs_approval` task naming the branch and
   the refusal, deduped per branch. The operator inbox — not a log line — is where a
   never-self-resolving condition lands.
2. **Recovery**: all 38 commits merged into `autopilot/flight` with both-sides-preserved
   semantic resolutions (see commit `70f971e3`), full suite green at 8,004 tests.
3. **v0.17.0 released** (minor: durable landing jobs, verdict protocol, registry
   guards in the fast gate, hebrew/rtl i18n, cockpit slices 11–12, KEEPER guards) —
   `PRODUCT_VERSION` bumped in the same landing window so the parity test holds.

## Open follow-ons (board)

- REGISTRY DERIVATION (`web-mteostss-7u5oaq`) — possible ship in the recovered round,
  pending reconcile confirmation.
- VERDICT auto-requeue part b (the sweep itself; part a's pure core landed).
- The file-collision class above: no fix seeded yet — candidates are (a) sync-back
  earlier/more often per firing so conflicts stay one-firing small, or (b) treating
  operator-checkout sessions as a lane with a lease. Needs a design verdict before a
  slice.
