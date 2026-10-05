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
  **The claim protocol's label 2026-10-04 (same law):** `/claim`
  (`claim.yml`) assigns and adds `claimed`, and both of the protocol's own
  releases (`/unclaim`, `stale-claim-reaper.yml`) remove the assignee and the
  label together. The steward's stale-claim reaper (the "Free stale claim(s)"
  button and the flight-end sweep) removed only the assignee, so a freed
  `/claim` kept reading `claimed` with nobody on it, and the workflow reaper,
  which only looks at a `claimed` issue that still has an assignee, never
  cleared it. The reaper's read now takes the labels, and the edit that
  unassigns an issue's one assignee also removes `claimed`, in any casing, as
  the issue carries it. A comment-only release, an issue without the label,
  and an issue another assignee still holds are unchanged. Covered by
  `test/flight/mirror-pass-claimed-label.test.ts`.
  **GitHub's close reasons 2026-10-04 (same law):** closing an issue as not
  planned or as a duplicate is the page's own "no", the native form of
  `declined`. The pass never read why an issue was closed, so a board task
  still queued from an issue the maintainer closed that way had the issue
  reopened as "a false-close". `fetchIssueState` now reads `stateReason` in
  the same `gh issue view` call, and the reconcile plans no reopen for an
  issue closed as not planned or as a duplicate. A close as completed, or with
  no reason read, is reopened as before. A claimant's close still settles its
  claimed task whatever the reason, and a landed commit is still noted on the
  closed issue. Covered by `test/flight/mirror-pass-close-reason.test.ts`.
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
  `GET /api/routing-console` serves it read-only (`server/routing-console.ts`).
  The **Routing console** panel renders it (`web/features/routing-console.ts`,
  formatting in `web/routing-console-panel.ts`): adopted right after the
  tasks board on a project page, with the community panels on the home
  page. It shows each milestone's progress bar and "7 of 10 closed (70%) ·
  due" line, every queue (an empty one reads "None"), the issues with no
  priority yet, and each claim plus the unclaimed issues. Unreadable
  milestones say so (`test/web/features/routing-console.test.ts`, axe-clean).
  Each milestone's title now links to its GitHub page in a new tab: the read
  keeps the row's `html_url` when it is https, and a row without one still
  shows, unlinked (`test/flight/routing-console.test.ts`; the link census
  sees the field and its href).
  **The claims ledger 2026-10-04 (board web-mtsylqbd-q2rg8k, the
  additive-only law):** an outside contributor's pool claim is often its
  comment alone, because the assign after it needs triage rights on the repo
  (`claim-ledger.ts`, #27). The pool reads that comment as a claim and warns
  the next claimant, but the console grouped claims by assignee alone, so the
  claimed issue showed under Unclaimed. The console now reads its issues
  through `fetchContributorFacingIssues`, which asks gh for `comments` too and
  carries each issue's `claimLedger`, and a login holds an issue when it is
  assigned or has a live ledger claim. Widening only: every assignee still
  shows, one the ledger reads as released included, and a claim handed back
  with `/unclaim` reads Unclaimed again. Covered by
  `test/flight/routing-console.test.ts`, whose fake gh returns only the fields
  `--json` asked for (written first, 3 of the new checks failed).
  **A project page on another repository 2026-10-05:** the console reads
  the repository `gh` acts on whichever page asks, so a project that is a
  checkout of another GitHub repository showed that repository's
  milestones, queues and claims as its own. A project page now sends
  `?project=`, and `main.ts` wraps the read in
  `refuseRepoMismatchedRoutingConsole`, S3's preview gate
  (`refuseRepoMismatchedPreview`) in front of it. A known mismatch answers
  `skippedReason: 'repo-mismatch'` with both repository names and no
  queues, and the panel says "Not read — this project is a checkout of …,
  but gh is acting on …" (en + he). An unknown project, an unresolved
  identity, or a project with no GitHub origin reads as before, and the
  home page skips the check (`test/flight/routing-console.test.ts`,
  `test/server/routing-console.test.ts`,
  `test/web/features/routing-console.test.ts`, axe-clean; written first, 5
  of the server and gate checks failed).
  **A project page reads its own repository 2026-10-05:** the refusal is
  replaced by the read it stood in for. `readProjectRoutingConsole` reads
  the project's `origin` (`fetchProjectRepo`, S3's own check) and names that
  `owner/repo` on both reads: the milestone path (`repos/<owner>/<repo>/…`
  instead of gh's `{owner}/{repo}` placeholder) and the issue list
  (`--repo`). A project page now shows its own milestones, queues and
  claims, whichever repository `gh` acts on, so the "Not read" line, its
  server branch and its two strings are gone. A project with no GitHub
  origin, an unknown project id, and the home page read the repository `gh`
  acts on, as before (`test/flight/routing-console.test.ts`; written first,
  all 5 new checks failed).
  **Steering from the dashboard's side 2026-10-05, the server half:** the
  console's first write. `POST /api/routing-console/route` (body `{issue,
  label, project?}`, `server/routing-console.ts`, CSRF-guarded JSON and
  rate-limited) runs `flight/routing-console-execute.ts`'s
  `createRoutingConsoleRouteApi`, which adds ONE house `priority:` label to
  an open issue no priority label routes yet. A label outside the priority
  group is refused before any read. A project page's route reads and edits
  its checkout's own repository with `--repo` (`projectRepoOf`, the lookup
  its console's read makes), and only that repository's owner routes; the home page acts on the repository `gh`
  resolves, gated by `resolveSocialIdentity`'s role. The issue is re-read
  when the route runs: an unreadable or closed issue, or one that carries a
  priority label in any casing by now, is refused, never given a second
  label. A refusal is a 200 with `refusedReason`, and a failed edit returns
  `gh`'s own words (`test/flight/routing-console-execute.test.ts`,
  `test/server/routing-console.test.ts`, `test/server/server.test.ts`). The
  pr-review census flags the new module (`flight/routing-console-execute`).
  _Still open:_ the panel's control for it — a priority picker on each "No
  priority yet" issue, behind a confirm, maintainer-only — so the route has
  no user-facing expression yet.
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
