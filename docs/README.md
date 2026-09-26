<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# AUTOPILOT — documentation

Every document under `docs/`, one line each, grouped by who reads it. Narrative docs (prose with
intentional tables and wrapping) are not Prettier-enforced. Files marked **generated** are written by a
script and verified by CI — edit the source, not the file.

## Start here

- [RUNBOOK.md](RUNBOOK.md) — every known failure mode and its recovery: the stale-4317-server ritual, kill
  procedures, SQLite/WAL corruption and snapshot restore, the flight instance lock, containment-breach response.
- [RELEASING.md](RELEASING.md) — versioning policy, the release ritual, milestone tags, pre-release maturity.
- [ROADMAP.md](ROADMAP.md) — where the fleet is flying next, and what shipped since the last update.
- [ACTION-PLAN.md](ACTION-PLAN.md) — milestones M0→M9 with a binary Definition of Done each. **The build order.**
- [FEATURE-COVERAGE.md](FEATURE-COVERAGE.md) — every feature traced to its spec and milestone ("nothing forgotten").
- [MODELS.md](MODELS.md) — what the fleet flies (Claude models, roles, routing) and how it keeps up.
- [COCKPIT-BASELINE.md](COCKPIT-BASELINE.md) — the living measurement doc for the dashboard cockpit.

## Architecture

- [ARCHITECTURE.md](ARCHITECTURE.md) — C4-style Context + Container diagrams, Mermaid-as-code. **Generated**
  from the workspace package graph (`pnpm architecture:update`, `pnpm run ci:architecture`).
- [DATA-MODEL.md](DATA-MODEL.md) — every SQLite table, column, relationship, index, and the migration history.
  **Generated** from `packages/store/src/schema.ts` (`pnpm data-model:update`, `pnpm run ci:data-model`).
- [CONTRAST-MATRIX.md](CONTRAST-MATRIX.md) — WCAG contrast ratio and pass/fail for every semantic color token pair,
  per theme. **Generated** from `@autopilot/tokens` (`pnpm contrast-matrix:update`, `pnpm run ci:contrast-matrix`).
- [THREAT-MODEL.md](THREAT-MODEL.md) — assets, trust boundaries, the tool-grant table (**generated** section,
  `pnpm run ci:threat-model`), mitigations and accepted risks.
- [FLIGHT-CONTAINMENT.md](FLIGHT-CONTAINMENT.md) — the escape story: detection audit and the PreToolUse guard layers.
- [adr/README.md](adr/README.md) — numbered Architecture Decision Records: why, not just what, for the decisions
  that would be expensive to silently reverse (framework, auth, backup, delivery, security model, landing guards).
- [epics/README.md](epics/README.md) — spec-driven development for board tasks too large for one firing: the
  committed spec a task's `EPIC-SPEC:` marker links to, machine-checked before a "complete" claim is trusted.

## Doctrine (RAG-indexed — a firing's ground truth)

- [ENGINEERING-DOCTRINE.md](ENGINEERING-DOCTRINE.md) — patterns, when to use them, canonical sources, package vetting.
- [PATTERNS-AND-STANDARDS.md](PATTERNS-AND-STANDARDS.md) — the adopted patterns and the regulatory standards.
- [MASTER-PROMPT.md](MASTER-PROMPT.md) — the one document a pilot, a maintainer and the firing prompt read from:
  the promise, the laws in one voice (told · enforced · proven), the surfaces, the rituals, the knobs, and the
  drift ledger the prompt is regenerated from.
- [HIERARCHY.md](HIERARCHY.md) — what the eye meets first and why: the fleet home's order, sizes and fields,
  sourced from flight-deck, mission-control and agent-console doctrine; pinned by a census test.
- [FAILURE-DOCTRINE.md](FAILURE-DOCTRINE.md) — the won-battles ledger: every failure class beaten, and the law that
  keeps it dead.
- [DOCTRINE-COORDINATION.md](DOCTRINE-COORDINATION.md) — the primitives a fleet actually runs on: sharding, leases,
  idempotency, monotonic allocation, convergence.
- [TRANSLATION-DOCTRINE.md](TRANSLATION-DOCTRINE.md) — native quality, or nothing: how the dashboard is localized.
- [ATTRIBUTION.md](ATTRIBUTION.md) — credit that spreads, rights that stay honest: attribution for flown work.
- [RESEARCH-LIBRARY.md](RESEARCH-LIBRARY.md) — every research finding, digested and dated. Never re-search.

## Community, governance, brand

- [DEPENDENCY-POLICY.md](DEPENDENCY-POLICY.md) — cooldowns, the dated major-version ignores and
  their lift conditions, how a Dependabot PR is merged, and the toolchain canary that runs on
  every manifest or lockfile change.
- [GOVERNANCE.md](GOVERNANCE.md) — the GitHub house taxonomy: labels, pools, priorities (the seed source for
  `pnpm dashboard:taxonomy-seed`). Project governance itself lives in
  [`.github/GOVERNANCE.md`](../.github/GOVERNANCE.md).
- [FOUNDATION.md](FOUNDATION.md) — the AUTOPILOT Foundation: what it funds and how.
- [DONATE.md](DONATE.md) — the donation channels. **Generated** from `docs/donations.json` (`pnpm run ci:donate`).
- [BADGE.md](BADGE.md) — the built-with-AUTOPILOT badge for flown projects.
- [PUBLICITY-DRAFTS.md](PUBLICITY-DRAFTS.md) — awesome-list submission drafts, written for the operator to
  review and submit by hand. Nothing in it has been sent.
