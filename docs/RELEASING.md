<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Releasing & versioning policy

How AUTOPILOT's versions, tags, changelog, and commit history are managed. This
is the durable record so the discipline is repeatable (and enforced by CI).

## Versioning — Semantic Versioning 2.0

- The **product/repo version** is the single line the `CHANGELOG.md` and git
  version tags share. The root `package.json` `version` tracks it.
- **The live law (since the fleet took over releasing):** the bump is computed
  from Conventional Commits since the last release tag — `feat` ⇒ MINOR,
  `fix`/`perf` ⇒ PATCH, a breaking marker ⇒ MAJOR (`planRelease`,
  `packages/engine/src/release.ts`). Milestones no longer map 1:1 to MINOR
  bumps — the founding "each milestone is one MINOR" scheme (M0 = `0.6.0`,
  M1 = `0.7.0`, …) held through `v0.10.0` and was outpaced by release cadence;
  `0.22.0` landed mid-M4. **1.0.0 still ships only at the M9 launch
  milestone** — maturity is a human call, not an arithmetic one.
- Every `0.x` release is an **alpha** and publishes as a GitHub **Pre-release**
  (SemVer §4, mechanized by `release/maturity.ts` — auto-detected, operator
  can override).
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

## Git tags — the post-genesis reality

The repo went public on **2026-09-03** as a single squashed genesis commit
(`chore: genesis — autopilot v0.21.0, public alpha`): the entire pre-public
history was deliberately compressed to one clean commit, so **a public clone
contains only `v0.21.0` and later tags**. Three tag families:

| Tag         | Where it lives | Meaning                                                                    |
| ----------- | -------------- | -------------------------------------------------------------------------- |
| `v<semver>` | public, pushed | the SemVer release — the machine-readable version; `v0.21.0` = genesis     |
| `m<N>`      | **local only** | the human milestone marker at the same commit as its `v` tag — kept off the public remote by policy |
| pre-genesis (`v0.6.0`–`v0.20.0`, `myth-baseline`) | **founder's archive only** | the pre-public build history; squashed at genesis, summarized in `CHANGELOG.md`'s dated sections — those entries are the durable public record of that era |

If a doc references a pre-genesis tag or SHA, that is a citation into archived
history a public clone cannot resolve — the changelog section for that era is
the readable substitute.

## Git notes

Each release commit carries a **`git notes add`** attestation — the version,
bump, and the commit subjects that earned it (`buildReleaseAttestation`,
attached automatically by the release ritual). Pre-genesis notes did not
survive the squash; the triad (tags / commits / **notes**) restarted cleanly
at `v0.22.0`, the first post-genesis ritual release.

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
