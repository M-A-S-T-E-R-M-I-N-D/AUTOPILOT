<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0003. Ring-0 fleet watchdog — one daemon spawns and revives across ALL registered projects

Status: Done — every acceptance criterion below is shipped and tested (2026-08-13):
fleet-mode `watch` (no folder) spawns/revives/lands across every registered project
through the existing registry + `flightWatchdogTick`/`landWatchdogTick` primitives, and
the dashboard's per-project flight card now labels a fleet-watchdog-initiated flight so
an operator can tell why a project started flying. The dashboard UI toggle to start/stop
fleet mode itself stays out of scope (below) — a separate slice.

Post-completion evolution (2026-08-20, refreshed 2026-09-02): `control/cli.ts` has
since grown past this spec's scope — per-instance flight addressing, self-restart
hardening, gh-doctor and other control-surface slices, and two further commands:
`dashboard fleet <folder> <lanes> [firings] [budgetUsd]` (the launcher
`scope-partition.ts` documents itself as being computed by — validates its
lane/firings/budget arguments up front, partitions the open board across lanes
BEFORE launch so two lanes can never claim file-colliding tasks, and staggers
lane starts — default 20s, `AUTOPILOT_FLEET_STAGGER_MS` — because simultaneous
launches raced `.git/index.lock` and killed a lane) and `dashboard vacuum`
(operator-invoked FTS5 freelist reclaim via `vacuumStore`, deliberately never
run by `watch` or any automatic ritual). Those belong to their own board items
and `docs/RESEARCH-LIBRARY.md` entries; the watchdog contract recorded here is
unchanged.

The board's M7 PARALLEL PILOTS item (critical priority) names two halves: "FlightRunner
becomes a per-project registry of concurrent detached flights" and "the ring-0 watchdog
owns per-project spawning and revival." The first half shipped as
`docs/epics/0001-parallel-flights.md` (Done, 2026-08-13) — its own Status line already
points here for what's left: *"Fleet-wide watchdog spawning across ALL registered
projects (one daemon iterating the whole fleet, vs. today's one-`watch
<folder>`-process-per-project) remains a deliberate follow-on."* This spec covers that
remainder.

## What exists today (the building blocks this epic reuses)

- `apps/dashboard/src/control/cli.ts`'s `watch <folder>` command opts into keeping
  exactly ONE named project flying, via `flightWatchdogTick`/`createFlightWatchdogControl`
  (`flight-watchdog.ts`) and `landWatchdogTick`/`createLandWatchdogControl`
  (`land-watchdog.ts`) — both scoped to a single `targetFolder`, found by
  `listProjects(store.db).find(p => samePath(p.root_path, targetFolder))`.
- `listProjects()` (`@autopilot/store`) already returns every registered project in one
  call — the fleet-wide primitive already exists; nothing today iterates it.
- `FLYABLE_STATUSES` (`flight-watchdog.ts`) already draws the correct idle boundary
  (`registered`/never-onboarded spawn; `flying`/`paused`/`hibernating`/`needs_you` are
  left alone) — this boundary is per-project logic, unaffected by fleet scope.
- The FlightRunner registry (`apps/dashboard/src/flight/registry.ts`, epic 0001 slices
  3 and 5) already enforces an operator `maxConcurrent` cap with FIFO queueing across
  concurrent `start()` calls on DIFFERENT folders — the concurrency-safety substrate a
  fleet loop calls into already exists and needs no new queueing logic.
- The flight-end ritual lock (epic 0001 slice 6) already serializes PAPER/landing/
  release commits so two projects finishing in the same tick land sequentially.

## Acceptance criteria

- A fleet-mode `watch` invocation (no single folder pinned) ticks over every project
  `listProjects()` returns, and for each one whose status is in `FLYABLE_STATUSES`,
  spawns a flight through the same `spawnFlight`/registry `start()` path the manual
  multi-fly UI already uses — no new spawn or concurrency logic invented.
- The operator's `maxConcurrent` cap still holds fleet-wide: with N idle projects and a
  cap of K < N, exactly K flights run and the rest queue (FIFO), exactly like today's
  manual-multi-fly path — quota fairness is enforced once, at the registry, not
  reimplemented per project.
- A project that ends a flight cleanly (status returns to `registered`) is revived on a
  later tick automatically — no project sits idle indefinitely just because no operator
  is watching it.
- `landWatchdogTick` also runs per-project across the fleet on the same cadence, and
  still serializes through the existing ritual lock — two fleet-wide landings in one
  tick commit sequentially, never race.
- A project sitting `paused`, `hibernating`, or `needs_you` is never auto-spawned by
  fleet mode — the exact same boundary the single-project watchdog already enforces,
  applied across every row instead of one.
- Fleet mode and an operator's manual single-project `watch <folder>` session can run at
  the same time without double-spawning the same project — the registry's existing
  per-folder exclusivity (epic 0001 slice 1/3) is the only thing relied on to prevent it.
- The flight log (or an equivalent visible record) distinguishes a fleet-watchdog-
  initiated flight from an operator-initiated one, so an operator watching the dashboard
  can tell why a project started flying.

## Constraints

- Reuse `listProjects`, `flightWatchdogTick`/`canSpawnFlight`, `landWatchdogTick`, and
  the registry's `maxConcurrent`/queue as-is. This epic is a fleet-wide LOOP over
  already-correct per-project primitives, not a rewrite of spawning, landing, or
  concurrency logic.
- Must not weaken the per-project instance lock, containment guard, or ritual-lock
  serialization epic 0001 already shipped.
- Windows-first, same as epic 0001 — no POSIX-only primitives.
- Opt-in only, same posture as today's `watch <folder>`: fleet mode never runs unless an
  operator explicitly starts it.

## Out of scope

- Cross-project priority/scheduling intelligence (which idle project spawns FIRST when
  several are idle and the cap is smaller than the idle count) — FIFO order is
  acceptable for this epic; smarter triage is a follow-on, same boundary
  `docs/BACKLOG-999.md` §D already draws for the supervisor daemon.
- A dashboard UI toggle to start/stop fleet mode from the web app itself. This epic is
  the CLI/daemon capability; a dashboard control surface is a separate slice and, per
  the UX-EXPRESSION DOCTRINE, needs its own accessible expression before it can be
  called complete.
- Distributed/multi-machine fleets, remote workers.

## Related

- `docs/epics/0001-parallel-flights.md` — the concurrency substrate (registry, locks,
  store hardening) this epic builds on; its Status line names this as the follow-on.
- `docs/BACKLOG-999.md` §D (Multi-project & supervisor).
- `docs/FLEET-ORCHESTRATION.md` — pillar 1 ("run this one · run another · run several in
  parallel") and pillar 3 (live activity map) this epic serves.
- **Post-completion related epics** (out of scope for 0003, tracked separately):
  - `docs/epics/0006-...md` — `gh-doctor` command (RING-0 SUPERVISOR, web-msq9hfhd-ebmy8k)
  - `docs/epics/0010-...md` — `ci-status` and `maintenance-sweep` commands
  - RING-0 SUPERVISOR epic (web-msq9hfhd-ebmy8k) — hands-free landing for fleet and
    per-project modes, routed through `/api/landing/execute`
- `apps/dashboard/src/control/flight-watchdog.ts`, `land-watchdog.ts`, `watchdog.ts`,
  `apps/dashboard/src/flight/registry.ts` — the existing single-project/registry
  primitives this epic's fleet loop reuses.
- `apps/dashboard/src/control/fleet-watchdog.ts` — fleet-mode flight spawning primitives.
