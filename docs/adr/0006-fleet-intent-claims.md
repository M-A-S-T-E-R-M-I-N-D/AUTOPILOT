<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0006. Fleet intent claims — declared, rendered, retired, verified

Status: Accepted

## Context

Parallel same-repo instances (the fleet) coordinated through a seeded
defense stack: board task claiming, each sibling's `touching:` (uncommitted
tree) and `unlanded:` (committed but not landed) file lists in every firing
prompt's FLEET digest, and a prompt-side hard rule against entering a
sibling's area. It still let real collisions through — one overnight run
produced three duplicate modules, and two siblings independently authored a
v13 store migration, caught only by hand during consolidation. The gap: all
observed signals appear only AFTER work starts; in the moment between two
siblings picking the same unit, neither has edited or committed anything,
so nothing warned them. And prompt-only compliance is a soft control — the
duplicate modules shipped straight past it (the same lesson as ADR-0005).

## Decision

Firings claim a primary-file intent, and the engine enforces it. Before
starting a unit, a firing overwrites the git-ignored `.autopilot-intent`
file at its worktree root with one line — `<primary file> — <goal>`. Sibling
digests render it as an `intent:` claim (`fleet-digest.ts`), the prompt
doctrine instructs every firing to declare its own, a shipped unit retires
its claim, only a checkpointed death keeps it standing (the resuming firing
still owns the packed-up unit) while every other no-ship ending — a noop, a
reverted unit, a gate crash — retires it as abandoned
(`claimSurvivesFiring`), and after every ship
`fly.ts` verifies the shipped commit's files against all standing sibling
claims (`readSiblingIntentClaims` → `detectIntentCollisions`). A collision
prints a `🚨 intent collision` console line and injects an INTENT-CLAIM
VIOLATION notice into the next firing's prompt. Enforcement redirects — it
never reverts a green commit (additive-git doctrine).

## Consequences

Easier: the pick-time race window is closed by a signal that exists before
any edit; violations are machine-detected instead of trusted to prompt
compliance; the collision evidence steers the very next firing away.
Harder: one more per-unit ritual (declaring), and a crashed firing's stale
claim can shadow an area until its resuming firing ships or re-declares —
accepted, because the resuming firing genuinely still owns that unit.

## Related

- `docs/DOCTRINE-COORDINATION.md` — operator guide (lifecycle + signals).
- `docs/RESEARCH-LIBRARY.md` — fleet anti-duplication defense stack and the
  reseed debrief (duplicate modules, v13 migration collision).
- ADR-0005 — the prior art: soft prompt rules need hard enforcement layers.
