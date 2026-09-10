<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mttxbufs-0`: CONTRIBUTOR JOURNEY split — 2 of 4 slices already shipped, 1 stale board entry, 1 live sibling collision

Board (medium/priorities): "VERDICT split web-mtt3hery-l8v0lf: CONTRIBUTOR
JOURNEY bundles 4 independently-shippable slices (live good-first/help-wanted
list, /claim walkthrough, partner-application deep-link, STANDING explainer)."
Originated from commit `92dfd1a1`'s free-pick reasoning: the epic "bundles
four independently-shippable UI features with zero existing dashboard
scaffolding — a multi-firing epic needing its own slice breakdown, not a
single unit."

This firing's unit, per the VERDICT-processing protocol, is verification —
re-check the claim against the current tree before treating it as still
accurate. It was NOT accurate: two of the four named slices have shipped
since the verdict was filed, but only through the shared integration branch,
invisible to a stale worktree's `git log`.

## This worktree was stale relative to `autopilot/flight`

This worktree's checked-out tip (`81da8fa9`) sits 40+ commits behind
`origin/autopilot/flight` (tip `40d0e13c`, fetched fresh this firing). Any
board-fit check that only reads local history risks re-doing, or missing the
completion of, work another fleet member already landed and synced. Verifying
against the fetched remote tip — not just `git log` in this checkout — is
what surfaced everything below.

## Slices 3 and 4 are already shipped

`apps/dashboard/src/web/contributor-standing-panel.ts` (landed in the
`41461e34`/`fc17cbd3`/`237c72fc` checkpoint range, refined by `377d347f` "the
standing panel asks who is looking, and sync can push"; paired with
`features/contributor-standing.ts`, which splices the module's real compiled
source into the served bundle, and `contributor-standing-panel.test.ts`)
implements:

- **Slice 4 (STANDING explainer):** `CONTRIBUTOR_STANDING_TIERS`, ported
  verbatim from `.github/CONTRIBUTOR-STANDING.md`'s tiers table, rendered
  read-only — plus `standingPanelOffer()`, which is *more* than the board
  title asked for: role-aware rendering so a maintainer sees "you are here"
  and a link to review pending applications instead of being invited to
  apply for a rank below their own (the role-honesty law read in its less
  obvious direction, per `377d347f`'s commit message).
- **Slice 3 (prefilled partner-application deep-link):** `partnerApplicationUrl()`
  / `CONTRIBUTOR_STANDING_APPLY_URL` — a fully static
  `.../issues/new?template=partner-application.yml` URL needing no `gh` round
  trip, plus `partnerApplicationsReviewUrl()` for the maintainer's review-queue
  link. The module's own doc comment calls this "a second slice of that task,
  alongside the tiers explainer above."

Both are wired into the served client bundle (not dead code) and covered by
`contributor-standing-panel.test.ts`. **`ap-mtu6l8ct-3`** (the board's own
"slice 4/4" follow-up task) **is stale and should be marked complete, not
left open** — the capability it names already has a real, tested, accessible
UI expression.

## Live collision: sibling fleet-4 is duplicating already-shipped slice 4

Sibling worktree `autopilot/flight-worktree-fly-autopilot--fleet-4` (local
branch, checkpoint commit `1c1bb7bf`, "firing 386 died mid-unit") is actively
building `apps/dashboard/test/web/docs-viewer-standing.test.ts` +
`features/docs-viewer.ts`: pinning `.github/CONTRIBUTOR-STANDING.md` to the
top of the generic Docs-reader panel's list via the existing
fetch+renderMarkdown pipeline — explicitly filed against `ap-mtu6l8ct-3` per
that test file's own doc comment. fleet-4's worktree is *also* stale relative
to `autopilot/flight` (same root cause as this one), so it has no way to know
a purpose-built, role-aware panel already satisfies the same board task
upstream. Landing both would leave two different UI expressions of the same
tiers content. Flagging here rather than touching fleet-4's files (both the
FLEET-claim rule and the fact that their in-progress diff is invisible to me
beyond the checkpoint commit) — fleet-4's next firing or the operator should
check `origin/autopilot/flight`'s `contributor-standing-panel.ts` before
continuing that slice.

## What is genuinely still unshipped

No shipped code anywhere in `autopilot/flight` (checked by path and by
content) implements:

- **Slice 1 — live good-first/help-wanted list:** needs a real `gh issue
  list --label` read, unlike slices 3–4 which turned out to be fully static.
- **Slice 2 — /claim walkthrough (fork-first etiquette):** needs a guided,
  multi-step UI flow, not a data read.

Both remain genuine, independent, multi-step slices — each still exceeds one
firing's safe unit on its own (real `gh` data wiring plus a new UI surface),
consistent with the original verdict's reasoning for the parts of the epic
that turn out to actually need it.

## Verification note for this firing's own METRICS

This firing's unit is this debrief file plus the fetch-and-read verification
behind it — no source or test file touched. `docs/` is excluded from
`prettier --check .` (`.prettierignore`) and from ESLint's `*.ts`/`*.mjs`/
`*.js`-only `files` globs (`eslint.config.js`), so `typecheck`/`test`/`build`
are structurally unaffected.
