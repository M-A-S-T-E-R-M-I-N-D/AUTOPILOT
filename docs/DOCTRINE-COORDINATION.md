<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Coordination doctrine — the primitives a fleet actually runs on

**Status:** Active · **Opened:** 2026-08-24 · **Companion to:** [DOCTRINE-WEAKPOINT-RESEARCH.md](DOCTRINE-WEAKPOINT-RESEARCH.md)

## Why this document exists

AUTOPILOT's store is honestly ACID: atomic multi-step mutations, 78 declarative
constraints with foreign keys deliberately switched **on**, WAL isolation with a
second bounded busy-retry behind it. That is the floor, and it holds.

But ACID describes **one database on one node**. AUTOPILOT is a fleet: up to ten
agent processes, each in its own git worktree, converging on one branch. Every
serious failure of the last month was a *coordination* failure, not an ACID one —
two agents building the same module, a claim stranded by a crashed instance, a
verdict paid for twice, the same migration number allocated by two siblings.

Each of those already has a defense in the codebase. What they lacked was a
**name and a stated invariant**, so each was rebuilt ad hoc and re-broken in a
new shape. This document names them. An invariant you can state is an invariant
you can test; one you cannot state gets rediscovered by an incident.

## The five primitives

### 1. Sharding — disjoint work partitions

**Invariant:** at takeoff, every open task belongs to exactly one instance's
scope, and a cohesion group is never split across instances.

**Implementation:** [`flight/scope-partition.ts`](../apps/dashboard/src/flight/scope-partition.ts)
— `areaKeyOf` derives a cohesion key, `partitionBoardScopes` LPT-assigns whole
groups, `scopeFilterCandidates` enforces partition-then-pull so a finished
instance never idles.

**How it broke:** twice, and both times through the *key*, never the algorithm.
Spec paths (`docs/epics/…`) collapsed four unrelated epics into one unsplittable
hub; the `VERDICT` message-type tag collapsed eight unrelated work items the same
way. **The lesson is that the invariant lives in the key function** — a key that
answers "where does this text live" instead of "what does this work touch"
silently destroys the partition while every test stays green.

**How it also broke:** the pre-commit sibling scan (`checkPreCommitSiblingOverlap`,
the live re-check that guards this invariant at the moment of `git commit`) could
not tell "a firing about to originate new work in a claimed file" from "a firing
finalizing an already-resolved merge that happens to touch a claimed file among
many others." A badly stale lane (`ap-mtjwbrok-0`: 937 commits behind) could
never land its catch-up merge — content-clean, no git conflict — because a
multi-hundred-commit diff is near-guaranteed to overlap *some* active sibling's
primary-file claim, every single firing. Fixed by exempting commits made while
`MERGE_HEAD` is set (`isMergeCommit`, `packages/engine/src/adapters/
sibling-commit-scan.ts`): git's own merge machinery already reconciled that
content, so the sharding guard's rationale doesn't apply to it. **A guard built
to stop origination must not also apply to convergence — the two look identical
at the file-path level but differ in what they claim.**

### 2. Leases — claims that expire

**Invariant:** a claim is held by exactly one live instance, and every claim has
an owner that will release it — orderly exit or not.

