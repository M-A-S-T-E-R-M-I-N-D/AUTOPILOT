<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief — the red-main revert cascade (2026-09-06)

## What happened

While the operator's session was peeling a chain of honest CI layers on
`main` (splice half-step → personal path → doc links → format → runner
ACL → frozen-clock e2e gate → a swept-in Playwright artifact), the live
flight's final firing saw `converged branch 'main' e2e is red` and ran its
red-main remediation: **a nine-deep `git revert` cascade on the primary
checkout**, walking back one commit at a time hunting a green baseline.

The cascade reverted, among others:

- the **pumped e2e clock-gate fix** — which the very next CI run proved
  green on the windows runner;
- **social-pass core** (epic 0016 slice 1), the flight's own freshly
  landed feature;
- the operator's artifact-untrack fix — the actual cure for the red it
  was reacting to;
- an i18n slice already merged to `origin/main`.

## Why it was wrong

Every red verdict the remediation acted on was **stale** — each failed
run had validated a commit whose specific defect a LATER commit already
fixed. The cascade never asked "which tree did this red actually judge,
and is that tree still the tip?" — so it reverted the fixes along with
everything else, manufacturing a regression out of a recovery.

## Why nothing was lost

`origin/main` never received the cascade: the operator's session caught
the divergence before any push, parked the damaged ref on a local backup
branch, reset the primary checkout to `origin/main`, and verified the one
seemingly-lost slice (the i18n chip translation) was already an ancestor
of `origin/main`. Damage: zero commits, ~40 minutes of forensics.

## Laws this hardens

1. **Verdict provenance before remediation** — a red CI verdict is
   evidence about the exact SHA it validated, nothing newer. Any
   automated response must first check whether the tip already contains a
   candidate fix (a newer run in progress, a newer commit touching the
   failing gate's inputs) and default to WAITING over reverting.
2. **Revert is an operator verb** — the flight may propose a revert as a
   board task with evidence; it must never execute a multi-commit revert
   walk on the primary checkout on its own authority.
3. **One writer at a time remains the deepest law** — the cascade was the
   flight-vs-operator edition of the flight-vs-flight race already on
   record; the standing "live git-commit race" debriefs from this same
   flight predicted exactly this collision class.

## Reproduced live, and bidirectional this time: firing-179 (2026-09-07)

This firing was mid-unit — a docs-only fix for GitHub issue #6 (append the
Contributor Covenant "Enforcement Guidelines" section to
`.github/CODE_OF_CONDUCT.md`) — when its own uncommitted edit became direct
evidence of this hazard, not just an observer of it. The edit sat unstaged
while this firing verified it (`prettier --check`); a `git status --porcelain`
moments later came back clean, and `git log` showed why: a sibling process had
run `763edde6` (`style(autopilot): autoformat — mechanical gate remediation`,
03:17:41), a bare, unscoped commit that swept this firing's uncommitted
`CODE_OF_CONDUCT.md` edit in alongside unrelated formatting — the same
"scoped git add on one side does not protect against a broader commit on the
other side" shape `2026-09-06-primary-checkout-live-collision.md` already
names, this time landing the content correctly (verbatim, matching what this
firing wrote) but under a message with no authorship trail back to this unit.

Seconds later the ground moved again. `git log` showed an eight-commit
revert/reapply burst, every entry timestamped within a two-second window
(03:18:26–03:18:28):

```
3b1eb204 Revert "style(autopilot): autoformat — mechanical gate remediation"     03:18:26
92f4caae Reapply "style(autopilot): autoformat — mechanical gate remediation"    03:18:27
180058ba Revert "style(autopilot): autoformat — mechanical gate remediation"     03:18:27
2d6fa1a5 Revert "fix(onboarding): re-land the static-site gate detector..."      03:18:27
25a1ca4a Revert "feat(ci): launcher smoke test actually executes .sh scripts..." 03:18:27
df737a7f Revert "docs(self-study): flight-end automated data refresh"           03:18:28
ff690f51 Revert "docs(debriefs): reconfirm primary-checkout collision a..."     03:18:28
ab2cd6a2 Revert "feat(flight): compose-to-tasks execute wiring..."              03:18:28
```

followed 24 seconds later by a fresh `ecdfd44c` (`docs(self-study):
flight-end automated data refresh`) — the pipeline re-running from a clean
slate rather than this specific revert having been undone.

Two things are new here versus the original finding above:

- **The revert walk is not always one-directional.** `763edde6` was reverted,
  then *reapplied* (`92f4caae`, git's own label for a revert-of-a-revert),
  then reverted again eleven seconds later — three commits fighting over one
  file's fate inside a single second-to-second window. That is at least two
  independent remediation actors disagreeing with each other in real time,
  not one actor walking backward through history.
- **The blast radius crossed units cleanly.** All six other reverts in the
  burst belong to unrelated, independently-authored work — a gate detector,
  a CI smoke test, a self-study data refresh, this very debrief file's prior
  entry, and another firing's board-task feature (compose-to-tasks execute
  wiring) — landed by at least four different processes across the twelve
  minutes before the burst (03:07–03:18), none sharing a topic with any
  other. A revert verdict computed for one bad SHA discarded every commit
  that happened to land after it, regardless of relevance.

Per this file's law 2 (revert is an operator verb) and the standing hard
rule against reacting to a possibly-stale red signal with a revert walk of
this firing's own, no corrective action was taken here — not a re-commit of
the `CODE_OF_CONDUCT.md` fix (the tree was still settling; adding a ninth
writer to an active revert fight was judged higher-risk than leaving the
fix to redo next firing), not a reset, not a cherry-pick of any reverted
SHA. `git status`/`git log` were polled read-only until `HEAD` held steady
across two four-second-apart checks before this entry was written. GitHub
issue #6 remains open; its fix landed on `autopilot/flight` at `763edde6`
and was then reverted at `180058ba` — worth relanding once the branch is
quiet, and worth flagging to whoever owns the revert-remediation script
that it does not check, before reverting, whether the SHA its verdict
judged is still the tip.
