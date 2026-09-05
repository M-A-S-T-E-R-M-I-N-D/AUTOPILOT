<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Fleet orchestration — the agent-org vision

The founder's north star for AUTOPILOT's autonomy, captured verbatim-in-spirit so
it drives the roadmap (it spans **M4–M8**; most of it is already in MASTER-PLAN
§5/§16/§17, this doc pins the specifics). The metaphor: **turn a real dev group /
a 2000-person org into a fleet of agents** that communicate, divide the work, do
it, report, and decide — autonomously, in parallel, without stepping on each other.

## The pillars (and where each lands on the plan)

### 1. Per-project control & instructions — **M5** (+ M2 SOUL, M7 run)

- Enter each project; **see and edit its instructions**. A layer of **locked
  defaults** (strongly recommended, left alone) and **editable non-defaults** you
  can tune — "locked-by-default, proposable" (MASTER §5.4, §17).
- Choose per project: **run this one · run another · run several in parallel**,
  isolated so parallel projects are unaware of each other (worktree/process
  isolation, the task/handoff/status contract — MASTER §7-supervisor, M7 DoD).

### 2. Domain-check configuration (the checkboxes) — **M8** (+ M5 settings)

A settings surface of **micro-checkboxes** selecting which domains the fleet
inspects, each enabling a coordinator that dispatches sub-agents to collect data,
analyze, and file tasks:

- networking · TLS/transport · **cybersecurity** (secret scan, dep-audit,
  SAST-style) · **accessibility** (WCAG 2.2 AA+) · **UX / UI** · performance ·
  **patterns & standards** · modern-web-app assurance · any web/software project type.
- Each checked domain → an agent (or sub-fleet) that **collects → analyzes →
  proposes tasks** into the one unified task entity (REACTIVITY §2). This is the
  **review-agent catalog / harness depth** of M8 ("author once, project everywhere").

### 3. Live agent-fleet activity map — **M4** (+ M7 fleet telemetry)

- A **group of agents you can watch in real time**, with **diagrams** showing at
  any moment: how many agents are running, what each is doing, which **domain**
  each is in, where it is, how long it's been running — a **map** that illustrates
  who is working on what, how, and for how long.
- This is the **activity map** (MASTER §5.2) fed by the **dual live-stream**
  (agent-semantics SSE + filesystem WS, REACTIVITY §4). The M3 flight log + the
  §16 severity×dimension gauge are the seeds already shipped.

### 4. Autonomous coordination & decisions — **M5** (+ §17 boundary)

- A **central coordinator** that gathers every investigation/finding/thought and
  **routes them to a decision**. A **checkbox: "decisions made autonomously"** by a
  dedicated **Decider** agent (the Design-Sprint "Decider" role) — versus routed to
  the human **approvals queue** (🟣).
- This IS the **verification boundary (§17)**: machine-verifiable work runs
  autonomously; human-required calls wait for approval — the checkbox chooses where
  the line sits per project.

## Sequencing (honest, milestone-by-milestone)

| Want | Milestone | Status |
|------|-----------|--------|
| Watch agents work live (map/diagrams, who/what/where/how-long) | **M4** | activity-map + live-stream — next after M3 |
| Per-project instructions: locked defaults + editable, run/parallel controls | **M5** + **M7** | settings/SOUL editor (M5); parallel supervisor (M7) |
| Domain checkboxes → review sub-fleets (security/a11y/network/UX/patterns) | **M8** | review-agent catalog + anomaly detection |
| Autonomous **Decider** vs human approvals (the checkbox) | **M5** | approvals queue + §17 boundary |
| The "2000-agent org" (communicate · divide · report · decide, no interference) | **M4→M8** | the whole arc; foundations (loop · onboarding · store · gate) already shipped |

**Already shipped toward it (M0–M3):** the gated autonomous loop (M1), folder-lock
onboarding + content-hash index (M2), the live read-only dashboard with a real
flying project + flight log + severity gauge + the Claude connection layer (M3).
The org grows on top of these — one milestone at a time, each gated and honest.

## Shipped mechanism chronicle

The concrete, code-verified implementation history for these pillars — the
first live fleet test's debrief, intent claims, the scope partitioner, fleet
wisdom, and close verification — now lives in
[DOCTRINE-COORDINATION.md](DOCTRINE-COORDINATION.md#shipped-mechanism-chronicle),
alongside the five coordination primitives it documents. This file stays the
north-star vision; that one is the fleet's operator/implementation reference.