**Implementation:** `claimTask`/`releaseTaskClaim` (owner-guarded by
`assignee = instanceKey`, so a sibling can never release someone else's work),
`releaseInstanceClaims` (flight-end sweep, orderly exits), `releaseStaleClaims`
(the reaper, for SIGKILL and power loss).

**How it broke:** the flight-end sweep existed before the reaper, so a crashed
instance stranded `in_progress` rows for three days — work that looked live and
inflated every gauge. **A lease without an expiry is not a lease, it is a leak.**

### 3. Idempotency — a decision paid for once

**Invariant:** re-reaching a conclusion the fleet already reached costs nothing.

**Implementation:** `verdictDeferTargets` + the defer loop in
[`fly.ts`](../apps/dashboard/src/fly.ts) — a no-commit firing that emits a
close/blocked verdict defers every task it names, so no sibling re-pays for the
same judgment while the proposal sits with the operator. The approved-verdict
cascade closes the loop from the other side.

**How it broke:** the first version guarded on `status === 'queued'`, but the
claimed task is `in_progress` by definition at the moment its own verdict fires —
so the guard silently excluded the exact case the feature existed for, and the
next round paid again. **A guard written for the general case must be checked
against the originating case.**

### 4. Monotonic allocation — a sequence number issued once

**Invariant:** two instances can never claim the same position in a global
sequence.

**Implementation today:** none. Migration numbers are chosen by reading the
highest one in the file and adding one — a read-then-write race across ten
worktrees that see the same base. `validateMigrations` catches a collision at
**merge**, which is late but not silent.

**How it broke:** twice (v13, v20). Both were caught and renumbered by hand
because the live database had not yet applied either side — a renumber that is
only safe *before* application. Once a migration has run somewhere, renumbering
is a data-integrity incident. **This is the one primitive we have a detector for
and no allocator.** See the open board task.

### 5. Convergence — many branches, one main

**Invariant:** work merges into `main` only through a green gate, and no
instance's committed work is lost on the way.

**Implementation:** the landing ritual (`POST /api/landing/execute`) runs the
full gate before the merge; per-firing sync-back carries commits to the checkout
during flight; the straggler sweep and the ahead-branch surfacing catch what
sync-back did not.

**How it broke:** a landing ran while an instance still held three unlanded
commits, because the existing defense only checked *hunk overlap* in the watchdog
path — not "ahead of base, no overlap" in the API path. **Convergence needs a
completeness check, not only a conflict check.**

## Where ACID still governs

Nothing above replaces the store's ACID guarantees; it sits on top of them.
Concretely: every primitive here mutates through the same transactional,
constraint-checked store, and any primitive that needs to read-then-write within
one instance must do it inside `db.transaction` — atomicity is what makes a
lease release or a defer flip observable as a single fact.

The durability leg deserves its own explicit decision rather than a default; the
board carries an ADR task for it.

## The deeper durability answer

AUTOPILOT's real durability does not rest on `fsync` at all. The un-fakeable
telemetry doctrine makes **git the durable record and the store a projection**:
a task closes only against a gate-verified, sha-verified commit, and
`reconcileShippedTasks` re-derives board state from git when they disagree.

That is why the operator's declared telemetry reset could delete 1,487 metrics
rows and 82,919 events without losing a single unit of work — the work was never
*in* those rows. Any future primitive should preserve that property: **the store
may be rebuilt from git; git may never be rebuilt from the store.**

## Shipped mechanism chronicle

Moved here from `FLEET-ORCHESTRATION.md` (which stays the north-star vision,
not the implementation log) — the concrete, code-verified history of how the
primitives above actually got built and broke in production.

### First live 3-way fleet test — debrief (2026-08-16)

**What happened:** 3 instances (base worktree + `--fleet-2` + `--fleet-3`) flew this
repo in parallel. 3/3 shipped, intent claiming held, zero cross-instance conflicts,
and one guard fix was self-shipped mid-test. **The gap:** each instance
flew ~1 of the expected 3 firings, then exited.

**Diagnosis (code-verified, board task web-msw5gwfs-rqylda):**

1. **Prime cause — the `[firings]` argument defaulted.** `pnpm dashboard:fly
   <folder> [firings]` treats the count as optional with `DEFAULT_FIRINGS = 1`
   (`apps/dashboard/src/fly.ts` — `argv[3] ?? DEFAULT_FIRINGS`). A fleet launch
   that omits it flies exactly ONE firing and exits `stoppedBy: 'max-iterations'`
   — a clean, silent, by-design exit that reads as "instance died early" from the
   outside. Three instances each defaulting to 1 firing reproduces the observed
   "3/3 shipped, ~1 firing each, then exit" exactly.
2. **Ruled out — the loop reacting to failure.** `runLoop`
   (`packages/engine/src/loop.ts`) never exits on a bad/crashed firing: consecutive
   failures only log an ALERT, global quota exhaustion hibernates (a sleep, not an
   exit), and the only terminal paths are a STOP request and `max-iterations`. An
   early exit therefore cannot be the loop "giving up" — it is either an
   as-requested iteration count or the flight process dying.
3. **The "~" in "~1" — per-firing session-budget deaths.** Two firings in this
   flight's own history (773, and fleet-2's 776) hit the harness's per-session USD
   cap mid-unit; deliver-or-pack packed a `wip(autopilot): checkpoint` commit as
   designed and the next firing resumed it. This is the designed degradation, not
   the fleet gap — but it ends that flight's process, which is why some instances
   show a fractional firing.

**Remediation directions:**
- fleet/watchdog launch recipes must pass `[firings]` explicitly (the dashboard
  path already does — `FlightRunner.start()` forwards an explicit count under
  `MAX_DASHBOARD_FIRINGS`) — not yet done; the recipe layer lives outside this repo.
- the flight-end line should say the requested count loudly enough that a
  defaulted count is visible as by-request, not a crash — **DONE**:
  `formatFlightDoneLine` (`apps/dashboard/src/flight/flight-summary.ts`) appends
  `(requested N)` to the `Done —` line whenever `stoppedBy === 'max-iterations'`.
