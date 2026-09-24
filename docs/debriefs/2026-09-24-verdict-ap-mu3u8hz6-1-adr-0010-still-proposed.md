<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mu3u8hz6-1`: ADR 0010's landing-guard override is still Proposed — the block holds

Board (priorities): "VERDICT blocked `web-mtyq8mpd-6e2i6z`: ADR 0010 is
Proposed, needs operator sign-off before any landing-guard override code
lands." This is itself a VERDICT task — a prior firing's claim about
another task, not buildable work. Per the VERDICT-processing protocol,
this firing's unit is to re-verify the claim against the current tree and
git history, then complete this task with fresh evidence rather than
attempt the underlying (operator-gated) code.

## Verification of the claim

1. **ADR 0010 is still `Status: Proposed`.**
   `docs/adr/0010-landing-guard-flight-tip-override.md:8` reads "Status:
   Proposed (🟣 operator decision — this record proposes a matching rule,
   it does not implement one...)". `git log --oneline --
   docs/adr/0010-landing-guard-flight-tip-override.md` shows exactly one
   commit against the file, `7cb2b080` (2026-09-12, the commit that
   authored it) — nothing has touched the file since, so no status
   transition to Accepted/Rejected has happened.
2. **No landing-guard override code has landed.** The ADR's recommended
   implementation (Option A) names two concrete call sites: `RawGhRun`/
   `WorkflowRunStatus` in `apps/dashboard/src/control/ci-status.ts` gaining
   a `headSha` field, and `E2eLandGuard` in
   `apps/dashboard/src/landing/execute.ts` gaining a flight-branch/tip-SHA
   override path. A search for `headSha` and `override` in both files
   returns zero matches — neither the field nor any override logic exists
   in the current tree. `git log --oneline -5 -- apps/dashboard/src/landing/execute.ts
   apps/dashboard/src/control/ci-status.ts` shows the five most recent
   commits touching either file (most recently `5c58b07f`, "carry a
   rejected push through a dashboard restart") are all unrelated to this
   ADR — none reference SHA-matching or a red-base override.
3. **No trace of `web-mtyq8mpd-6e2i6z` in the tree.** A repo-wide search
   for `mtyq8mpd` (excluding `node_modules`) returns zero hits — same
   "pool-only, no in-tree residue" shape the other recently-processed
   VERDICT tasks in this debrief series show (e.g. `ap-mufmdoq5-0`,
   2026-09-24).

## VERDICT

**Confirmed — the block still holds.** ADR 0010 remains Proposed with no
operator sign-off recorded anywhere in the tree, and none of its three
named code sites (`ci-status.ts`'s `headSha` field, `execute.ts`'s
override path, or the accompanying test block) have been implemented.
`web-mtyq8mpd-6e2i6z` correctly stays blocked: the ADR itself is explicit
that shipping the override as a self-initiated fix is the wrong move
("this ADR proposes the design for operator sign-off rather than shipping
the override as a self-initiated fix") because a SHA-matching bug in this
exact guard fails in the direction of wrongly *allowing* a landing its own
base CI says is red — the ADR's own stated reason this is 🟣 operator-only,
not an autonomous judgment call to relitigate here.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file plus the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`)
— the only paths this firing staged or touched. Pure documentation:
`docs/` is excluded from `prettier --check .` (`.prettierignore`) and
`.md` files are outside ESLint's configured `files` globs, so this adds
no source or test code and `typecheck`/`test`/`build` are structurally
unaffected.
