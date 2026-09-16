<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtq4l4fu-4`: EPIC 0016 slice 1/6 already got its dedicated firings — refuted as open work

Board (medium/priorities): "VERDICT split `web-mtpzzx23-n1kqv0`: EPIC 0016 slice 1/6 needs its
own dedicated firing — comparable rituals (`pr-review.ts`) run 3600+ lines for one slice at this
repo's quality bar." A VERDICT title is a prior firing's proposal about another task, not
buildable work — this firing's whole unit is processing it: verify the claim against the code and
git history it names, then complete the VERDICT task with the evidence.

## Verification of the claim

1. **`web-mtpzzx23-n1kqv0` is slice 1/6, "social-pass core."** Its own header comment in
   `apps/dashboard/src/flight/social-pass.ts:5-6` names the board id directly: "epic 0016 'The
   GitHub Social Flight', slice 1/6 — board `web-mtpzzx23-n1kqv0`". The epic doc
   (`docs/epics/0016-github-social-flight.md`, Slices §1) spells out slice 1's DoD: "gh-identity
   resolve, role detect (owner vs user), inventory load (own submissions, open threads), protocol
   engine with caps; pure planner + injectable executor, the pool-client/pr-review seam style."
2. **Every DoD element is present in the file, not just planned:**
   - gh-identity + role resolve — `resolveSocialIdentity` (line 97), `createSocialIdentityApi`
     (line 129).
   - own-submissions inventory — `fetchOwnSubmissions` (line 232).
   - open-threads inventory — `fetchOpenThreads` (line 252), composed with the above into
     `fetchSocialPassReport` (line 274).
   - protocol engine with caps — `planSocialProtocol` (line 390), enforcing the epic's law 1
     (dedup against both inventories), law 4 (per-kind caps, queue instead of drop), and law 5
     (role-gated candidates).
   - pure planner + injectable executor — `planSocialCommand`/`planSocialCommands` (lines
     454/477, the planner half) and `executeSocialCommands` (line 509, the executor half,
     continuing past a failure the same way `issue-triage.ts`'s `executeIssueTriageCommands`
     already does for independent commands).
3. **Git history shows the "dedicated firing" the verdict asked for already happened — six times
   over**, not once:
   ```
   e228cc1e feat(flight): social-pass core — gh identity/role resolve, own-submissions inventory, protocol caps
   e95334f8 feat(flight): the anti-flood guard — a duplicate comment can no longer post
   101e22e6 feat(flight): social-pass protocol engine dedups new-issue candidates (epic 0016 law 1)
   334eeaf8 feat(flight): social-pass protocol engine enforces role honesty (epic 0016 law 5)
   065ab7d3 feat(flight): social-pass core adds open-threads inventory (epic 0016 slice 1/6)
   d191517d feat(flight): reapply social-pass's executor, lost to a landing-race revert (epic 0016 slice 1/6)
   ```
   The file is 519 lines today — the verdict's own comparison point (`pr-review.ts`-scale
   rituals running "3600+ lines for one slice") was never a literal line-count target, it was
   evidence that this slice needed room to grow across firings rather than being squeezed into
   one. That room was given and used.
4. **Tests pass clean**, covering every DoD element above by name (identity/role resolution
   including case-insensitivity and the standing-tier lookup, both inventories' gh argv and
   degrade-to-empty paths, `fetchSocialPassReport` composition, the protocol engine's caps/dedup/
   role-gating/never-drop invariants, and both the planner's fail-closed contract and the
   executor's continue-past-failure behavior):
   ```
   npx vitest run apps/dashboard/test/flight/social-pass.test.ts apps/dashboard/test/flight/social-flight-trigger.test.ts
   ✓ |node| apps/dashboard/test/flight/social-flight-trigger.test.ts (11 tests)
   ✓ |node| apps/dashboard/test/flight/social-pass.test.ts (49 tests)
   Test Files  2 passed (2)
        Tests  60 passed (60)
   ```

## VERDICT

**Refuted as open work — slice 1/6 already received its dedicated firings and shipped its full
DoD.** No further action is owed to `web-mtpzzx23-n1kqv0` itself; it is complete, tested, and
green. This looks like a verdict written before those firings landed (or one whose target closed
without the verdict being processed) rather than a live gap.

**Forward note, not this firing's scope:** the epic's real remaining gap is slice 3/6 ("weave-in"),
board `web-mtpzzx7v-72q2dv`. Its pure decision half already exists and is tested
(`apps/dashboard/src/flight/social-flight-trigger.ts` — `parseSocialFlightToggle`/
`shouldRunSocialFlight`, fail-closed to `'off'`), but per its own header comment it "has no I/O
and is never called from anywhere yet." Wiring it means touching `apps/dashboard/src/fly.ts`
(1819 lines — the live flight-loop entry point every instance, including this one, is currently
running inside of) at its start/interval/end points, composing it with the already-substantial
slice 2 mirror-pass machinery (`flight/mirror-pass.ts` + `flight/mirror-pass-execute.ts`, ~1900
lines combined), adding a clean-refusal path for a disconnected `gh`, AND a dashboard fly-bar
toggle for the UX-EXPRESSION doctrine. That is a materially riskier, multi-file integration into
the fleet's shared flight loop — exactly the kind of unit slice 1/6 itself needed room to grow
across firings for, not a one-firing drop-in.

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief file plus the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`) — the only
paths this firing staged or touched. Pure documentation: `docs/` is excluded from
`prettier --check .` (`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so it adds no source or test code and
`typecheck`/`build` are structurally unaffected. The 60 tests above were already run in full
during verification and passed clean.
