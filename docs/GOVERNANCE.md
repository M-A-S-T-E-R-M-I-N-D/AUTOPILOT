<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# GitHub governance — the house taxonomy

The label scheme + starter milestone set every AUTOPILOT-stewarded repo
seeds onto its own GitHub page. This doc is the source of truth; the
taxonomy seeder ritual (epic 0019 "GitHub Steward" slice 1,
`apps/dashboard/src/flight/taxonomy-seed.ts`, run via
`pnpm dashboard:taxonomy-seed`) applies it — it does not redefine it.

## Why a seeder, not a one-time hand edit

This repo's own page was hand-stewarded on 2026-09-07: labels and starter
milestones applied by hand, once. That does not generalize — a fresh
instance flying its own project (or a fork) starts with none of it. The
seeder productizes the hand into a per-project ritual any instance can run
on any repo **it owns**, idempotently, any number of times.

## Role gate

The seeder never writes to a repo the acting identity does not own.
`resolveSocialIdentity` (`apps/dashboard/src/flight/social-pass.ts`)
decides `maintainer` vs `user` once, by comparing the resolved `gh`
login against the repo's owner segment. A `user` (guest) identity gets a
plan with zero actions — the ritual reports what it would have done and
stops there. See docs/epics/0019-github-steward.md's law 1, "role honesty
first" (inherited from epic 0016 law 5).

## The label scheme

Four groups, an `epic` marker, and a community set — 18 labels total.
Idempotent: every seed run re-applies every label via
`gh label create --force`, so a repeat run (or a run against an
already-seeded repo) is cheap and harmless.

| Group | Labels |
| --- | --- |
| **priority** | `priority: critical`, `priority: high`, `priority: medium`, `priority: low` |
| **area** | `area: dashboard`, `area: flight-engine`, `area: foundation`, `area: ci`, `area: i18n`, `area: community` |
| **status** | `status: awaiting-human`, `status: blocked` |
| **epic** | `epic` — multi-slice initiative with its own doc under `docs/epics/` |
| **community** | `claimed`, `declined`, `roadmap`, `agent-ok`, `partner-application` |

Exact colors and descriptions live in `HOUSE_TAXONOMY_LABELS`
(`apps/dashboard/src/flight/taxonomy-seed.ts`) — this doc names the
groups; that module is the byte-for-byte record so there is exactly one
place to edit the scheme.

**Deliberately out of scope for this seeder:**

- GitHub's own stock defaults (`bug`, `enhancement`, `documentation`, …) —
  every fresh repo already has these.
- Dependabot's auto-created labels (`dependencies`, `github_actions`,
  `javascript`, …) — created on demand by Dependabot itself.
- The `pool: *` set (`pool: accessibility`, `pool: cybersecurity`, …) —
  already synced by its own dedicated mechanism,
  `.github/labels.json` + `.github/workflows/labels.yml`, which runs in
  CI on every push to that file. The taxonomy seeder is additive to that
  mechanism, never a second source of truth for it.

## Starter milestones

A **generic** bootstrap set for a fresh repo — not this (or any) project's
own specific initiatives, which stay hand-authored beyond this starter
set. Idempotent by title: a milestone already present (open or closed) is
left alone, never duplicated or overwritten — unlike labels, GitHub
milestones have no `--force` upsert, and a maintainer may already have
edited its description.

| Title | Purpose |
| --- | --- |
| **Foundations** | Core scaffolding, CI/gate, and initial architecture in place. |
| **V1** | First user-facing release — the MVP surface. |
| **Hardening** | Security, accessibility, and performance passes before wider release. |

## Running the ritual

```sh
pnpm dashboard:taxonomy-seed
```

Reports what it applied (`N applied, M failed`) against the resolved
`owner/repo`, or why it declined to write (unresolved identity, or a
guest role) — see `apps/dashboard/src/control/cli.ts`'s `taxonomy-seed`
case for the exact output shape.
