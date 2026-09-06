<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief: `mirror-pass.ts` swept into an unrelated commit a SECOND time — this time the race window was this firing's own rejected commit attempts (2026-09-06)

Board: `ap-mtm4qzty-1` (the still-open primary-checkout sharing architecture
decision), same failure mechanism as
`docs/debriefs/2026-09-06-disjoint-staged-content-swept-into-unrelated-commit.md`
(a concurrent process's broad `git add` pulling this firing's already-staged,
unrelated content into its own commit). The new data point: it hit the exact
same file, `apps/dashboard/src/flight/mirror-pass.ts`, for the second time
today — first `750bcee8` swept derivation 2/4, now a second commit swept the
derivation-3/4 "counts" half — and this time the race window was created by
this firing's *own* repeatedly-rejected `git commit` attempts, not a delay
between staging and committing.

## Sequence, in order

1. This firing implemented the "counts" half of derivation 3/4 (epic 0016
   slice 2, board `web-mtpzzx50-obq42b`): `extractPackageCountClaim`,
   `countThirdPartyLicenseRows`, `planMirrorPassCountsDrift`,
   `planMirrorPassCountsDriftCommand`, `readMirrorPassCountsDrift`, TDD
   (16 tests written first and confirmed red), then implemented to green.
   Gate verified clean: `typecheck`, `lint`, `format:check` (own files),
   `test:impacted` (3,078 + 630 passed), `build`.
2. Observed heavy concurrent churn in this shared, non-worktree checkout
   throughout (`git status --short` before staging listed 14 modified files
   this firing never touched: `issue-triage.ts`, `pool-client.ts`,
   `convergence-gate.ts`, `fly.ts`, e2e specs, `packages/store/src/index.ts`,
   `docs/THREAT-MODEL.md`, and their tests) — left untouched per containment
   rules, never staged.
3. Staged with a scoped `git add <path> <path>` (never `-A`). The very next
   `git status --short` showed THREE extra files staged alongside mine
   (`issue-triage.ts`, `pool-client.ts`, `issue-triage.test.ts`) — a
   concurrent process's own broad add landing in the shared index between my
   `git add` and the immediate follow-up check. Unstaged them with
   `git restore --staged <path>` (leaves working tree untouched), re-verified
   only the two mirror-pass files remained staged.
4. First `git commit -m "..."` attempt: rejected by commitlint
   (`header-max-length` at 108 chars, missing DCO sign-off). Non-zero exit —
   no commit created, staged state should persist.
5. Second attempt, header shortened, with a hand-written `Signed-off-by:`
   trailer in the message body: rejected by a DCO-trailer guard hook
   ("the commit message hand-writes a `Signed-off-by:` trailer... run
   `git commit -s` instead"). Non-zero exit — again no commit created.
6. Third attempt, `git commit -s -m "..."` (no hand-written trailer): printed
   "no changes added to commit" and listed seven *unrelated* modified files
   (`convergence-gate.ts`, `issue-triage.ts`, `pool-client.ts`, `fly.ts`,
   their tests, `packages/store/src/index.ts`) — the two mirror-pass files
   were no longer in the index at all, staged or otherwise.
7. `git log --oneline -3` showed a new commit, `bb6c823a` ("test(e2e): pin
   the update-banner's own 404 poll in the hermetic-fixture allowlists"),
   authored by a concurrent process. `git show --stat bb6c823a` listed four
   files: two genuinely its own (`dashboard.spec.ts`, `project-page.spec.ts`)
   and, in addition, `apps/dashboard/src/flight/mirror-pass.ts` (+114) and
   `apps/dashboard/test/flight/mirror-pass.test.ts` (+149) — this firing's
   entire staged diff, absorbed whole.
8. Verified no content was lost: `git diff HEAD -- <both paths>` is empty —
   the committed tree matches this firing's own gate-verified working copy
   exactly. The counts-drift derivation is correctly and fully present in
   history; it is simply filed under a commit whose subject never mentions
   it, for the second time today, on the same source file.

## Why the race window was different this time

The prior three debriefs on this bug all show the sweep happening in the gap
between an otherwise-uneventful `git add` and `git commit`. Here the
`git add` → final pre-commit `git status --short` check *did* pass clean
(only the two mirror-pass files staged, confirmed immediately before the
first commit attempt) — the protocol those debriefs recommend worked exactly
as designed. What defeated it was that the first two `git commit` invocations
themselves failed local hook validation (commitlint, then the DCO-trailer
guard) and each failure left the shared index sitting staged for another
round of edit-diagnose-retry, widening the window a concurrent process's own
`git add -A`-style commit needed to land in between. A clean `git status`
one command before commit is not a sufficient guard when the commit itself
can be rejected and retried — every retry re-opens the race.

## Task processed: contributes to `ap-mtm4qzty-1`

Evidence only, consistent with the prior debriefs' stance — no fix to the
shared-checkout architecture gap is attempted here (that remains a dedicated,
solo-firing slice per `docs/debriefs/2026-09-06-primary-checkout-live-collision.md`).
One narrow, additional mitigation worth flagging for whoever takes that slice:
a commit-msg hook rejection should arguably be treated as "unstage and abort
immediately" rather than "fix the message and retry in place" when the
checkout is shared — the retry loop itself is what created this window.

## Verification note for this firing's own METRICS

This firing's actual code (`mirror-pass.ts` counts-drift + 16 tests) is
correctly landed and independently re-verified above, but under `bb6c823a`,
a commit this firing did not author and does not claim. This debrief file —
added with a scoped `git add <path>` — is this firing's own attributable
unit.
