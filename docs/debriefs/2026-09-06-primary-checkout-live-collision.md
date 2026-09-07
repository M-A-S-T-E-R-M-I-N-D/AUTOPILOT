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

1. On start, `git status` in `<repo-root>` (this session's own working
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
`<repo-root>` — from doing so while a lock-holding flight is also
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

## Verdict processed: ap-mtq0bpgj-2 (2026-09-06, firing-119)

Board item `ap-mtq0bpgj-2` is firing-105's own self-issued VERDICT
("primary worktree `autopilot/flight` was actively mutated by ≥1 concurrent
unmanaged process mid-session — unsafe to select/commit"), promoted to a
tracked task. Verified against firing-105's dataset row
(`fly-autopilot--fleet-5:firing-105`, 2026-09-06, `outcome: noop`,
`completion: slice`, `sha: null` — it committed nothing) and against this
file's own reproduction one day earlier: the claim is **CONFIRMED**, not a
false block. It is the same hazard as `ap-mtm4qzty-1` above, and this
firing (firing-119, same day as this debrief) independently reconfirmed it
a further time: `git status` returned a transient staged `M` on an
unrelated file moments into the session, then a fully clean tree on the
very next `git status` call — a sibling instance's own commit landing
cleanly through this primary checkout while this session only read it.
Nothing was lost; the pattern matches items 1-2 above exactly, and is one
more data point toward criterion (2) — no uncommitted state was discarded,
this time by luck of neither session writing during the other's window.

The open gap and its three-way operator decision (a/b/c, above) are
unchanged by this reconfirmation — no new architecture fact emerged, so
this firing takes no new position. `ap-mtq0bpgj-2` closes as **verified,
duplicate of the still-open `ap-mtm4qzty-1` gap**; the durable fix remains
an operator call, not a firing-sized patch.

## Verdict reconfirmed a third time, new flavor: firing-147 (2026-09-06)

`ap-mtq0bpgj-2` still shows as an open, topmost board item in firing-147's
prompt despite the closure above — the board evidently lags behind
debriefs rather than being updated by them, which is itself a minor data
point (closure lives in this file, not in whatever regenerates the board).

This firing hit a **new shape** of the same hazard: not an unrelated
process's commit landing mid-session, but two instances **independently
converging on and redundantly re-verifying the identical abandoned unit of
work**. On start, `git diff` showed uncommitted edits to
`apps/dashboard/test/server/client-bundle-size-budget.test.ts` and
`scripts/ci/check-bundle-size.mjs` (a core-bundle-budget bump,
172/51KB → 176/52KB) left behind by a prior firing that hit the turn cap
before committing. This firing ran the full gate against that diff
end-to-end — `format:check`, `typecheck`, `lint`, a targeted `vitest run`,
`build`, and `test:impacted` — all green — then went to `git add` the two
files. At that point `git status --porcelain` showed them **already clean
against HEAD**: `git log` revealed a new commit, `42b81380`
(`fix(dashboard): raise core bundle budget 172/51KB -> 176/52KB for
LANDING i18n`, timestamped 2026-09-06 23:03:25), with a message, diff, and
provenance trailers (`Model: claude-sonnet-5`, `Firing-Prompt-Version:
firing-v12`, `Harness: claude-cli`) indistinguishable from what this firing
would itself have written. A sibling instance had picked up, verified, and
committed the exact same leftover diff while this firing was mid-gate.

No data was lost — criteria (1) and (2) from above both held again, this
time trivially, since there was nothing left in this firing's working tree
to discard by the time it looked. The new cost is **duplicated
verification work**: two full gate runs (machine time, tokens, wall clock)
spent independently confirming the same three-line budget bump, because
nothing in either session's view of the world showed the other was already
on it — the FLEET claim mechanism covers *board* tasks and declared
in-progress intent, but an *abandoned uncommitted diff from a dead firing*
is neither, so two resuming instances have no signal to deduplicate on.
That gap — no claim/intent visibility over orphaned uncommitted state from
a turn-capped firing — is a candidate fourth item for the operator's list,
narrower than (a)/(b)/(c) above: e.g. a resuming firing could check
whether its target commit sha already exists in `git log` (by diff content
or a checkpoint marker) before spending a full gate run re-verifying it.
This firing takes no position beyond noting the gap; still the same
underlying architecture question as `ap-mtm4qzty-1`, still an operator
call.

## Verdict reconfirmed a fourth time, new flavor: firing-150 (2026-09-06)

`ap-mtq0bpgj-2` was still the topmost board item this firing too — same
board-lag gap noted above. This firing's own reproduction has two parts,
one a repeat shape and one genuinely new.

**Repeat shape (same as firing-147):** on start, `git status` showed an
untracked, fully-written `apps/dashboard/test/web/masthead-census.test.ts`
(118 lines, EPIC 0017 nav remake slice 1/5, board `web-mtq019pd-rj8dsn`) —
leftover work from before this session's context compaction. This firing
independently verified it end-to-end (`vitest run` on the file: 11/11
green, `prettier --check`, `tsc -b`, `eslint .`, `format:check`), staged it
with `git add <path>`, then found `git diff --cached --name-only` came back
**empty**. `git reflog` explained why: `HEAD` had advanced to `9f9d287d`
(`test(dashboard): masthead census — pin every control before EPIC 0017 nav
remake`) — a concurrent process had authored and committed
byte-identical content under a different commit message while this firing
was mid-verification. Confirmed via `git show 9f9d287d` — the diff matches
what this firing had staged exactly. No data lost; duplicated verification
work only, same cost as firing-147's finding.

**New flavor — concurrent mutation corrupting an in-flight gate run:**
immediately after, this same firing ran `pnpm run test:impacted`
(`vitest run --changed HEAD~1`) and got **26 failing tests** across two
files, all `TypeError: writer.paths is not a function` inside
`packages/engine/src/release.ts:388` — a real-looking, widespread breakage
in the release engine. Running the same failing file in isolation moments
later showed only **one** failure (an unrelated, genuinely pre-existing
citation-commit-ordering bug, `web-mtmrh0mv-161chu`, unrelated to any work
in this session). Re-running the exact same `--changed HEAD~1` selection a
second time reproduced only that same single pre-existing failure — the
other 25 had vanished. `ls --time-style=full-iso` on the implicated files
pinned the cause: `apps/dashboard/test/release/execute.test.ts` (23:12:55),
`packages/engine/src/release.ts` (23:13:52), and
`apps/dashboard/src/flight/report-compose.ts` (23:14:02) were all written
by a **third**, still-unidentified concurrent process within the same
one-second window `test:impacted`'s first run started (`Start at
23:14:04`) — a live write racing vitest's module import for those exact
files. That process kept writing throughout this firing's session
(`report-compose-tasks.ts` at 23:19:29, `execute.ts` (src) at 23:21:14,
`release.test.ts` at 23:19:30 — new files, `apps/dashboard/test/flight/
pr-review.test.ts` too, none related to this firing's own task).

This is a previously undocumented consequence of the `ap-mtm4qzty-1` hazard
class: it is not only lost commits or duplicated verification at risk, but
**spurious mass test failures indistinguishable from a real regression**,
produced purely by another live process's file writes landing mid-import.
A firing (or a human) trusting a single red `test:impacted` run against
this primary checkout could easily misdiagnose a phantom regression, revert
innocent work, or burn a full debugging cycle chasing a bug that was never
in the code — directly relevant to this repo's own "gate honesty" thread
(`f1428f9a`). Practical mitigation until the operator resolves (a)/(b)/(c)
above: a `test:impacted`/`test` failure against the primary checkout is not
trustworthy on its own — rerun once before treating a red result as real,
especially when the failure trace touches a file this firing never edited.

No data was lost this time either (criteria (1) and (2) from the original
finding both held again) — this firing touched none of the
concurrently-mutated files and made no destructive git call. `ap-mtq0bpgj-2`
closes again as **verified, duplicate of `ap-mtm4qzty-1`**, with one new
piece of evidence added to the open gap: concurrent primary-checkout
mutation can fabricate transient test failures, not just race commits.

## Verdict reconfirmed a fifth time, caught mid-write: firing-154 (2026-09-06)

This firing's very first `git status` already showed `HEAD` at `b75ff525`
(this file's own "fourth reconfirmation" commit, above) — another full
commit had landed on this checkout between the firing prompt's snapshot and
this session's first read, the same shape as every prior entry.

The new evidence is sharper than any previous entry: this firing polled
`git status --porcelain` three times, three seconds apart, with no git
operation of its own in between, purely to observe. `apps/dashboard/src/
release/execute.ts` read as `M ` (staged, index differs from `HEAD`,
working tree matches index) on the first two polls, then `MM` (staged
*and* further modified in the working tree) on the third. That transition
is only possible if a live process wrote to that file's working-tree copy,
on disk, in the ~3-second gap — not a fast sequence of separate commits
(the prior entries' shape), but a single file caught mid-edit by repeated
reads of the same command. This is the most direct evidence yet that these
are concurrent, uncoordinated *writes*, not just closely-timed *commits*.

The six flapping paths identify the process's own work, not corruption:
`apps/dashboard/src/release/execute.ts`, `apps/dashboard/test/release/
execute.test.ts`, `packages/engine/src/release.ts`, and `packages/engine/
test/release.test.ts` are exactly the `ReleaseWriter.paths()` /
`Releasable.commitPaths` scoped-release-commit fix — the same fix
firing-150 saw mid-flight and blamed for its fabricated `writer.paths is
not a function` failure batch. Reading the diff in place (without staging
or touching it) showed that fix fully formed: `commitAll` replaced with
`commitPaths` on `Releasable`, a `paths()` method added to `ReleaseWriter`,
and a new regression test asserting a release commit "never sweeps an
unrelated uncommitted file" into itself — i.e. the still-unidentified
process from firing-150 is, three firings later, visibly a sibling
finishing legitimate, on-topic work, not noise. Two further paths,
`packages/engine/src/prompt.ts` and `packages/engine/test/prompt.test.ts`,
were also modified (working-tree only, never staged) — unrelated to the
release fix, so either the same process is carrying two units at once or a
second concurrent process is also live.

Action taken: none. This firing staged nothing, edited nothing, and ran no
`git add`/`commit`/`stash`/gate command against any of the six flapping
paths — only this documentation file, which no other process touched, was
edited and committed. No data was lost (criteria (1) and (2) hold a fifth
time). `ap-mtq0bpgj-2`/`ap-mtm4qzty-1` remain **open, operator-owned**; the
(a)/(b)/(c) decision from the original finding is unchanged by this entry.

## Verdict reconfirmed a sixth time, HEAD caught moving mid-poll: firing-173 (2026-09-07)

This firing's first `git status` showed a full feature staged —
`apps/dashboard/src/flight/mirror-pass.ts` +
`apps/dashboard/test/flight/mirror-pass.test.ts`, 236 lines — plus eleven
more files modified-but-unstaged across `packages/engine`, `packages/store`,
`packages/tokens`, `apps/dashboard/src/web/shell.ts`, and the self-study
docs/scripts (529 lines). Rather than touch any of it, this firing polled
`git status --porcelain` twice, five seconds apart, with no git operation
of its own in between: the hash of the porcelain output was identical both
times, but `git log` afterward showed `HEAD` had moved from `08be7a2b` to
`74f43d9a` — a clean new commit, `feat(github): mirror-pass catches internal
doc links that no longer resolve` (EPIC 0016 slice 2, board
`web-mtpzzx50-obq42b`). Its diff matched the staged content exactly; the
sibling authoring it committed cleanly while this firing was merely
reading. Same shape as firing-147/150's "repeat shape" — no data lost,
duplicated-observation cost only (this firing did no verification work to
duplicate, since it never staged or gated the content).

The eleven other files remain unstaged and untouched as of this writing —
a second, still-uncommitted sibling unit (the `shell.ts` change lines up
with this same firing's own FLEET board showing a `CLAIMED by solo`
"calm cockpit ... scroll containers" entry; the engine/store/tokens/
self-study cluster looks like one coherent self-study-pipeline feature,
unclaimed on the visible board). Neither was staged, gated, or committed by
this firing.

New artifact shape, not seen in entries one through five: an untracked,
fully-formed nested git worktree at `.worktree-verify-groupA/` inside the
primary checkout root, confirmed via `git worktree list` (detached HEAD at
`274fd68c`, a full working copy including `node_modules`-adjacent tooling
files). This firing did not enter, read from, or write to it — flagging it
only as a candidate data point for whoever owns the flight-containment
guidance (`docs/FLIGHT-CONTAINMENT.md`) against nesting a sandbox/verify
worktree under a live primary checkout's own root.

Action taken: none against any of the above. Only this documentation file
was read, edited, and committed (pathspec-scoped commit, to guarantee no
accidental sweep of the eleven still-unstaged foreign paths).
`ap-mtq0bpgj-2`/`ap-mtm4qzty-1` remain **open, operator-owned**; the
(a)/(b)/(c) decision is unchanged. One new, sharper data point: `HEAD`
movement is now confirmed reproducible via nothing more than two
read-only `git status` polls a few seconds apart — this is not a rare
timing accident, it is the checkout's steady state under fleet load.

## Verdict reconfirmed a seventh time, a placeholder artifact resolved into a
## staged diff mid-read: firing-178 (2026-09-07)

This firing's first `git status` showed two untracked files —
`.tmp-stashed-rct.ts` and `scripts/ci/launcher-smoke.mjs` — plus unstaged
edits to `.github/workflows/ci.yml` and `package.json` wiring a new
`ci:launcher-smoke` step. `scripts/ci/launcher-smoke.mjs` self-identified as
a complete, working CI smoke test for board `web-mtqanfe4-pil22i` slice
1/2. `.tmp-stashed-rct.ts` was a different shape from anything in entries
one through six: not a normal source file, but a full copy of
`apps/dashboard/src/flight/report-compose-tasks.ts`'s slice-1+2 content
(COMPOSER TARGET=TASKS, board `web-mtq2m6la-ckpxm7`) sitting at a
non-source, temp-looking path. This firing read it (a plain file read, no
git operation) and moved on to a `git status` a few tool-calls later —
which came back **completely different**: `.tmp-stashed-rct.ts` was gone
entirely, and in its place `apps/dashboard/src/flight/report-compose-tasks.ts`
+ its test now showed as **staged** modifications, content matching what
the temp file had held. No `git stash`/`add`/`commit` of this firing's own
ran in between. `git stash list` explained the source: `stash@{0}` is
titled `"On autopilot/flight: wip: report-compose-tasks slice2
(applyComposedTasks) + shell.ts i18n sweep tranche1 - from turn-capped
firing 175, not yet gated/committed"` — a checkpoint stash from a prior
turn-capped firing, still present in the stash list (not popped — `stash
pop` removes the entry; this one didn't), while its `report-compose-tasks.ts`
portion had independently reappeared staged in the working tree. Two
`git status --porcelain` polls three seconds apart, after that point, came
back byte-identical — the state had settled, not still flapping.

New data point beyond entries one through six: a stash entry can go
**partially stale** while still sitting in the stash list. Diffing
`stash@{0}`'s other two touched paths (`apps/dashboard/src/web/shell.ts`,
`packages/tokens/src/strings.ts`, the "i18n sweep tranche1" half of the
same checkpoint) against `HEAD` came back empty — that half had already
landed under some other commit, leaving the stash holding a mix of
already-superseded and still-relevant hunks under one entry, with nothing
in the stash list itself to tell which is which. Combined with
`2026-09-06-primary-checkout-collision-recurs-live-blindspot.md`'s existing
"stash contents are invisible to `touchingFiles`" finding, this sharpens the
same gap: even a sibling that *does* eventually read a stash has no signal
for whether any given hunk inside it is still live or a leftover no-op.

Action taken: none against `.tmp-stashed-rct.ts` (already gone by the time
this was written), the now-staged `report-compose-tasks.ts`/test, or the
untracked `launcher-smoke.mjs`/`ci.yml`/`package.json` cluster — all left
exactly as found. This firing's own board (EPIC 0018/0017/0016 slices, all
high-priority) sit entirely inside the same dashboard hot zone
(`shell.ts`, `pr-review.ts`, masthead/lanes wiring) already shown live and
volatile above, so this firing deviates from PICK DISCIPLINE this once to
avoid adding a fourth concurrent writer to that same zone, contributing
only this documentation update instead (same choice entries one through
six made). Only this file was read, edited, and committed
(pathspec-scoped), same discipline as every prior entry.
`ap-mtq0bpgj-2`/`ap-mtm4qzty-1` remain **open, operator-owned**; the
(a)/(b)/(c) decision is unchanged.
