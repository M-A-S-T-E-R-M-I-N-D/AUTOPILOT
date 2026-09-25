<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-muhcwgc6-strand`: "STRANDED SYNC-BACK … fleet-2 … firing 275 unverifiable: refused: uncommitted changes remain after the commit" — already rescued

Board (high): "STRANDED SYNC-BACK: flight ended with its commits parked on
autopilot/flight-worktree-fly-autopilot--fleet-2 — withheld: firing 275
unverifiable: refused: uncommitted changes remain after the commit —" (title
truncated by the board summary before the rescue ref it names, per
`apps/dashboard/src/fly.ts`).

## Identifying the stranded commit

The task id's timestamp half (`muhcwgc6`, base-36 milliseconds) decodes to
2026-09-25 22:31:14 +03:00. That is the moment the flight ended and filed
this task. The lane branch's reflog
(`git reflog show autopilot/flight-worktree-fly-autopilot--fleet-2`) shows
the lane's head at that moment:

| Time (+03:00)       | Reflog entry                  | Commit                                                                      |
| ------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| 2026-09-25 21:51:07 | commit                        | `e4d89a0b` docs(epics): refresh 0009 warm-sessions status …                 |
| 2026-09-25 22:19:52 | reset: moving to HEAD~1       | back to `27123e28` (the 21:28 landing)                                      |
| 2026-09-25 22:20:18 | commit                        | `007b982a` docs(epics): refresh 0001-parallel-flights status …              |
| — 22:31:14 —        | _flight ends, task filed_     | lane head = `007b982a`                                                      |
| 2026-09-26 00:16:25 | commit                        | `d123949d` docs(epics): record the 2026-09-19 timeout tuning … on 0009      |
| 2026-09-26 00:20:14 | merge autopilot/flight (ff)   | lane catches up to the sync merge `55e8549a`                                |

The 22:19:52 entry explains the withheld reason. The firing ran a mixed
`git reset HEAD~1` over its own `e4d89a0b`, which had already been
fast-forwarded into `autopilot/flight` as that branch's tip at 21:51. The
reset put `e4d89a0b`'s `docs/epics/0009-warm-sessions.md` diff back in the
working tree as uncommitted changes. The firing then committed only the 0001
change as `007b982a`. The per-firing gate saw the 0009 edit still in the
tree and refused to judge the head ("uncommitted changes remain after the
commit"), so the flight end parked `007b982a`.

No parked ref was ever cut for it. `git for-each-ref refs/autopilot/parked`
lists three heads under this lane, all dated 2026-09-19 (an earlier round),
and none is `007b982a`. The lane was never moved aside: its next firing
produced a green head, and sync-back published that head normally.

## Verification of the claim

1. **The stranded commit reached `autopilot/flight`.** `d123949d`'s parent is
   `007b982a`. The sync merge `55e8549a` (`chore: sync
   autopilot/flight-worktree-fly-autopilot--fleet-2 into autopilot/flight`,
   2026-09-26 00:20:10) has `d123949d` as its second parent. Its diff against
   the flight tip is exactly `007b982a`'s 13-line addition to
   `docs/epics/0001-parallel-flights.md`.
2. **The uncommitted leftover was committed too, and it is identical to the
   landed copy.** `d123949d` is the lane's next firing picking up the 0009
   edit left in the tree. `git diff e4d89a0b d123949d --
   docs/epics/0009-warm-sessions.md` is empty, so it is byte-for-byte the
   content `e4d89a0b` had already landed. The merge folded it in as a no-op:
   no duplicated section and no conflict. `git log -- docs/epics/0009-warm-sessions.md`
   still names `e4d89a0b` as the file's latest change.
3. **Both are on `main`.** `git merge-base --is-ancestor` returns true for
   `007b982a`, `d123949d` and `55e8549a` against `main` (`e03bc73c`,
   `chore: land autopilot/flight into main`, 2026-09-26 01:46:15).
4. **Nothing is left behind.** This lane's working tree is clean at the start
   of this firing. Its branch equals `autopilot/flight` equals `main` at
   `e03bc73c`. `git stash list` holds no entry from this lane (the only
   leftover stash belongs to fleet-4, firing 109).

## VERDICT

**Close — already rescued.** Firing 275's head `007b982a` and the edit it
left uncommitted were both published by this lane's next green firing
(`d123949d`, synced in `55e8549a`) about two hours after the strand. Both
landed on `main` in `e03bc73c`. Nothing needs to be merged, re-applied or
un-parked.

The underlying failure shape is a firing un-committing a commit that had
already landed, which leaves its diff in the tree. The engine addressed that
shape afterwards in `251c51ee` (`fix(engine): a firing's leftovers are set
aside, and its commit is gated on its own`, 2026-09-26 00:00:55). Leftovers
now go into a named, recoverable stash and the gate judges the commit alone,
so this shape no longer strands a lane.

## Verification note for this firing's own METRICS

The unit of work is this debrief plus the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`).
Both are documentation only. All evidence above came from read-only `git`
inspection (`reflog`, `log`, `show`, `diff`, `merge-base`, `for-each-ref`,
`stash list`) of history already present in this worktree. No other lane's
live or unlanded files were touched. Every backtick-quoted hex citation in
this file (`e4d89a0b`, `27123e28`, `007b982a`, `d123949d`, `55e8549a`,
`e03bc73c`, `251c51ee`) was checked with `git merge-base --is-ancestor <sha>
HEAD` before commit, because `ci:doc-commit-refs` fails on any that is not
an ancestor.
