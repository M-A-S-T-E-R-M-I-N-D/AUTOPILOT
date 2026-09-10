<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `web-mtq70agu-pjs8mg`: "gate-decision observability" is already fully shipped

Board (medium): "gate-decision observability: guard-verify + convergence-gate
decisions (why blocked, which check, duration) emit only into the event
stream — surface them on the project page so operators can inspect Why". Three
prior slices target this exact item; picked it up expecting a remaining
gap and found none — this firing's unit is the verification that closes it.

## Verification of the claim

1. **Convergence-gate decisions are covered, both non-green outcomes.**
   `flight/convergence-gate.ts`'s `gateConvergedBranch` has exactly two
   non-green paths — RED (`deps.recordRed`) and UNVERIFIABLE
   (`deps.recordUnverifiable`, the GATE HONESTY plausibility-floor demotion)
   — and both already persist through `fly.ts` into `@autopilot/store`
   (`packages/store/src/read-events.ts`), parse defensively in
   `read/persisted-events.ts`, aggregate into an evidence-carrying `Anomaly`
   in `read/anomalies.ts` (`convergenceRedAlarms`/
   `convergenceUnverifiableAlarms`), and wire through `read/fleet.ts` +
   `read/source.ts` into `card.anomalies`. Both carry "which check" (`check`/
   `signature`) and "duration" (`ms`, plus `floorMs` for the unverifiable
   case) exactly as the board title asks.
2. **Guard-verify refusals are covered.** `fly.ts`'s GUARD SETTINGS
   VERIFICATION step persists a `guard-verify-failed` event with `reason`
   (mirroring the same pipeline shape) whenever `flight/guard-verify.ts`'s
   `verifyGuardSettings` fails closed. `reason` is a single free-text field
   because the check itself is one synchronous read-back-and-compare with no
   meaningful sub-check or duration to separate out — unlike the gate runs
   above, there is nothing else to thread.
3. **Both chips render with real, accessible UI expression, not just data
   plumbing.** `web/shell.ts`'s `ANOMALY_LABELS` has proper emoji labels for
   `convergence-unverifiable` (`❓`) and `guard-verify-failed` (`🛑`) — the
   last remaining gap (`ef4fdce3`, a raw-kind-string fallback) is already
   fixed. `anomalyChip()` renders both through the same `tipChip()` helper
   every other anomaly kind uses: keyboard-reachable, `aria-label`-carrying,
   hover/focus tip holding the full evidence string.
4. **Test coverage confirms the whole vertical slice, not just units.** Ran
   the exact test files covering this pipeline from a clean tree:
   `apps/dashboard/test/read/anomalies.test.ts` (55 tests),
   `apps/dashboard/test/read/persisted-events.test.ts` (37 tests),
   `packages/store/test/read.test.ts` (155 tests), and
   `apps/dashboard/test/web/anomaly-chip.test.ts` (3 tests, including
   `"gives convergence-unverifiable and guard-verify-failed chips a proper
   label, not the raw kind string"` and `"renders one keyboard-reachable,
   self-explaining chip per detected anomaly"`) — **250/250 passed**.

## VERDICT

**Close — already fully shipped.** `54118ff2` (convergence-unverifiable),
`c05b90db` (guard-verify-failed), and `ef4fdce3` (the label fallback fix)
together deliver the complete vertical slice the board title describes:
both decision classes reach the event stream, surface as aggregated,
evidence-carrying, accessible chips on the project page, and are covered by
tests at every layer. No further slice is actionable here.

## Pick-discipline note

This firing's board pass ranked `web-mtt3h1a4-divddf` (rank 1, already
debriefed 2026-09-09 as blocked on an operator design decision) and
`web-mtlsiac0-v8rksh` (rank 2, claimed by sibling fleet-5 per its own
`unlanded:` file list) ahead of this item. Neither fit this firing, so this
item — rank 3, the next one down — was worked instead; investigating it
surfaced that it too has no remaining actionable slice, hence this
closure record rather than a code change.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, added with a scoped
`git add <this-path>` — the only file this firing staged or touched. Pure
documentation: `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so it adds no source
or test code and `typecheck`/`build` are structurally unaffected. The 250
tests above were already run in full during verification and passed clean.
