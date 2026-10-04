<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Re-verifying `ap-musvu2gp-1`: `dossier-posted` is still 404 live, but `--labels-only` (`082ca978`) now lets the operator create it without the unwanted starter milestones

Board (🟣, operator): "create the `dossier-posted` label on the live repo — 404 today, so KEEPER's
dossier marker can't land; running the seed would also create the Foundations/V1/Hardening starter
milestones." The task is the same gap the prior debrief
([`2026-10-03-verdict-ap-mui04ldw-0-needs-format-already-live.md`](2026-10-03-verdict-ap-mui04ldw-0-needs-format-already-live.md))
raised as a 🟣 proposal when it closed `ap-mui04ldw-0`. A firing still can't run the seed for real —
it writes labels and milestones to the public repo — but it can re-check the live state and confirm
whether the milestone side effect that debrief warned about still applies.

## The gap is still live

`gh api repos/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/labels/dossier-posted` still returns 404 today
(2026-10-04). No issue carries the label. The gap the prior debrief found is unchanged.

## The milestone concern the prior debrief raised is now resolved

The prior debrief's open question was item 4: a plain seed run would create three generic starter
milestones (`Foundations`, `V1`, `Hardening`) next to the repo's four hand-authored ones, with "no
dry-run or labels-only flag to skip it." That gap was closed the same day by `082ca978`
("`feat(steward): taxonomy-seed --labels-only and --dry-run (epic 0019)`"), which is on this
branch's history. `--labels-only` skips the milestone read and plan entirely; `--dry-run` writes
nothing and lists every action a real run would take. That commit's own message records a
`--dry-run --labels-only` run against the live repo whose only planned create was `dossier-posted` —
the exact gap this task names.

`docs/GOVERNANCE.md` and `docs/RUNBOOK.md` already document both flags, and
`apps/dashboard/src/control/cli.ts` refuses an unrecognized option with exit 1, so a mistyped flag
can't fall through into an unwanted write. Nothing about this task needed further code or doc
changes — the only gap was in the record, which this debrief updates.

## What the operator needs to run

`pnpm dashboard:taxonomy-seed --labels-only` (without `--dry-run`, so it writes) upserts the house
labels — including creating `dossier-posted` — and skips the starter-milestone plan entirely. No
other house label's name, color, or description has changed since the prior debrief, so the other
17 upserts stay no-ops.

## Outcome

`ap-musvu2gp-1` stays open and 🟣 — creating a label on the live repo is still an operator action no
firing can take. What changed is the risk profile: the operator can now run the one command above
and get exactly the one label this task asks for, with no starter-milestone side effect to weigh
first.

## Left alone

- **The live repo.** Every call this firing made against GitHub was a read.
- **`taxonomy-seed.ts`, `cli.ts`, `GOVERNANCE.md`, `RUNBOOK.md`.** All four already carry the
  `--labels-only`/`--dry-run` work from `082ca978`; nothing here needed a second pass.
