<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing board `web-mtsvcibf-bh6asp`: "lucky planner sustained-load awareness" is already fully shipped

Board (medium): "lucky planner sustained-load awareness: probe measures
launch-moment CPU but 4-lane gates spike to ~100% later — cap suggested
lanes at cores/3 by default and surface a machine-load hint in the fly
bar". Picked it up expecting a remaining gap (`FAILURE-DOCTRINE.md` row 16
still read "mercy 3 boarded") and found the described fix already fully in
the tree — this firing's unit is the verification and ledger correction
that closes it out.

## Verification of the claim

1. **Lanes are already capped at cores/3.** `flight/lucky-plan.ts`'s
   `CORES_PER_LANE` constant is `3`, not the `2` the board title's premise
   assumes still ships. Its own doc comment names this exact board id as the
   reason it was tightened from 2 → 3: a near-idle probe still let a 4-lane
   round climb to ~100% CPU once the gates actually ran.
2. **The machine-load hint is already surfaced in the fly bar.**
   `web/features/fly.ts`'s lucky-button handler (lines 403-429) explicitly
   cites `board web-mtsvcibf-bh6asp` in its own comment: `reasoning[0]` (the
   CPU-bound line `lucky-plan.ts` always computes first) was "computed but
   never painted" before this fix, and is now prepended to the rolled
   summary shown to the operator — riding the existing single `{reason}`
   slot, so no new i18n `STRINGS` key was needed.
3. **Both pieces are test-covered, one of them by name.**
   `test/web/features/fly.test.ts` has
   `'surfaces the machine-load reading, not just the final lane count
   (board web-mtsvcibf-bh6asp)'`, asserting the exact `loadHint`/`rolled`
   string-concatenation logic in the source; `test/flight/lucky-plan.test.ts`
   asserts the cores/3 arithmetic ("(100-50)% of 12 cores = 6 usable → 2
   lanes at 3 cores each"). Ran both files plus the full `lucky-plan` and
   `fly` suites clean.
4. **`RUNBOOK.md` already documents the shipped state**, not a pending
   follow-up: §12 already reads "the three-idle-cores-per-lane ratio was
   tightened further (from two) ... (board web-mtsvcibf-bh6asp)" and "the
   CPU line rides along with the rolled plan as the bar's machine-load hint,
   not just the final lane count." The only stale artifact was
   `FAILURE-DOCTRINE.md` row 16, still marked "mercy 3 boarded" — corrected
   in this same commit to "mercy 3 shipped" with the concrete file/board
   evidence, matching the ledger's own rule that a fixed row names where the
   counter lives.

## VERDICT

**Close — already fully shipped.** Both halves of the board title (cores/3
cap, CPU-load hint painted in the fly bar) are in the tree, each covered by
a test, and one test names this exact board id. No further slice is
actionable here; the ledger note was the only thing out of date.

## Pick-discipline note

Rank 1 (`web-mtt3h1a4-divddf`) stays blocked on an operator design decision
per the 2026-09-09 debrief — unchanged, still doesn't fit. Rank 2
(`web-mtqumz0u-j39av4`, guard-precision doctrine) got a substantial
per-scanner audit this firing: every `scripts/ci/*.mjs` script that does
real regex/heuristic text matching (`secret-scan`, `validate-no-personal-
paths`, `audit-board-flood`, `check-model-freshness`, `dependency-audit`,
`check-doc-commit-refs`, `validate-spdx-headers`, `license-check`,
`check-merge-integrity`, and `validate-configs`'s `findUnpinnedActions`)
already carries a negative corpus and matched-text evidence in its red
output. The remaining unstested scripts (`detect-flaky`, `quarantine-
report`, `run-all-mutation`, `check-bundle-size`, the launcher/npx smoke
tests) are empirical or structural checks, not pattern scanners with a
legit-shape false-positive risk the doctrine's wording targets — but that
reading is not yet certain enough to write as a closure verdict in the same
firing as this one, so it is left open rather than force-fit here. Rank 3
(`web-mtqte4di-qq3xw2`, reland protocol) was not evaluated this firing.
Rank 4, this item, is the one this firing's unit actually completes.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file plus the one-line
`FAILURE-DOCTRINE.md` row-16 correction — both `docs/` paths, staged with a
scoped `git add`. `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so this adds no
source or test code and `typecheck`/`build` are structurally unaffected. The
`lucky-plan` and `fly` test suites cited above were run in full during
verification and passed clean.
