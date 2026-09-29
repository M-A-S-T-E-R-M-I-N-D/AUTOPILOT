<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-muk7f98l-strand`: "STRANDED SYNC-BACK … fleet-4 … merge … failed (exit 1): Auto-merging docs/epics/0036-provider-parity.md" — already rescued

Board (high): "STRANDED SYNC-BACK: flight ended with its commits parked on
autopilot/flight-worktree-fly-autopilot--fleet-4 — merge of
'autopilot/flight-worktree-fly-autopilot--fleet-4' into 'autopilot/flight'
failed (exit 1): Auto-merging docs/epics/0036-provider-parity.md
Auto-merging packages/engine/src/adapter…". This is a real content conflict,
not a withheld head and not a dirty sync target like the earlier strand
debriefs. The lane's commits sat on a file that the flight branch had just
lost part of.

## Identifying the stranded commits

The task id's timestamp half (`muk7f98l`, base-36 milliseconds) decodes to
2026-09-27 22:21:12 +03:00. The lane branch's reflog and the flight branch's
reflog (`git reflog show --date=iso <branch>`) give the order:

| Time (+03:00) | Branch        | Reflog entry                  | Commit                                                                              |
| ------------- | ------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| 20:51:11      | fleet-4       | merge flight: ff              | lane tip = `a3fbf8b6`; its `codex-cli.ts` has the `reapDescendants` seam            |
| 21:00:30      | fleet-4       | commit                        | `c8164981` fix(engine): the Codex adapter closes stdin …                            |
| 21:06:27      | flight        | merge fleet-5 (ort)           | `b3518be0` carries the lane revert `5780614b`, which drops that seam from flight    |
| 21:45:15      | fleet-4       | commit                        | `e623faea` fix(engine): a stale Codex session id retries cold …                     |
| — 22:21:12 —  | _flight ends_ | _sync-back fails, task filed_ | lane head = `e623faea`, two commits ahead of flight tip `03e50ae6`                  |
| 22:21:13      | flight        | merge fleet-5 (ort)           | `eed7f6b6` lands the fleet-5 reland `f8cf80bf`, which leaves `codex-cli.ts` out     |
| 22:41:44      | —             | commit                        | `fd2e3cfa` restores the Codex seam, on top of flight tip `b1a369d0`                 |
| 22:41:53      | —             | commit (merge)                | `344e8bd6` chore: sync …fleet-4 into autopilot/flight (parents `fd2e3cfa`, `e623faea`) |
| 22:44:59      | flight        | merge `344e8bd6`: ff          | flight tip = `344e8bd6`                                                             |
| 23:17:48      | main          | landing                       | `5a2838a4` chore: land autopilot/flight into main                                   |
| 23:19:59      | fleet-4       | merge flight: ff              | lane's next launch fast-forwards to `5a2838a4`, nothing left to park                |

The earlier fleet-4 epic 0036 commits (`f3b510bf`, `14ee8d19`) were already
in `03e50ae6`. Only `c8164981` and `e623faea` were stranded.

## Why the merge failed

`c8164981` was written against a lane tip whose `codex-cli.ts` has the
injectable `reapDescendants` seam and the `timedOut` report. `5780614b`
reverted a merge on the fleet-5 lane, and that removed the same seam, and
`b3518be0` carried the revert into flight at 21:06:27. The fleet-5 reland
`f8cf80bf` restored 22 of the 27 files the revert touched. The five it left
out were the two generated self-study files, the epic 0036 doc,
`codex-cli.ts` and `codex-cli.test.ts`. So at 22:21 the flight tip had no
seam, and the lane's two commits edit the lines around it.

Recomputed today, `git merge-tree --write-tree --name-only 03e50ae6 e623faea`
exits 1 with `CONFLICT (content)` in
`packages/engine/src/adapters/codex-cli.ts` and
`packages/engine/test/adapters/codex-cli.test.ts`. It also prints the two
`Auto-merging` lines the task title quotes. The conflict is reproducible, and
the strand was not a flake.

## Verification of the claim

1. **The seam came back before the rescue merge.** `fd2e3cfa`'s body names
   the gap: "the Codex adapter's reapDescendants seam, its timedOut report,
   their tests and the epic 0036 text stayed lost." `codex-cli.ts` at
   `a3fbf8b6` has 4 `reapDescendants` hits. At `b3518be0`, `03e50ae6` and
   `eed7f6b6` it has 0. At `fd2e3cfa` it has 4 again.
2. **The rescue merge equals git's own merge and carries exactly the two
   commits.** `git merge-tree --write-tree fd2e3cfa e623faea` exits 0 with
   tree ef06235e (a tree id, not a commit). That is `344e8bd6`'s tree, so the
   recorded merge needed no hand resolution once the seam was back.
   `git diff --stat fd2e3cfa 344e8bd6` shows 3 files, +320/−17. That equals
   `c8164981` (+113/−6) plus `e623faea` (+207/−11), on the same three files.
3. **Every line survives at HEAD.** For each of the three files, every line
   that `c8164981` or `e623faea` added was checked against HEAD
   (`9d0252e6`) by fixed-string grep. The result is 270 of 270 present, with
   0 missing. `codex-cli.ts` still closes stdin on every run
   (`child.stdin?.end()`), and it still retries a CLI-rejected session id once,
   cold (`isCodexResumeFailure`).
4. **It is on `main`.** `git merge-base --is-ancestor` returns true for
   `c8164981`, `e623faea`, `fd2e3cfa` and `344e8bd6` against `main`. The first
   landing to carry them is `5a2838a4`.
5. **Nothing is left behind.** `git log autopilot/flight..autopilot/flight-worktree-fly-autopilot--fleet-4`
   is empty. The only parked head under this lane
   (`git for-each-ref refs/autopilot/parked`) is dated 2026-09-19. The only
   fleet-4 `git stash list` entry is the older firing-109 leftover.
6. **The capability is green at HEAD.**
   `npx vitest run packages/engine/test/adapters/codex-cli.test.ts` passes
   47 of 47 tests in this firing.

## VERDICT

**Close — already rescued.** Both stranded Codex fixes, `c8164981` and
`e623faea`, were merged into `autopilot/flight` by `344e8bd6` about 20
minutes after the strand. That happened once `fd2e3cfa` restored the seam the
lane revert had removed. They landed on `main` in `5a2838a4` 36 minutes
later. Nothing needs to be merged, re-applied or un-parked.

This task predates `dbe57b94` (2026-09-28 00:33), which makes a stranded-work
task name its head and close itself once that head lands. Tasks filed before
that commit carry no head, so they need a firing to close them by hand, as
this one does.

The sibling strand task `ap-muk395cb-strand` (fleet-5, filed 20:24:29) points
at the same revert. This firing did not process it, but the facts above bear
on it. Every line `5780614b` removed was checked against HEAD by the same
fixed-string grep. The only misses are 47 lines in the generated
`docs/SELF-STUDY/DATA-SERIES.md` and `docs/SELF-STUDY/PAPER.md` blocks, which
later refreshes have rewritten, plus two lines that the stranded commits
themselves rewrote. Those two are the `codex-cli.ts` import, which now also
imports `isResumeFailure`, and the epic 0036 sentence that still listed
"no resume-retry" as a gap.

## Verification note for this firing's own METRICS

The unit of work is this debrief plus the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`).
Both are documentation only. All evidence above came from read-only `git`
inspection (`reflog`, `log`, `show`, `diff`, `merge-tree`, `merge-base`,
`for-each-ref`, `stash list`) of history already present in this worktree,
plus one targeted test run. No other lane's live or unlanded files were
touched. Every backtick-quoted hex citation in this file was checked with
`git merge-base --is-ancestor <sha> HEAD` before commit, because
`ci:doc-commit-refs` fails on any that is not an ancestor.