- whether `DEFAULT_FIRINGS = 1` is the right cautious default for CLI launches is
  an operator (🟣) decision — open.

### Fleet intent claims — declare → render → retire → verify

The anti-duplication substrate for same-repo parallel instances (BOARD
web-mswo4x1u-kl2qsw; RESEARCH-LIBRARY defense-stack item 2). Four halves,
all shipped:

- **Declare** — before starting a unit, a firing overwrites the git-ignored
  `.autopilot-intent` file at its worktree root with ONE line,
  `<primary file> — <goal>`. This is the only claim signal that exists
  BEFORE any edit or commit does, closing the window where two siblings pick
  the same unit at the same moment. SLICE-RELAY DUP 1/3
  (web-mt14o4iz-3ehrrw): prompt-only declaring still left a gap between
  `claimTask` succeeding and the firing's LLM actually getting around to
  writing the file — three siblings duplicated a `tasks_reorder` unit in
  that window ($9.2 wasted, zero collisions caught, because none had
  declared yet). `fly.ts` now auto-declares the instant a claim succeeds,
  guessing the primary file from a path-shaped token in the task title
  (`likelyPrimaryPathFromTitle`) via `writeDeclaredIntent`; the firing's own
  declaration, still prompted, overwrites the guess once it picks a real
  primary file.
- **Render** — every sibling's FLEET digest shows the claim as an `intent:`
  line (`fleet-digest.ts` `declaredIntent`), alongside the passive
  `touching:` (uncommitted tree) and `unlanded:` (committed, not yet landed)
  signals. The firing prompt names it the strongest claim signal: never
  touch the file it names.
- **Retire** — a shipped unit fulfills its claim, so `fly.ts` clears the
  file (`clearDeclaredIntent`). Only a checkpointed death keeps the claim
  standing (`claimSurvivesFiring`): the packed-up unit is still owned by the
  firing that resumes it. Every other no-ship ending — a noop, a reverted
  unit, a gate crash, a death on a clean tree — abandons the unit, and its
  claim retires with it so it can't wall siblings out of ghost work.
- **Verify** — prompt-side compliance alone was evaded (three duplicate
  modules and a v13 migration collision in one overnight run), so after a
  firing ships, `fly.ts` checks the shipped commit's files against every
  sibling's standing claim (`readSiblingIntentClaims` →
  `detectIntentCollisions`: separator/case-normalized, own worktree
  excluded). A hit prints a `🚨 intent collision` line in the flight console
  and injects an INTENT-CLAIM VIOLATION notice into the NEXT firing's
  prompt, steering it out of the claimed area. Additive-git doctrine keeps
  the green commit — enforcement redirects; it never reverts.

### Fleet scope partitioner — disjoint scopes, no idle instance

The fifth consensus defense against parallel-agent duplicate work (BOARD
web-mt1kvauh-aqmn3l; RESEARCH-LIBRARY "Where SOTA actually is" — Co-Coder's
cohesion-aware partitioning: naive file-based parallelism measured +60% cost
with NO quality gain from conflicting interfaces, while grouping cohesive
work eliminates most cross-agent conflicts BY CONSTRUCTION). Complements
intent claims above: instead of every same-repo instance racing to pull from
the SAME open board top, a LAUNCHER can compute a disjoint per-instance
scope BEFORE takeoff and hand each instance only its slice.

- **Cohesion signal** — `areaKeyOf` (`flight/scope-partition.ts`) maps a
  task's title to the area it belongs to: the title's primary path prefix
  (`likelyPrimaryPathFromTitle`, truncated to two path segments) when it
  names one, else the board's leading-tag convention ("SHELL …", "COCKPIT
  …", "SLICE-RELAY …"), else its first word lowercased.
- **Hub rule** — `partitionBoardScopes` groups open tasks by that area key
  and never splits a group across instances: same-area tasks are exactly
  the ones most likely to touch the same files, so keeping the group whole
  internalizes the conflict risk instead of exporting it across instances.
- **LPT balance** — groups assign biggest-first to the least-loaded
  instance (longest-processing-time greedy scheduling), so per-instance
  load stays close to even even though group sizes vary; instances beyond
  the group count get an empty scope.
