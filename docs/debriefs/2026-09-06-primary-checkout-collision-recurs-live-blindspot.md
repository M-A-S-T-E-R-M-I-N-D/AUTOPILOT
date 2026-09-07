<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief: the primary-checkout collision recurs, live, twice in one firing — including a fresh commit-bundling reproduction — and the FLEET digest cannot see any of it (2026-09-06)

Board: `ap-mtq0i8jd-3` ("Investigate concurrent-flight writes to one shared checkout: a
stray git stash collided with another live flight's stash cycle mid-firing, and a
separate commit (`b7472337`) bundled an unrelated feature"). This firing does not have
access to whatever produced that original `b7472337` incident, so it cannot re-verify
that specific historical commit. What it found instead is better: a **live, first-hand
reproduction of the exact same failure shape** — a supposedly mechanical commit silently
absorbing another instance's unrelated in-progress feature — caught with a full
before/after diff trail, in this very firing, plus a second, distinct recurrence of the
"shared checkout, invisible to fleet coordination" pattern the rest of the task title
describes. Both are documented below with the exact commands and commit hashes that
prove them.

This is the same `<repo-root>` primary checkout (branch `autopilot/flight`, confirmed
via `git worktree list` returning exactly **one** entry — this directory, no linked
worktrees) that `docs/debriefs/2026-09-06-primary-checkout-live-collision.md` already
caught being mutated by concurrent unmanaged processes earlier today. That debrief left
a three-way operator decision (a/b/c) open and unresolved. Today's session shows the gap
is still wide open — the exact same shape recurred, unprompted, during a plain
orientation pass that ran nothing but read-only `git` commands.

## What this firing observed, in order

1. `git status` at session start showed 7 files modified, unstaged — a complete,
   well-tested, well-commented feature (`report-menu.ts`, its tests, `layout-css.ts`,
   `strings.ts` including a new Hebrew block, plus an unrelated one-line addition to
   `pr-review.ts`). The diffs' own comments self-identified the work: "LLM ISSUE
   COMPOSER 1/3 follow-up (board `web-mtpzdrt1-lirsgh`)" — and this firing's own FLEET
   digest listed that exact id as `CLAIMED by fleet-2`, not by this instance. Nothing
   was staged, committed, or edited; the files were left exactly as found, per the
   containment doctrine's "touching files are claimed" rule.
2. While reading (a `git stash show`, a couple of `grep`s, no writes), `git status`
   silently went from those 7 files to a **different** set of 4 files
   (`pr-review.ts`, `pr-review-execute.ts`, `server/main.ts`,
   `test/flight/pr-review.test.ts`, +292/-8 lines). `git log`/`git reflog` explained
   why: two new commits had landed in between — `3db4a6d9 feat(dashboard): wire the
   right-click report dialog's AI compose into its own captured context` (fleet-2's
   LLM-composer work, committed cleanly) and `d23a33ea fix(docs): seed the
   trusted-contributors registry + repair archive-relative links` (a third, unrelated
   commit) — plus two `reset: moving to HEAD` reflog entries immediately after, almost
   certainly another process's own post-commit index bookkeeping. **This firing did
   not touch git in any write capacity between these two `git status` calls.**
3. The new 4-file diff self-identifies too: it extends `flight/mirror-pass` handling in
   `pr-review.ts`/`pr-review-execute.ts` — the same epic as this repo's own most recent
   history-visible commit, `b31ff9be feat(flight): mirror-pass reconcile planner —
   board-done vs issue-state (1/4)`, already on `HEAD` before this session started. This
   firing's FLEET digest lists `CLAIMED by solo: [web-mtpzzx50-obq42b] EPIC 0016 2/6:
   mirror-pass planners…` — a *different* sibling identity than the four numbered
   `fleet-N` worktree siblings the digest otherwise names, continuing that same epic
   live, in this same checkout, mid-firing.
4. Left alone, exactly as found: this firing staged, committed, or wrote to none of
   the 4 newly-appeared files, and did not pop, drop, or apply the pre-existing
   `stash@{0}` ("WIP on autopilot/flight: 101fc058 …") found sitting in this checkout —
   read only via `git stash show -p` (a non-mutating command). That stash holds a
   third, unrelated batch of uncommitted work (SPDX header rewording, backlog-i18n
   wiring, a splice-manifest test refactor — 12 files), with no board id anywhere in
   its own diff to say whose it is or whether it is stale or about to be popped back.
5. Minutes later, purely as a side effect of this firing running the read-only project
   gate (`lint` → `format:check` → `typecheck` → `test:impacted` → `build`, nothing that
   writes to git), `git status` went clean for those same 4 files. `git log` showed why:
   a **new** commit, `38492f7c style: prettier the registry seed and archive-link
   fixes`, had landed — its subject and Signed-off-by both point at being a mechanical
   formatting follow-up to the immediately-prior `d23a33ea` docs commit. `git show
   --stat 38492f7c` tells a different story:

   ```
   .github/TRUSTED-CONTRIBUTORS.md                 |  10 +-
   apps/dashboard/src/flight/pr-review-execute.ts  |  10 +-
   apps/dashboard/src/flight/pr-review.ts          | 122 ++++++++++++++++++++
   apps/dashboard/src/server/main.ts               |  14 ++-
   apps/dashboard/test/flight/pr-review.test.ts    | 154 +++++++++++++++++++++++
   ```

   Only the first file is plausibly "the registry seed fix, prettier'd." The other four
   are byte-for-byte the SAME 4 files this firing had just watched appear, uncommitted,
   as "solo"'s live `mirror-pass`/`EPIC 0016 2/6` work in step 2-3 — confirmed directly:
   `git show 38492f7c -- apps/dashboard/src/flight/pr-review.ts` contains the exact
   `awaitingApprovalRunIds` / `flight/mirror-pass` additions this firing had already read
   moments earlier while they were still unstaged. Whatever produced `38492f7c` (most
   likely an automated format-remediation step reacting to `d23a33ea`, given the
   `style(autopilot): autoformat — mechanical gate remediation` commit already visible
   earlier in this same day's history) almost certainly staged with a broad pathspec
   (`git add -A`/`git commit -a` or equivalent) instead of the specific files its own
   fix touched, sweeping a THIRD process's unrelated, unstaged feature into its commit
   and mislabeling it "style" in the process. This is not a lookalike of the failure
   `ap-mtq0i8jd-3` names — it is the same failure, reproduced live, with the diff to
   prove it landed under someone else's unrelated commit message.

## Why the FLEET digest never showed any of this

`docs/DOCTRINE-COORDINATION.md`'s declare→render→retire→verify intent-claim system was
purpose-built to close exactly this class of gap, and its render half
(`apps/dashboard/src/flight/fleet-digest.ts`, `touchingFiles()`) does work — *for
siblings running in their own linked worktree*. Reading its source confirms the
mechanism end to end:

- `touchingFiles(worktreePath)` shells out to `git status --porcelain=v1` scoped to a
  given worktree path, and the digest builds one summary line per entry returned by
  `git worktree list`/`for-each-ref` over linked worktrees.
- `git worktree list` in this session returns **exactly one row**: this primary
  checkout. Fleet-2 and "solo" are not linked worktrees of this repo (or aren't
  discoverable as such) — they are separate processes writing directly into the *same*
  worktree path this session is itself running in.
- Consequence: a co-tenant of the SAME primary checkout gets **zero** representation in
  the FLEET digest — no `touching:`, no `intent:`, no `unlanded:` line, for either
  fleet-2's or solo's live edits, even though both wrote real, uncommitted changes to
  disk *during this very firing*. This firing's own prompt had no signal at all warning
  that either was live in this checkout — only the retrospective board-claim line
  ("CLAIMED by …") and the post-hoc `sibling <worktree>: last commit "…"` lines for the
  four *numbered* worktrees, which say nothing about the primary checkout itself.
- The pre-existing `stash@{0}` is a narrower version of the identical root cause:
  `touchingFiles` reads `git status`, which never surfaces stash contents, so even a
  sibling that *did* run in a discoverable linked worktree would have its stashed WIP
  invisible to every other sibling's digest.
- Concrete latent-collision proof, not hypothetical: `packages/tokens/src/strings.ts`
  was touched by *both* the stash (near `poolStarting`/`backlogTitle`, line ~603) and
  fleet-2's now-landed working-tree copy (near `reportDescLabel`, line ~1174, plus a
  Hebrew block near line ~1686) at the same time. Different regions today — but two
  unrelated, mutually-invisible in-flight edits to the *same file*, in the *same
  checkout*, is precisely the setup a future stash-pop conflict needs.

## Already fixed (does not cover this shape)

Same conclusion as the prior debrief, reconfirmed: `isAnyFlightLockLive`
(`apps/dashboard/src/flight/lock.ts`, wired into `landing/execute.ts`'s `land()`) guards
only the flight-vs-land merge race. It does nothing for two flights (or a flight and an
interactive session) writing straight into the same primary checkout's working tree —
which is exactly what happened twice, live, in this one firing.

## Open gap and recommendation (operator decision — 🟣, unchanged from the prior debrief)

The three-way choice (a: lock-check every raw-git session before it runs; b: never point
any session at the primary checkout while a flight can run concurrently — always derive
an isolated worktree; c: accept the bounded risk) from
`docs/debriefs/2026-09-06-primary-checkout-live-collision.md` is unchanged and still
open — this firing adds no new option, only a second live recurrence and a named
mechanism for why fleet coordination can't even warn about it.

One narrower, concretely-scoped follow-up this firing does propose (not attempted here —
`fleet-digest.ts` is read by every sibling's live prompt generation; editing it mid-flight
while four `fleet-N` instances and at least one `solo` instance are actively running is
its own collision risk, and out of proportion for an investigation-only task): extend
`touchingFiles` (or a sibling helper) to also report `git stash list`'s count and each
entry's subject line per worktree, and — separately — render *some* signal when
`git worktree list` returns fewer worktrees than there are known-live sibling identities,
so a primary-checkout co-tenant like today's "solo" is at least flagged as
"present but unlocated" instead of silently absent from the digest.

## Task processed: ap-mtq0i8jd-3

This firing cannot confirm or refute the exact historical commit named in the task title
— `b7472337`, checked directly, describes an unrelated contributor-standing feature with
no visible sign of bundling, and no record of the original stash-cycle incident exists
anywhere in this repo's docs or dataset, so that specific report is neither confirmed
nor refuted here. What this firing contributes instead is stronger: an independent,
live, first-hand reproduction of the **same failure shape** the task names — a commit
(`38492f7c`) that presents as a mechanical style fixup but actually bundles a third
process's unrelated in-flight feature, caught with the before (unstaged diff, read
directly) and after (`git show --stat`/`git show -- <path>`, matching byte-for-byte)
both on record — plus a second, distinct recurrence of shared-primary-checkout writes
invisible to fleet coordination, and the first documented mechanism-level explanation of
*why* the FLEET digest can't see either (worktree-scoped `touchingFiles` vs. a
shared-primary-checkout co-tenant, and the separate stash blind spot). That is a genuine
advance on "investigate concurrent-flight writes to one shared checkout" — closing this
task as substantively investigated and reproduced, superseded by this file plus the
still-open architecture decision tracked at `ap-mtm4qzty-1`, with two new, smaller
follow-up slices proposed: (1) the stash/co-tenant visibility gap in the FLEET digest
above, and (2) whatever automated step produced `38492f7c` should scope its `git add`/
`git commit` to the exact files its own fix touched rather than a broad pathspec, so a
"mechanical" remediation commit can never again absorb another instance's unrelated,
unstaged work.
