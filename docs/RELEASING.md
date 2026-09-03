<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Releasing & versioning policy

How AUTOPILOT's versions, tags, changelog, and commit history are managed. This
is the durable record so the discipline is repeatable (and enforced by CI).

## Versioning — Semantic Versioning 2.0

- The **product/repo version** is the single line the `CHANGELOG.md` and git
  version tags share. Pre-1.0, **each milestone (M0…M9) is a MINOR bump**; bug
  fixes between milestones are PATCH bumps; **1.0.0 ships at the M9 launch**.
- Current version line: planning `0.1`–`0.5` (pre-code docs), **M0 = `0.6.0`**,
  **M1 = `0.7.0`**, … The root `package.json` `version` tracks this.
- Workspace packages (`@autopilot/*`) are pre-1.0 internal libraries; they stay
  at `0.1.0` until first external publish, then adopt independent SemVer. The
  number that means "the product" is the repo version above.

## Changelog — Keep a Changelog

- `CHANGELOG.md` is maintained **from day 0**, newest first, human-readable.
- Work accrues under a top **`[Unreleased]`** section; on a release it is
  promoted to a dated `[x.y.z]` section.
- Every milestone gets an entry with what was **Added / Changed / Fixed**, what
  was **Verified**, and what **Remains** (with a backlog cross-reference) — no
  overclaiming.

## Git tags

Three tag families, all local until a public remote exists:

| Tag             | Meaning                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| `v<semver>`     | the SemVer release (e.g. `v0.6.0` = M0, `v0.7.0` = M1) — the machine-readable version |
| `m<N>`          | the human-friendly milestone marker (`m0`, `m1`, …) at the same commit as its `v` tag |
| `myth-baseline` | the pristine **pre-code** snapshot (the MYTH floor, before any M0 code)               |

Planning versions `0.1`–`0.5` predate the git repo; they are captured inside the
`myth-baseline` commit and documented in the changelog (not separately tagged).

## Git notes

Each milestone / release commit carries a **`git notes add`** attestation: the
DoD-met record, gate + coverage numbers, review verdict, and any deferrals. This
is the machine-readable "flight-log" annotation alongside the human changelog —
the third leg of the tags / commits / **notes** version-management triad.

## Commits

- **Conventional Commits** (`feat`/`fix`/`docs`/`test`/`chore`/`ci`/`refactor`/
  `perf`/`build`/`revert`/`style`), enforced by commitlint (local hook + CI).
- **DCO sign-off** (`git commit -s`) on every commit.
- Small, logically-scoped commits — one concern each.
- The only author identity is the brand **1337 · REL AZEUS · MΔSTERMIND**; no
  private data ever (CI secret-scan + no-personal-paths gates).

## Release checklist (per milestone)

1. Milestone DoD objectively met; `pnpm run verify` green.
2. Adversarial review (+ security review) applied; no unresolved critical/high.
3. `CHANGELOG.md`: promote `[Unreleased]` → dated `[x.y.z]`; bump root
   `package.json` `version`.
4. `docs/FEATURE-COVERAGE.md` statuses reconciled with the real tree.
5. Tag `v<semver>` and `m<N>` at the release commit. Steps 3 and this `v<semver>`
   leg are mechanized by the dashboard's RELEASE panel ("Cut release"); the
   `m<N>` leg is mechanized too, but only when the operator names one in the
   panel's optional "Milestone tag" field — the panel computes bumps and tags
   commits, it cannot judge whether a milestone's DoD (step 1) is actually
   met, so that call stays with the operator.
6. Never force-push / `reset --hard` / touch a shared branch without approval.
