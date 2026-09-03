<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0004. Gated, thin vertical slices over big-bang delivery

Status: Accepted

## Context

AUTOPILOT both builds itself (dogfooding) and flies other repositories
autonomously. Two constraints make slice size a first-order design decision
rather than a style preference: every unit of work must be independently
verifiable and revertible (the gate is the safety mechanism, not a
formality), and a single firing runs under a hard turn budget — the harness
hard-stops mid-action, and anything uncommitted at that point is simply lost.

## Decision

Every milestone, and every firing within it, ships as a small, gated
(typecheck + test + build, revert-on-red) unit, committed independently —
never a big-bang rewrite. Milestone plans (`M1-ENGINE-PLAN.md`,
`M2-ONBOARDING-PLAN.md`, `M3-DASHBOARD-PLAN.md`, ...) are literally
structured as an ordered "Slice order (each gated + committed)" list with a
Definition of Done per slice. A firing that can't reach a green gate before
its turn budget runs out checkpoints instead of leaving unverified,
uncommitted work: `wip(autopilot): checkpoint — <what's done, what remains,
next step>`, so the next firing resumes rather than rediscovering.

## Consequences

Positive: every commit in the FLIGHT LOG (ADR-0003) is independently green
and revertible; every milestone stays demoable ("watch it fly") along the
way, not just at the end; a stalled or killed firing loses at most one
slice's progress, never accumulated undelivered work.

Tradeoff: slower perceived velocity than a big rewrite, and it demands real
discipline in sizing each unit correctly — too large and the turn budget
catches it mid-flight; too small and slices stop being independently
meaningful.

## Related

- `docs/ACTION-PLAN.md` (milestone DoDs)
- `docs/M1-ENGINE-PLAN.md`, `docs/M2-ONBOARDING-PLAN.md`, `docs/M3-DASHBOARD-PLAN.md`
- `docs/ENGINE-RESEARCH.md` I4 (test-impact analysis: "verify a slice, full-verify on a schedule")
