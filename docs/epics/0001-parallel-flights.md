<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0001. Parallel flights — independent projects, independent work plans

Status: Done — all 6 slices shipped and tested (2026-08-13). Fleet-wide watchdog
spawning across ALL registered projects (one daemon iterating the whole fleet, vs.
today's one-`watch <folder>`-process-per-project) remains a deliberate follow-on —
see "Out of scope" below and `docs/BACKLOG-999.md` §D / RING-0 SUPERVISOR.

Post-completion evolution (2026-08-20): the subject files kept moving PAST this
spec's scope — PARALLEL UNLOCK C added N-way SAME-folder fleets (per-instance
`instanceId` → own worktree/lock/log/runner-registry key, board task-claiming,
per-instance stop/pause), validated live at 3-, 5-, 7- and 10-way (the 10-way:
80% ship, zero crashes, zero SQLITE_BUSY). Same-folder fleet coordination
(intent claims, slice-relay duplication, machine budget) is tracked in
`docs/RESEARCH-LIBRARY.md` ("Fleet anti-duplication", "The 7→10 ramp"), not
here — this spec stays the record of the cross-PROJECT unlock it delivered.

Ongoing refinements (2026-08-23+): `fly.ts` continues to be refactored for
clarity and maintainability (extraction of `firing-hooks.js`, `board-triage.js`,
`post-flight-sweeps.js`, `fleet-wisdom-mining.js` modules). These do not alter
the parallel flights capability or the acceptance criteria below; they are
internal restructuring to support future maintenance and feature work.

