<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Scoping board `web-mtt3h1a4-divddf`: "maintainer verbs disabled-with-reason for non-owners"

Board (high): "role-gated UI addendum (operator refinement): maintainer verbs
render DISABLED-with-reason for non-owners, not hidden — tooltip names the
missing role and links the path to earn it; discoverability over
concealment." Investigated before attempting a slice, since the title reads
as a refinement of an existing hide-based pattern — that premise does not
hold in the current tree.

## What "maintainer verbs" already means here

The term is not a new coinage — it is already load-bearing prose in
`apps/dashboard/src/web/features/pr-review.ts:258` ("THE MAINTAINER VERBS —
only on the cards the ritual deliberately refuses to act on itself"),
covering the three buttons a `queue-for-human` PR-review card renders at
`pr-review.ts:262-277`: "🤝 Merge as maintainer", "↻ Re-run failed", "⟳
Update branch". All three already render **disabled-with-reason**, not
hidden: `humanMergeReadiness()` (`web/pr-review-panel.ts:211`) computes
`{ready, reason, hasFailedChecks, behindBase}` and the shared
`prPanelButton()` helper (`features/pr-review.ts:131-142`) sets
`b.disabled = true` + `aria-disabled` + a `data-tip` reason rather than
omitting the button — exactly the pattern the board title asks for.

**The gating axis is PR *readiness* (checks red, branch behind, not yet
mergeable), not viewer *role*.** Nothing in the app currently hides or
disables a UI element based on who is looking at it.

## No role/ownership signal reaches the client

Grepped `apps/dashboard/src/web` for `isOwner`, `viewerIsOwner`, `RoleGate`,
`viewerRole`, `isMaintainer` — zero matches (the only `role` hits are ARIA
`role="group"`/`role="img"` attributes, unrelated). The one identity read
that exists, `fetchViewerLogin` (`flight/pr-review.ts:3019`), is used purely
to detect self-authored PRs for the KEEPER ritual's own guard — never
surfaced to the dashboard UI, never compared against a "who am I" concept a
button could gate on.

This lines up with epic `0007-platform-maintainer-and-pool.md`'s standing
design: MASTERMIND's dashboard runs the maintainer autopilot under the
founder's own gh identity (line 17-20); every other contributor "connects
with their OWN GitHub user" and, "from their own dashboard ... flies it
LOCALLY on their clone with their own tokens" (lines 21, 71) — one identity
per running dashboard instance. A shared dashboard where a non-owner views
(and needs to be UI-gated away from) another user's maintainer verbs is not
a scenario the current architecture produces anywhere. The board title's
"for non-owners" presupposes multiple viewers of one dashboard, which does
not exist yet.

## The tooltip primitive cannot carry the requested link either

`[data-tip]` (used in ~49 `web/` files) renders through `showTip()`
(`web/shell.ts:516-528`) via `tip.textContent = target.getAttribute(...)` —
plain text, `pointer-events: none`. "Links the path to earn it" needs a
clickable element inside the tip, which this primitive structurally cannot
host without a rework (interactive/hover-persistent popover, or a
click-to-open affordance next to the disabled button instead of inside the
tip).

## Verdict: split, not a one-firing slice

Two prerequisites the task's own wording assumes already exist do not:

1. A role/ownership signal reaching the client at all (blocked on a design
   decision: does a shared multi-viewer dashboard even ship before this is
   meaningful, or is this forward work for that future state?).
2. A tooltip/disabled-affordance that can host a real link, not just text.

Neither is a mechanical extension of the existing `prPanelButton()` pattern
— building the button-level change first, without (1) and (2), would mean
either fabricating a role check with nothing real to gate, or shipping a
link-capable tooltip nobody calls yet. Recommending as separate slices once
prioritized:

- **(a)** Design decision: confirm whether/when a dashboard needs to render
  another identity's maintainer verbs at all, given the current
  one-identity-per-dashboard architecture (epic 0007). This is the actual
  blocker — everything below is speculative until it is answered.
- **(b)** A link-capable disabled-reason affordance (extend `[data-tip]` or
  add a sibling popover) — a real, generically useful UI primitive once (a)
  names a caller for it.
- **(c)** Apply role-gating to the known maintainer-verb call sites
  (`pr-review.ts:262-277`) once (a) and (b) land.

This firing does not attempt (a)-(c) — each depends on the one before it,
and (a) is an operator-level product decision, not something a firing can
resolve unilaterally.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file — the only file staged
or touched. Pure documentation: `docs/` is excluded from `prettier --check
.` (`.prettierignore`) and from ESLint's `files` globs
(`*.ts`/`*.mjs`/`*.js` only in `eslint.config.js`), so it adds no source or
test code and `typecheck`/`test`/`build` are structurally unaffected.
