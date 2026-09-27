<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mujcc5sc-strand`: "STRANDED SYNC-BACK … fleet-3 … refusing to sync: the primary checkout has uncommitted changes" — already rescued

Board (high): "STRANDED SYNC-BACK: flight ended with its commits parked on
autopilot/flight-worktree-fly-autopilot--fleet-3 — refusing to sync: '…' has
uncommitted changes". The quoted path is the primary checkout, which has
`autopilot/flight` checked out. The title comes from
`apps/dashboard/src/fly.ts` wrapping the refusal that
`packages/engine/src/adapters/worktree.ts` returns when
`git status --porcelain` in that checkout is not empty.

This is a different strand shape from the three earlier strand debriefs. The
lane head was not withheld as unverified. The lane was fine. The sync-back
target was dirty, so the merge was refused before it started.

## Identifying the stranded commit

The task id's timestamp half (`mujcc5sc`, base-36 milliseconds) decodes to
2026-09-27 07:51:00 +03:00, the moment the flight ended and filed this task.
The lane branch's reflog
(`git reflog show autopilot/flight-worktree-fly-autopilot--fleet-3`) and the
flight branch's reflog (`git reflog show autopilot/flight`) give the order:

| Time (+03:00)  | Branch            | Reflog entry              | Commit                                                                        |
| -------------- | ----------------- | ------------------------- | ----------------------------------------------------------------------------- |
| 07:16:31       | flight            | reset to main (landing)   | `0b6aee32` chore: land autopilot/flight into main                             |
| 07:22:31       | fleet-3           | commit                    | `a3b1cdf2` docs(epics): epic 0004 records the round evaluation's commit …     |
| 07:27:00       | flight            | merge fleet-3: ff         | flight tip = `a3b1cdf2` (a per-firing sync-back succeeded)                    |
| 07:32:46       | fleet-3           | commit                    | `8a7a34ef` fix(flight): a PR touching docs/SIGNING-KEY.asc queues for a human |
| — 07:51:00 —   | _flight ends_     | _sync refused, task filed_ | lane head = `8a7a34ef`, one commit ahead of flight                            |
| 08:07:54       | flight            | merge fleet-4 (ort)       | the next lane's sync-back succeeds, so the checkout was clean again           |
| 08:36:44       | flight            | commit (merge)            | `1dca430d` chore: sync …fleet-3 into autopilot/flight                         |
| 08:50:30       | main              | landing                   | `9b4b88d2` chore: land autopilot/flight into main                             |
| 11:42:33       | fleet-3           | merge flight: ff          | lane's next launch fast-forwards to `b9c57de0`, nothing left to park          |

Only `8a7a34ef` was stranded. Its parent `a3b1cdf2` had already been
fast-forwarded into `autopilot/flight` at 07:27:00. `8a7a34ef` is the fix
the board lists as a shipped slice of `web-mtq0rtub-jxpptv`.

## Verification of the claim

1. **The stranded commit reached `autopilot/flight` unchanged.** `1dca430d`
   has `d32ef021` (the flight tip at 08:35:14) as its first parent and
   `8a7a34ef` as its second. Its diff against the first parent touches only
   `apps/dashboard/src/flight/pr-review.ts` (+7) and
   `apps/dashboard/test/flight/pr-review.test.ts` (+5), which is exactly
   `8a7a34ef`'s stat. `git merge-tree --write-tree d32ef021 8a7a34ef` exits
   0 with tree 0d5ad19d (a tree id, not a commit), the same tree as
   `1dca430d`. So the merge was
   conflict-free, and the recorded merge equals the one git computes.
2. **Someone other than a live sync-back made the rescue merge.** The flight
   reflog records it as `commit (merge)`, not the `merge <branch>: Merge made
   by the 'ort' strategy` line that every automated sync-back in that window
   left. The subject and sign-off match the sync-back's own
   `chore: sync <lane> into <flight>` message. This is the hand merge-after-
   the-round that the RUNBOOK's parked-head section describes.
3. **It is on `main`.** `git merge-base --is-ancestor` returns true for
   `a3b1cdf2`, `8a7a34ef` and `1dca430d` against `main`. The first landing to
   carry them is `9b4b88d2` (08:50:30), and the current tip `569ad428`
   carries them too.
4. **Nothing is left behind.** No parked head was cut for this strand.
   `git for-each-ref refs/autopilot/parked` lists four heads under this lane,
   and all four are dated 2026-09-19 or 2026-09-25. None is `8a7a34ef`. The
   lane's 11:42:33 launch fast-forwarded instead of moving a head aside,
   because `8a7a34ef` was already in the flight branch. Today
   `git log autopilot/flight..autopilot/flight-worktree-fly-autopilot--fleet-3`
   and `git log main..autopilot/flight-worktree-fly-autopilot--fleet-3` are
   both empty. The only `git stash list` entry belongs to fleet-4 (firing
   109), not to this lane.

## VERDICT

**Close — already rescued.** The one stranded commit, `8a7a34ef`, was merged
into `autopilot/flight` conflict-free 45 minutes after the strand (`1dca430d`)
and landed on `main` 14 minutes later (`9b4b88d2`). Nothing needs to be
merged, re-applied or un-parked.

What made the primary checkout dirty between 07:27:00 and 08:07:54 cannot be
determined from this lane. Containment keeps a lane out of the primary
checkout, and git records only what was committed there. The refusal itself
behaved as designed: sync-back never merges into a checkout with uncommitted
changes, because that could mix someone's live edits into a fleet merge.

## Verification note for this firing's own METRICS

The unit of work is this debrief plus the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`).
Both are documentation only. All evidence above came from read-only `git`
inspection (`reflog`, `log`, `show`, `diff`, `merge-tree`, `merge-base`,
`for-each-ref`, `stash list`) of history already present in this worktree.
No other lane's live or unlanded files were touched. Every backtick-quoted
hex citation in this file was checked with
`git merge-base --is-ancestor <sha> HEAD` before commit, because
`ci:doc-commit-refs` fails on any that is not an ancestor.
