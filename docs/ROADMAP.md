<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Roadmap — where the maestro is flying

The honest, load-bearing answer to "what direction is AUTOPILOT going, and how can I help?"
Updated by the maintainer when direction actually changes — not a wish list, a flight plan.
Live granular truth: [`CHANGELOG.md`](../CHANGELOG.md) (what landed) and the
[issues labeled `help wanted`](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
(what's open for you, right now).

## Now flying (the current focus)

1. **Full dashboard i18n** — community-reported
   ([#16](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/issues/16)): every user-facing
   string through the locale table; Hebrew first-class. The fleet works this continuously.
2. **LLM issue composer** — write a bug note in YOUR language, free-form; the system
   investigates locally and composes a top-tier GitHub issue for one-click submission.
   Raw notes never leave your machine; report language is yours to choose.
3. **Post-push verdict ritual** — the autopilot itself watches CI after every push/land,
   and on red files an evidence-rich remediation task instead of a human noticing hours later.
4. **This collaboration protocol** — public claims, visible direction, no duplicate work
   (see [`CONTRIBUTING.md`](../.github/CONTRIBUTING.md) → "Claiming work").

## Next up (M4 → M5 arc)

- **Live flight control from the dashboard** finishing M4: pause/steer/approve mid-flight.
- **Approvals queue maturity (M5)**: every human-only call (deps, publicity, spend) in one
  place, with the KEEPER ritual's reasoning attached.
- **Update channel polish**: the over-the-air banner grew in 0.23.0; next is release-notes
  surfacing in-app and a smoother stash-and-update flow.

## Horizon (M6 → M9, unchanged intent)

Efficiency levers (cost per shipped firing), multi-project fleets as a first-class surface,
harness hardening, and the **1.0.0 public-launch milestone (M9)** — 1.0 ships on maturity,
not arithmetic ([`docs/RELEASING.md`](RELEASING.md)).

## How work gets shared

| You want to… | Do this |
|---|---|
| See what needs doing | Issues labeled **`help wanted`** — each carries scope, isolation notes, and a DoD |
| Take one | Comment **`/claim`** — the bot assigns YOU, labels it `claimed`; one assignee, ever, so nobody double-picks |
| Hand it back | Comment `/unclaim` (or 14 quiet days auto-release it) |
| Know who's on what | The issue's assignee IS the claim — visible to everyone, including the fleet |
| Ship it safely | Fork-first, touch only the scoped paths, `pnpm run verify` green, squash-PR referencing the issue — the KEEPER review ritual does the rest ([`CONTRIBUTING.md`](../.github/CONTRIBUTING.md)) |
| See what was declined and why | Label **`declined`** always carries a reasoned comment — disagreement is documented, never silent |

The autonomous fleet respects the same rules in reverse: an issue assigned to a human is
OFF the fleet's menu (that's the point of the `good first issue` reserve too — the fleet
leaves the welcome mat alone).
