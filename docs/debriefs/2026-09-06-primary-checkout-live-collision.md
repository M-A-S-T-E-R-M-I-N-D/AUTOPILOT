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
   firing prompt was generated from — from `3f9875d6` to `593ebb56`, a
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
   1–3: `593ebb56` → `85355c31` (`feat(github): add free-text compose to the
   report-to-upstream issue form` — fleet-2's own clean commit of the exact
   feature that had been sitting staged) → `4c44b879` (`fix(security):
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
against HEAD**: `git log` revealed a new commit, `efc70cad`
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
**empty**. `git reflog` explained why: `HEAD` had advanced to `ae2c2419`
(`test(dashboard): masthead census — pin every control before EPIC 0017 nav
remake`) — a concurrent process had authored and committed
byte-identical content under a different commit message while this firing
was mid-verification. Confirmed via `git show ae2c2419` — the diff matches
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
(`d08a9be1`). Practical mitigation until the operator resolves (a)/(b)/(c)
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

This firing's very first `git status` already showed `HEAD` at `b85128d4`
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
times, but `git log` afterward showed `HEAD` had moved from `f0c709e9` to
`ab095cfb` — a clean new commit, `feat(github): mirror-pass catches internal
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
`ddb3bb15`, a full working copy including `node_modules`-adjacent tooling
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

## Verdict reconfirmed a seventh time, two units landed back-to-back mid-investigation: firing-196 (2026-09-07)

This firing's own investigation produced the clearest before/after pair
yet. On start, `git status` showed two unrelated, file-disjoint uncommitted
units sitting together in the working tree: (1) `.github/workflows/ci.yml`
+ `package.json` + an untracked `scripts/ci/launcher-smoke-cmd.mjs` (316
lines, board `web-mtqanfe4-pil22i` slice 2/2 — Windows `.cmd` launcher
smoke test), and (2) `apps/dashboard/src/control/post-push-watch.ts` +
`landing/execute.ts` + `server/main.ts` + two test files (~374 lines, "POST-
PUSH VERDICT RITUAL" slice 3, board `web-mtpbmay4-94ii65`) — neither
touched by this firing.

Three read-only `git status`/`git log` polls, spanning a few minutes: unit
(1) landed cleanly as `b1625e19` (`feat(ci): launcher smoke test now
executes .cmd scripts too, not just .sh`) between the first and second
poll; unit (2) landed cleanly as `6536616b` (`feat(control): post-push
verdict ritual slice 3 — start the watch from a green land`) between the
second and third poll — each commit's message, diff, and provenance
trailers matched what this firing had only just finished reading,
reconfirming that the working-tree content was always the same identity
that ultimately committed it, never something this firing needed to
rescue. Immediately after the second landing, a **third** unit (i18n
translation of the docs-viewer panel: `inbox/add.ts`, `web/features/
docs-viewer.ts`, `packages/tokens/src/strings.ts`, two test files, one new
untracked test file) was already sitting uncommitted — a live process had
moved on to its next unit before this firing's own read had even finished.

This firing touched none of the three units — no `git add`, no gate run, no
edit against any of them, only observation. No data was lost (criteria (1)
and (2) both hold a seventh time). The new data point: two full, unrelated
units landing back-to-back and cleanly inside one firing's own read-only
investigation window, immediately followed by a third unit's uncommitted
start, is the sharpest evidence yet for firing-173's closing line — this
is the checkout's steady state under fleet load, not a rare timing
accident. `ap-mtq0bpgj-2`/`ap-mtm4qzty-1` remain **open, operator-owned**;
the (a)/(b)/(c) decision is unchanged by this reconfirmation.

### Board rank-4 task checked, found blocked (not touched)

The same firing checked this session's board rank-4 item (`EPIC 0016 6/6:
protocol red-team tests — duplicate-issue temptation, cap overflow,
role-confusion, answer-for-a-human refusals`) against
`apps/dashboard/src/flight/social-pass.ts` (epic 0016 slice 1/6, the only
slice landed so far). Cap overflow is already covered by that slice's own
test suite (`planSocialProtocol`'s cap/queue behavior). The other three
fixtures the task names — duplicate-issue detection, role-based verb
enforcement, and answer-for-a-human refusal — have no corresponding
production logic anywhere in the module yet: they belong to epic 0016
slices 2–5 (mirror-pass core, weave-in, standalone, observability), none
of which have landed. Slice 6 cannot be meaningfully red-teamed ahead of
the behavior it is meant to test. No code was changed for this check.

## Verdict reconfirmed an eighth time, index gained unrelated staged work mid-observation: firing-218 (2026-09-07)

This firing's first `git status` showed exactly the two-file shape a prior
turn-capped session leaves behind: `apps/dashboard/test/web/features/
issue-triage.test.ts` modified plus an untracked, fully-written
`apps/dashboard/test/web/issue-triage-panel-i18n.test.ts` (163 lines, six
tests, citing board `web-msnsndki-dz3vn1`). This firing treated it as
possibly its own resumable work (the session hook's summary showed a
"Last Updated" timestamp minutes old) and began verifying it: read the
untracked test file, confirmed the `STRINGS.en`/`STRINGS.he`
`issueTriage*` keys it depends on already existed in `packages/tokens/src/
strings.ts`, and ran both test files — 14/14 green.

The next `git status` (run only to confirm scope before staging) told a
different story: the diff had grown from 2 files to **5** —
`apps/dashboard/src/web/features/issue-triage.ts`,
`apps/dashboard/src/web/layout-css.ts`, and `apps/dashboard/src/web/
shell.ts` were now modified too, `packages/tokens/src/strings.ts` was now
modified (not clean, as first read), and a *second* new untracked file,
`apps/dashboard/test/web/live-worker-lane-grid.test.ts`, had appeared —
none of which this firing had touched. This firing's own FLEET board data
named `web-msnsndki-dz3vn1` ("i18n foundation + HEBREW... locale infras")
as `CLAIMED by fleet-3` — the unit visibly growing in place, mid-session,
is consistent with fleet-3 actively authoring it in this same checkout
right now, not a resumable orphan.

New flavor, sharper than any prior entry: that same `git status` also
showed **staged** (index-level) changes to three files this firing had
never opened — `apps/dashboard/test/github/pr-execute.test.ts`,
`packages/engine/src/github-pr-contribute.ts`, `packages/engine/test/
github-pr-contribute.test.ts` — proving a *second*, independent concurrent
process had run its own `git add` against this checkout while this firing
was merely reading. A follow-up poll, seconds later, found those three
paths gone from `git status` entirely and `HEAD` advanced to `5cfe1cf2`
(`feat(engine): reland the identity-law disclosure on contribute-upstream
PRs`) — that second process's own clean commit, landing mid-observation,
the same "caught it staged, then it committed cleanly" shape as
firing-147/173/196's entries, but this is the first entry to catch the
index accumulate a wholly unrelated unit's staged state (not just an
already-complete stage) before the commit resolved it.

Action taken: this firing did not stage, edit, or gate any of the six
distinct contested paths above (the i18n unit's five, the
`live-worker-lane-grid` file), and did not touch the
`github-pr-contribute` unit either — despite having already run a full
`vitest run` against the i18n unit's two test files, that verification was
discarded rather than acted on, since the unit was, by the very next poll,
demonstrably still growing under a live sibling's hands. Only this
documentation file was edited and will be committed with a pathspec-scoped
commit. No data was lost (criteria (1) and (2) hold an eighth time).
`ap-mtnd737s-1`/`ap-mtq0bpgj-2`/`ap-mtm4qzty-1` remain **open,
operator-owned**; the (a)/(b)/(c) decision is unchanged. Practical addendum
for future firings: a session summary's "recently modified" timestamp is
**not** reliable evidence that uncommitted state in the primary checkout
belongs to the resuming session itself — verify by re-polling `git status`
at least once before spending any verification effort on it, since a live
sibling's in-progress unit will keep growing across polls while a truly
orphaned one will not.

## Verdict reconfirmed a ninth time, this session's OWN edit landed under a commit it never issued: firing-223 (2026-09-07)

This firing found a genuine, real bug left uncommitted from a prior session:
`apps/dashboard/test/tooling/validate-spdx-headers.test.ts` had
`REUSE-IgnoreStart`/`REUSE-IgnoreEnd` markers wrapping only its last two
`it()` blocks (lines 41-56), but two earlier blocks (lines 15-38) contained
the identical SPDX-fixture shape, unguarded — `reuse lint-file` on the file
still failed with `invalid SPDX License Expression 'Apache-2.0','` even with
the partial markers in place. This firing extended the ignore region to
cover all four fixture blocks, verified the fix directly (`reuse lint-file`
went from failing to clean exit 0), and ran the full project gate
(`typecheck`, `lint`, `format:check`, `test` — 616 files / 9434 tests green,
`build`) — all green — before proceeding to stage and commit.

At that point `git status` came back clean and `git log` showed `48d42188`
(`docs(tooling): shield validate-spdx-headers test fixtures from reuse
lint`) already at `HEAD`. Diffing it against the pre-session blob
(`git show 48d42188 -- <path>`) showed a byte-for-byte match with the exact
edit this firing had just written and gated — same moved comment placement,
same removed duplicate block, same prose in the comment itself, right down
to the em dash and the `generate-donate-doc.mjs` cross-reference — under a
commit message, trailers (`Model: claude-sonnet-5`, `Firing-Prompt-Version:
firing-v12`, `Harness: claude-cli`), and author identity this firing never
produced. No local hook explains it: this session's own
`.claude/settings.json` carries no PostToolUse/git hooks, and `.husky/`
only wires `commit-msg` (commitlint), which fires on a commit already in
progress, not one it originates.

This is a sharper flavor than any of the eight entries above. Every prior
entry documented a *sibling's own, independently-produced* work landing
mid-observation — content this firing had at most read, never written. Here
the committed content was this firing's own freshly-written edit, sitting
in the shared working tree, picked up and committed by a different process
before this firing ran its own `git add`/`commit`. The practical
consequence is new: a firing cannot treat "I haven't run `git commit` yet"
as proof its work is still pending — on this shared checkout, another
process can commit a session's own in-progress edit out from under it
first. Had this firing's diff differed even slightly from what actually got
committed (e.g. if two sessions were mid-edit on the same lines with
different intents), this would be a live corruption/lost-edit risk, not
just duplicated verification cost.

Action taken: none beyond this documentation entry — nothing left to stage,
nothing to recommit, no data lost (criteria (1) and (2) both hold a ninth
time; the landed commit exactly matches the intended fix and the gate
already verified it). `ap-mtq0bpgj-2`/`ap-mtm4qzty-1` remain **open,
operator-owned**; the (a)/(b)/(c) decision is unchanged, but option (b)
(mandatory worktree isolation per session) now looks materially stronger
than option (c) (accept as bounded) — (c)'s premise that only "uncommitted,
in-memory-only edits" are at risk undersells the case where a session's own
on-disk edit is committed by a foreign process under foreign attribution
before the authoring session can verify-then-commit it as its own unit.
