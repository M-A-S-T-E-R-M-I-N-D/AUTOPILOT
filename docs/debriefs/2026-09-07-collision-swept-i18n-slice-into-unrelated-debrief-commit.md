<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief: a live collision swept this firing's i18n slice into an unrelated sibling's commit — the sibling's commit was itself about this exact hazard (2026-09-07)

Board: `web-msnsndki-dz3vn1` ("i18n foundation + HEBREW"). This firing picked the
topmost board item, found a concrete next slice via `pnpm i18n:untagged` (the
per-project "Project not found" empty state — `renderProjectPage()`'s two
untagged `el()` nodes in `apps/dashboard/src/web/shell.ts`), wrote a failing
regression test first (TDD), implemented the fix (`data-i18n="projectNotFound"`
/ `data-i18n="projectNotFoundBody"` plus matching English/Hebrew entries in
`packages/tokens/src/strings.ts`), and verified it green. It never got to run
its own `git commit` for that work — a live collision on this shared primary
checkout did it first, and did it for real, not by losing the work.

## What happened, in order

1. Edited and verified three files: `apps/dashboard/src/web/shell.ts`,
   `packages/tokens/src/strings.ts`, `apps/dashboard/test/web/project-page-i18n.test.ts`.
   `git diff --stat` confirmed exactly those three files, 60 insertions, matching
   intent.
2. Between verification and commit, `git status`/`git diff` flapped repeatedly —
   sometimes showing all three files with the fix, sometimes showing a fully
   clean tree with the fix gone from disk, sometimes showing `shell.ts` mixed
   with a second, unrelated hunk (a `projectCardStates` per-project card-diff
   cache, a live sibling's own in-progress "chips repaint identical facts"
   fix, epic 0018 slice 1). `git log`/`git reflog` explained the clean-tree
   readings: `HEAD` was moving underneath this firing — `978c35d1` (a launcher
   smoke-test commit, unrelated) landed while this firing was mid-edit,
   preceded by reflog entries showing `reset: moving to HEAD` around a
   cherry-pick+amend, the same shape `docs/debriefs/2026-09-07-hard-reset-
   destroys-uncommitted-work-live.md` (below) documents from the other side.
3. Rather than fight the working tree, this firing staged its `shell.ts` hunk
   in isolation via a hand-built patch and `git apply --cached --check` /
   `git apply --cached` (index-only, never touches the working tree — the same
   non-destructive technique `docs/debriefs/2026-09-06-primary-checkout-live-
   collision.md` recommends over `git stash`), then `git add`ed the other two
   files once confirmed intact, re-verifying each time a file's content
   reverted mid-sequence and had to be reapplied.
4. A `git restore --staged` was needed once too: a sibling's own `git add`
   landed a fourth, unrelated file
   (`docs/debriefs/2026-09-07-hard-reset-destroys-uncommitted-work-live.md`)
   into this session's shared index before this firing could commit — evidence
   that the INDEX itself, not just the working tree, is shared and mutated
   concurrently on this primary checkout, a sharper variant than either prior
   debrief's "working tree only" framing.
5. Before this firing's own commit ran, `HEAD` advanced to `abc3250f` — the
   sibling's own commit, titled `docs(debriefs): hard reset destroys
   uncommitted work live — new ap-mtm4qzty-1 failure shape`. Checking `git show
   abc3250f --stat` afterward showed **four** files, not the one the sibling's
   own commit message describes: `apps/dashboard/src/web/shell.ts` (+8/-2),
   `apps/dashboard/test/web/project-page-i18n.test.ts` (+50), and
   `packages/tokens/src/strings.ts` (+4) — exactly this firing's three-file
   i18n diff — alongside the sibling's actual intended new debrief file. The
   sibling's own commit body even names the symptom without identifying the
   cause: "A second concurrent sibling was independently editing unrelated
   files (post-push-verdict.ts, project-page-card-dedup.test.ts,
   projectNotFound strings) at the same moment" — correctly observing this
   firing's edits as foreign, but still swept them into its commit anyway.

## Why this is a new, sharper variant

Every prior entry in this hazard's chain (`docs/debriefs/2026-09-06-primary-
checkout-live-collision.md`, its "-recurs-live-blindspot" sibling, and
`2026-09-07-hard-reset-destroys-uncommitted-work-live.md`) frames the bundling
risk as a *hypothetical* to guard against (paths always excluded here via
pathspec-scoped `git add`/`git commit`) or a *loss* (a hard reset wiping
uncommitted edits with no trace). This firing supplies the missing middle
case, live: a **commit that neither lost the foreign edits nor stayed clean of
them** — it silently absorbed a complete, correct, unrelated feature into its
own tree while its commit message and diff-stat expectation named only its own
file. Two consequences distinct from the already-documented shapes:

- **No data was lost** (unlike `2026-09-07-hard-reset-...`) — this firing's
  code is fully present, tested, and correct on `HEAD` right now. But it is
  **misattributed**: authored and verified by this session, landed under a
  different session's commit hash, subject line, and (by omission) authorship
  narrative.
- **The absorption happened despite the absorbing commit being explicitly
  about not absorbing foreign work** — the sibling's own commit message
  *identifies* this firing's files as a distinct concurrent actor's edits in
  its prose, while its actual `git add`/`git commit` invocation swept them in
  regardless. Naming the hazard in a commit message is not the same as
  guarding against it in the commit command.

## Verification performed this firing

Re-ran the full targeted suite against current `HEAD` (`abc3250f`, still
`HEAD` at the time of this check) after the collision settled:
`apps/dashboard/test/web/project-page-i18n.test.ts` (5/5),
`apps/dashboard/test/tooling/find-untagged-strings.test.ts` (17/17),
`packages/tokens/test/strings.test.ts` (8/8), `packages/tokens/test/locales.test.ts`
(9/9) — 39/39 green. The swept-in i18n slice is correct and complete as
landed; no follow-up fix is needed for the code itself.

## Action taken

None beyond this documentation. This firing's own three-file diff has nothing
left to commit (it is already byte-identical to `HEAD`). No attempt was made
to amend, revert, or re-author `abc3250f` — that would rewrite a commit this
firing does not own, on a shared branch, for a purely cosmetic attribution
fix with zero functional benefit. `git add`/`git commit` for this file alone,
pathspec-scoped, to avoid repeating the exact failure this file describes.

## Verdict

`web-msnsndki-dz3vn1`'s "Project not found" i18n slice is **done** — verified
shipped on `HEAD` via `abc3250f`, even though this firing did not author that
commit. The broader `ap-mtm4qzty-1` primary-checkout-collision hazard remains
**open, operator-owned** (unchanged three-way decision: lock-check every raw-git
session, mandatory worktree isolation, or accept bounded risk) — this entry adds
the "commit that names the hazard yet still commits the bundle anyway" data
point to that already-substantial evidence trail.
