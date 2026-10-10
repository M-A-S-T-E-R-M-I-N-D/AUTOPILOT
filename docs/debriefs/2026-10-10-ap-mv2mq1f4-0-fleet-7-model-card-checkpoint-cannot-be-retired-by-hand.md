<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mv2mq1f4-0`: fleet-7's 09bb4f47 MODEL-CARD checkpoint is stale, and no hand move retires it — only the lane's next launch does

Board: "Retire fleet-7's stale unlanded MODEL-CARD checkpoint (09bb4f47)". It follows the
[2026-10-05 blocked verdict](2026-10-05-verdict-ap-muv2rhjx-0-model-card-v18-blocked-by-fleet7.md),
which left the card's `firing-v18` edit waiting on that parked head. This firing tried the retire
and found every hand route closed.

## The checkpoint is stale on its own terms

`git log HEAD..autopilot/flight-worktree-fly-autopilot--fleet-7` is exactly one commit, 09bb4f47
("wip(autopilot): checkpoint — firing 141 died mid-unit", 2026-09-19). It changes two rows of
`docs/MODEL-CARD.md` §6, from `firing-v12` to `firing-v15` and from `2026-09-03` to `2026-09-19`.
Both new values are behind what HEAD already carries:

| Row | The checkpoint writes | HEAD's card (`6046446f`, 2026-10-04) | Truth in `packages/engine/src/prompt.ts` |
|---|---|---|---|
| Firing-Prompt-Version | `firing-v15` | `firing-v17` | `firing-v18` (`127d55ab`, 2026-10-05) |
| Last reviewed | `2026-09-19` | `2026-10-04` | — |

`git merge-tree --write-tree HEAD autopilot/flight-worktree-fly-autopilot--fleet-7` reports
`CONFLICT (content): Merge conflict in docs/MODEL-CARD.md`. The branch has no worktree
(`git worktree list` has no fleet-7 entry), so nothing is mid-edit there. Landing the head
would only write older values over newer ones.

## Why a hand retire does not work

- **`git merge -s ours` into the flight branch.** The RUNBOOK says merging the parked head into the
  flight branch counts as landing it, so this looked like the additive route. It fails
  `pnpm run ci:merge-integrity`. This firing built the merge as an unreferenced object
  (`git commit-tree HEAD^{tree} -p HEAD -p 09bb4f47`, no ref moved) and ran
  `node scripts/ci/check-merge-integrity.mjs <merge>~1..<merge>`. It exited red:

  ```
  parent 1 (09bb4f47) has 2 line(s) it ADDED that this merge does not contain:
    | Firing-Prompt-Version (current) | `firing-v15` |
    | This card last reviewed against the above | 2026-09-19 |
  ```

  That check exists for exactly this move (`scripts/ci/check-merge-integrity.mjs`, header
  comment). A merge that resolves the conflict by keeping HEAD's lines drops the same two lines
  and fails the same way. Adding a ledger entry to quiet it is forbidden by that file's own rule
  ("never add one to quiet a live loss").
- **Resetting or deleting the branch.** `git reset --hard` and `branch -D` are refused by this
  flight's guard, and the branch is a parked sibling's lane, not this firing's.
- **The engine's own move-aside.** At a lane's next launch `apps/dashboard/src/fly.ts` (the
  `🪺 parked head moved aside` path, around line 672) keeps the head under
  `refs/autopilot/parked/<lane branch>/<sha8>` and resets the lane onto the shared tip. The
  RUNBOOK §"A lane parked with an unverified head" describes it. Nothing triggers it on demand,
  because it runs inside `fly`'s launch.

## One finding for the card's owner

The 2026-10-05 debrief held the `firing-v17` to `firing-v18` edit back on the fear that it would
collide with this checkpoint "whenever fleet-7 next flies or its head is hand-recovered". Neither
path merges the head into the flight branch. The move-aside resets the lane away from it, and a
hand recovery already conflicts on the card today, with or without a v18 edit. So the parked head
is not a reason to leave the card behind. Fleet-3 holds the live claim on the card's refresh,
`docfresh-docs-model-card-md-1791205499000`. That suffix, read as epoch milliseconds, is the commit time of
`331d2ab5` ("the pinned eval suite reads an unpriced firing as null, not $0",
`packages/store/src/eval-gate.ts`, 2026-10-05). The earlier `prompt.ts` row, suffix 1791193730000,
belongs to `127d55ab`. One review of the card against both subjects, which also bumps §6 to
`firing-v18`, clears both rows. This firing left `docs/MODEL-CARD.md` alone, since it is fleet-3's.

## VERDICT

**Blocked on the lane's next launch, not closeable by hand.** The checkpoint is verified stale and
fully superseded, so nothing is lost when the engine moves it aside. The retire is a launch-time
engine step that a firing cannot perform without tripping `ci:merge-integrity` or the guard.
`ap-mv2mq1f4-0` stays open until a flight launches fleet-7 and `git for-each-ref
refs/autopilot/parked/autopilot/flight-worktree-fly-autopilot--fleet-7` shows the head kept aside.
Whoever launches that lane can then close it.

## Verification note for this firing's own METRICS

This is a docs-only unit: this debrief plus the regenerated `docs/debriefs/README.md` index
(`node scripts/docs/generate-debriefs-index.mjs`). `docs/` is excluded from `prettier --check .`
and from ESLint's configured `files` globs. No ref was created, moved or deleted, and the probe
merge object was never referenced. No claimed or unlanded sibling file was edited.
