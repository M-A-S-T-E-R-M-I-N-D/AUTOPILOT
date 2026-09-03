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

## How to use this document

When a fleet incident happens, name it against this list before fixing it. If it
fits a primitive, the fix belongs with that primitive's invariant and gets a test
that states the invariant. If it fits none, that is a sixth primitive worth
adding here — and the incident is the evidence for it.
