<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief: the same-content commit-vs-commit race recurred a SECOND time in one session, this time racing the debrief about the FIRST one (2026-09-06)

Board: `ap-mtq191kz-1` ("EVIDENCE ap-mtm4qzty-1") / `ap-mtm4qzty-1` (the still-open
primary-checkout sharing architecture decision). This firing does not add a new
failure *shape* — it is the identical-content commit-vs-commit race already
named in `docs/debriefs/2026-09-06-commit-race-preempts-attempted-landing.md`
(landed `a26316ee`) — but it recurring a second time, within roughly ten
minutes, on THIS SAME DAY'S session is itself the evidence: this is not a rare
edge case, it is the default behavior of this shared checkout under today's
concurrency load.

## Sequence, in order

1. This firing's own intended unit of work — the mirror-pass epic 0016
   derivation 2/4 slice found already written and uncommitted in the working
   tree — was independently gate-verified clean (typecheck, lint, format,
   targeted vitest 34/34, full build) and about to be committed when a
   `git status` re-check showed it had already vanished: absorbed into
   `4407238d` ("docs: reconcile 2 stale BACKLOG-999.md rows against shipped
   code"), a concurrent process's unrelated commit that apparently staged with
   something broader than a scoped `git add`. This firing did not author that
   commit and does not claim it.
2. Investigating further, this firing found
   `docs/debriefs/2026-09-06-disjoint-staged-content-swept-into-unrelated-commit.md`
   sitting **untracked** in the working tree — a different concurrent firing's
   own fully-verified debrief documenting exactly the `4407238d` sweep above,
   left orphaned mid-commit (the same shape `a26316ee` itself documents: a
   commit attempt that never got the chance to run).
3. This firing re-verified that file's claims independently (re-derived
   `4407238d`'s `--stat` listing, confirmed the empty `git diff HEAD` for the
   swept files, confirmed the timestamps) and, finding them accurate, staged
   it with a scoped `git add <path>` and ran
   `git commit -s -m "..." -- <path>`.
4. That commit's own output was **not** a success banner — it printed
   "Changes not staged for commit: modified: apps/dashboard/src/connection/config.ts"
   (an unrelated file this firing never touched) and said nothing about the
   debrief file, with exit code 1: "no changes added to commit".
5. `git log --oneline -3` immediately after showed `92a9f9a8
   docs(debriefs): disjoint staged content silently swept into an unrelated
   commit (ap-mtm4qzty-1)` sitting on `HEAD` — a commit this firing never
   authored (different subject line than what this firing's own `-m` argument
   said). `git show --stat 92a9f9a8` confirmed a single 93-line file, matching
   byte-for-byte what this firing had itself just verified and staged.

## Why this matters beyond a second data point

The prior debrief already proved the *mechanism* (git's index locking makes
the loser of a commit race a silent no-op, never an error). What this firing
adds: within one ~20-minute window of one session, this exact race fired
**twice**, on two different pieces of content, including once on the very
debrief documenting the first occurrence. A failure mode that recurs this
densely under ordinary same-day load is not a tail risk to accept — it is
close to guaranteed on any firing that assumes its own `git commit` succeeded
without checking `git log`/`git show` afterward. Both times, the content was
not lost (git's locking prevented corruption), but authorship was: two
firings' actual verification work now reads, in history, as authored by
whichever concurrent process's `git commit` happened to win the race by
seconds.

## Task processed: contributes to `ap-mtq191kz-1` / `ap-mtm4qzty-1`

This is evidence only — no fly.js change is attempted here. A concrete
mitigation (serializing writers against the primary checkout, e.g. a
commit-scoped lock analogous to `apps/dashboard/src/flight/lock.ts`'s
`FileInstanceLock`/`isAnyFlightLockLive`, or the "always derive an isolated
worktree, never point a raw session at the primary checkout" option already
on the table) is a **separate, focused slice** — attempting it in the same
firing that just watched two of its own commits get raced would mean editing
core flight-orchestration code (`fly.ts`, ~1500 lines, itself mid-write by
active concurrent siblings right now) under exactly the conditions this
debrief chain shows are unsafe. Left for a dedicated firing, ideally one
running alone against this checkout, per the still-open a/b/c choice in
`docs/debriefs/2026-09-06-primary-checkout-live-collision.md`.

## Verification note for this firing's own METRICS

This firing made zero commits of its own that survived as attributed: its
`git commit -s -- <path>` for the disjoint-staged-content debrief was itself
raced and became a no-op (confirmed via the exit code, the unstaged-file
listing it printed instead of a success banner, and `git log`/`git show`
immediately after). This file — landed with a scoped `git add <path>`,
verified via a subsequent `git log`/`git show` check for the same reason — is
this firing's actual, attributable unit.
