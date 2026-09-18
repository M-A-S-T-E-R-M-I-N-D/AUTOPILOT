<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Dependency policy — how a bump gets in, and what stops one

Written 2026-09-18, the day a routine dev-dependency bump silently switched
off mutation testing (see [MUTATION-DEBT.md](MUTATION-DEBT.md), "103 of 103
green — then every one of them red in one bump"). This page is the standing
rule set; `.github/dependabot.yml` is the machine-readable half of it and
carries the same reasons next to each rule.

## Cadence and cooldown

- Dependabot runs weekly for npm and for GitHub Actions.
- A fresh release is not adopted on the day it ships: 3 days for a patch,
  7 for a minor, 14 for a major (`cooldown`). The window is what lets a
  yanked or hijacked version be noticed by the ecosystem before it lands
  here.
- Development dependencies arrive as one grouped PR; production
  dependencies one PR each, so a runtime change is reviewed on its own.
- GitHub Actions stay pinned to a full commit SHA; Dependabot bumps the SHA
  and the version comment together.

## What is ignored, and why

| Dependency | Ignored | Reason | Lift when |
|---|---|---|---|
| `better-sqlite3` | majors | v13.0.3 segfaulted on native load; the Node.js-side fix shipped in v22.14.0 and `.nvmrc` is past it, but nobody has re-tested on the new runtime | a run on the pinned Node confirms `new Database()` no longer crashes |
| `typescript` | majors | a TS major is a toolchain generation (7.x is the native compiler); adopted on our schedule via a migration branch with a full local verify, never via an auto-PR (PR #6 arrived red on all three OSes) | the migration branch is green |
| `vitest`, `@vitest/*`, `vite` | majors | `@stryker-mutator/vitest-runner`'s peer range accepted vitest 5, and every mutant in every config then survived: the runner's activation never reached a vitest 5 worker. A green CI job proved nothing; only a green sweep does | the runner names the new major in its peer range |

An ignore is a dated decision with a lift condition, never a permanent
opt-out. Re-read this table when the condition might have been met.

## How a Dependabot PR is merged

1. Every check green: verify on all three OSes, e2e, commitlint, CodeQL,
   and **mutation testing (changed modules)** — the per-change gate.
2. Review it (a real review: what changed, why, what the release notes say).
3. Squash-merge with a lowercase subject (`chore(deps): bump x from a to b`)
   and BOTH sign-off trailers in the body: Dependabot's and the maintainer's.
   The repository allows squash merges only.
4. Never `--admin`, never with a red check. A red check on a bump is the
   bump talking.

## The toolchain canary

A bump that touches only `package.json` and the lockfile names no mutated
module, so the per-change mutation gate used to select nothing and pass
vacuously — which is exactly how the vitest 5 bump got through. Since
2026-09-18 any change to the manifest, the lockfile, `config/mutation/`,
`scripts/mutation/` or the mutation workflows runs one small, known-green
Stryker config (`dashboard-paths`, 13 mutants, seconds). A canary that
reports 0 killed fails the PR. `scripts/mutation/configs-for-changes.mjs`
owns the rule and `apps/dashboard/test/tooling/configs-for-changes.test.ts`
pins it.

## When a bump breaks something the gate cannot see

Pin back to the last known-good range in `package.json`, add the dependency
to the ignore table above with the reason and the lift condition, and land
that before anything else. Then write the incident down where the next
person will look for it — this page, the debt page, or the research library
— with the run ids that prove the before and the after.

## Rebases and the push cadence

Dependabot rebases a PR only on conflicts, and stops after 30 days. Under
strict up-to-date branch protection every push to `main` re-behinds an open
PR; when a Dependabot PR is in its final CI round, hold your own pushes
until it merges, or comment `@dependabot rebase` and wait for the next
round.
