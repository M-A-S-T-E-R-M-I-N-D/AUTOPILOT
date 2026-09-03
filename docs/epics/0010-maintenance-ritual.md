<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0010. Maintenance ritual — the recurring sweep the founder does by hand today

Status: Active — slices 2-4 shipped (slice 4 on 2026-09-02).

Board task (web-mstdokr6-qgxqz8, priority `high`): "recurring sweep - outdated/audit
triage, in-range refresh, deprecation traces, action-pin bumps, gh run babysitting,
publish-readiness" — a habit the founder already performs manually and routinely.
This epic exists because the one-line board title names six different housekeeping
concerns at once, several of which already have PARTIAL machinery scattered across the
repo; before any firing builds more, this spec inventories what already exists, what
each named concern actually still needs, and where the seams are — so a firing that
picks up a slice reads a scoped contract instead of re-deriving "what does 'ritual'
mean" from six words on a board card.

## What already exists (do not rebuild these)

- **Outdated/audit triage** and **action-pin bumps** — `.github/dependabot.yml`
  already opens weekly PRs for npm deps (grouped dev-dependencies, per-severity
  cooldowns, `better-sqlite3`/`typescript` majors excluded from auto-PR) and for
  GitHub Actions (every `uses:` in `.github/workflows/*.yml` is already SHA-pinned
  with a version comment). The ritual's job here is not "detect drift" —
  dependabot already does that — it is **triage**: is anything open right now,
  is it safe to merge, is anything BLOCKED (the `typescript`/`better-sqlite3`
  major-bump exceptions need a deliberate, occasional look).
- **Deprecation traces** overlaps `apps/dashboard/src/flight/doc-freshness.ts`
  (BACKLOG web-msnsjxqu-25trfq): `computeDocDrift` already flags a doc whose
  subject paths were touched more recently than the doc itself. That machinery
  is doc-vs-code drift, not dependency deprecation notices (an npm package
  itself printing a deprecation warning, or a transitive dep flagged
  unmaintained) — a real gap this epic's slices below should NOT duplicate
  doc-freshness's own detector, only reference it.
- **Publish-readiness** overlaps `packages/engine/src/release.ts`'s `planRelease`
  (read via `apps/dashboard/src/read/source.ts`): it already plans a release from
  feat/fix commits since the last tag and reports a no-op when nothing
  release-worthy landed. The ritual's job here is triggering/reviewing that plan
  on a cadence, not re-implementing it.
- **`gh run babysitting`** has NO existing machinery in this repo today — CI runs
  (`ci.yml`, `mutation.yml`, `labels.yml`) execute on GitHub's infrastructure with
  nothing watching for a red run, a stuck run, or a run that never started. This
  is the one named concern that is genuinely greenfield.

## Acceptance criteria

- A single operator-facing surface (dashboard panel or a `pnpm run maintenance:*`
  script family, whichever slice 1 below decides) reports the CURRENT state of
  all six named concerns in one read — not six places to check by hand.
- `gh run babysitting`: at minimum, a read-only report of the most recent run per
  workflow (status, conclusion, age) sourced from `gh run list`, surfaced
  somewhere the operator or a KEEPER-style firing actually sees it — a script
  that only prints to a terminal nobody reads does not satisfy this criterion
  (UX-EXPRESSION DOCTRINE: a Docs entry or dashboard panel, not just a CLI).
- Every check this epic adds is READ-ONLY by default (report/flag, never
  auto-merge, auto-close, or auto-retry) — mutating actions belong to epic 0007's
  KEEPER review slice (PR merge policy), not this one; this epic's job is
  surfacing what needs a look, matching the founder's own description of the
  ritual as something THEY currently do by hand.
- No slice duplicates dependabot, doc-freshness, or `planRelease`'s own detection
  logic — each slice either triages their EXISTING output or fills the one named
  gap (`gh run babysitting`) that has no detector yet.

## Constraints

- MACHINE BUDGET: this is explicitly the kind of work a fleet firing must NOT
  turn into a multi-minute all-core job (see the standing FLEET machine-budget
  rule) — `gh run list`/`gh pr list` calls are cheap, read-only, and bounded;
  no polling loops, no scheduled daemons added by this epic without a separate,
  explicit design for where that daemon would run.
- `gh` shells through the operator's own authenticated CLI (epic 0006's doctrine,
  reaffirmed by epic 0007) — no new credential surface.
- Windows-first tooling, consistent with the rest of this repo's scripts.

## Out of scope

- Auto-merging dependabot PRs, auto-retrying failed CI runs, or auto-cutting
  releases — this epic reports; a human or a separately-scoped KEEPER slice acts.
- A new dependency-vulnerability scanner (`pnpm audit`/`ci:dependency-audit`
  already exists in the gate) — this epic surfaces its FINDINGS on a cadence,
  it does not replace the scanner.
- Rebuilding `doc-freshness.ts` or `planRelease` — see "What already exists" above.

## Slices

