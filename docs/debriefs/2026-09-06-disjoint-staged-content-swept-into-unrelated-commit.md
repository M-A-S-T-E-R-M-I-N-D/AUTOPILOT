<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief: a concurrent process's broad `git add` silently swept this firing's disjoint staged content into an unrelated, misleadingly-labeled commit (2026-09-06)

Board: `ap-mtm4qzty-1` ("Multiple concurrent claude/node processes are committing
to the PRIMARY (non-worktree) AUTOPILOT directory simultaneously, silently
discarding uncommitted edits and duplicating landed work"). This is a third,
distinct failure shape for the same still-open architecture gap, alongside
`docs/debriefs/2026-09-06-primary-checkout-collision-recurs-live-blindspot.md`
(working-tree churn / accidental bundling) and
`docs/debriefs/2026-09-06-commit-race-preempts-attempted-landing.md`
(identical-content commit-vs-commit race, one side silently no-ops). This one
shows a third mechanism: **disjoint** staged content — unrelated to what the
other process was working on — getting swallowed into that other process's
commit and mislabeled under its subject line.

## Sequence, in order

1. This firing found `apps/dashboard/src/flight/mirror-pass.ts` and its test
   file already modified in the working tree, unstaged, matching the previous
   session's own recorded end time (file mtimes ~20:40, session summary
   "Last Updated: 20:39") — this firing's own leftover WIP from before a
   context compaction, implementing mirror-pass derivation 2/4
   ("landed-commit ↔ issue-comment", epic 0016 slice 2, board
   `web-mtpzzx50-obq42b`). Content reviewed in full: a pure planner
   (`planMirrorPassLandingNote` + batch + command shaping) and 34 new tests,
   consistent with derivation 1/4's already-landed shape (`1ffbb7cc`).
2. Verified clean: `pnpm run typecheck`, `pnpm run lint`, `pnpm run
   format:check`, targeted `vitest run` (34/34), `pnpm run test:impacted`
   (628/628 across the impacted + registry-guard suites), `pnpm run build` —
   all green.
3. Staged with a scoped `git add <path> <path>` (never `-A`), exactly the two
   mirror-pass files. `git status --short` immediately after showed only
   those two files as `M `.
4. Before running `git commit`, a `git status --short` re-check (standard
   practice after the prior two debriefs documented this exact checkout as
   unsafe to assume static) returned **empty** — the two staged files were
   gone from the status output entirely, with no commit made by this firing.
5. `git log --oneline -5` showed two new commits neither authored by this
   firing: `750bcee8` ("docs: reconcile 2 stale BACKLOG-999.md rows against
   shipped code") and, above it, `1510e428` (a different concurrent firing's
   own debrief about a same-day commit race). `git show --stat 750bcee8`
   listed all three files: `apps/dashboard/src/flight/mirror-pass.ts`,
   `apps/dashboard/test/flight/mirror-pass.test.ts`, **and**
   `docs/BACKLOG-999.md` — the last one is what that commit's subject
   actually describes; the first two are this firing's disjoint,
   unrelated-to-BACKLOG-999 staged content.
6. Confirmed no content was lost or corrupted: `git diff HEAD -- <both
   paths>` is empty (the committed tree matches this firing's verified
   working copy exactly), and `git log --oneline -- mirror-pass.ts` shows
   only `1ffbb7cc` and `750bcee8` ever touching the file — derivation 2/4 is
   fully, correctly present in history. It is simply attributed to a commit
   whose message never mentions it.

## Why this is a distinct variant

The other two debriefs from today show: (a) one process's edits getting
bundled into another's commit when both touch overlapping working-tree state
around the same moment, and (b) two processes committing *identical* staged
content, where git's index locking makes the loser's `git commit` a silent
no-op with nothing to show for it. This case has neither overlap nor
duplication — the swept-in content was never staged, edited, or known to the
process that ran `750bcee8`'s `git commit`. The only explanation consistent
with a shared `.git/index`: that process staged its own `docs/BACKLOG-999.md`
edit with something broader than a scoped `git add` (e.g. `-A` or `.`),
picking up this firing's already-staged mirror-pass files from the same
index and folding them into its own commit without ever inspecting them.
The result is a commit whose diff is 3x larger than its subject line
describes, and a `feat`-shaped addition (a new exported planner + comment
API) invisibly filed under a `docs:` commit — actively misleading for anyone
using `git log --grep` or blame to find when/why mirror-pass gained
derivation 2/4.

## Current state (for any firing reading this)

Mirror-pass derivation 2/4 is **done and landed** — do not re-implement
`planMirrorPassLandingNote`/`planMirrorPassLandingNoteBatch`/
`fetchIssueComments`/`fetchMirrorPassIssueComments`, they exist in
`apps/dashboard/src/flight/mirror-pass.ts` as of `750bcee8`, fully tested.
Derivations 3/4 (README-claims ↔ tree) and 4/4 (stale-claim reaper) remain
open per the file's own docstring.

## Verification note for this firing's own METRICS

This firing made zero commits: its own attempted `git add`/`git commit`
sequence for the mirror-pass files never got the chance to run before the
content was absorbed by `750bcee8`. It does not claim that commit as shipped
work — the code is correct and independently verified above, but a different
process's `git commit` invocation authored it. This debrief file is this
firing's actual, attributable unit, added with a scoped `git add <path>`.
