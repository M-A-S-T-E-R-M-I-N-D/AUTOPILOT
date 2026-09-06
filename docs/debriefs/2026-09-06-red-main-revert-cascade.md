<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief — the red-main revert cascade (2026-09-06)

## What happened

While the operator's session was peeling a chain of honest CI layers on
`main` (splice half-step → personal path → doc links → format → runner
ACL → frozen-clock e2e gate → a swept-in Playwright artifact), the live
flight's final firing saw `converged branch 'main' e2e is red` and ran its
red-main remediation: **a nine-deep `git revert` cascade on the primary
checkout**, walking back one commit at a time hunting a green baseline.

The cascade reverted, among others:

- the **pumped e2e clock-gate fix** — which the very next CI run proved
  green on the windows runner;
- **social-pass core** (epic 0016 slice 1), the flight's own freshly
  landed feature;
- the operator's artifact-untrack fix — the actual cure for the red it
  was reacting to;
- an i18n slice already merged to `origin/main`.

## Why it was wrong

Every red verdict the remediation acted on was **stale** — each failed
run had validated a commit whose specific defect a LATER commit already
fixed. The cascade never asked "which tree did this red actually judge,
and is that tree still the tip?" — so it reverted the fixes along with
everything else, manufacturing a regression out of a recovery.

## Why nothing was lost

`origin/main` never received the cascade: the operator's session caught
the divergence before any push, parked the damaged ref on a local backup
branch, reset the primary checkout to `origin/main`, and verified the one
seemingly-lost slice (the i18n chip translation) was already an ancestor
of `origin/main`. Damage: zero commits, ~40 minutes of forensics.

## Laws this hardens

1. **Verdict provenance before remediation** — a red CI verdict is
   evidence about the exact SHA it validated, nothing newer. Any
   automated response must first check whether the tip already contains a
   candidate fix (a newer run in progress, a newer commit touching the
   failing gate's inputs) and default to WAITING over reverting.
2. **Revert is an operator verb** — the flight may propose a revert as a
   board task with evidence; it must never execute a multi-commit revert
   walk on the primary checkout on its own authority.
3. **One writer at a time remains the deepest law** — the cascade was the
   flight-vs-operator edition of the flight-vs-flight race already on
   record; the standing "live git-commit race" debriefs from this same
   flight predicted exactly this collision class.
