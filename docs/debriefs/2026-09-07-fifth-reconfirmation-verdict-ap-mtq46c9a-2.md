<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtq46c9a-2`: scoped `git add` is confirmed unsafe against shared-index races — and the hazard is still live

Board: `ap-mtq46c9a-2` (VERDICT, blocked `ap-mtm4qzty-1`) — "my own scoped
`git add <path>` commit still bundled a sibling's staged `mirror-pass.ts`/test
(`4407238d`) — scoped-add is not a safe mitigation against shared-index races."

## Verification of the claim

The claim is accurate. `git show --stat 4407238d` ("docs: reconcile 2 stale
BACKLOG-999.md rows against shipped code") lists three files:
`docs/BACKLOG-999.md` (what the subject describes), plus
`apps/dashboard/src/flight/mirror-pass.ts` and
`apps/dashboard/test/flight/mirror-pass.test.ts` (356 insertions total,
3x the size a doc-only commit implies). This exact incident is already
fully documented in
`docs/debriefs/2026-09-06-disjoint-staged-content-swept-into-unrelated-commit.md`:
a firing staged its own disjoint, unrelated-to-BACKLOG-999 mirror-pass
derivation with a scoped `git add <path> <path>` (never `-A`), and it was
silently absorbed into `4407238d`'s commit by a concurrent process that
staged its own edit with something broader than a scoped add against the
same shared `.git/index`. No content was lost — the code is correct and
landed — but scoped-add on the committING side does not protect against a
concurrent process's broad add on the OTHER side of the same shared index.

## What already shipped in response

This was not the first nor the last reconfirmation of the underlying
`ap-mtm4qzty-1` hazard class that day (2026-09-06): `a83b9820` (identical-
content commit race), `7345cff0` (mirror-pass swept a *second* time),
`beb46a5f` (two instances redundantly re-verifying the same abandoned diff),
`b85128d4` (concurrent writes fabricating a 26-test failure batch indistin­
guishable from a real regression) all landed as further distinct failure
shapes of the same gap. The chain terminated in `3f4bd6c6`, which added the
hard rule now standing in `packages/engine/src/prompt.ts` (and reproduced
verbatim in this firing's own prompt): an uncommitted diff present at firing
start with no `wip(autopilot): checkpoint` commit may be a live sibling's,
not solely a turn-capped prior firing's own leftover — re-check
`git status`/`git log` immediately before the final commit, and treat an
already-landed target as a clean noop rather than a retry cue.

That is a **detection/avoidance** rule for the agent side, not a fix to the
underlying architecture: multiple processes still write directly into one
shared, non-worktree `.git/index` with no locking or partitioning between
them. `ap-mtm4qzty-1` itself — the board item this VERDICT is blocked on —
remains open at the architecture level.

## New evidence this firing: caught live, a sixth time, mid-orientation

While orienting for this firing (no code touched yet), three consecutive
`git status`/`git diff --stat` snapshots of this exact primary checkout,
taken seconds apart, each showed a **different** set of modified files:

1. First snapshot: 9 files dirty, including `CHANGELOG.md` (+17) and
   `apps/dashboard/src/web/shell.ts` (+21/-3).
2. Second snapshot (moments later): `CHANGELOG.md`'s diff had vanished
   entirely (`git diff -- CHANGELOG.md` returned empty), two new files
   appeared (`docs/SELF-STUDY/DATA-SERIES.md`, `docs/SELF-STUDY/PAPER.md` —
   the generated output of `scripts/self-study/generate-data.mjs`), and
   `shell.ts`'s own diff had grown to +53/-9.
3. Third snapshot: two more files newly dirty
   (`apps/dashboard/test/flight/mirror-pass.test.ts` — the very file
   `4407238d` swept — and `packages/tokens/src/strings.ts`), and
   `packages/store/src/read-events.ts`'s diff had *shrunk* (97 → 92 lines),
   consistent with active, in-progress editing rather than a one-shot
   snapshot.

No git command in this sequence was destructive (`status`, `diff`, `show`,
`log` only) and this firing staged or committed none of that content. This
is first-hand confirmation, one day after the `3f4bd6c6` mitigation landed,
that the shared-checkout hazard remains fully live: at least two concurrent
processes (one producing a verdict-quality gate-classification feature
touching `gate.ts`/`firing.ts`/`read-events.ts`, another producing an i18n
sweep touching `shell.ts`/`strings.ts`) are writing into this same primary
checkout right now, and `mirror-pass.ts`'s test file — already swept once —
is dirty again.

## VERDICT

**Confirmed, and stands as originally filed.** The scoped-`git add`
mitigation is real but insufficient by itself; `3f4bd6c6`'s detection rule
is the correct response *for an individual firing* and this one followed it
by treating every currently-dirty file above as claimed/contended and
picking work (this debrief) that touches none of them. The architecture gap
(`ap-mtm4qzty-1`: no isolation between concurrent processes sharing one
`.git/index`) remains open and is an operator-owned decision — most
directly, whether every flight against this repo should be required to run
in its own worktree (as the fleet-2..5 siblings already do per this firing's
own FLEET data) rather than any flight running directly against the primary,
non-worktree checkout. This firing does not attempt that change itself.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, added with a scoped
`git add <this-path>` — the only file this firing staged or touched. It is
a pure documentation addition: `docs/` is excluded from `prettier
--check .` (`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), and it adds no
source or test code, so `typecheck`/`test`/`build` are structurally
unaffected by it.