- [BRAND.md](BRAND.md) — the goggles mark: construction, variants, theme-bound hex, don'ts.
- [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) — the licenses of what the product ships: every npm package,
  plus the Lucide icons ([ISC](../LICENSES/ISC.txt)) and the Inter and Roboto typefaces
  ([OFL-1.1](../LICENSES/OFL-1.1.txt)) copied into the tree. The people behind them: [THANKS.md](../THANKS.md).
- [MODEL-CARD.md](MODEL-CARD.md) — the engine's model card and evaluation card, versioned per engine version.

## Self-study and evidence

- [SELF-STUDY/PAPER.md](SELF-STUDY/PAPER.md) — AUTOPILOT's own account of flying its own repository: method,
  gate-verified vs. self-reported telemetry, threats to validity. Data regenerates with `pnpm self-study:update`;
  never hand-edit the `DATA:SUMMARY` block.
- [SELF-STUDY/DATASHEET.md](SELF-STUDY/DATASHEET.md) — the datasheet for the exported flight dataset (**generated**).
- [SELF-STUDY/EVIDENCE-LOG.md](SELF-STUDY/EVIDENCE-LOG.md) — the running evidence log behind the paper's claims.
- [SELF-STUDY/DATA-SERIES.md](SELF-STUDY/DATA-SERIES.md) — the per-day series the charts read (**generated**).
- [CASE-STUDIES/README.md](CASE-STUDIES/README.md) — full narrative flights, cited against real flight logs and gate
  output — never reconstructed after the fact.
- Evaluations — dated, evidence-first reviews of the system against itself:
  [2026-08 (358 firings)](EVALUATION-2026-08.md) ·
  [2026-08-20 the road to SOTA](EVALUATION-2026-08-20-sota.md) ·
  [2026-08-27 the silent gate](EVALUATION-2026-08-27-silent-gate.md) ·
  [2026-08-30 the stranded sync-back](EVALUATION-2026-08-30-stranded-syncback.md) ·
  [2026-09-03 sync-back conflict taxonomy](EVALUATION-2026-09-03-sync-conflict-taxonomy.md) ·
  four cockpit-baseline evaluations under [archive/](archive/).
- [debriefs/](debriefs/) — one file per incident or verdict, dated; the raw record the doctrine docs distil.
- [MUTATION-DEBT.md](MUTATION-DEBT.md) — the standing record behind the per-module Stryker configs and their
  `break: 100` threshold: which mutants still survive, why, and the plan to clear each one.
- [BACKLOG-999.md](BACKLOG-999.md) — the tracked backlog; [BACKLOG-999-ARCHIVE.md](BACKLOG-999-ARCHIVE.md) — full
  evidence for closed items.

## History (founding documents and research — read as history)

- [MASTER-PLAN.md](MASTER-PLAN.md) — the founding vision, architecture, locked decisions, progression gauge.
  Deliberately not re-edited.
- [KICKOFF-PROMPT.md](KICKOFF-PROMPT.md) — the prompt the build was launched with.
- [FLEET-ORCHESTRATION.md](FLEET-ORCHESTRATION.md) — the agent-org north star as first written (domain checkboxes,
  live activity map, autonomous decisions, parallel projects).
- [LIVING-REPO-SPEC.md](LIVING-REPO-SPEC.md) — the operator's SDD spec for the living-repo epic; predates the epics
  convention and some of its named paths.
- [M1-ENGINE-PLAN.md](M1-ENGINE-PLAN.md) · [M2-ONBOARDING-PLAN.md](M2-ONBOARDING-PLAN.md) ·
  [M3-DASHBOARD-PLAN.md](M3-DASHBOARD-PLAN.md) — the milestone plans as built.
- [ENGINE-RESEARCH.md](ENGINE-RESEARCH.md) — the proven internal loop and the SOTA efficiency levers.
- [MDVIEWER-STUDY.md](MDVIEWER-STUDY.md) — the reference implementation, file-cited.
- [REACTIVITY.md](REACTIVITY.md) — chat · hybrid RAG · task assignment · live view.
- [CLAUDE-CLI-INTEGRATION.md](CLAUDE-CLI-INTEGRATION.md) — Claude Code auth and headless-run mechanics.
- [ECOSYSTEM-RESEARCH.md](ECOSYSTEM-RESEARCH.md) — framework and deployment decisions (no-framework core,
  npm → Docker → Cloudflare).
- [SOTA-MAP-llm-software-engineering-2026-08.md](SOTA-MAP-llm-software-engineering-2026-08.md) — the field-wide
  LLM-native SWE context pack (domains A–K, stable IDs). Cite by ID.
- [DOCTRINE-WEAKPOINT-RESEARCH.md](DOCTRINE-WEAKPOINT-RESEARCH.md) — the founding rationale behind
  FAILURE-DOCTRINE: find everything, fix at SOTA, learn so it stays fixed.
- [archive/](archive/) — the pre-0.14.0 changelog and superseded evaluations.

---

**Suggested reading order for a newcomer:** README (root) → RUNBOOK → ARCHITECTURE → ACTION-PLAN →
FEATURE-COVERAGE → adr/README → epics/README → ENGINEERING-DOCTRINE → FAILURE-DOCTRINE → RESEARCH-LIBRARY.
