<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mtnd737s-1`: `ap-mtm4qzty-1`'s lock guards the land-time bookends, never the edit-time window between them

Board: `ap-mtnd737s-1` (medium, learnings) — "`ap-mtm4qzty-1`'s lock guards
LAND only — concurrent primary-checkout firings still race at worktree-edit
time before either commits (observed live twice this firing)." This firing
did not witness that live collision itself (the claim originates in whichever
prior firing filed the task); its unit of work is verifying the claim against
`fly.ts`'s actual guard code and committing the fact permanently, since
`docs/FAILURE-DOCTRINE.md` — the repo's own "read this before improvising"
ledger — currently has no row for the underlying `ap-mtm4qzty-1` hazard class
at all, despite eight prior debriefs reconfirming it.

## Verification of the claim

`apps/dashboard/src/fly.ts` has exactly two guards against the shared,
non-worktree checkout hazard, and both fire at a single decision point rather
than holding for a duration:

1. **The primary-fallback guard** (`fly.ts` ~L418-439, "FLIGHT-VS-FLIGHT
   PRIMARY FALLBACK GUARD"): checked once, immediately after worktree setup
   fails or throws, right before Bash would start running directly against
   `target`. If `isAnyFlightLockLive(dirname(dbPath), target, process.pid)` is
   true at that one instant, the flight refuses outright and exits.
2. **The sync-back guard** (`fly.ts` ~L358-403): checked once per sync-back
   call site, immediately before `syncWorktreeBranch`/`fastForwardWorktree`
   touch `target`'s working directory and index directly.

Both checks are snapshots taken at a bookend — the moment just before a
flight would either (a) start editing the shared checkout with no isolation,
or (b) reconcile the shared checkout at the end of a run. Neither check is
re-evaluated during the interval between them, and nothing holds a lock
continuously across that interval. The interval itself — every Read/Edit/Bash
tool call a flight makes while doing its actual unit of work, typically
dozens to low hundreds of turns — is exactly the "worktree-edit time" the
board task names, and it is unguarded by construction: a guard implemented as
"check once, decide, proceed" cannot detect a second process that starts its
own edit-time window a moment later, since neither is checked again until its
own next bookend.

## Why this is a distinct, useful fact, not a restatement

Every prior `ap-mtm4qzty-1` debrief (`2026-09-06-primary-checkout-live-collision.md`
and its four 2026-09-06 siblings, `2026-09-07-fifth-reconfirmation-verdict-ap-mtq46c9a-2.md`,
`2026-09-07-hard-reset-destroys-uncommitted-work-live.md`) documents a
collision *observed after the fact* — dirty files that changed between two
`git status` snapshots, or a hard reset that erased uncommitted edits. None of
them state explicitly why the `fly.ts` guards did not prevent what they
caught: it is because those guards were never designed to hold for the
edit-time window in the first place, only to gate the two moments where a
flight is about to touch the shared checkout's git state directly. `ap-mtnd737s-1`
names that gap precisely instead of leaving it implicit in eight separate
incident reports. The actual mitigation for the edit-time window is a
different, already-shipped mechanism — the `3f4bd6c6` detection rule, carried
in `packages/engine/src/prompt.ts` and reproduced in every firing prompt's
hard rules ("Uncommitted changes already in the tree at start … may be a live
sibling's work … re-check `git status`/`git log` right before your final
commit") — and that rule is reactive (catches a collision before landing),
not preventive, and per the hard-reset debrief has its own blind spot: a
sibling's `git reset --hard` can erase another firing's uncommitted edit-time
work with zero trace, before the re-check ever runs.

## VERDICT

**Confirmed by code inspection.** `ap-mtm4qzty-1`'s two `fly.ts` guards are
land-time bookend checks, not an edit-time mutex, and cannot be — full
mutual exclusion for an entire flight's duration would mean serializing every
concurrent flight against one project, which is a larger, operator-owned
architectural trade-off (per the standing verdict already on record: require
every flight to run in its own isolated worktree, never the shared primary
checkout, which the fleet-2..6 lanes already do). This firing does not
attempt that change. Its contribution is making the gap a committed fact
(this file) and giving the eight-debrief-deep `ap-mtm4qzty-1` class its own
permanent row in `docs/FAILURE-DOCTRINE.md` (added in the same commit), so
a future firing reads one ledger row instead of re-deriving the same
conclusion from `git log --grep` across nine files.

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief plus the `docs/FAILURE-DOCTRINE.md`
row it adds, both under `docs/`, which is excluded from `prettier --check .`
and from ESLint's configured file globs — `typecheck`/`test`/`build` are
structurally unaffected. Confirmed green anyway before committing.