1. This spec. SHIPPED — inventories existing machinery (dependabot, doc-freshness,
   `planRelease`) against the board title's six named concerns, so the genuinely
   open gap (`gh run babysitting`, plus a single unifying triage surface) is
   explicit instead of guessed at fresh by whichever firing picks this up next.
2. `gh run babysitting`: a read-only report of the latest run per workflow
   (`gh run list --workflow <name> --limit 1` per workflow in `.github/workflows/`),
   surfaced as a dashboard panel or docs-discoverable script output — the one
   concern with no existing detector.
   SHIPPED — `apps/dashboard/src/control/ci-status.ts`'s `ciRunReport`/
   `ciWorkflowStatus`: injectable `gh` runner (mirrors `gh-doctor.ts`'s shape),
   never throws — `gh` absent/unauthenticated, malformed JSON, or a workflow
   with zero runs all degrade to an informational line rather than a failure
   claim. Flags only a genuinely failing conclusion (`failure`/`cancelled`/
   `timed_out`/`action_required`/`startup_failure`) as needing a look; a run
   still in progress (`conclusion: null`) is never flagged. Wired as
   `dashboard ci-status` / `pnpm dashboard:ci-status` (`control/cli.ts`),
   documented in `docs/RUNBOOK.md`'s command table (UX-EXPRESSION: a
   docs-discoverable script, not a silent CLI flag). Read-only by construction —
   only ever calls `gh run list`, never a retry/cancel/re-dispatch. Covered by
   `apps/dashboard/test/control/ci-status.test.ts`.
3. Unifying triage surface: one place (panel or `pnpm run maintenance:sweep`)
   that reports dependabot PR backlog + doc-freshness proposals + `planRelease`'s
   verdict + the slice-2 CI-run report together, so the founder's routine sweep
   becomes one read instead of six.
   SHIPPED — `apps/dashboard/src/control/maintenance-sweep.ts`'s
   `maintenanceSweepReport`: composes `dependabotPrBacklog` (`gh pr list
   --author app/dependabot --state open`, never a mutating call),
   `docFreshnessSweep` (the existing `doc-freshness.ts` detector run
   read-only — no task created, unlike `fly.ts`'s flight-end sweep),
   `releaseSweep` (`planRelease` against THIS repo's own `package.json`/
   `CHANGELOG.md`/last tag — the same policy function `read/source.ts`'s
   store-backed `readReleaseInfo` calls, without the project-registry lookup
   since the sweep always targets the repo it runs in), and slice 2's
   `ciRunReport`, each independently degrade-safe so one missing tool or
   unreadable file never blanks the others. Wired as `dashboard
   maintenance-sweep` / `pnpm dashboard:maintenance-sweep` (`control/cli.ts`),
   documented in `docs/RUNBOOK.md`'s command table (UX-EXPRESSION: a
   docs-discoverable script). Covered by
   `apps/dashboard/test/control/maintenance-sweep.test.ts`.
4. Optional: a periodic reminder/nudge (e.g. a board task auto-proposed when the
   sweep finds something stale past a threshold) — only once slices 2-3 prove the
   read-only reports are actually useful in practice.
   SHIPPED (2026-09-02, operator decision, "option A" of ADR 0008 — see that
   ADR's Amendment section) — stronger than the "nudge" originally scoped
   here: `apps/dashboard/src/landing/execute.ts`'s `E2eLandGuard` consults
   slice 2's `ciWorkflowStatus` for the converged (base) branch BEFORE a
   landing executes and REFUSES the landing (reason `'e2e-red'`) when it's
   red, rather than only nudging after the fact. Zero added run-time cost —
   reads GitHub Actions' already-computed result, never runs e2e itself, so
   the original MACHINE BUDGET objection in ADR 0008 doesn't apply. Wired
   into production via `createRealE2eLandGuard()` in `server/main.ts`, so
   both the manual EXECUTE button and the automatic land-watchdog go through
   it (same shared code path `createLandingExecuteApi` already used for the
   flight-running guard). A refusal persists an `e2e-land-block` events row.
   Follow-up SHIPPED (2026-09-02): an aggregated fleet-card anomaly chip for
   those events — `read/anomalies.ts`'s `e2eLandBlocks`, same
   one-chip-with-count-and-latest-detail shape as the
   `land-gate-alarm`/`convergence-red` chips (see ADR 0008's Amendment
   section for the full read-path wiring). Covered by
   `apps/dashboard/test/landing/execute.test.ts`'s "e2e land guard" suite and
   `apps/dashboard/test/read/anomalies.test.ts`'s `e2eLandBlocks` suite.

## Related

- `.github/dependabot.yml`, `apps/dashboard/src/flight/doc-freshness.ts`
  (BACKLOG web-msnsjxqu-25trfq), `packages/engine/src/release.ts`'s `planRelease`.
- Epic 0007 (platform-maintainer-and-pool) — its KEEPER PR-review slice is the
  natural home for any future auto-merge policy this epic's reports could feed,
  kept deliberately out of scope here.
