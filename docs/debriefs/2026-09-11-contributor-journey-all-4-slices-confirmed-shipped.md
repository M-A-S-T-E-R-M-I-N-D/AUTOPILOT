<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# CONTRIBUTOR JOURNEY (`web-mtt3hery-l8v0lf`): all 4 slices now confirmed shipped, gate-verified

Follow-up to `docs/debriefs/2026-09-10-verdict-ap-mttxbufs-0-contributor-journey-split-reconfirmed.md`,
which confirmed slices 3 (partner-application deep-link) and 4 (STANDING
explainer) shipped but found slices 1 (live good-first/help-wanted list) and
2 (`/claim` walkthrough, fork-first etiquette) "genuinely still unshipped."
This firing re-checked that claim against the current tree (`HEAD` `6cf03d09`,
working tree clean before this commit) rather than assuming it still holds,
per the VERDICT/checkpoint-verification protocol — it does not hold anymore.
Both remaining slices are now in the tree, wired into the served bundle, and
covered by tests.

## Slice 1 — live good-first/help-wanted list — shipped

`apps/dashboard/src/web/contributor-issue-list-panel.ts` (formatting) +
`apps/dashboard/src/web/features/contributor-issue-list.ts` (served client
panel) + `apps/dashboard/src/server/contributor-issue-list.ts`
(`GET /api/contributor-issues`) + `apps/dashboard/src/flight/contributor-issue-list.ts`
(`planContributorIssueList`, `fetchContributorFacingIssues` — the real `gh
issue list --state open` read). Wired into `web/shell.ts:4128`'s
`#contributor-issue-list-panel` section, registered through
`web/features/index.ts`'s auto-generated splice manifest. This code landed
via an un-squashed `wip(autopilot): checkpoint` commit (`b1da272f`, "firing
432 died mid-unit") — a same-day firing (`b766622c`) wrote a "verify and
close" debrief confirming it, but that debrief commit was itself reverted
minutes later (`ea775d95`, no reason stated in either commit message) during
a run of sync/autoformat churn on this branch. This firing re-verified the
underlying code and tests independently rather than trusting that stranded
debrief — the revert only removed a documentation file, never touched the
feature's source or tests.

## Slice 2 — `/claim` walkthrough (fork-first etiquette) — shipped

`contributor-issue-list-panel.ts`'s `CLAIM_WALKTHROUGH_STEPS` (four steps
condensed from `.github/CONTRIBUTING.md`: fork, claim, build, ship) rendered
by `features/contributor-issue-list.ts`'s `renderClaimWalkthrough()` as a
native `<details>`/`<summary>How to claim</summary>` disclosure appended
under the issue list — keyboard-operable with no hand-rolled ARIA, and gated
behind the same "hidden when nothing to show" rule as the list itself (a
visitor with nothing open has nothing to walk through). This code landed via
a second un-squashed checkpoint (`c89cbe98`, "firing 446 died mid-unit") that
had never been verified or closed by any later firing until now.

## Verification performed this firing

- `apps/dashboard/test/web/contributor-issue-list-render.test.ts` — real-bundle
  DOM test (`renderShell()` + `clientJs()`, not the function in isolation):
  confirms the walkthrough renders as a real `<details>` with 4 `<li>` steps
  alongside the list, and renders nothing when the list is empty.
- `apps/dashboard/test/web/contributor-issue-list-panel.test.ts` — unit
  coverage on `CLAIM_WALKTHROUGH_STEPS`' content and ordering (fork before
  claim before build before ship).
- Targeted run of all 5 contributor-issue-list test files: 44/44 passed.
- Full gate, this worktree, this firing: `typecheck` (8 project refs) clean,
  `lint` clean, `format:check` clean, `build` (`tsc -b`) clean, `test`
  (`vitest run`) — **677 test files, 10374 tests, all passed**.

## Board recommendation

All four CONTRIBUTOR JOURNEY slices have a real, tested, accessible UI
expression in the served bundle. The epic and its three still-open follow-up
tasks are stale and should be marked complete:

- `web-mtt3hery-l8v0lf` (the epic itself)
- `ap-mtu6l8cs-1` (slice 2/4, `/claim` walkthrough — confirmed above)
- `ap-mtu6l8cs-2` (slice 3/4, partner-application deep-link — confirmed in
  the prior debrief)
- `ap-mtu6l8ct-3` (slice 4/4, STANDING explainer — confirmed in the prior
  debrief, which already flagged this one by ID)

## Flagged, not fixed, this firing

`apps/dashboard/src/web/features/docs-viewer.ts` independently pins
`.github/CONTRIBUTOR-STANDING.md` to the top of the generic docs-viewer
panel's file list (`STANDING_DOC_PATH`, tested in
`test/web/docs-viewer-standing.test.ts`), explicitly filed against
`ap-mtu6l8ct-3` — the same board task the purpose-built, role-aware
`contributor-standing-panel.ts` already satisfies. This is the sibling
fleet-4 collision the prior debrief warned about; it landed anyway, so the
dashboard now ships two live UI expressions of the same tiers content. A
real, low-risk dedup opportunity, but a UX call (which surface to keep, or
whether both earn their place) rather than a mechanical one — left for a
dedicated firing rather than folded into this verification unit.
