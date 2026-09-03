<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# ARCHITECTURE

C4-style diagrams (Context, then Container), Mermaid-as-code so they're plain text: git-diffable,
reviewable in a PR, and — for the Container level — LLM/script-generatable straight from the real
workspace graph instead of hand-drawn and left to rot. Component-level diagrams are intentionally
omitted: a single package's internals are better read from its own `src/` than mirrored into a
second, driftable artifact. For the narrative version of these decisions, see
[MASTER-PLAN.md](MASTER-PLAN.md); for *why*, see [adr/README.md](adr/README.md).

## System Context

Hand-authored — the actors here are external to the codebase (a person, two other systems AUTOPILOT
talks to), so there's no source-of-truth file to generate this from the way the container diagram
below is generated from the package graph.

```mermaid
flowchart TD
  operator["🧑 Operator<br/>(Person)<br/>Starts/pauses flights, reviews the board, approves 🟣 human-required items"]
  autopilot["📦 AUTOPILOT<br/>(Software System)<br/>Autonomous engineering agent + read-only dashboard"]
  repo["🗂️ Target Git Repo<br/>(External System)<br/>The codebase a flight reads, edits, gates, and commits to"]
  cli["🤖 Claude CLI<br/>(External System)<br/>Runs each firing's agent turn, headless"]

  operator -->|starts/pauses flights, reviews the board, EXECUTEs a landing| autopilot
  autopilot -->|reads, edits, gates, commits — never main, never force-push| repo
  autopilot -->|spawns one firing at a time| cli
  cli -->|edits files, runs shell commands| repo
```

## Containers

Generated from every `packages/*/package.json` / `apps/*/package.json` — name, description, and
`@autopilot/*` dependencies. Refresh with `pnpm architecture:update`; `pnpm run ci:architecture`
(wired into `pnpm verify` and CI) fails the build if this block drifts from the real graph.

<!-- CONTAINER:DIAGRAM:START -->
_Generated 2026-08-27T15:14:47.898Z by `pnpm architecture:update` from every `packages/*/package.json` / `apps/*/package.json` — name, description, and `@autopilot/*` dependencies — not a hand-drawn diagram that can drift from what actually depends on what._

```mermaid
flowchart TD
  subgraph packages["packages/"]
    engine["**engine**<br/>AUTOPILOT engine — the gated autonomous loop (orient → pick → gate → commit → report → pace)."]
    mcp["**mcp**<br/>AUTOPILOT retrieval-as-MCP — read-only index tools reusable by the dashboard and any harness."]
    onboarding["**onboarding**<br/>AUTOPILOT onboarding — lock a folder, back it up (MYTH/LEGACY), detect the gate, index it."]
    store["**store**<br/>AUTOPILOT persistence — SQLite schema, migrations, and telemetry store."]
    tokens["**tokens**<br/>AUTOPILOT design tokens — the single source of truth for palette/type/space, with dark/light/terminal themes."]
  end
  subgraph apps["apps/"]
    dashboard["**dashboard**<br/>AUTOPILOT dashboard — the localhost read-only web control panel."]
  end
  dashboard --> engine
  dashboard --> mcp
  dashboard --> onboarding
  dashboard --> store
  dashboard --> tokens
  engine --> store
  mcp --> store
  onboarding --> store
```

| Package | Path | Responsibility |
|---|---|---|
| `@autopilot/dashboard` | `apps/dashboard` | AUTOPILOT dashboard — the localhost read-only web control panel. |
| `@autopilot/engine` | `packages/engine` | AUTOPILOT engine — the gated autonomous loop (orient → pick → gate → commit → report → pace). |
| `@autopilot/mcp` | `packages/mcp` | AUTOPILOT retrieval-as-MCP — read-only index tools reusable by the dashboard and any harness. |
| `@autopilot/onboarding` | `packages/onboarding` | AUTOPILOT onboarding — lock a folder, back it up (MYTH/LEGACY), detect the gate, index it. |
| `@autopilot/store` | `packages/store` | AUTOPILOT persistence — SQLite schema, migrations, and telemetry store. |
| `@autopilot/tokens` | `packages/tokens` | AUTOPILOT design tokens — the single source of truth for palette/type/space, with dark/light/terminal themes. |
<!-- CONTAINER:DIAGRAM:END -->
