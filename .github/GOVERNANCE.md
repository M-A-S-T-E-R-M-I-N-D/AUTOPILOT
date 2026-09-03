<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Governance

AUTOPILOT is an open-source project founded and led by
**1337 · REL AZEUS · MΔSTERMIND**.

## Roles

- **Founder / BDFL** — sets vision and direction, holds final decision authority,
  and is the release signer. Currently: `1337 · REL AZEUS · MΔSTERMIND`.
- **Maintainers** — review and merge contributions, triage issues, uphold the
  standards in [`docs/PATTERNS-AND-STANDARDS.md`](../docs/PATTERNS-AND-STANDARDS.md).
- **Contributors** — anyone who opens an issue or PR.

## Decision-making

1. **Machine-verifiable changes** (compiles, tests, security scan, machine-
   checkable accessibility) merge autonomously once the gate is green and review
   approves — this mirrors AUTOPILOT's own verification boundary
   ([`MASTER-PLAN.md`](../docs/MASTER-PLAN.md) §17.1).
2. **Human-judgment changes** (visual/brand, UX, ethics, ambiguous intent,
   irreversible architectural forks) require explicit founder/maintainer sign-off
   — the 🟣 gate ([`MASTER-PLAN.md`](../docs/MASTER-PLAN.md) §17.2).
3. **Locked decisions** ([`MASTER-PLAN.md`](../docs/MASTER-PLAN.md) §15) — name, engine
   language, license, MVP shape — are not re-litigated without founder approval.

## Repository settings

`main` is locked to exactly one writer — the founder, and the agent acting under
their identity (epic 0007, "the platform"). The desired-state config lives at
[`.github/branch-protection.json`](branch-protection.json) (required CI checks,
founder-only PR approval via CODEOWNERS, no force-pushes/deletions, linear
history) and is applied to the live repo by the founder running
`pnpm run gh:setup-branch-protection` with their own authenticated `gh` CLI —
deliberately a manual, operator-run command rather than automatic CI, since it
mutates GitHub's remote security settings. Its read-only counterpart,
`pnpm run gh:verify-branch-protection`, fetches the live protection (GET,
never PUT) and diffs it against the same desired-state config, exiting
non-zero on drift — run it after applying the lock to prove it stuck, and any
time thereafter to detect drift. `pnpm run verify` keeps the config's
required-check contexts honest against `.github/workflows/ci.yml`'s job matrix,
but never applies it.

## Changes to governance

This document is changed by the founder, ideally after community discussion in a
tracked issue.

## Code of Conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