Ongoing refinements, continued (2026-08-24 → 2026-08-27): the note above
undersold this window — alongside further extraction, real same-folder
fleet-lane concurrency hardening landed, closing gaps this epic's own
"Out of scope" section deferred to `docs/RESEARCH-LIBRARY.md`. A firing-number
race (`web-mtbay6wd-hz0p0m`: two lanes both reading an unrecorded
`COUNT(*) FROM metrics` computed the identical next firing) is now closed by
a durable per-project `firing_seq` counter and an atomic
`reserveNextFiring()` (`packages/engine/src/adapters/store.ts`, schema v22).
The scope partitioner (`apps/dashboard/src/flight/scope-partition.ts`) —
previously dead code with no production caller, so every lane pulled from the
whole board — is now wired to a real launcher (`flight/fleet-launch.ts` +
`control/cli.ts`'s `dashboard fleet <folder> <lanes>` command), so same-area
board tasks that touch the same files land on ONE lane instead of racing
across lanes. Sync-back's post-merge step gained a visible convergence
typecheck (prints `✓`/`⛔` with duration, persists a `convergence-red` event
on failure) after two incidents where a clean auto-merge of two
individually-green lanes still left `tsc` red on `autopilot/flight`; sync-back
refusals themselves are now durable per-refusal telemetry rows instead of a
console-only `⚠` line, closing a case where one stayed silently blocked on
`shell.ts` for 10+ firings. None of this changes the acceptance criteria
above — it hardens the same-folder N-way fleet mechanics the 2026-08-20 note
already scoped out to `docs/RESEARCH-LIBRARY.md` — but it is real
concurrency-safety work, not the "internal restructuring only" framing the
prior note gave it.

Ongoing refinements, continued (2026-08-27 → 2026-08-28): the convergence
typecheck above outgrew its typecheck-only shape. Per-firing lane merges keep
the lightweight typecheck (the ~109s median gap between merges can't afford
more), but the flight-end final sync-back — which previously had NO gate at
all — now runs the FULL detected gate (typecheck + lint + format + test +
build) before the landing ritual, both call sites sharing one alarm-only
contract via a standalone, dependency-injected
`apps/dashboard/src/flight/convergence-gate.ts`. A follow-up fix split the two
gate weights into explicit `perFiringGateSpec`/`fullGateSpec` builders
(`flight/gate-schedule.ts`) after the flight-end gate was caught silently
inheriting the per-firing test schedule — on 4 of every
`FULL_TEST_EVERY_N_FIRINGS` flights it ran `test:impacted` instead of the full
suite, defeating the reason a flight-end gate exists (catching the
merge-interaction bugs an impacted-only diff scope can't see).

Ongoing refinements, continued (2026-08-30): doc reviewed and confirmed current
with implementation. All six slices and their acceptance criteria remain
unchanged and live in production; no new concurrency work since 2026-08-28.
Gate-schedule builders and convergence ceremonies are stable and in use
(flight/gate-schedule.js, flight/convergence-gate.ts). Post-flight sweep
pipeline (flight/post-flight-sweeps.ts) now includes doc-freshness checks and
fleet-wisdom mining; neither alter the parallel-flights capability itself.

Ongoing refinements, further continued (2026-08-27 → 2026-08-28): flight-end
convergence ceremony refined to run the FULL gate (not just per-firing
impacted-only scope) after sync-back lands, so merge-interaction bugs two
individually-green lanes can hide are caught at landing time — a follow-on to
the post-merge typecheck above that caught the tsc-red incidents. Verdict
close/blocked task deferring now survives mid-flight shipping elsewhere
(previously a late-firing task shipped on one lane risked leaving a
close-verdict stranded "queued" while a sibling was still flying), keeping
the board tidy across concurrent work. None of this changes the acceptance
criteria or epic scope — these are hardening refinements to the convergence
ceremony and verdict machinery, adding visibility and safety to the
parallel-flights capability already live in production.

Freshness check (2026-09-03): `fly.ts` changed once since this doc's 2026-09-02
last touch — `fastForwardWorktree` (commit 7f957398), wired in right after the
existing catch-up drain to fast-forward a REUSED lane worktree onto `target`'s
tip at launch time. A second change in the same window, `syncWorktreeBranch`'s
new rerere-replay + union-merge self-healing for sync-back (commit 96b6f220,
`packages/engine/src/adapters/worktree.ts`), also touches the launch/sync-back
seam this epic's locks list references. Both are same-folder N-way fleet-lane
mechanics — lane freshness and recurring-conflict absorption, not cross-project
parallelism — and both are already recorded where lane concurrency work lives:
`docs/epics/0004-bash-containment-worktree.md`'s Post-completion evolution log.
Neither changes any of the four locks above or the acceptance criteria below;
all six slices remain unchanged and live in production.

Founder directive (2026-08-13): _"כל פרויקט לא יהיה תלוי באחר — שיוכלו לרוץ במקביל, כל
אחד עם תכנית העבודה שלו"_ — no project depends on another; each flies in parallel with
its own board. Today the fleet is serial by construction, at four distinct layers; this
epic removes each layer deliberately, in slices, without weakening any containment or
telemetry guarantee.

## Why it is serial today (the four locks)

1. **Store-wide engine lock** — `fly.ts` takes `FileInstanceLock` on
   `<stateDir>/engine.lock`; a second engine on a DIFFERENT project is refused exactly
   like a duplicate on the same project.
2. **Singleton `FlightRunner`** — `apps/dashboard/src/flight/runner.ts` holds one
   `#child`/`#status`; `POST /api/fly` 409s while anything flies, and the fly-bar path
   field locks globally.
3. **Single-writer store assumptions** — all flights and the server share
   `.autopilot/autopilot.db`; concurrent writers are possible under WAL but nothing
   sets/handles `busy_timeout`/`SQLITE_BUSY` deliberately, so today's safety is the
   serial schedule itself.
4. **Flight-end rituals write to THIS repo** — self-study PAPER regen (and landing /
   release, when opted in) commit into the AUTOPILOT checkout regardless of which
   project the flight flew; two flights ending together would race those commits.

## Acceptance criteria

- Two `fly.js` processes fly two DIFFERENT projects at the same time, end to end
  (onboard → firings → gate → commit → telemetry), each contained to its own target,
  each reading its own board/SOUL/backlog, neither observing the other's work plan.
- A second flight on the SAME project is still refused (single-instance per project is
  a guarantee, not a casualty).
- The dashboard shows all live flights at once — each with its own log, budget, phase
  rail, stop/pause — and starting project B never requires waiting for project A. The
  path field is never globally locked.
- Telemetry stays un-fakeable and per-project: metrics/events rows attribute to the
  correct project under concurrency; no cross-project bleed in the read models.
- An operator-set concurrency cap exists (shared subscription quota is a real budget);
  flights beyond the cap queue rather than fail.
- Flight-end rituals (PAPER regen, landing, release) are serialized: two flights
  ending simultaneously produce clean sequential commits, never a race or a dirty-tree
  refusal caused by a sibling.

## Constraints

- Containment guarantees are untouched: each flight's PreToolUse guard stays confined
  to ITS target; the per-project lock must not open any cross-project write path.
- Store migrations stay append-only/checksum-frozen; concurrency hardening is
  connection-level (`busy_timeout`, bounded retry), not schema surgery.
- The engine's un-fakeable verification chain (gate → sha → HEAD) is per-project git
  state and must keep holding when two gates run concurrently on different repos.
- Subscription quota is shared: the pacer/resilience machinery may not silently double
  spend pressure — fairness is part of the design, not an afterthought.
- Windows-first: locks and process handling must work on this box (no POSIX-only
  primitives).

## Out of scope

- Cross-project scheduling intelligence (priorities BETWEEN projects, fleet-level
  triage) — this epic makes parallel possible, not smart. Supervisor-daemon smarts are
  a follow-on.
- Distributed/multi-machine fleets, remote workers.
- Per-project separate databases (the shared store with correct concurrency handling
  is the deliberate design — one dashboard reads one fleet).

## Slices (board tasks carry the EPIC-SPEC marker)

1. Per-project engine lock (`engine-<projectId>.lock`, stale-PID handling kept).
2. Store write hardening for concurrent writers (busy_timeout + bounded retry + test).
3. `FlightRunner` registry — one runner per folder; API becomes per-folder.
4. Multi-flight dashboard UI — per-project flight cards; no global path lock.
5. Shared-quota fairness — operator concurrency cap + pacer sibling-awareness.
6. Flight-end ritual serialization — one commit queue for PAPER/landing/release.

## Related

- `docs/BACKLOG-999.md` §D (supervisor daemon, aggregate telemetry, quota fairness).
- `docs/FLEET-ORCHESTRATION.md` — fleet doctrine.
- `docs/SOTA-MAP-llm-software-engineering-2026-08.md` A4 (isolation substrate: one
  worktree/branch per agent; blast-radius ordering).
- The RING-0 SUPERVISOR epic (watchdog daemon) — the natural future owner of
  multi-flight spawning once this epic makes concurrency legal.
