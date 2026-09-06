<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief: a live `git commit`-vs-`git commit` race on the shared primary checkout preempted this firing's own attempted landing (2026-09-06)

Board: `ap-mtq0i8jd-3` ("Investigate concurrent-flight writes to one shared checkout").
That task was already closed this session by
`docs/debriefs/2026-09-06-primary-checkout-collision-recurs-live-blindspot.md`
(landed as `b68755e3`). This is a narrower follow-up: while attempting to land that
exact debrief, this firing's own `git commit` was itself preempted by a second,
concurrent process committing the identical staged content first — a distinct failure
shape from the stash-collision and commit-bundling cases already on record, worth
its own note because it demonstrates the race can happen on the commit boundary
itself, not just on working-tree edits.

## Sequence, in order

1. This firing found `docs/debriefs/2026-09-06-primary-checkout-collision-recurs-live-blindspot.md`
   already staged (`git status` → `new file:`), left over from an interrupted prior
   firing in this same primary checkout. Its factual claims were independently
   re-verified against live git state (`627b687b`'s stat, `git worktree list`,
   the stash entry, `touchingFiles()`'s line number, `bb9bceb6`'s content) before
   proceeding — all confirmed accurate.
2. First landing attempt: `git commit -m "..."` with a hand-written `Signed-off-by:`
   trailer in the message body. This was rejected before touching git history, by a
   tool-layer guard (not a git hook) that flags hand-typed DCO trailers and requires
   `-s` instead. No commit, no side effect.
3. Second attempt: `git commit -s -m "..."` (a different message than what ultimately
   landed). Its output was **not** the normal `[branch hash] <subject>` success banner —
   it printed the "changes not staged for commit" status for two unrelated files
   (`apps/dashboard/src/flight/mirror-pass.ts`, `.../test/flight/mirror-pass.test.ts`,
   both pre-existing live edits from a different, still-running process working the
   mirror-pass epic — confirmed untouched by this firing) and nothing about the
   debrief file at all.
4. `git log -1` immediately after showed `b68755e3`, subject
   `"docs(debriefs): catch a live commit-bundling collision + fleet-digest blind spot
   (ap-mtq0i8jd-3)"` — a message this firing never wrote. `git show --stat b68755e3`
   confirmed its tree is exactly the same 177-line debrief file this firing had
   staged and verified; `git show b68755e3:<path>` matched byte-for-byte.
5. `git reflog` shows exactly **one** new entry between `627b687b` and `HEAD`:
   `b68755e3 HEAD@{0}: commit: ...`. `git show -s --format="%H %ai"` puts its
   timestamp at `2026-09-06 20:38:47 +0300`.
6. Ruled out a message-rewriting hook as the explanation: `.husky/commit-msg` only
   runs `pnpm commitlint --edit "$1"` (validation, not rewriting); no
   `.husky/prepare-commit-msg` exists at the top level (only husky's default `_/`
   shims, which are inert unless a real hook file invokes them).

## Conclusion

The only consistent explanation: a second, concurrent process — operating in this
exact same primary checkout, sharing the same `.git` index — read the same staged
file this firing had found, generated its own commit message, and ran `git commit`
a moment before this firing's own `git commit -s` executed. Git's index locking
prevented any corruption or interleaving of content (the landed tree is clean and
correct), but the practical effect is that this firing's own commit **silently
became a no-op** for that path — no error, no conflict marker, just an empty diff
where a file used to be staged. A firing that assumed its `git commit` had
succeeded because it exited zero, without checking `git log`/`git show` afterward,
would have reported a commit hash or message it never actually authored.

This is a new variant of the same root cause already tracked at `ap-mtm4qzty-1`
(the open architecture decision on primary-checkout sharing): prior instances of
this failure showed *working-tree* writes racing invisibly; this one shows the
*commit* operation itself racing, with git's own locking silently absorbing the
loser's attempt rather than erroring it out. No new mitigation is proposed beyond
the three-way choice already open at `ap-mtm4qzty-1` — this is additional evidence
for how wide that gap is, not a new decision point.

## Verification note for this firing's own METRICS

Because `b68755e3` was not authored by this firing's own `git commit` invocation
(confirmed via reflog and the unfamiliar commit message), this firing does not
claim it as shipped work. The content is correct and already verified independently
above and in the commit this debrief documents. This file itself — added with a
scoped `git add <path>` (never `-A`) specifically to avoid ever bundling the live
`mirror-pass.ts`/`mirror-pass.test.ts` edits sitting unstaged in this same
checkout — is this firing's actual, attributable unit of work.
