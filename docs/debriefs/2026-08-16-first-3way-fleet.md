<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief: first 3-way fleet test (2026-08-16)

Board: web-msw5gwfs-rqylda. Result: 3 instances, 3/3 shipped, claiming held,
zero conflicts, guard fix ffcd9c6 self-shipped. GAP: each instance flew ~1 of
its 3 firings, then exited. This records the diagnosis.

## Root cause: project-scoped firing ids under a shared store

All three same-folder instances shared one project store. Each instance's loop
computes its next firing number as `firingCount() + 1`, and `firingCount()`
counts the PROJECT's metrics rows — a shared, instance-blind number. So every
instance minted the same `<project>:firing-<n>` id from the same lifetime
count. The first insert won `metrics`' `UNIQUE(firing_id)`; the other two
processes died mid-firing on `SQLITE_CONSTRAINT_UNIQUE` — after their work was
committed but before their telemetry row landed. That is exactly the observed
shape: every instance ships its first unit (3/3 shipped), but only one process
survives its insert, so each instance "flew ~1 of 3 firings then exited".

Evidence: `packages/engine/src/adapters/store.ts` (`firingIdOf`'s docstring
records the crash), `packages/engine/src/loop.ts` (`firingCount() + 1`).

## Already fixed

`firingIdOf(projectId, firing, instanceId)` now scopes the id per INSTANCE
(`<project>--<instance>:firing-<n>`) when a fleet instance is flying, so
concurrent instances can no longer collide on `UNIQUE(firing_id)` — shipped as
PARALLEL UNLOCK C follow-up, alongside the task-claiming that already held
during the test.

## Ruled out: cross-instance budget exhaustion

The competing hypothesis — instances counting each other's spend against their
own total budget and exiting early on "total budget reached" — is refuted:
`spentSoFar` is flight-local, in-memory state (`apps/dashboard/src/fly.ts`,
`let spentSoFar = 0`, incremented only in this process's own
`onFiringComplete`), never read back from the shared store. Sibling spend
cannot trip a sibling's budget stop.

## Verification criterion for the next fleet run

A 3-way run on the instance-scoped store should now complete all
`firings × instances` firings with one metrics row per firing id and zero
`SQLITE_CONSTRAINT_UNIQUE` deaths. If an instance still exits early, capture
its final stdout line — every deliberate exit path (`shouldStop`) prints its
reason before stopping.
