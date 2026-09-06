<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief: caught the primary-checkout collision live (2026-09-06)

Board: ap-mtm4qzty-1 ("Multiple concurrent claude/node processes are
committing to the PRIMARY (non-worktree) AUTOPILOT directory simultaneously,
silently discarding uncommitted edits and duplicating landed work —
investigate"). This firing did not fix it — it caught the exact failure mode
red-handed, in this very session, and records the evidence plus what remains
open after the existing partial fix.

## What this firing observed, in order

1. On start, `git status` in `Z:\Claude\AUTOPILOT` (this session's own working
   directory — the live checkout, branch `autopilot/flight`, **not** a linked
   worktree; confirmed via `git worktree list` returning only the primary)
   showed a full feature staged: 8 files implementing "LLM ISSUE COMPOSER
   2/3" (a free-text note → `/api/report/compose` → title/body fill-in on the
   CONNECT panel's GitHub-issue form). That task was listed in this same
   firing's FLEET board as `CLAIMED by fleet-2`, not by this instance.
2. `git reflog` showed `HEAD` had already advanced past the snapshot the
   firing prompt was generated from — from `db9a2634` to `76115173`, a
   **second** commit titled `docs(self-study): flight-end automated data
   refresh` (same subject line as an earlier commit two revisions back) —
   i.e. another process had committed to this exact checkout after the
   prompt's git snapshot was taken and before this session's first read.
3. To avoid bundling fleet-2's unverified, unrelated staged work into
   whatever this firing committed (`git commit` always commits the full
   index, not just a given pathspec's paths — a pathspec restricts which
   *working-tree* changes get folded in, it does not exclude content
   *already staged* for other paths), this firing ran a purely index-level,
   content-preserving `git restore --staged` on the 8 contaminated paths.
   That command touches only the index, never the working tree, so nothing
   written to disk was at risk.
4. Immediately after, `git status --short` came back **completely clean** —
   not "modified, unstaged" as `restore --staged` alone should leave a
   normal file, but byte-identical to `HEAD`. Re-running `git log` explained
   why: `HEAD` had moved *again*, twice, in the few seconds between steps
   1–3: `76115173` → `6409eee0` (`feat(github): add free-text compose to the
   report-to-upstream issue form` — fleet-2's own clean commit of the exact
   feature that had been sitting staged) → `0980c47e` (`fix(security):
   connection.json gets a REAL owner-only ACL on Windows` — a **third**,
   unrelated process's commit, nothing to do with fleet-2's task).

That is the bug, live: at least two other processes committed to this
session's own working directory while this session was merely running `git
status`/`git log`/`git diff` against it. No data was lost this time only
because this firing chose the non-destructive `restore --staged` over a
`git stash` or a same-pathspec commit — a stash taken between steps 2 and 3
would have yanked fleet-2's in-flight work out from under its own process
moments before that process committed it cleanly.

## Already fixed (does not cover this shape)

`apps/dashboard/src/flight/lock.ts`'s `isAnyFlightLockLive` (wired into
`apps/dashboard/src/landing/execute.ts`) already closes the **flight-vs-land**
race: `land()` now scans every `engine-*.lock` file for this project, across
every instance id, before checking out/merging the base branch, instead of
only consulting the dashboard's own in-memory `FlightRunnerRegistry`. See
that function's own "ROOT CAUSE" docstring for the original gap.

That fix guards one call site: the dashboard's `land()` flow. It does
**nothing** for the shape observed above — an interactive/manual agent
session (this one) running raw `git` commands directly against the primary
checkout has no lock check anywhere in its path. `fly.ts`'s
`FileInstanceLock` prevents two `fly.ts`-spawned flights from racing each
other, and `isAnyFlightLockLive` prevents `land()` from racing a live flight,
but nothing prevents a *third kind* of actor — any process, human or agent,
running plain `git`/file operations straight against
`Z:\Claude\AUTOPILOT` — from doing so while a lock-holding flight is also
mid-commit there. That third kind is exactly this session.

## Open gap and recommendation (operator decision — 🟣)

The durable fix is a choice between:

- **(a)** Make every session that can run raw git against a project's root —
  including this kind of interactive/manual firing — check
  `isAnyFlightLockLive`-equivalent state before it runs, and refuse (or wait)
  if the project's checkout is locked by a live flight elsewhere.
- **(b)** Never point an interactive/manual session at the primary checkout
  while any flight for that project can be running concurrently — always
  derive and use a `deriveWorktreePlan`-style isolated worktree instead, the
  same isolation `docs/FLIGHT-CONTAINMENT.md` item 4 already mandates for
  `fly.ts`-spawned flights, extended to this session type too.
- **(c)** Accept the current risk as bounded (git's own atomicity means a
  race can duplicate or interleave commits, as seen twice in this log, but
  git has not yet been observed *losing* a committed object — only
  uncommitted, in-memory-only edits are actually at risk, and those are
  bounded to whatever a single firing holds uncommitted at any moment).

This firing takes no position beyond documenting the reproduction — the
fix's shape (session-level lock check vs. mandatory worktree isolation for
every session type) is a real architecture decision, not a small patch, and
belongs to whoever owns the fleet/session dispatch layer.

## Verification criterion for closing ap-mtm4qzty-1

Re-run with two or more instances intentionally pointed at the same
project's primary checkout (not worktrees) and confirm: (1) no committed
object is ever lost — every commit any instance made is reachable from some
ref or the reflog — and (2) no instance's uncommitted index/working-tree
state is silently discarded by another instance's git operations. Today,
(1) held by luck of timing in this session; (2) was never actually tested
end-to-end because this session deliberately avoided any operation that
could have discarded another process's uncommitted state.
