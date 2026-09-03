<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0003. MYTH/LEGACY tags + FLIGHT branch backup ritual

Status: Accepted

## Context

An autonomous agent is about to be let loose committing to a real,
pre-existing repository. Before any mutating step can run, there needs to be
a guaranteed-safe pristine snapshot, a restore floor, and a place for
autopilot's own commits to land that is never confused with the human's
working branches — and any restore must be additive, never a history
rewrite, per the SOUL's "additive git only" rule.

## Decision

Onboarding (`lockRepo`) runs a backup-before-work ritual, in this fixed
order, before any other mutating step touches the repo:

1. **MYTH** tag — a read-only archival snapshot of the pristine, pre-touch
   state (standard term: pristine baseline).
2. **LEGACY** tag + branch — the lock-on baseline and restore floor
   (standard term: checkpoint baseline).
3. **FLIGHT** branch — every autopilot commit since lands here, forming the
   browsable, diffable **FLIGHT LOG**.

`assertBackedUp` gates any further onboarding step on this ritual having
completed; resume detects an existing snapshot instead of re-running it.
Restores are always a new branch, never `reset --hard`/force-push/rewritten
history; `main` is never touched without explicit approval. Implemented on
plain git (tags, branches, worktrees) — no bespoke VCS — so it stays portable
and inspectable, and surfaces directly in the dashboard's Versions screen.

## Consequences

Positive: a bad flight is always recoverable by construction; the founder can
inspect or diff the FLIGHT LOG at any time; the mechanism is just git, so it
needs no special tooling to audit by hand.

Tradeoff: every onboarded project carries extra tags/branches to keep
straight, and the safety guarantee only holds if the ritual's order is never
skipped — enforced today by `assertBackedUp` plus tests asserting "no repo
touched before MYTH/LEGACY".

## Related

- `docs/PATTERNS-AND-STANDARDS.md` §9 (versioning/backup model)
- `docs/M2-ONBOARDING-PLAN.md` (slice 3: "Backup + safety ritual")
- `docs/MASTER-PLAN.md` §7 ("MYTH / LEGACY")
