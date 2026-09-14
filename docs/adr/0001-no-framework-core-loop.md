<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0001. No agent framework for the core loop

Status: Accepted, amended 2026-09-14 (see "Amendment" below)

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

## Amendment (2026-09-14) — the "forgone" multi-provider abstraction was since built, narrowly

The Consequences section above lists "multi-provider abstraction" as something
AUTOPILOT forgoes by not adopting a framework. That held at genesis but is no
longer accurate: the engine ships its own minimal `ModelPort` seam
(`packages/engine/src/ports.ts`) — `invoke(model, prompt, resumeSessionId?,
caps?): Promise<ModelResponse>` — with `ClaudeCliModel`/
`StreamingClaudeCliModel` (`adapters/claude-cli.ts`) as the reference
implementation and `OllamaModel` (`adapters/ollama.ts`) as a second,
independent driver, both exported publicly from `@autopilot/engine`
(`index.ts`'s `export type * from './ports.js'`). `auth.ts`'s `endpoint` mode
(community epic #21 slice S1) layers Anthropic-compatible endpoint
redirection (Ollama, DeepSeek, a self-hosted proxy) on top of the SAME
`ClaudeCliModel` driver — no new adapter needed for that slice.

This is not the framework-grade abstraction this ADR declined (no graph
visualizer, no community integration marketplace) — it is the narrowest seam
that lets a second driver exist at all, built because the core loop needed
it, not because a framework was adopted. Issue #21's S2 slice ("PilotAdapter
seam … documented interface with claude as reference impl") describes
exactly this seam; it already existed before the issue was filed. The
remaining tradeoff — no vendor-CLI adapters for Codex/Copilot/Kiro/OpenCode —
stands and is issue #21's S3+ (community-claimed slices), not resolved by
this amendment.

## Related

- `docs/ECOSYSTEM-RESEARCH.md` §1
- `docs/MASTER-PLAN.md` §15.2 (engine language / stack)
- GitHub issue #21 (multi-provider pilots, community epic)
