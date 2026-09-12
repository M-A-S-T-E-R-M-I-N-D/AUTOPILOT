<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing board `web-mtrh1hlh-62l41b`: firing 505's checkpoint finishes the last mirror-pass execute button; the board-priority half stays open

RESUME CHECK: the tip commit at this firing's start was
`38c03d5d wip(autopilot): checkpoint — firing 505 died mid-unit; next
firing resumes it`, touching `flight/mirror-pass-execute.ts`,
`web/features/mirror-pass.ts`, `web/mirror-pass-panel.ts`,
`packages/tokens/src/strings.ts`, and three test files. Per the RESUME
CHECK protocol, this firing's first job was to finish that unit before
picking anything else — this debrief is that verification.

## Verification of the claim

1. **The checkpoint's diff is the "Free stale claim(s)" button** —
   `mirrorPassCanExecuteStaleClaim` (`web/mirror-pass-panel.ts`, same role
   gate as the other three: a confirmed non-maintainer never sees it, an
   unresolved identity still does), wired into `web/features/mirror-pass.ts`
   as a fourth independent button posting to
   `POST /api/mirror-pass/stale-claims/execute`
   (`flight/mirror-pass-execute.ts`'s `createMirrorPassStaleClaimExecuteApi`,
   already live with zero dashboard trigger before this), plus its six
   `mirrorPassStaleClaim*` strings in both `en` and `he` in
   `packages/tokens/src/strings.ts` (the only two locales the table
   carries).
2. **It is the last of the four UI buttons, not a new derivation.** The
   board's own "prior slices shipped" list already had derivation 1/4
   (reconcile), 2/4 (landing-note) and 4/4's mutating execute path + HTTP
   route wired; this checkpoint's only remaining gap was 4/4's own
   dashboard trigger. `web/features/mirror-pass.ts`'s
   `renderMirrorPassBody` now takes `canExecuteStaleClaim` as a fifth
   parameter alongside the pre-existing three gates, and all four buttons
   render independently of one another.
3. **Gate is fully green with zero further changes needed.** Ran the full
   project gate from the checkpoint tip as-is: `pnpm run typecheck`,
   `pnpm run lint`, `pnpm run format:check`, `pnpm run test:impacted`, and
   `pnpm run build` all passed clean. Also ran
   `apps/dashboard/test/web/mirror-pass-panel.test.ts`,
   `mirror-pass-panel-guest.test.ts`, and
   `web/features/mirror-pass.test.ts` directly — the checkpoint's own new
   tests cover the role gate (hides for a confirmed non-owner, shows for
   the resolved maintainer, shows when identity is unresolved, hides with
   no finding), the button's i18n wiring (data-i18n/-tip/-aria, confirm
   dialog, in-flight and failure states via `tr()`), and the fetch call
   itself — not a stub.
4. **The board title's other half is still unwritten**, confirmed against
   `docs/debriefs/2026-09-08-verdict-ap-mtsg3nc0-3-mirror-pass-runner-
   wiring-split.md` (the split verdict this board item traces to): its
   item (d), "issue labeled/milestoned by the maintainer ⇒ board priority
   follows" (epic law 2), has no planner, no type, and no fetch wiring
   anywhere in `flight/mirror-pass.ts` today — `grep -rn "priority\|
   milestone" apps/dashboard/src/flight/mirror-pass.ts` returns nothing.
   That is a fifth, unwritten `planMirrorPass*` derivation, independently
   larger than this firing's unit, per the split verdict's own
   recommendation.

## VERDICT

**The checkpoint is complete and safe to leave as-is in history — no
follow-up commit was needed.** All four mirror-pass execute derivations
((a) reconcile, (b) drift, (c) landing-note, (d… numbered 4/4) stale-claim)
now have both their HTTP route and their dashboard trigger, closing this
epic's UX-EXPRESSION gap for the "board done ⇒ close linked issue" half of
S3. The board item itself stays open (`"completion":"slice"`, not
`"complete"`): the "maintainer labels/milestones ⇒ board priority" half
has zero code yet and needs its own planner slice first, exactly as the
2026-09-08 split verdict called it.

## A second, unrelated stale board item noticed in passing

While reviewing the board for pick discipline, `web-mtt8lo8x-lna12h`
("EPIC 0020 S5 LINK CENSUS: a test fails when a rendered GitHub noun
... has no link while the API reported a URL for it") matches
`docs/epics/0020-legible-surface.md`'s slice 5 row **word for word**,
which is marked **shipped** — `test/flight/link-census.test.ts` already
exists, diffs the `src/flight/` directory on disk (never a hand-kept
list), and passed clean when run directly
(`npx vitest run apps/dashboard/test/flight/link-census.test.ts` — 3/3).
This firing did not touch it or claim it — flagging it here as a proposed
`close` verdict for whoever triages the board next, since it appears to
be a stale duplicate of already-shipped work.

## Pick-discipline note

Ranks 1-4 (`web-mtsylqbd-q2rg8k`, `web-mtt8lo8x-lna12h`,
`web-mtvpuoj4-tv1z09`, `web-mtt3f7j6-3bj899`) were not evaluated for a
fresh pick this firing — the RESUME CHECK protocol requires finishing the
mid-flight checkpoint before any new pick, and the checkpoint's own
underlying task is this item, rank 5. `picked_rank: 5`,
`deviation_reason`: resume-check priority, not a quality judgment on the
higher-ranked items.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, staged and committed
on its own — a pure `docs/` addition. `docs/` is excluded from `prettier
--check .` (`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so it adds no
source or test code and `typecheck`/`build` are structurally unaffected.
The full gate (typecheck, lint, format:check, test:impacted, build) was
run in full against the checkpoint tip before writing this file, plus the
three mirror-pass test files and the link-census test file directly, all
green, all cited above.
