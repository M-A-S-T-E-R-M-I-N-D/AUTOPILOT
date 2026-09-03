<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Architecture Decision Records

Short, numbered records of decisions that would be expensive or confusing to
silently reverse or rediscover — framework adoption/rejection, auth model,
branching/backup model, delivery model, security-control layering, data-store
choice. Not every code change gets one; routine implementation doesn't.

Found **none existed** despite the project already carrying real founding
decisions scattered across `ECOSYSTEM-RESEARCH.md`, `MASTER-PLAN.md` §15, and
`FLIGHT-CONTAINMENT.md` — undiscoverable as a single "why did we do X" list.
This directory is that list, going forward.

## Format

Nygard-style ADR, one file per decision:

```markdown
# NNNN. Title

Status: Accepted | Proposed | Superseded by ADR-NNNN | Deprecated

## Context

What forces (technical, product, safety) made this decision necessary.

## Decision

What we decided, stated as a clear, active sentence.

## Consequences

What becomes easier or harder as a result — the honest tradeoff, not just
the upside.

## Related

Links to the research/plan doc(s) the decision was distilled from.
```

## Convention

- Filename: `NNNN-kebab-case-title.md`, four-digit zero-padded, sequential.
- Numbers are never reused or renumbered. A reversed decision gets a **new**
  ADR; the old one's Status changes to `Superseded by ADR-NNNN` — the record
  stays, it doesn't get deleted or silently edited.
- An ADR distills and links its source doc(s); it doesn't replace them. When
  `ECOSYSTEM-RESEARCH.md` or `MASTER-PLAN.md` §15 already covers the research,
  the ADR is the short, stable pointer — not a fork of the prose.

## When to write one

Per `PATTERNS-AND-STANDARDS.md` §10 principle 5 ("Plan-before-execute"): a
PLAN step that lands, changes, or reverses an architectural decision writes
(or supersedes) an ADR as part of that same slice — before or alongside the
implementation, not as a follow-up. `MASTER-PLAN.md` §15 ("Decisions
resolved") and the board are the primary sources for what still needs
backfilling.

A board task for that PLAN step can carry a trailing `ADR: docs/adr/NNNN-kebab-title.md`
marker in its title — parallel to the `EPIC-SPEC:` clause convention
(`docs/epics/README.md`), parsed by `apps/dashboard/src/flight/adr-spec.ts`.
Machine-checked: `markTaskDoneIfShipped` (`apps/dashboard/src/fly.ts`)
verifies the linked file is actually committed (`GitVcs.fileExists`, checked
against HEAD) before trusting a `"completion":"complete"` claim on a marked
task — a marker pointing at a record that was never committed demotes the
claim to a slice, the same mechanism the DELIVERABLE verifier and EPIC-SPEC
convention already use for an unbacked completion claim.

## Index

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-no-framework-core-loop.md) | No agent framework for the core loop | Accepted |
| [0002](0002-subscription-auth-over-api-keys.md) | Subscription auth over API keys as the default | Accepted |
| [0003](0003-myth-legacy-flight-branch-backup-ritual.md) | MYTH/LEGACY tags + FLIGHT branch backup ritual | Accepted |
| [0004](0004-gated-slices-over-big-bang.md) | Gated, thin vertical slices over big-bang delivery | Accepted |
| [0005](0005-defense-in-depth-containment-guards.md) | Defense-in-depth containment guards for flights | Accepted |
| [0006](0006-fleet-intent-claims.md) | Fleet intent claims — declared, rendered, retired, verified | Accepted |
| [0007](0007-sqlite-durability-posture.md) | SQLite durability posture: `synchronous = NORMAL`, deliberately | Accepted |
| [0008](0008-e2e-does-not-gate-direct-push-landings.md) | E2E does not gate direct-push landings — deliberately, for now | Accepted |
