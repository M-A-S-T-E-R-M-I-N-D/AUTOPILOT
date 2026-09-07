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
- **S4 — operator routing console:** the dashboard surfaces "what the
  page says" (milestone progress, label queues, claims) next to the
  board, so steering happens from either side with one truth.
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
