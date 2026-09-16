<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# EPIC 0020 S8a (`ap-mtzrb9gy-2`): diff-approval UI shell confirmed shipped, gate-verified

Board (medium/priorities): "EPIC 0020 S8a: diff-for-approval UI shell, provable
with a fixture diff before any code-gen exists." This firing picked it up
expecting the remaining gap VERDICT `ap-mtydvfm1-0`
(`docs/debriefs/2026-09-13-verdict-ap-mtydvfm1-0-epic-0020-s8-fix-commit-half-confirmed.md`)
described — "nothing calls it yet" — and found none: the task shipped earlier
today, and the board snapshot this firing started from simply predates it.

## Verification of the claim

1. **Two commits, both already ancestors of this firing's `HEAD`, build the
   whole feature:**
   ```
   c5dc7576 feat(dashboard): diff-approval UI shell's pure contract (epic 0020 slice 8a)
   547c5e96 feat(dashboard): wire the diff-approval UI shell into the live Diagnose panel
   ```
   (`git merge-base --is-ancestor <sha> HEAD` confirms both; `547c5e96` is
   dated 2026-09-16, the same day as this firing.)
2. **The pure contract** (`c5dc7576`) — `flight/check-diagnosis.ts`'s
   `FixCommitProposal` type and `web/pr-review-panel.ts`'s
   `fixProposalDiffLines`/`fixProposalApproveDisabledReason`/
   `fixProposalDiscardTip` — is exactly what VERDICT `ap-mtydvfm1-0` already
   confirmed existed.
3. **The live wiring** (`547c5e96`), not present when that VERDICT was
   written, is now real:
   - `web/features/pr-review.ts`'s `renderFixProposal(item, proposal, number)`
     builds the title, summary, a colorized `<pre>` diff (reusing
     `web/diff-view.ts`'s six-way line classification), a permanently
     disabled-with-reason Approve button, and a no-confirm Discard button
     that only removes the box client-side.
   - It is called from the `data-pr-diagnose` click wiring's `afterFor`
     callback (`wirePrMaintainerAction(...)`, `pr-review.ts:590-593`), so
     every live 🔧 Diagnose response reaches it.
   - `layout-css.ts:851-864` styles `.pr-fix-proposal`/`.pr-fix-diff`/
     `.pr-fix-proposal-actions`/`.pr-fix-approve`/`.pr-fix-discard` for both
     themes, reusing the shared `.diff-add`/`.diff-remove`/... palette
     already defined for `.firing-diff`.
4. **`test/web/pr-review-fix-proposal.test.ts` proves it exactly the way the
   board task asked** — "provable with a fixture diff before any code-gen
   exists": a hand-authored `FIX_PROPOSAL` fixture (title, summary, a real
   unified diff, `filesChanged`) drives the live panel end-to-end (boots
   `renderShell()` + `clientJs()`, clicks the real Diagnose button, asserts
   on the rendered DOM) — never `diagnoseFailedCheck` itself, which still
   never populates `fixProposal` in production (that is slice (b), unstarted,
   confirmed below). Four tests: renders title/summary/6 correctly-classified
   diff lines/disabled-with-reason Approve/Discard; Discard removes the box
   with no `confirm()` and no fetch; a later flake/unknown verdict clears a
   standing proposal; no `fixProposal` at all renders nothing.
5. **Full targeted run, this firing:**
   ```
   npx vitest run apps/dashboard/test/web/pr-review-fix-proposal.test.ts \
     apps/dashboard/test/web/features/pr-review.test.ts \
     apps/dashboard/test/web/pr-review-panel.test.ts
   Test Files  3 passed (3)
        Tests  54 passed (54)
   ```

## VERDICT

**Confirmed shipped.** Slice (a) of VERDICT `ap-mtydvfm1-0`'s three-way split
is done: a real, styled, accessible (keyboard-operable buttons, `aria-label`/
`aria-disabled` via the shared `prPanelButton` helper) diff-approval shell,
proven against a fixture diff exactly as scoped, with zero dependency on
slice (b)'s fix-commit generation. `ap-mtzrb9gy-2` should close.

**Forward note, not this firing's scope:** the epic's real remaining gap is
still slice (b) — fix-commit generation core (`diagnoseFailedCheck` never
produces a `FixCommitProposal` in production) — and, after that, slice (c),
the apply-approved-fix execute path. Neither is attempted here; VERDICT
`ap-mtydvfm1-0` already flagged (b) as a 🟣 operator-facing scope decision
before any code.

## Fixed this firing

`docs/epics/0020-legible-surface.md` row 8 still read "nothing calls it yet...
`web/features/pr-review.ts` does not yet render it" — stale as of `547c5e96`.
Corrected in place to record slice (a) as shipped, citing the same evidence
above, so the epic doc does not contradict the tree.

## Verification note for this firing's own METRICS

This firing's unit of work is `docs/epics/0020-legible-surface.md`'s row-8
correction, this debrief file, and the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`)
— the only paths staged. Pure documentation: `docs/` is excluded from
`prettier --check .` (`.prettierignore`) and from ESLint's configured `files`
globs (`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so it adds no
source or test code and `typecheck`/`build` are structurally unaffected. The
54 tests above were already run in full during verification and passed clean.

## Deviation note (PICK DISCIPLINE)

`picked_rank: 7`. Ranks 1-6 on this firing's board did not fit a single safe
firing:

- **#1** (EPIC 0024 pipeline redesign) — centers on
  `web/features/pipeline.ts`, unlanded/claimed by sibling fleet-2.
- **#2** (EPIC 0023 docs reader) — a multi-slice feature (live re-render,
  editor with a guarded write endpoint, search/ToC); too large for one
  firing even at slice 1.
- **#3** (`web-mtsylqbd-q2rg8k`, "additive-only law") — per this repo's own
  prior debrief (`2026-09-13-verdict-web-mtt3f7j6-3bj899-role-gated-dashboard-shipped.md`'s
  deviation note), this reads as a standing regression-test law binding
  future EPIC 0019 slices, not a closeable single-firing deliverable.
- **#4** (EPIC 0026 tasks screen) and **#5** (EPIC 0019 S3 issues-board
  mirror) — both large, multi-file redesigns/features.
- **#6** (EPIC 0025 icon system) — checked `git diff --name-only
  main...<sibling-branch>` for every fleet sibling: fleet-2 and fleet-3 both
  carry unlanded changes to `packages/tokens/src/strings.ts`, the shared
  STRINGS module almost every remaining icon slice (panel-heading and
  chip/badge text alike) needs to touch; fleet-3's unlanded set additionally
  covers `anomaly.ts`, `firing-timeline.ts` and `shell.ts` — exactly the
  chip-conversion territory this slice would otherwise enter.

`ap-mtzrb9gy-2` (#7) touches only `flight/check-diagnosis.ts`,
`web/pr-review-panel.ts`, `web/features/pr-review.ts` and
`layout-css.ts` — none claimed by any sibling (verified the same way, against
all five fleet branches; fleet-4/5/6 carry no unlanded diff at all).
