<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0001. No agent framework for the core loop

Status: Accepted

## Context

The 2026 agent-framework landscape consolidated around six production
frameworks (LangGraph, CrewAI, OpenAI Agents SDK, Claude Agent SDK, Google
ADK, MS Semantic Kernel); TypeScript specifically favors Mastra / Vercel AI
SDK / the official TS SDKs. AUTOPILOT's core loop (fire → gate →
commit/revert, un-fakeable telemetry) needed to decide whether to sit on one
of them or drive the `claude` CLI directly.

Three forces ruled the frameworks out:

1. They orchestrate **API-key** model calls. AUTOPILOT's economic core is an
   external loop over `claude -p` on the user's **subscription** auth (see
   ADR-0002) — wrapping a framework around that would re-introduce the
   per-token billing dependency the design deliberately avoids.
2. The Claude CLI **already is** the agent runtime: tools, permissions,
   PreToolUse hooks (the containment guard, ADR-0005), MCP, streaming —
   battle-tested by Anthropic. A framework would duplicate this with less
   fidelity. Princeton's HAL data shows scaffold choice swings agent scores
   by up to ~30 points; the CLI is the scaffold tuned by the model's own
   vendor.
3. AUTOPILOT's loop is deliberately tiny and auditable — the gate is the
   product. Frameworks optimize for flexibility inside the safety boundary
   that this project doesn't want.

## Decision

Do not adopt any agent-orchestration framework for the core fire → gate →
commit/revert loop. Build directly on the local `claude` CLI as the agent
runtime (`ClaudeCliModel` adapter).

## Consequences

Positive: a tiny, auditable loop; the gate is the actual product surface;
scaffold quality matches the model vendor's own tuning rather than a
third-party's.

Tradeoff: AUTOPILOT forgoes framework conveniences (built-in graph
visualizers, community integrations, multi-provider abstraction). If the
CLI-spawn seam ever becomes a real constraint, the recorded migration
candidate is the official **Claude Agent SDK (TypeScript)** — same engine as
the CLI, preserves the hook/permission model. Not needed today: the
`ClaudeCliModel` adapter already delivers subscription auth + stream-json +
`--settings` guard injection.

## Related

- `docs/ECOSYSTEM-RESEARCH.md` §1
- `docs/MASTER-PLAN.md` §15.2 (engine language / stack)
