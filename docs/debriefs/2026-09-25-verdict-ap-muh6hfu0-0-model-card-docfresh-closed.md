<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-muh6hfu0-0`: MODEL-CARD.md doc-freshness proposal closed — no staleness remains

Board (low): "VERDICT close `docfresh-docs-model-card-md-1789835641000`: MODEL-CARD.md was
refreshed 2026-09-25 12:16:29 (v0.54.0, firing-v17), after the last `prompt.ts` change
(2026-09-19); no staleness remains." A VERDICT title is a prior firing's proposal about another
task, not buildable work — this firing's whole unit is processing it: verify the claim against
the code/git history it cites, then complete the VERDICT task with the evidence.

## Verification of the claim

1. **The proposal id encodes exactly the touch time it claims is now stale.**
   `docFreshnessTaskId` (`apps/dashboard/src/flight/doc-freshness.ts:268-270`) mints an id as
   `docFreshnessIdPrefix(doc) + newestStaleSubjectTouchedAt` — the doc's slug plus the epoch-ms
   of the tracked subject file's most recent commit at proposal time. `git log -1 --format=%ct --
   packages/engine/src/prompt.ts` returns 1,789,835,641 (seconds), i.e. 1,789,835,641,000 ms —
   byte-identical to the numeric suffix on the proposal id itself (`docfresh-docs-model-card-md-`
   followed by that same epoch-ms value). That commit is `4d5a4610` ("fix(engine): a killed
   firing can be rescued — the session id comes off the wire", 2026-09-19 19:34:01 +0300): the
   proposal was minted because `MODEL-CARD.md` hadn't yet been touched after that `prompt.ts`
   change.
2. **`docs/MODEL-CARD.md` tracks two subjects, both fresh.** The sweep config
   (`apps/dashboard/src/flight/doc-freshness.ts:205-206`) lists
   `subjects: ['packages/engine/src/prompt.ts', 'packages/store/src/eval-gate.ts']` for this doc.
   `git log -1` against each:
   - `packages/engine/src/prompt.ts` → `4d5a4610`, 2026-09-19 19:34:01.
   - `packages/store/src/eval-gate.ts` → `f6a2829f`, 2026-09-03 23:44:10 (untouched since genesis).
   `docs/MODEL-CARD.md` itself was last touched by `d7f77714` ("docs: refresh MODEL-CARD evidence
   pointers", 2026-09-25 12:16:29) — after both subjects. `computeDocDrift`
   (`doc-freshness.ts:220-249`) flags a doc only when a tracked subject's touch time is newer than
   the doc's own; with the doc now newer than both subjects, this doc produces no finding.
3. **The card's own content matches**, not just the timestamps: §6 `Firing-Prompt-Version
   (current)` reads `firing-v17` (`docs/MODEL-CARD.md:106`) — the same version this very firing
   runs under — and `This card last reviewed against the above` reads `2026-09-25`
   (`docs/MODEL-CARD.md:112`).
4. **The retire path already exists for exactly this case.** `findStaleDocFreshnessProposalIds`
   (`doc-freshness.ts:285-291`) compares open proposal ids against `docFreshnessTaskId` of the
   sweep's *current* findings and returns any id with no matching current finding — that is
   precisely this proposal's fate: `computeDocDrift` no longer reports a finding for
   `docs/MODEL-CARD.md` at all (subject touch time unchanged, doc now newer), so its id can never
   recur, and the next post-flight sweep retires it on its own without any code change needed
   here.

## VERDICT

**Confirmed — close.** `docs/MODEL-CARD.md` was refreshed after both subjects it tracks
(`prompt.ts` 2026-09-19, `eval-gate.ts` 2026-09-03), the refresh commit (`d7f77714`,
2026-09-25 12:16:29) matches the card's own self-reported "last reviewed" date, and the
`Firing-Prompt-Version` pointer already reads the version this firing itself carries
(`firing-v17`). No staleness remains; the proposal is stale-by-success, not stale-by-neglect, and
the sweep's existing prune path will retire it on its next run.

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief file plus the regenerated `docs/debriefs/README.md`
index (`node scripts/docs/generate-debriefs-index.mjs`) — the only paths this firing staged or
touched. Pure documentation: `docs/` is excluded from `prettier --check .` (`.prettierignore`)
and `.md` files are outside ESLint's configured `files` globs, so this adds no source or test
code and `typecheck`/`test`/`build` are structurally unaffected.
