<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtuks0jr-2`: ATTRIBUTION 4/4 claim — confirmed

Board: `ap-mtuks0jr-2` (VERDICT close, targeting `web-mtt0a97o-18fblk`) —
"ATTRIBUTION 4/4 withAttribution already fleet-wide via ghExec,
census-enforced in gh-exec-census.test.ts".

## A staleness note first

This flight's own worktree branch (`fleet-5`) is ~185 commits behind
`main` and predates this feature entirely — `apps/dashboard/src/flight/
gh-exec.ts` here still reads `withAntiFlood(realCliExec, ...)` with no
`withAttribution` in sight. That is not evidence the claim is false; it
is evidence this lane has not synced in a while. All verification below
reads `main` (`git show main:<path>`), the fleet's converged state, not
this stale branch — per the primary-checkout-live-collision lesson
(docs/debriefs/2026-09-06-primary-checkout-live-collision.md): check the
authoritative state, not just the local tree, before judging something
missing.

## Verification of the claim

1. **`withAttribution` exists and does what ATTRIBUTION.md §3 describes.**
   `apps/dashboard/src/flight/attribution.ts` (landed `3bfc1771`, "feat(flight):
   withAttribution() signs every outbound conversation (ATTRIBUTION 4/4,
   rung 1)", shipped in v0.33.0 per `CHANGELOG.md`) decorates a `CliExec`:
   `parseConversationPost` matches `gh issue|pr comment --body` and
   `gh pr review --body`, and `withAttribution` appends
   `conversationSignature(operatorHandle)` — the exact
   `— ✈️ AUTOPILOT agent, on behalf of @<operator> · [what is this?](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)`
   line channel 3 specifies — once per message (a body already containing
   `— ✈️` is left alone), failing open (unsigned, not swallowed) when the
   operator's login cannot be resolved.

2. **It is fleet-wide via `ghExec`, not opt-in per call site.**
   `apps/dashboard/src/flight/gh-exec.ts:36,39` on `main`:
   `import { withAttribution } from './attribution.js'` and
   `export const ghExec: CliExec = withAntiFlood(withAttribution(realCliExec), ...)`.
   Every flight module that posts to GitHub takes an injectable `CliExec`
   and defaults it to `ghExec` — the same default-IS-the-policy shape
   `gh-exec-census.test.ts` already polices for the anti-flood guard — so
   any module posting through its default exec gets the signature for
   free, with zero call-site edits.

3. **Census-enforced — across two tests, not one.** The claim names
   `gh-exec-census.test.ts` specifically; that file (unchanged by this
   feature, verified identical to this branch's copy) census-enforces only
   "every `.ts` under `src/flight/` defaults its `CliExec` param to `ghExec`,
   never raw `realCliExec`" — it says nothing about `withAttribution` by
   name. The test that actually locks `withAttribution` INTO `ghExec` is a
   second one, `attribution.test.ts`'s `'the helper is wired into
   gh-exec.ts, not merely written'` (asserts `withAttribution` is a real,
   non-mocked export AND that `gh-exec.ts`'s own source text contains
   `withAttribution`). The two census tests compose — module → `ghExec`
   (`gh-exec-census.test.ts`) → `withAttribution` (`attribution.test.ts`) —
   to close the full chain the claim describes, but the claim's citation of
   the single file is imprecise. Substance holds; citation needed a
   correction.

4. **The one opt-out lever covers this and channel 1 together.**
   `docs/RUNBOOK.md`'s attribution section confirms `AUTOPILOT_ATTRIBUTION=off`
   is checked once in `attribution.ts` (channel 3, this claim) and reused
   by `fly.ts`/`buildFiringPrompt` for the `Assisted-by:` commit trailer
   (channel 1) — one lever, not per-ritual duplication, matching
   ATTRIBUTION.md's own "one opt-out lever covers all four channels"
   wording.

## What remains open (not this claim's scope)

`attribution.ts`'s own doc comment is explicit: `gh issue|pr create`
(ATTRIBUTION.md §2's filing spread-line, `[AUTOPILOT](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT) vX.Y.Z`) is
"still unwired — a separate slice", and channel 4 (README badge +
`CITATION.cff` pointer) is untouched by this module entirely. Those are
real, separate board scope — not part of what `ap-mtuks0jr-2` claimed, and
not touched by this firing.

## VERDICT

**Confirmed**, with one citation correction. `withAttribution()` is
implemented, wired fleet-wide into the shared `ghExec` default (not
opt-in), and census-enforced — but by the composition of
`gh-exec-census.test.ts` (module → `ghExec`) and `attribution.test.ts`
(`ghExec` → `withAttribution`) together, not by `gh-exec-census.test.ts`
alone. `web-mtt0a97o-18fblk` may close on this evidence; channels 2 and 4
of `docs/ATTRIBUTION.md` remain genuinely open work for a future slice.

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief file plus `.autopilot-intent`
(git-ignored, not part of the commit), added with a scoped `git add
<this-path>`. It is a pure documentation addition: `docs/` is excluded
from `prettier --check .` (`.prettierignore`) and from ESLint's
configured `files` globs (`eslint.config.js` targets only
`*.ts`/`*.mjs`/`*.js`), and it adds no source or test code, so
`typecheck`/`build`/`test` are structurally unaffected by it.
