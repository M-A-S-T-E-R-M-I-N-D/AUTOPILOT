<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Contributor standing — humans, their autopilots, and trust that's earned in the open

AUTOPILOT is built BY autonomous agents and FOR their human operators — so this
project distinguishes, explicitly and kindly, between the two. This document is
the protocol both sides' machines read.

## The identity law (applies to every AUTOPILOT instance, including ours)

An AUTOPILOT instance **always discloses itself** in public artifacts it
creates on any repo it doesn't own: PRs and issues it authors carry a visible
line —

> 🛩️ Flown by [AUTOPILOT](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT) vX.Y.Z, on behalf of @operator-handle

— plus the machine-readable `Autopilot-Agent:` marker in the body (the linked
version folds in `docs/ATTRIBUTION.md` §2's filing-channel spread-line, one
disclosure satisfying both doctrines — see `packages/engine/src/
github-identity-disclosure.ts`). An agent
never presents as its operator, never claims human-reserved work
(`good first issue` is the humans' welcome mat — our own fleet skips it, and
so must yours), and never answers a question that was asked of a human.
This law ships in the product itself, so every operator's instance is born
knowing it.

## Standing tiers (what they unlock, how they're earned)

| Tier                    | Who                              | Unlocks                                                                                                               | Earned by                                 |
| ----------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Newcomer**            | anyone                           | `/claim` on `good first issue` + `help wanted`                                                                        | showing up                                |
| **Contributor**         | a human with merged work here    | claiming larger scoped issues; their voice weighs in triage                                                           | ≥1 merged PR through the full ritual      |
| **Active partner**      | a proven contributor who applies | batch claims; their AUTOPILOT may work `agent-ok`-labeled upstream tasks (under caps, disclosed); early roadmap input | application + maintainer approval (below) |
| **Maintainer-delegate** | invitation only                  | scoped review powers                                                                                                  | sustained partnership                     |

**What never relaxes, at any tier:** the security-hard KEEPER rules (deps,
guard/containment, auth, CI paths always queue for the human maintainer), DCO
sign-off, the gate, and squash-through-review. Trust widens scope — it never
bypasses safety.

## Applying for Active partner (the easy path)

Open an issue with the **🤝 Active-partner application** template. Our KEEPER
assembles an evidence dossier for the maintainer — nothing is auto-approved:

- verifiable GitHub facts: account age, public repos and their substance,
  contribution history elsewhere;
- OUR shared history: merged PRs here, review-cycle conduct, DCO cleanliness,
  protocol respect (claims honored, scope kept);
- patch quality signals: were the diffs meaningful, minimal, well-tested —
  and did any ever trip a security review.

The maintainer decides; the decision (and reasoning) lands on the application
issue — approvals and declines are equally documented. Standing is recorded in
[`TRUSTED-CONTRIBUTORS.md`](TRUSTED-CONTRIBUTORS.md), which both sides' fleets
read.

## For operators whose AUTOPILOT flies against this repo

Your instance inherits this protocol from the codebase. When its social pass
finds upstream work that is human-reserved and matches your interests, it will
SUGGEST it to YOU (a dashboard notification) — the claim, and the credit, are
yours. That's not a limitation; it's the point: the humans stay the community,
the agents stay the workforce.
