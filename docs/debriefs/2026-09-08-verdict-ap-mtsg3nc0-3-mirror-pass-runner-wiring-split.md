<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtsg3nc0-3`: EPIC 0019 S3 mirror-pass is confirmed unstarted at the runner/CLI/HTTP layer

Board: `ap-mtsg3nc0-3` (VERDICT split, targeting `web-mtrh1hlh-62l41b` — EPIC
0019 S3 "issues⇄board mirror per project") — "mirror-pass.ts has planner
logic but zero runner/CLI wiring — split into (a) runMirrorPass + CLI wiring
for this repo [...]".

## Verification of the claim

Confirmed on all three counts.

1. **Zero runner.** `apps/dashboard/src/flight/mirror-pass.ts` (903 lines)
   holds four independent pure-planner derivations — reconcile
   (`planMirrorPassReconcile`), landing-note (`planMirrorPassLandingNote`),
   version/counts/link drift (`planMirrorPass{Version,Counts,Link}Drift`),
   and stale-claim reaper (`planMirrorPassStaleClaimReaper`) — each with its
   own `fetch*`/`read*` read wiring. But nothing composes fetch → plan →
   apply into one pass. Compare `issue-triage.ts`'s `runIssueTriageRitual`
   (fetches open issues, batch-plans them, executes the resulting `gh`
   commands, then applies board-task writes, all in one exported async
   function) — `mirror-pass.ts` has no equivalent for any of its four
   derivations. `grep -rn "runMirrorPass"` across `apps/dashboard/src` and
   its own test file returns nothing.
2. **Zero CLI/HTTP wiring.** Four sibling flight files each pair a pure
   planner with an `*-execute.ts` companion that builds a preview API
   (read-only, no mutation) and an execute API (the real `gh`-mutating run)
   against the real store + real `CliExec`, wired into `server.ts` behind
   CSRF/rate-limit guards, with a dashboard panel driving both endpoints:
   `issue-triage.ts` → `issue-triage-execute.ts`, `pr-review.ts` →
   `pr-review-execute.ts`, `report-from-here.ts` →
   `report-from-here-execute.ts`, `pool-client.ts` → `pool-client-execute.ts`.
   `mirror-pass.ts` has no `mirror-pass-execute.ts`, no `server.ts` route, no
   `web/mirror-pass-panel.ts`, and no CLI script entry — confirmed by listing
   `apps/dashboard/src/flight/*.ts` (55 files, no `mirror-pass-execute.ts`
   among them) and `apps/dashboard/test/flight/mirror-pass.test.ts` (tests
   only the pure planners/fetchers already listed above).
3. **S3 itself is two halves, and only one half has planner code at all.**
   `docs/epics/0019-github-steward.md` defines S3 as: "board task done ⇒
   close linked issue with the landing SHA" (mirror-pass derivation 1/4 —
   `planMirrorPassReconcile`'s close path — has a planner, per point 1
   above, no runner) **and** "issue labeled/milestoned by the maintainer ⇒
   board priority follows" (epic law 2). The second half has zero code
   anywhere in `mirror-pass.ts` — no type, no planner, no fetch wiring
   mentions `priority` or `milestone` at all. This is not a wiring gap on
   top of finished logic; it is an unwritten derivation.

## VERDICT

**Confirmed, and the split call is correct — this is not a one-firing
unit.** Point 2 alone (preview/execute API pair, CSRF-guarded HTTP route,
dashboard panel) is the same shape that shipped as its own dedicated slice
for each of the four sibling rituals it was compared against; point 3 adds
an entirely new planner derivation epic law 2 requires before any wiring is
meaningful. Recommending as separate, independently-shippable slices:

- **(a) `runMirrorPass` composition + read-only CLI/preview wiring.** One
  `mirror-pass-execute.ts` (or four, one per derivation — TBD by whoever
  picks it up) mirroring `issue-triage-execute.ts`'s
  `createIssueTriagePreviewApi` shape: fetch real issue state + comments via
  `realCliExec`, run each `plan*` batch, return the findings — no `gh`
  mutation yet. This is the smallest slice that turns "pure planner" into
  "something a firing can actually run and see output from."
- **(b) The mutating execute path + HTTP wiring.** A
  `createMirrorPassExecuteApi` counterpart plus the
  `GET /api/mirror-pass` + `POST /api/mirror-pass/execute` route pair in
  `server.ts`, CSRF-guarded and rate-limited the same way
  `release/execute.ts` is — the actual "close issue with landing note" /
  "reopen honestly" / "file drift issue" / "reap stale claim" `gh` calls
  going live.
- **(c) Dashboard UI panel.** `web/mirror-pass-panel.ts` +
  `web/shell.ts` wiring so a maintainer can see and trigger a mirror pass
  per project, closing the UX-expression gap the same way
  `issue-triage-panel.ts` closed it for KEEPER triage — required before any
  of (a)/(b) could be tagged `"completion":"complete"` under this repo's own
  UX-EXPRESSION DOCTRINE.
- **(d) The unwritten "issue labels/milestone ⇒ board priority" derivation.**
  A fifth `planMirrorPass*` function (decision core first, same pure-planner
  pattern as the existing four) plus whatever board-priority write path it
  needs — this has no code to wire yet, so it blocks behind its own planner
  slice, not behind (a)-(c).

This firing does not attempt any of (a)-(d) itself — each is independently
larger than one firing's safe unit, and per the VERDICT-processing
protocol this firing's own unit is the verification above, not the
underlying task.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, added with a scoped
`git add <this-path>` — the only file this firing staged or touched. It is
a pure documentation addition: `docs/` is excluded from `prettier
--check .` (`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), and it adds no
source or test code, so `typecheck`/`test`/`build` are structurally
unaffected by it.
