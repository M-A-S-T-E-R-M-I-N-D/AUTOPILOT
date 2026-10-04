<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Epic 0019 — GitHub Steward: the pilot manages the page

**Operator directive (2026-09-07):** "I want to manage AUTOPILOT through
GitHub and route the pilots under me — and anyone running AUTOPILOT on
their own folder should get the same: their pilot is the GitHub manager
of THEIR project, exactly like mine is of this one."

Today the AUTOPILOT repo's page is hand-stewarded (labels taxonomy,
milestones, single-visible-release, triage labeling, partner registry —
all applied manually on 2026-09-07). This epic productizes that hand
into a per-project ritual any instance can run on any repo it owns.

## Laws

1. **Role honesty first** — every steward act resolves identity through
   `social-pass.ts`'s `resolveSocialIdentity`: `maintainer` verbs only on
   a repo the viewer owns; on anyone else's repo the steward is a guest
   and proposes instead of writes. (Epic 0016 law 5, inherited whole.)
2. **The operator routes through GitHub** — labels, milestones and issue
   assignment are STEERING inputs: what the maintainer marks
   `priority: high` outranks triage; a milestone is a flight objective.
   The board and the page must agree in both directions.
3. **Taxonomy is seeded, not assumed** — the steward can stamp the house
   scheme (priority/area/status groups, epic, community set) onto a
   fresh repo idempotently (`--force` label upserts), then keep using it.
4. **Anti-spam law applies** (epic 0016 law 4) — budgeted voice, know
   your own submissions, thread-in never duplicate.
5. **Fork-local freedom** — a user may run the steward against their
   fork or a private mirror; nothing ever writes to an upstream they do
   not own (the guest rule above makes this structural, not configured).

## Slices

- **S1 — taxonomy seeder ritual:** one command/panel action stamps the
  label scheme + starter milestones onto any owned repo; idempotent;
  documented in a governance doc the ritual itself cites.
- **S2 — triage learns the taxonomy:** accepted issues get
  area/priority labels + a milestone; `partner-application` routes to
  dossier+human, never auto-verdicts (boarded 2026-09-07).
- **S3 — issues⇄board mirror per project:** generalize mirror-pass —
  board task done ⇒ close linked issue with the landing SHA; issue
  labeled/milestoned by the maintainer ⇒ board priority follows (law 2).
  **Per-project previews 2026-10-01 (board ap-muhqoogl-0):** `gh` acts on
  one repository, and the five EXECUTE apis already refused a project whose
  origin is another one (0a6a70b7). The four previews that read issues did
  not: called for such a project, they read `gh`'s repository and returned
  its issues as that project's findings. The panel stopped asking once it
  knew, but a page with no origin to compare, or a direct call, still got
  them. `main.ts` now wraps each of the five previews in
  `refuseRepoMismatchedPreview` (drift reads only the project's own tree,
  and is wrapped so all five answer alike), which runs the same check as
  the execute gate before the preview reads anything. The check is role-blind, because a preview is a read. A known
  mismatch throws `MirrorPassRepoMismatchError`. The route still answers
  its usual null body and adds `skippedReason: 'repo-mismatch'` plus both
  repository names, and the panel shows its "not the repository gh acts on"
  line instead of "Board and GitHub agree". An unknown project, an
  unresolved identity, or a project with no GitHub origin runs the preview
  as before. Making `gh` act on the project's own repository
  (`--repo`/`GH_REPO`) is still open.
  **The maintainer's marks 2026-10-03 (board web-mtsylqbd-q2rg8k, the
  additive-only law):** a board task outlives a later "no" on its issue.
  When the maintainer declined an accepted issue (`declined`) and closed
  it, the reconcile reopened it and called the close "a false-close". On
  an issue they had put on hold (`status: awaiting-human`, `status:
  blocked`) it closed, noted or settled as if the label were not there.
  `fetchIssueState` now reads the labels in the same `gh issue view` call.
  The reconcile and the landing note plan nothing for an issue that
  carries any of the three marks, matched the way the contributor lists
  match them, and the landing note does not read that issue's comments.
  Lifting the label lets the next pass act as before. Covered by
  `test/flight/mirror-pass-marks.test.ts`: the labels are the seeder's,
  each of the five reconcile findings and the landing note skip a marked
  issue, and the execute sends no reopen or note for it while its unmarked
  neighbour is still reconciled.
- **S4 — operator routing console:** the dashboard surfaces "what the
  page says" (milestone progress, label queues, claims) next to the
  board, so steering happens from either side with one truth.
  _Shipped so far (board web-mtrh1hn3-8x9f0z):_ the console's model,
  `flight/routing-console.ts`. `planRoutingConsole` derives it purely from
  the open milestones and the open issues: milestone progress (soonest due
  first, percent rounded down so an open issue never reads 100%), one queue
  per house `priority:`/`status:` label in any casing, the issues no
  priority label routes yet, and claims by assignee.
  `fetchOpenMilestones` is its one new read, and a failed page reads as
  unknown, never as "no milestones" (`test/flight/routing-console.test.ts`).
  _Still open:_ the API route and the panel beside the board.
- **S5 — steward for THEIR project:** the per-project page (any
  onboarded folder) gets the same steward actions against that
  project's own repo (GITHUB 2/5's `sync any project` is the
  foundation; identity/role decides verbs).
- **S6 — release hygiene as steward behavior:** the
  single-visible-release policy (docs/RELEASING.md) executes per-repo
  through the steward, not through the operator's hands.

## Non-goals

Writing to repos the identity does not own; Projects-v2 automation
until the token scope exists; any steward act that a red main would
auto-trigger (the no-auto-revert law covers stewarding too).