- **Partition-then-pull transport** — the assigned id list rides as the
  comma-joined `AUTOPILOT_FLEET_TASK_SCOPE` env var
  (`StartFlightInput.taskScope` → `spawnFlight`'s 6th arg). `fly.ts` reads
  it once at takeoff via `parseTaskScope` and `scopeFilterCandidates`
  filters BOTH the claim candidates and the board rendered into the
  prompt: while any scope task is still open, only scope tasks are
  pickable; once the scope is exhausted the instance falls back to the
  ordinary full-board pull rather than idling (Co-Coder's greedy list
  scheduling — a fast instance never sits still waiting on a slow
  sibling). Solo flights never set the env var, so `parseTaskScope`
  returns `null` and every candidate passes — byte-for-byte the
  pre-partitioner behavior.

`partitionBoardScopes` is a pure function computed by the LAUNCHER (the
coordinator role in the consensus pattern) — the same repo boundary as the
launch recipe above ("the recipe layer lives outside this repo"): this repo
owns the partition algorithm and the full per-instance transport/consumption
path; the external launcher calls `partitionBoardScopes` once against the
fleet's instance-id list and passes each instance's slice as `taskScope` on
its `POST /api/fly` start call (or CLI-equivalent).

### Fleet wisdom — learnings graduate from SOUL into a shared layer

The M7 companion (BOARD web-msnt26xe-pc4pzp): a learning that keeps being
rediscovered project-by-project stops being one project's idiosyncrasy and
becomes fleet-wide wisdom every project should inherit. Four halves of the
lifecycle, all shipped:

- **Mine** — `mineFleetWisdom` (`flight/fleet-wisdom-mining.ts`) runs in the
  post-flight sweeps and proposes a fleet-level amendment once the SAME
  learning has independently appeared in the SOUL of at least
  `FLEET_WISDOM_GENERALIZATION_THRESHOLD = 3` DISTINCT projects — one or two
  could be coincidence; three is a pattern. "The same learning" is an exact
  marker match against the `LEARNING_KINDS` registry (one `{ marker,
  fleetTemplate }` entry per machine-mined `## Learned: …` note), never a
  free-text similarity engine — the design and its invariants live in
  `docs/epics/0014-fleet-wisdom-generalization.md`. Two kinds are live: the
  checkpoint-streak "size the unit smaller" note and the noop-streak "spend
  no-commit streaks on VERDICT proposals" note. Registry order is priority
  order: with the single pending-proposal slot, mining proposes the FIRST
  kind that qualifies and the rest wait for the sweep after the operator
  acts. Adding a kind is adding a registry entry — storage, routes, and the
  compose seam never change.
- **Propose** — the mined text lands in the fleet row's `wisdom_proposed`
  slot (mirroring `projects.soul`/`soul_proposed`). There is exactly one
  pending proposal for the WHOLE fleet, and mining never overwrites an
  unreviewed one.
- **Ratify / dismiss** — an operator decision, never automatic: `POST
  /api/fleet/wisdom-ratify` applies the proposal as the live `wisdom` text,
  `POST /api/fleet/wisdom-dismiss` drops it; the dashboard shell renders a
  pending proposal as a banner panel with both actions.
- **Compose** — the consumption side: at prompt-assembly time `fly.ts` calls
  `composeSoulWithFleetWisdom` to layer the ratified shared text into every
  project's firing prompt under a `# FLEET WISDOM (shared across all
  projects)` heading. Dedup is per registry kind: for every kind whose
  marked note the project's own SOUL already carries, the fleet copy is
  stripped first — the project-local copy is more specific, and the same
  lesson twice in one prompt is noise.

**Confidentiality boundary:** the mined text is a fixed, pre-authored
template that never interpolates any project-identifying data — no slug, no
name, no root path, no verbatim SOUL content; only the COUNT of confirming
projects. One project's specifics cannot leak into the shared layer by
construction, rather than by a redaction pass that could miss a case.

### Close verification — demotions now reach the next firing

A firing that tags `"completion":"complete"` is checked by
`markTaskDoneIfShipped` before the task closes: measurable DELIVERABLE
predicates against HEAD, a vocabulary check of the shipping patch, the
UX-EXPRESSION doctrine (a user-facing claim must touch a UI/Docs surface),
and EPIC-SPEC / ADR file-existence conventions. A refused close demotes the
metrics row to a slice and the task stays open — and since firing 810's fix,
the refusal REASON is injected into the next firing's prompt as failure
feedback (the same channel gate reverts use). Before that fix the reason
only reached the operator console: firings 802/806/810 re-attempted one
close blind, three firings burned on a message nobody showed them.

## How to use this document

When a fleet incident happens, name it against this list before fixing it. If it
fits a primitive, the fix belongs with that primitive's invariant and gets a test
that states the invariant. If it fits none, that is a sixth primitive worth
adding here — and the incident is the evidence for it.
