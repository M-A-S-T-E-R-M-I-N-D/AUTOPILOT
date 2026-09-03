<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# AUTOPILOT — documentation

The doc set, grouped. These are narrative docs (prose with intentional tables/wrapping) — not Prettier-enforced.

## Architecture

- [ARCHITECTURE.md](ARCHITECTURE.md) — C4-style Context + Container diagrams, Mermaid-as-code. The Container
  diagram is generated from the real workspace package graph (`pnpm architecture:update`) and CI-verified against
  drift (`pnpm run ci:architecture`).
- [DATA-MODEL.md](DATA-MODEL.md) — every SQLite table, column, relationship, index, and the full migration
  history. Generated from `packages/store/src/schema.ts`'s `MIGRATIONS` (`pnpm data-model:update`) and CI-verified
  against drift (`pnpm run ci:data-model`).
- [CONTRAST-MATRIX.md](CONTRAST-MATRIX.md) — WCAG contrast ratio + pass/fail classification for every semantic
  color token pair, per theme (epic [0015](epics/0015-cockpit-supervisory-control.md) §6.6). Generated from
  `@autopilot/tokens`'s `contrastMatrix()` (`pnpm contrast-matrix:update`) and CI-verified against drift
  (`pnpm run ci:contrast-matrix`).

## Vision & bootstrap

- [MASTER-PLAN.md](MASTER-PLAN.md) — vision · architecture · §15 locked decisions · §16 progression gauge · §17
  verification boundary · §18 dogfooding + "pack for a friend".
- [KICKOFF-PROMPT.md](KICKOFF-PROMPT.md) — the founding kickoff prompt (how the build was launched).
- [FLEET-ORCHESTRATION.md](FLEET-ORCHESTRATION.md) — the agent-org north star (domain checkboxes · live activity map ·
  autonomous decisions · parallel projects) mapped to M4–M8.

## Plan & tracking

- [ACTION-PLAN.md](ACTION-PLAN.md) — milestones M0→M9, each with a binary Definition of Done. **The build order.**
- [FEATURE-COVERAGE.md](FEATURE-COVERAGE.md) — every feature traced to its spec + milestone ("nothing forgotten").
- [BACKLOG-999.md](BACKLOG-999.md) — the tracked backlog.

## Operations

- [RUNBOOK.md](RUNBOOK.md) — every known failure mode + its recovery path: the stale-4317-server
  ritual, kill procedures, SQLite/WAL corruption + snapshot restore, the flight instance lock, and
  containment-breach response. Previously lived only in operator memory.

## Brand

- [BRAND.md](BRAND.md) — the goggles mark: construction, variants, theme-bound hex, don'ts (epic
  [0008](epics/0008-brand-identity.md) slice 1). Source: `apps/dashboard/src/assets/goggles-mark.ts`.

## Architecture decisions

- [adr/README.md](adr/README.md) — numbered Architecture Decision Records: why, not just what, for the decisions
  that would be expensive to silently reverse or rediscover (framework, auth, backup, delivery, security model).

## Epic specs

- [epics/README.md](epics/README.md) — SDD convention for board tasks too large for one firing: a committed spec
  (acceptance criteria, constraints, out-of-scope) a task's `EPIC-SPEC:` marker links to, machine-checked before a
  "complete" claim on a marked task is trusted.

## Research (studied & reused, never copied)

- [ENGINE-RESEARCH.md](ENGINE-RESEARCH.md) — the proven internal v2.4 loop + the SOTA efficiency levers.
- [MDVIEWER-STUDY.md](MDVIEWER-STUDY.md) — the reference implementation, file-cited.
- [REACTIVITY.md](REACTIVITY.md) — chat · hybrid RAG · task assignment · live view.
- [PATTERNS-AND-STANDARDS.md](PATTERNS-AND-STANDARDS.md) — the adopted patterns + regulatory standards.
- [CLAUDE-CLI-INTEGRATION.md](CLAUDE-CLI-INTEGRATION.md) — researched Claude Code auth + headless-run mechanics
  (login is interactive-only · `setup-token` · `claude -p` flags · `stream-json` events for the activity map).
- [SOTA-MAP-llm-software-engineering-2026-08.md](SOTA-MAP-llm-software-engineering-2026-08.md) — the field-wide
  LLM-native SWE context pack (domains A–K, stable IDs, confidence markers, anti-pattern index). Cite by ID.

## Knowledge base (RAG-indexed, the firing's ground truth)

- [ENGINEERING-DOCTRINE.md](ENGINEERING-DOCTRINE.md) — patterns, when to use them, canonical sources, package vetting.
- [RESEARCH-LIBRARY.md](RESEARCH-LIBRARY.md) — every research finding, digested + dated. Never re-search.
- [LIVING-REPO-SPEC.md](LIVING-REPO-SPEC.md) — the operator's SDD spec for the living-repo epic.
- [FLIGHT-CONTAINMENT.md](FLIGHT-CONTAINMENT.md) — the escape story: detection audit + PreToolUse guard layers.
- [ECOSYSTEM-RESEARCH.md](ECOSYSTEM-RESEARCH.md) — framework/deployment decisions (no-framework core, npm→Docker→CF).

## Self-study (living evidence)

- [SELF-STUDY/PAPER.md](SELF-STUDY/PAPER.md) — AUTOPILOT's own account of flying its own repository: method,
  gate-verified vs. self-reported telemetry, threats to validity, AI-use disclosure. Data regenerates with
  `pnpm self-study:update`; never hand-edit the `DATA:SUMMARY` block.
- [MODEL-CARD.md](MODEL-CARD.md) — the engine's model card + evaluation card: capabilities, limitations, intended
  use, versioned per engine version + `Firing-Prompt-Version`. Localized-maintenance convention — update §6's
  evidence pointers, not the narrative sections.

## Milestone plans (as-built)

- [M1-ENGINE-PLAN.md](M1-ENGINE-PLAN.md) — the faithful engine port.
- [M2-ONBOARDING-PLAN.md](M2-ONBOARDING-PLAN.md) — the folder-lock onboarding.
- [M3-DASHBOARD-PLAN.md](M3-DASHBOARD-PLAN.md) — the read-only dashboard.

---

**Suggested reading order:** MASTER-PLAN → ARCHITECTURE → ENGINE-RESEARCH → MDVIEWER-STUDY → REACTIVITY →
PATTERNS-AND-STANDARDS → ACTION-PLAN → FEATURE-COVERAGE → BACKLOG-999 → adr/README → epics/README → RUNBOOK.
