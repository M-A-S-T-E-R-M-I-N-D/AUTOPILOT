<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0008. E2E does not gate direct-push landings — deliberately, for now

Status: Accepted, amended 2026-09-02 (see "Amendment" below)

## Context

`apps/dashboard/e2e` catches a real class of bug invisible to both `tsc` and
`vitest`: the dashboard's client bundle ships feature modules as function
bodies via `.toString()` (server-rendered into the shell, then executed in
the browser), so a cross-lane name mismatch type-checks fine in isolation
and passes jsdom tests, but throws in a real browser. Two commits — wiring
the dashboard e2e suite into the CI gate, then making the e2e job a required
check, not just a CI run — made e2e a required GitHub branch-protection
check, closing that gap — for pull requests.

This fleet's own landings never go through a pull request. `executeLanding`
(`packages/engine/src/landing.ts`, called from
`apps/dashboard/src/landing/execute.ts`) runs the fast local gate
(typecheck/lint/format/test/build — see `gate-commands.ts`'s `gateCommands`,
the one source both a live flight and a landing execute gate through) and,
if green, merges the flight branch directly into `main` with a real `git`
call. No GitHub PR is ever opened, so GitHub's required-status-checks
branch protection — including the now-required e2e job — has nothing to
attach to and never runs before the merge. `.github/workflows/ci.yml`'s
`e2e` job does still fire on `push: branches: [main]`, but by then the
commit has already landed; a red run is discovered after the fact, not
prevented. This produced a real, repeated cost: a follow-up fix had to
repair visual-baseline drift that had shipped landed for four rounds
running before anyone noticed, because nothing was watching the post-land
e2e result.

`apps/dashboard/src/control/ci-status.ts` (epic 0010 slice 2, "gh run
babysitting") already exists and read-only reports the latest run
conclusion per workflow file via `gh run list` — a red `ci.yml` run
(e2e included, since a failing job fails the whole workflow run) shows up
there. It is folded into `maintenance-sweep.ts` (slice 3). Both are
on-demand (`dashboard ci-status` / `dashboard maintenance-sweep`), not
triggered automatically after every landing.

## Decision

Do not add `e2e` to `GateSpec`/`gateCommands`, and do not build an automatic
post-land watcher that polls or blocks on the e2e result, at this time.

- The Playwright suite runs a real browser and carries a 15-minute CI
  timeout. Running it synchronously inside every `executeLanding` call would
  serialize each landing behind a multi-minute job — exactly the class of
  cost the fleet's own MACHINE BUDGET rule prohibits, made worse by several
  fleet instances landing against the same machine concurrently.
- An automatic post-land daemon (poll `ci-status` after each land, alarm or
  quarantine further landings on red) is exactly the kind of addition epic
  0010 flags as needing "a separate, explicit design for where that daemon
  would run" before it gets built — it is explicitly *not* authorized by
  that epic's already-shipped slices 2-3, which are deliberately read-only
  and on-demand. Slice 4 (an automated nudge once the reports prove useful)
  is still open.
- The fast local gate plus the existing read-only `ci-status`/
  `maintenance-sweep` surfaces are an accepted interim posture: they do not
  prevent a bad landing, but they make one discoverable without adding a new
  scheduled process.

## Consequences

Positive: landings stay fast (bounded by the local gate, not a real-browser
suite), and no new daemon/credential surface was added without the
dedicated design epic 0010 already calls for.

Tradeoff, accepted: a landed commit can still break an e2e-only-catchable
regression (cross-lane `.toString()` bugs, visual baselines) and stay
broken until a human or a KEEPER-style firing runs `dashboard ci-status` /
`maintenance-sweep`, or until the next unrelated firing's e2e run happens
to surface it — the four-round visual-baseline drift cleaned up by that fix
is the concrete cost of this gap, and it can recur. Closing it for real needs one of: an
explicit design for a bounded, budget-safe post-land e2e trigger (epic 0010
slice 4), or a policy change to route landings through a real PR merge so
branch protection actually applies — both are operator-level tradeoff
decisions, not something a single fleet firing should improvise.

## Amendment (2026-09-02) — operator decision, "option A"

The operator picked a third option this ADR's original "Consequences" section
didn't consider: neither a real-browser e2e run in the landing's own critical
path, nor a policy change to route landings through PR merges — instead,
consult the converged branch's ALREADY-COMPUTED e2e result before a landing
executes, and refuse the landing when it's red.

`apps/dashboard/src/landing/execute.ts`'s `E2eLandGuard` (wired via
`createRealE2eLandGuard`, consulted inside `createLandingExecuteApi` right
after `base` resolves, before the local gate or any git command runs) reads
epic 0010 slice 2's `ciWorkflowStatus` for `base` — the same `gh run list
--workflow ci.yml` read `dashboard ci-status` already exposes read-only, now
also filterable by branch so a PR-triggered run never outranks the actual
push-to-`base` result. This adds ZERO run-time cost per landing (no e2e
execution is triggered by this check, only a `gh` API read of a run GitHub
Actions already completed on the last push to `base`), so the MACHINE BUDGET
objection above does not apply. `gh` absent/unauthenticated/no-runs-yet all
degrade to "not blocked" — this can only refuse a landing on a CONFIRMED red
result, never an unknown one. A refusal persists an `e2e-land-block` events
row (audit trail, same convention as `land-gate-alarm`) and surfaces via the
LANDING panel's existing generic refusal rendering (`web/landing-panel.ts`'s
`landingExecuteResult`) — no new UI was needed since any refusal reason
already renders its `details` line there.

SHIPPED (2026-09-02): an aggregated fleet-card anomaly chip for
`e2e-land-block` events — `apps/dashboard/src/read/anomalies.ts`'s
`e2eLandBlocks`, same one-chip-with-count-and-latest-detail shape as
`landGateAlarms`/`convergenceRedAlarms`. Read path: `packages/store/src`'s
`e2eLandBlockEvents` → `read/source.ts`'s `parseE2eLandBlockEvents` →
`read/fleet.ts`'s `toCard` → `web/shell.ts`'s `ANOMALY_LABELS`
(`'e2e-land-block': '🚫 e2e land block'`). "N landings have been blocked by
this" now rolls up on the fleet card instead of only being visible
per-attempt.

## Related

- `apps/dashboard/src/landing/execute.ts`, `packages/engine/src/landing.ts`,
  `apps/dashboard/src/gate-commands.ts`
- `apps/dashboard/src/control/ci-status.ts`,
  `apps/dashboard/src/control/maintenance-sweep.ts`
- `docs/epics/0010-maintenance-ritual.md` (slice 4, shipped 2026-09-02)
- `.github/workflows/ci.yml`, `.github/branch-protection.json`
