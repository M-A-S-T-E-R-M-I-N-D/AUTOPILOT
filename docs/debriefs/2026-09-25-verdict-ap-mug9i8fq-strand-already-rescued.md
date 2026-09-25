<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mug9i8fq-strand`: "STRANDED SYNC-BACK … fleet-3 … firing 232 … refused: uncommitted changes remain after the commit" — already rescued

Board (high): "STRANDED SYNC-BACK: flight ended with its commits parked on
autopilot/flight-worktree-fly-autopilot--fleet-3 — withheld: firing 232
unverifiable: refused: uncommitted changes remain after the commit —" (title
truncated by the board summary before the rescue ref it names, per
`apps/dashboard/src/fly.ts` line ~1941).

## Identifying the stranded commit

`git for-each-ref refs/autopilot/parked` lists four parked heads under
`autopilot/flight-worktree-fly-autopilot--fleet-3/`. Three are
`wip(autopilot): checkpoint` commits explicitly labelled with firing numbers
that do not match 232 (117, 131, 139 — all dated 2026-09-19, an earlier
round). The fourth, db6e31c3, carries no firing number in its subject
(`docs: refresh MODEL-CARD evidence pointers`) and is dated 2026-09-25
04:05:07+03:00 — today's round, hours before this firing (259) — making it
the only candidate consistent with "firing 232" and with a *normal* commit
(not a checkpoint) sitting next to leftover uncommitted changes, exactly the
`withheld: … refused: uncommitted changes remain after the commit` shape.

## Verification of the claim

1. **db6e31c3 was never merged.** `git merge-base --is-ancestor db6e31c3
   HEAD` returns false — its content never reached `autopilot/flight`. Its
   parent (`ddd8d7dd`, `chore: land autopilot/flight into main`) *is* an
   ancestor of `HEAD`, confirming it branched cleanly off a landed point and
   simply never synced back, matching the stranding description.
2. **Its content already exists on `HEAD` via a different commit.**
   `git log --oneline -- docs/MODEL-CARD.md` shows `d7f77714`
   (`docs: refresh MODEL-CARD evidence pointers`, 2026-09-25 12:16:29+03:00,
   `Co-Authored-By: Claude Opus 5.5 (1M context)`) making the identical
   two-line change (`firing-v12` → `firing-v17`, review date `2026-09-03` →
   `2026-09-25`). Its own commit body says so directly: "Brought over by hand
   from lane fleet-3, where the per-firing gate withheld it only because
   unrelated files were left uncommitted beside it. The prompt version it
   cites, firing-v17, is the current one." `docs/MODEL-CARD.md` on the
   current tree already reads `firing-v17` / `2026-09-25` at lines 106/112.

No recovery action is needed: the parked head named by this task was already
retrieved and its diff re-applied by hand in `d7f77714`, roughly eight hours
after it was stranded and well before this firing. The parked ref itself
(`refs/autopilot/parked/autopilot/flight-worktree-fly-autopilot--fleet-3/db6e31c3`)
is now safe to leave as an inert historical marker — re-merging it would only
reproduce a change already on `HEAD`.

## VERDICT

**Close — already rescued.** The stranded commit's content is present on
`HEAD` via `d7f77714`, landed hours after the strand and independently of
this task. Per `docs/RUNBOOK.md` §"A lane parked with an unverified head",
the parked ref exists precisely so a stranded commit can be recovered by
hand; here that recovery already happened. No further action, no merge, no
re-application — the task is stale by the time it reached the board.

## Verification note for this firing's own METRICS

The unit of work is this debrief plus the regenerated
`docs/debriefs/README.md` index (`node
scripts/docs/generate-debriefs-index.mjs`), both pure documentation:
`docs/` is excluded from `prettier --check .` (`.prettierignore`) and from
ESLint's configured `files` globs (`eslint.config.js` targets only
`*.ts`/`*.mjs`/`*.js`), so it adds no source or test code and
`typecheck`/`build`/`test:impacted` are structurally unaffected. All
evidence above came from read-only `git` inspection of local history
already present in this worktree — no other lane's live or unlanded files
were touched.
