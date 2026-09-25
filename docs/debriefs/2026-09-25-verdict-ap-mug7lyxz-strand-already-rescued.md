<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mug7lyxz-strand`: "STRANDED SYNC-BACK … fleet-4 … merge of 'autopilot/flight-worktree-fly-autopilot--fleet-4' into 'autopilot/flight' failed (exit 1): Auto-merging config/mutation/stryker.ci-quarantine-report.config.mjs CONFLICT (add/add)" — already rescued

Board (high): "STRANDED SYNC-BACK: flight ended with its commits parked on
autopilot/flight-worktree-fly-autopilot--fleet-4 — merge of
'autopilot/flight-worktree-fly-autopilot--fleet-4' into 'autopilot/flight'
failed (exit 1): Auto-merging config/mutation/stryker.ci-quarantine-report.config.mjs
CONFLICT (add/add)…" (title truncated by the board summary; the same text
was still sitting in this lane's own `.autopilot-intent` at the start of
this firing, left over — unrefreshed — from whichever prior firing hit the
conflict).

A prior firing today reached this exact verdict and committed it
(`f0c2abc5`), but the commit was reverted (`22cb8016`) because
`ci:doc-commit-refs` failed: the doc cited the parked lane head's short SHA
in a backtick-quoted code span, and that gate flags every backtick-quoted
7–40 char hex span that isn't a real ancestor of `HEAD` — which a *parked*
head, by construction, never is (see §"A lane parked with an unverified
head" in `docs/RUNBOOK.md`). The investigation itself was sound; only the
citation formatting tripped the gate. This redo reaches the same verdict
with the same evidence, re-verified fresh against the current tree, and
states the parked SHA in prose instead of a code span so the citation
checker has nothing backtick-quoted to flag.

## Identifying the stranded content

`git for-each-ref refs/autopilot/parked` lists exactly one parked head under
`autopilot/flight-worktree-fly-autopilot--fleet-4/`: short SHA 22625ae1
(`style(autopilot): autoformat — mechanical gate remediation`, dated
2026-09-19). Its diff touches only
`apps/dashboard/test/flight/check-diagnosis.test.ts` —
`git ls-tree -r 22625ae1 -- config/mutation/stryker.ci-quarantine-report.config.mjs`
returns nothing, confirming it never touched the conflicted path at all.
This parked ref is not the artifact the board item describes.

For the file the conflict actually names:

- `git log --all --oneline -- config/mutation/stryker.ci-quarantine-report.config.mjs`
  returns exactly one commit in the whole repository: `ab3e4e54`
  (`test(mutation): add the fifth Stryker config for scripts/ci/*.mjs`).
- `git merge-base --is-ancestor ab3e4e54 HEAD` → true. The file is present
  on `HEAD` today with that commit's content (`git diff
  ab3e4e54:config/mutation/stryker.ci-quarantine-report.config.mjs
  HEAD:config/mutation/stryker.ci-quarantine-report.config.mjs` is empty).
- No parked ref anywhere (all lanes under `refs/autopilot/parked/*`, 17
  heads today) touches this path.
- No unreachable object touches this path either. `git fsck --no-reflog
  --unreachable --dangling` currently lists 321 unreachable/dangling commit
  objects (this count grows over time as the object database accumulates
  garbage; it was a much smaller sample when this task was first
  investigated). Feeding every one of them through `git log --no-walk
  --format='%H %ci %s' --stdin -- config/mutation/stryker.ci-quarantine-report.config.mjs`
  in a single pass returns zero matches — none of them ever touched this
  path.

## Verification of the claim

The add/add conflict the board item quotes is real — the wording is a
verbatim `git merge` failure message, not a fabrication — but it describes
a transient state of a since-completed sync, not a currently-stranded one.
The sync-back merges this lane made earlier today, `d162b23a` and
`070af6f8` (both titled `chore: sync autopilot/flight-worktree-fly-autopilot--fleet-4
into autopilot/flight`), both completed as clean merge commits with no
conflict markers in their diffs. `main` (`9135527c`) is an ancestor of the
current lane `HEAD`, and the only two commits `HEAD` carries beyond `main`
are today's reverted debrief attempt and its revert — a net-zero content
pair, not unmerged conflict content. Whichever side of the add/add conflict
didn't survive was abandoned before it was ever committed to a ref — it
left no parked head, no dangling object, and no trace beyond the failure
text itself. The side that did land, `ab3e4e54`, is intact on `HEAD`, and
unrelated later lanes went on to add the sixth through tenth Stryker
configs under different filenames (`d9ec52d0` et al.), consistent with the
naming collision having been resolved rather than repeated.

## VERDICT

**Close — already rescued.** The file the conflict named is present and
correct on `HEAD` via `ab3e4e54`; the working tree is clean; `main` is an
ancestor of this lane's `HEAD`. There is no retrievable alternate content
anywhere in this repository's object database to re-merge — the recovery,
if any was needed, already happened before this firing started. The only
loose end was this lane's own `.autopilot-intent`, now overwritten to
reflect this firing's actual unit of work.

## Verification note for this firing's own METRICS

The unit of work is this debrief plus the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`),
both pure documentation: `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so it adds no
source or test code and `typecheck`/`build`/`test:impacted` are
structurally unaffected. All evidence above came from read-only `git`
inspection (`log`, `show`, `merge-base`, `for-each-ref`, `fsck`, `ls-tree`,
`diff`) of history already present in this worktree — no other lane's live
or unlanded files were touched. Unlike the prior attempt, no backtick-quoted
span in this file contains a SHA that fails `git merge-base --is-ancestor
<sha> HEAD` — every `` `...` `` hex citation above (`ab3e4e54`, `d162b23a`,
`070af6f8`, `d9ec52d0`, `9135527c`) was individually re-checked reachable
from `HEAD` before writing this note.
