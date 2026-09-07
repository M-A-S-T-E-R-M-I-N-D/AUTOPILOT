<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# New failure shape of `ap-mtm4qzty-1`: a sibling's hard reset silently destroyed this firing's uncommitted edit, live, mid-firing

The `ap-mtm4qzty-1` hazard class (multiple processes writing directly into one
shared, non-worktree `.git/index`/working tree, no locking or partitioning)
has been reconfirmed identically five times already — see
`docs/debriefs/2026-09-07-fifth-reconfirmation-verdict-ap-mtq46c9a-2.md` and
its own chain of prior incidents. This firing picked a different unit of work
(a small, well-scoped dashboard fix — see below) and hit a **new, more severe**
failure shape of the same underlying gap while executing it, caught live with
hard evidence. This debrief exists to add that shape to the record, not to
reconfirm the VERDICT again with no new information — a sixth identical
reconfirmation with nothing new would be pure waste.

## What this firing was doing

Board `web-mto1tya3-57v8ig` ("KEEPER ritual: surface first-time-contributor CI
gating"): `flight/pr-review.ts` already detects a PR's head stuck in GitHub's
`action_required` status (`fetchAwaitingApprovalRunIds`/
`annotateAwaitingApproval`, wired into `GET /api/pr-review`) and already
composes a distinct `reasoning` sentence for it — but the dashboard panel's
badge (`prReviewDecisionLabel` in `apps/dashboard/src/web/pr-review-panel.ts`)
collapses that case into the same generic "🟣 queue for human" label every
other unreported-gate reason gets, so a maintainer scanning the KEEPER PR
review panel cannot tell "just needs eyes" from "click here, this needs your
approval to run CI at all" without opening each tooltip. The fix: thread an
`awaitingApproval` boolean into `prReviewDecisionLabel` (backward compatible,
new optional third parameter) so that specific case gets its own badge, plus
a new `prReviewAwaitingApprovalLabel` STRINGS key (en + he) and unit tests.
Deliberately NOT wired to auto-execute the `gh api .../approve` command — the
existing reasoning text still tells the human to run that by hand, on
purpose, since auto-wiring "Apply" to authorize an untrusted fork's code to
run in CI with repo secrets would defeat the exact protection the gate exists
for. A pure, additive, low-risk display change across four files:
`apps/dashboard/src/web/pr-review-panel.ts`,
`apps/dashboard/src/web/features/pr-review.ts`, `packages/tokens/src/strings.ts`,
`apps/dashboard/test/web/pr-review-panel.test.ts`.

## What happened

All four edits were applied successfully (confirmed via the editor tool's own
success responses). Verifying them moments later with a direct `grep` for the
new identifiers across all four files returned **zero matches** — every edit
had vanished, with no trace, no conflict marker, no error. `git status` at
that same moment showed a completely different set of dirty files
(`apps/dashboard/src/web/shell.ts` modified, plus three untracked files this
firing never touched: `apps/dashboard/src/control/post-push-verdict.ts`,
`apps/dashboard/test/control/post-push-verdict.test.ts`,
`apps/dashboard/test/web/project-page-card-dedup.test.ts`).

`git reflog -10` explained why:

```
978c35d1 HEAD@{0}: reset: moving to HEAD
978c35d1 HEAD@{1}: reset: moving to HEAD
978c35d1 HEAD@{2}: reset: moving to HEAD
978c35d1 HEAD@{3}: commit (amend): feat(ci): launcher smoke test actually executes .sh scripts, not just describes them
31e6f88a HEAD@{4}: cherry-pick: feat(ci): launcher smoke test actually executes .sh scripts, not just describes them
a1cae51f HEAD@{5}: checkout: moving from autopilot/flight to autopilot/flight
```

`HEAD` moved from this firing's start point (`a1cae51f`) to `978c35d1` — a
commit re-landing a feature (`feat(ci): launcher smoke test...`) that a
**prior firing had already reverted** (`25a1ca4a Revert "feat(ci): launcher
smoke test actually executes .sh scripts, not just describes them"`, visible
in this firing's own starting `git log`). A concurrent sibling process
cherry-picked it, amended it, and then hard-reset the shared working tree to
that commit **three times in a row** — a `reset: moving to HEAD` reflog entry
with the working tree wiped to match is the signature of `git reset --hard`,
not a bare/mixed reset (which leaves working-tree edits to unrelated files
untouched). That hard reset is what erased this firing's four uncommitted
edits as pure collateral damage: they touched files the resetting process had
no interest in and no awareness of, because there is no per-process isolation
on this checkout at all — a `git reset --hard` run by any one process nukes
every other process's uncommitted work tree-wide, not just the files it
means to touch.

A re-check three seconds later showed the picture still moving:
`packages/tokens/src/strings.ts` was now dirty again — but `git diff` on it
showed a **third, unrelated** in-progress feature (`projectNotFound`/
`projectNotFoundBody` STRINGS keys, a "project not found" UI string, nothing
to do with PR review or CI gating). Combined with the untracked
`post-push-verdict.ts`/`project-page-card-dedup.test.ts` files, this confirms
at least **two** concurrent sibling processes were actively writing into this
exact primary checkout at the same moment as the hard-reset process — a
minimum of three simultaneous writers sharing one `.git` with no lock, no
partition, and (as just demonstrated) no protection against one process's
reset destroying another's uncommitted work outright.

## Why this is a new failure shape, not a repeat

Every prior reconfirmation of `ap-mtm4qzty-1` documented **commit-time**
hazards: a scoped `git add` still landing a sibling's staged file in the same
commit (`750bcee8`), an identical-content commit race, a swept test file, a
fabricated 26-test failure batch from concurrent writes. All of those are
about the wrong content ending up in a real, landed commit — lossy but
recoverable (the content still exists somewhere, just misattributed). This
incident is different in kind: a **hard reset silently discarded another
firing's uncommitted work with zero trace and zero recoverability** — had
this firing not verified its own edits immediately after applying them (not
a standard step, and not one every firing takes), the lost work would have
gone completely unnoticed, not even reaching the noop/checkpoint path that
would let a future firing resume it. The `6cbdacc4` detection rule (re-check
`git status`/`git log` before the final commit, treat unexplained dirty state
as a sibling's) protects against picking up a false start; it does nothing
for edits that were made, then destroyed, before that final check ever runs.

## What this firing did in response

Nothing was re-attempted. The checkout was still actively changing seconds
apart (verified by re-running `git status` and finding new dirty files each
time), so redoing the same four-file edit immediately would only risk a
second destruction or an incorrect bundling into whichever concurrent
process commits next — the same risk the fifth reconfirmation's own
conclusion already named. Every file this incident touched
(`shell.ts`, `strings.ts`, `post-push-verdict.ts`,
`project-page-card-dedup.test.ts`) is now treated as claimed/contended per
the standing doctrine, and this firing's own unit of work became this
debrief instead — added with a scoped `git add <this-path>`, the only file
this firing stages. `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured file globs, so
`typecheck`/`test`/`build` are structurally unaffected.

## VERDICT

**New evidence, escalating an already-confirmed architecture gap.** This
does not reopen or re-litigate `ap-mtq46c9a-2` (still correctly confirmed,
still correctly deferred to the operator) — it adds a concrete, first-hand
data point that the residual risk of flying directly against this primary,
non-worktree checkout is not just misattributed commits but outright,
silent, unrecoverable loss of a firing's in-progress work whenever any
concurrent process on the same checkout runs so much as one `git reset
--hard`. The fix this and every prior incident points to remains the same
operator-owned call already on record: require every flight (not only the
fleet-2..5 siblings that already do) to run in its own worktree. This firing
does not attempt that change itself.
