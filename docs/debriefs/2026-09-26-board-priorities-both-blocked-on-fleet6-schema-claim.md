<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing board priorities (firing 307): both ranked tasks blocked on fleet-6's live `packages/store/src/schema.ts` claim

Board (fleet-4, firing 307) ranked two tasks, top to bottom:

1. `ap-mu7ktjpc-2` — Board→issues export slice 3/3: HTTP execute + UI
2. `web-mty1azf9-2we84o` — TELEMETRY: a checkpoint-killed firing records cost as a fabricated
   `$0.00` (the `cost_unknown` reland)

Neither was buildable this firing. Both share one root blocker, verified independently below.

## `ap-mu7ktjpc-2` (rank 1): blocked on its own unlanded slice 1/3

`docs/debriefs/2026-09-19-verdict-ap-mu6lf6ve-4-board-issues-export-split-confirmed.md` split the
board→issues export ritual into three independently-landable slices: (1) a `shareable` data-model
flag, (2) a pure ritual planner, (3) the confirm-guarded HTTP execute path + dashboard panel (this
board item). Slice 2 has landed — `87f63a1c feat(flight): plan the board-to-issues export as a
pure decision core` (`apps/dashboard/src/flight/board-issue-export.ts`,
`apps/dashboard/test/flight/board-issue-export.test.ts`).

Slice 1 (the `shareable` flag) has **not** landed. Confirmed by inspection: `packages/store/src/
types.ts`'s `TaskRow` has no `shareable` field, and `packages/store/src/schema.ts`'s `MIGRATIONS`
tops out at `{ version: 22, name: 'firing_seq' }` — no migration adds one. The only source hits for
`shareable` repo-wide are `board-issue-export.ts`'s own `BoardExportTask` interface (documented
inline as "the operator's explicit opt-in (slice 1/3's flag)") and its test fixtures — there is no
way today to produce a real `shareable: true` task from the store.

This firing's FLEET digest names the reason: sibling `autopilot/flight-worktree-fly-autopilot--
fleet-6` currently declares live intent `packages/store/src/schema.ts — web-mtpzqrw8-dsy6a9 slice
1/3: shareable flag (data model + persistence only, no GitHub I/O)`, unlanded (its last commit is
`wip(autopilot): checkpoint — firing 140 died mid-unit; next firing resumes it`). Building slice 3
now would mean either quietly building slice 1 too inside this firing — contradicting the split
verdict's own rationale for three *independent* slices — or shipping an endpoint + panel that can
only ever see `shareable: true` in a test fixture, never a real task, which fails this repo's own
UX-EXPRESSION doctrine (a capability without a reachable, real operator surface is not complete).
Slice 3 should wait for fleet-6's slice 1 to land.

## `web-mty1azf9-2we84o` (rank 2): reland blocked by the same file, same sibling

Per `docs/debriefs/2026-09-26-cost-unknown-revert-root-cause-stale-dist-trap.md`, relanding
`489fb8eb` (migration v23, `metrics.cost_unknown`) is gate-clean once `packages/store/src/
schema.ts` is free of a live sibling claim — the earlier attempt this cycle discarded its own
uncommitted, fully-gate-passing change specifically because fleet-6's claim on that same file
pre-empted the commit. This firing re-checked the current FLEET digest: fleet-6's intent on
`packages/store/src/schema.ts` is unchanged from that debrief — still slice 1/3 (`shareable`),
still unlanded. The reland remains blocked for the identical reason, on the identical file.

## VERDICT

Both ranked tasks are correctly left open, not stale or invalid — they share exactly one blocker:
fleet-6's in-flight, unlanded `packages/store/src/schema.ts` work (`web-mtpzqrw8-dsy6a9` slice
1/3). Once that lands (or the claim clears), both become immediately actionable: rank 2 is a clean
cherry-pick of `489fb8eb` followed by rebuild-then-regenerate-`docs/DATA-MODEL.md` (see that
debrief's documented order); rank 1 needs the newly-landed `shareable` field wired into
`board-issue-export.ts`'s real input, plus the confirm-guarded HTTP+UI slice `ap-mu6lf6ve-4`
describes.

## Note for the operator

Fleet-6's slice 1/3 has already died mid-unit and been checkpointed at least once (firing 140)
without landing. If it stalls again, two ranked board items stay stuck behind it — worth freeing or
reassigning `packages/store/src/schema.ts` if that recurs, rather than leaving both blocked
indefinitely.

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief file plus the regenerated `docs/debriefs/README.md`
index (`node scripts/docs/generate-debriefs-index.mjs`) — the only paths this firing staged or
touched. Pure documentation: `docs/` is excluded from `prettier --check .` (`.prettierignore`) and
`.md` files are outside ESLint's configured `files` globs, so this adds no source or test code and
`typecheck`/`test`/`build` are structurally unaffected.
