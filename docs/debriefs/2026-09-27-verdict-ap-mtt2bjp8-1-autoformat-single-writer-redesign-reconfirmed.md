<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtt2bjp8-1`: AUTOFORMAT single-writer redesign still needs its own slice — reconfirmed, unchanged since 2026-09-10

Board: `ap-mtt2bjp8-1` (VERDICT split, targeting `web-mtsx325f-uzdisr`) —
"AUTOFORMAT single-writer redesign still needs its own slice." This VERDICT
was itself raised as the named follow-up from
`docs/debriefs/2026-09-10-verdict-ap-mtv8ql4c-0-autoformat-mutex-per-checkout-only.md`,
whose own last line reads: "real engineering work beyond one verification
firing's scope. Proposed as follow-up below; not attempted here." This
firing's unit is to verify that claim still holds, seventeen days later, and
process the VERDICT — not to attempt the redesign itself.

## Verification

**The code is byte-identical in the relevant sections to what `ap-mtv8ql4c-0`
examined on 2026-09-10.** Checked directly against current `HEAD`
(`d2902860`):

- `apps/dashboard/src/flight/ritual-lock.ts:48-50` still resolves
  `AUTOFORMAT_LOCK_FILE_NAME` via `resolveLockPath(dbPath, ...)` = `join(dirname(dbPath), lockFileName)` —
  no fleet-shared override.
- `apps/dashboard/src/fly.ts:1146` still wires `RemediatingGate`'s `withLock`
  straight to that per-checkout path — remediation still runs per-firing,
  not moved to land/sync-back time.
- `apps/dashboard/src/read/config.ts`'s `resolveDbPath()` still resolves
  `cwd()`-relative whenever `AUTOPILOT_DB` is unset, and it remains unset in
  this fleet's environment (`AUTOPILOT_FLIGHT_INSTANCE_ID=fleet-4`,
  `AUTOPILOT_DB` empty — checked this firing's own process env directly, same
  check `ap-mtv8ql4c-0` ran on 2026-09-10 for `fleet-2`).

**`docs/DOCTRINE-COORDINATION.md` (§5, lines 139-166) already carries the
corrected account** from `ap-mtv8ql4c-0`'s own commit: "Fixed for one
checkout; NOT fixed across the fleet's real topology," citing both dated
recurrences (`18aafd26`, `4dc4bc24`) and naming the two open alternatives —
a genuinely fleet-shared lock location, or moving remediation to
land/sync-back time. Neither has landed.

**One small drift found in passing (not the main finding, not fixed here):**
`ritual-lock.ts:41-42`'s own doc comment still asserts, uncorrected, that
`resolveLockPath` uses "the same lock directory every sibling instance
flying this checkout already shares" — the exact overclaim `ap-mtv8ql4c-0`
refuted in the doctrine doc. The doctrine doc was corrected in that commit;
this source comment, one call site over, was not. Leaving it alone here to
keep this firing's diff scoped to the debrief — the next firing that touches
`ritual-lock.ts` for the actual redesign should fix the comment in the same
commit as the code, not separately.

## VERDICT

**Confirmed — the split still holds, unchanged since `ap-mtv8ql4c-0`.** This
is genuine cross-cutting engineering work (either a fleet-shared lock
location reachable from every worktree, or relocating remediation into
`packages/engine/src/landing.ts`'s merge path, which today "has no
remediation of its own; it just fails the merge on a red `format:check`") —
correctly out of scope for a single verification firing, and out of scope for
this one too. Neither `fly.ts`, `ritual-lock.ts`, `config.ts`, nor
`landing.ts` appears on any sibling's live `.autopilot-intent` or unlanded
list in this firing's FLEET digest, so the slice is unclaimed and available
for a future firing with the runway to do it properly.

### Why this firing didn't pick the higher-ranked board items instead

Board rank 1 (`ap-mui2h3s1-1`, Versions screen) was investigated first: the
commit that shipped it, `d7296968`, was landed and then reverted
(`29f76133`) with no explanatory body. Cherry-picking `d7296968` onto current
`HEAD` applies cleanly with no conflicts, which rules out a source conflict
as the revert's cause and is consistent with `ap-mtuks0jm-0`'s documented
pattern of an unrelated red sweeping a trailing commit as collateral — but
relanding it touches `apps/dashboard/src/web/shell.ts` and
`apps/dashboard/src/web/layout-css.ts`, both of which this firing's FLEET
digest lists as live unlanded claims for sibling `fleet-2` and `fleet-3`.
Touching a sibling-claimed file is a hard containment rule, not a judgment
call, so this firing backed out its speculative cherry-pick unstaged and left
the reland for once those siblings clear (or for the operator to prioritize
directly). Rank 2 (`web-mtq07kj7-xcul0q`) is claimed right now by sibling
`fleet-8`'s own declared intent (`social-upstream-suggest.ts`). Rank 3
(`web-mtq0rtub-jxpptv`) is an explicitly HUMAN-GATED signing ritual. Ranks 4
and 5 (`ap-mui04ldw-0`, `ap-muhr0qsi-0`) are both tagged 🟣 for the operator.
Rank 6, this VERDICT, was the first item this firing could safely process
end to end.

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief alone — no source files touched.
The full gate was not re-run beyond `pnpm run ci:doc-links` scope checks
since nothing besides this new doc and the generated debriefs index changed.
