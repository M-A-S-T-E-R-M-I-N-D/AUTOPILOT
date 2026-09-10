<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# CONTRIBUTOR JOURNEY slice 1/4 (`ap-mtu6l8cr-0`): firing 432's checkpoint verified and closed

Per the RESUME CHECK protocol, this firing's first job was to finish the unit
firing 432 left mid-flight (`b1da272f "wip(autopilot): checkpoint — firing
432 died mid-unit; next firing resumes it"`, `.autopilot-intent`: "ship the
dashboard panel (UI expression) for the live good-first/help-wanted issue
list"). The checkpoint's diff was already complete and the working tree was
already clean — nothing further to write — so this firing's unit was full
gate verification of that diff before treating the slice as done.

## What the checkpoint shipped

`apps/dashboard/src/flight/contributor-issue-list.ts`'s pure decision core
(`planContributorIssueList`) and live `gh issue list` read
(`fetchContributorFacingIssues`) had already shipped in earlier firings
(`f47f7564`, `41a65f86`). The checkpoint completed the slice's UX expression,
the piece flagged as still missing by `docs/debriefs/2026-09-10-verdict-
ap-mttxbufs-0-contributor-journey-split-reconfirmed.md`:

- `createContributorIssueListPreviewApi` (`flight/contributor-issue-list.ts`)
  composes the fetch + pure plan behind one call, mirroring
  `publicity.ts`'s `PublicityPreviewApi` shape.
- `handleContributorIssueList` (`server/contributor-issue-list.ts`) serves it
  at `GET /api/contributor-issues`, wired into `server/main.ts` and
  `server/server.ts` the same way `poolClient`/`publicity` are.
- `contributorIssueListJs` (`web/features/contributor-issue-list.ts`) is the
  real client panel: polls the endpoint every 30s, hides the section
  entirely when there is nothing open (the same convention the Pool panel
  uses), and renders each issue as a safely-targeted external link
  (`target="_blank"` + `rel="noopener noreferrer"`) with a tier badge from
  `contributorIssueTierBadge` (`web/contributor-issue-list-panel.ts`).
- `web/shell.ts` gained the `#contributor-issue-list-panel` section (`aria-
  label="Good first issues"`), and `web/chunks.ts` / `web/features/index.ts`
  wire the module into the deferred-feature and splice-manifest censuses.

## Verification performed this firing

- `pnpm run typecheck` — clean.
- `pnpm run lint` — clean.
- `pnpm run format:check` — clean.
- `pnpm run build` — clean.
- `pnpm run test:impacted` — clean.
- Targeted `vitest run` across all six touched/added test files (`flight/
  contributor-issue-list.test.ts`, `server/contributor-issue-list.test.ts`,
  `web/contributor-issue-list-panel.test.ts`, `web/contributor-issue-list-
  render.test.ts`, `web/features/contributor-issue-list.test.ts`, `tooling/
  generate-splice-manifest.test.ts`) — 240/240 passed, including the splice-
  manifest census confirming the committed `features/index.ts` matches a
  fresh regeneration.
- The census suite (`flight/gh-exec-census.test.ts`, `web/masthead-
  census.test.ts`, `flight/link-census.test.ts`) — 19/19 passed.
- `web/a11y.test.ts` (the repo-wide axe scan over `renderShell()`) — clean;
  the new panel's real-bundle render test (`contributor-issue-list-render.
  test.ts`) confirms the rendered link is a real `<a>` (native keyboard
  operability) with a descriptive `aria-label`.

## Verdict

**Slice 1/4 (`ap-mtu6l8cr-0`, "in-app live good-first/help-wanted issue
list") is complete.** All three layers named in the split verdict — pure
core, live `gh` read, and dashboard UI expression — are shipped, wired into
the served bundle, and gate-green. Slices 2–4 of the CONTRIBUTOR JOURNEY
epic remain tracked separately per the split verdict; slices 3–4 were found
already shipped elsewhere in that same debrief, leaving only slice 2 (the
`/claim` walkthrough) as genuinely open.
