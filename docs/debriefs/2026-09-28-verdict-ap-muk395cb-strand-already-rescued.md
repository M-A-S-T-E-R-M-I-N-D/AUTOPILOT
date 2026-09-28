<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-muk395cb-strand`: "STRANDED SYNC-BACK … fleet-5 … merge … failed (exit 1): Auto-merging apps/dashboard/src/flight/contributor-dossier.ts" — already rescued

Board (high): "STRANDED SYNC-BACK: flight ended with its commits parked on
autopilot/flight-worktree-fly-autopilot--fleet-5 — merge of
'autopilot/flight-worktree-fly-autopilot--fleet-5' into 'autopilot/flight'
failed (exit 1): Auto-merging apps/dashboard/src/flight/contributor-dossier.ts
CONFLICT (content): Merge…". The board line also says that one slice already
shipped: `f8cf80bf` "fix: reland main's work that a lane revert stripped from
autopilot/flight". This is the fleet-5 strand that the
[`ap-muk7f98l-strand` debrief](2026-09-28-verdict-ap-muk7f98l-strand-already-rescued.md)
mentions but did not process.

## Identifying the stranded commits

The task id's timestamp half (`muk395cb`, base-36 milliseconds) decodes to
2026-09-27 20:24:29 +03:00. The reflogs of the lane branch, the solo lane and
the flight branch (`git reflog show --date=iso <branch>`) give the order:

| Time (+03:00) | Branch        | Reflog entry                  | Commit                                                                                   |
| ------------- | ------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| 19:29:22      | fleet-5       | merge flight: ff              | lane tip = `e11b10fb`                                                                    |
| 19:37:39      | solo          | commit                        | `f62ff11a` fix(keeper): a null gh row no longer truncates the contributor dossier …      |
| 19:40:16      | fleet-5       | commit                        | `8583c119` fix(keeper): the same null-row guard, same file, written as a free pick       |
| 19:45:57      | flight        | merge solo (ort)              | `1f2568ab` brings `f62ff11a` into flight                                                 |
| 20:02:53      | fleet-5       | commit                        | `4371d22b` fix(ci): license gate parses SPDX AND/OR with parentheses                     |
| — 20:24:29 —  | _flight ends_ | _sync-back fails, task filed_ | lane head = `4371d22b`, two commits ahead of flight tip `e475ba93`                       |
| 20:49:20      | flight        | reset to main                 | `a3fbf8b6`, a landing that does not carry either commit                                  |
| 20:58:44      | fleet-5       | commit (merge)                | `a5e156a8` merges `a3fbf8b6` into the lane, taking flight's side of the dossier conflict |
| 21:06:26      | fleet-5       | revert                        | `5780614b` reverts `a5e156a8` with `-m 1`                                                |
| 21:06:27      | flight        | merge fleet-5 (ort)           | `b3518be0` carries both commits, and the revert, into flight                             |
| 21:57:16      | fleet-5       | commit                        | `f8cf80bf` restores 22 of the files the revert removed, from main                        |
| 22:21:13      | flight        | merge fleet-5 (ort)           | `eed7f6b6` lands that reland                                                             |
| 22:56:38      | flight        | commit                        | `f6113b61` stops the diff-size gate from reverting a lane's catch-up merge               |
| 23:17:48      | main          | landing                       | `5a2838a4` chore: land autopilot/flight into main                                        |

Only `8583c119` and `4371d22b` were stranded.

## Why the merge failed

Two lanes fixed the same bug in the same lines, 2 minutes 37 seconds apart.
The solo lane's `f62ff11a` was a slice of its claimed task
web-mtsylqbd-q2rg8k (the EPIC 0019 null-row sweep). Fleet-5's `8583c119` was
a free pick. Neither had reached the flight branch when the other was
written, so neither lane could see the other's fix in its tree. Both add
`if (typeof raw !== 'object' || raw === null) continue;` before the title
check in `fetchContributorFacts`. They differ only in the comment above it,
and in fleet-5 widening the loop's cast to `(RawMergedPr | null)[]`, which
changes types but not behavior. Both add a test with the identical name "skips
a null or non-object merged PR row without losing the rows after it". Both
tests feed a `null` and a `'stray'` row and assert that 2 merged PRs are
counted.

Recomputed today, `git merge-tree --write-tree --name-only e475ba93 4371d22b`
exits 1. It reports `CONFLICT (content)` in
`apps/dashboard/src/flight/contributor-dossier.ts` and prints the
`Auto-merging` line the task title quotes. The test file merges cleanly. The
conflict is reproducible, and the strand was not a flake.

## Verification of the claim

1. **The conflict was resolved the right way, then undone by the gate.** The
   blob ids of the two dossier files trace every step:

   | Commit                                        | `contributor-dossier.ts` | its test |
   | --------------------------------------------- | ------------------------ | -------- |
   | `8583c119` (fleet-5's fix)                    | e62c8b5d                 | 3cd28b8e |
   | `f62ff11a` (solo's fix), `e475ba93`           | ec5f032c                 | e9815c16 |
   | `a5e156a8` (lane catch-up merge)              | ec5f032c                 | e9815c16 |
   | `5780614b` (gate revert), `b3518be0`          | e62c8b5d                 | 3cd28b8e |
   | `f8cf80bf` (reland), `main`, HEAD `560e9755`  | ec5f032c                 | e9815c16 |

   `a5e156a8` kept the solo lane's version. `f8cf80bf`'s body explains why
   `5780614b` exists: the diff-size gate measured the catch-up merge as if
   all of flight's delta were the firing's own diff, which came to over 1400
   review lines, and it reverted the merge with `git revert -m 1`. For this
   file, that swapped the solo version back to fleet-5's duplicate, and
   `b3518be0` carried that into flight. `f8cf80bf` put the solo version back,
   byte for byte. `f6113b61` fixed the gate: it now counts a merge of the
   base branch by its own `--remerge-diff`.
2. **The dossier fix survives, once.** HEAD has the guard once, with the solo
   lane's comment, and the solo lane's test. Fleet-5's four differing source
   lines (its comment and the widened cast) and six test-fixture lines are
   absent by design, because they duplicate a fix already present. Carrying
   both would have added a second test with the same name in the same
   `describe` block.
3. **The license-check fix was never touched.** `scripts/ci/license-check.mjs`
   (blob 0a1bf7a9) and `apps/dashboard/test/tooling/license-check.test.ts`
   (blob 77698e4c) have the same blobs at `4371d22b`, `a5e156a8`, `5780614b`,
   `b3518be0`, `f8cf80bf` and HEAD. `git log 4371d22b..HEAD` on both paths
   prints nothing. A fixed-string grep of every non-blank line `4371d22b`
   added finds 77 of 77 in the script and 38 of 38 in the test at HEAD.
4. **Both commits are on `main`.** `git merge-base --is-ancestor` returns
   true for `8583c119`, `4371d22b`, `f8cf80bf` and `f6113b61` against `main`.
   `a3fbf8b6` carries neither commit. The first landing to carry them is
   `5a2838a4`.
5. **Nothing is left behind.** `git log autopilot/flight..autopilot/flight-worktree-fly-autopilot--fleet-5`
   is empty. The three parked heads under this lane
   (`git for-each-ref refs/autopilot/parked`) are all dated 2026-09-19. No
   `git stash list` entry names fleet-5.
6. **Both capabilities are green at HEAD.**
   `npx vitest run apps/dashboard/test/flight/contributor-dossier.test.ts apps/dashboard/test/tooling/license-check.test.ts`
   passes 69 of 69 tests in this firing (18 dossier, 51 license gate).

## VERDICT

**Close — already rescued.** Of the two stranded commits, `4371d22b` (the
license gate's SPDX AND/OR parsing) is on `main` unchanged. `8583c119` was a
duplicate of the solo lane's `f62ff11a`, and every step that resolved the
conflict kept `f62ff11a`'s version. The one real loss in this chain was the
gate reverting the lane's catch-up merge, not the strand itself.
`f8cf80bf` healed it for this file, and `f6113b61` keeps it from happening
again. Both landed on `main` in `5a2838a4`. Nothing needs to be merged,
re-applied or un-parked.

This task predates `dbe57b94` (2026-09-28 00:33), which makes a stranded-work
task name its head and close itself once that head lands. This task's title
names no head, so a firing has to close it by hand, as this one does.

## Verification note for this firing's own METRICS

The unit of work is this debrief plus the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`).
Both are documentation only. All the evidence above came from read-only `git`
inspection (`reflog`, `log`, `show`, `rev-parse`, `diff`, `merge-tree`,
`merge-base`, `for-each-ref`, `stash list`) of history already in this
worktree, plus one targeted test run. No other lane's live or unlanded files
were touched. Every backtick-quoted hex citation in this file was checked
with `git merge-base --is-ancestor <sha> HEAD` before commit, because
`ci:doc-commit-refs` fails on any that is not an ancestor. Blob ids are left
unquoted because they are not commits.
