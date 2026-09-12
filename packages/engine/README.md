<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# @autopilot/engine

The gated autonomous loop: **orient → pick → gate → commit → report → pace**. One firing is one
unit of work by one Claude Code session against one checked-out project, and nothing a firing does
counts until the project's own gate (typecheck · lint · format · test · build) passes on the result.

Part of the [AUTOPILOT](../../README.md) monorepo; not published on its own (`private`). The
dashboard's flight runner (`apps/dashboard/src/fly.ts`) is its production caller.

## What lives here

- `firing.ts` — one firing end to end: the prompt, the session, the checkpoint on a mid-unit death,
  the gate, the revert on red, the telemetry record.
- `guard.ts` / `containment.ts` — the PreToolUse guard a session runs under: path containment,
  destructive-git denial, read hygiene. See `docs/FLIGHT-CONTAINMENT.md`.
- `config.ts`, `auth.ts` — the Claude Code invocation and the subscription-auth stance.
- `ask.ts`, `ask-escalation.ts` — retrieval-augmented, tool-less answers for the dashboard's Ask.
- `github-sync.ts`, `github-contribute.ts`, `github-pr-contribute.ts` — the git and GitHub legs
  a firing may take (additive git only; never `main`, never force).
- `inbox.ts`, `info.ts`, `telemetry.ts` — the operator inbox, the engine's self-description, and the
  METRICS/PROPOSALS lines a firing reports.
- `adapters/` — the ports' real implementations: git (worktree lanes, sync-back, rerere self-healing),
  the remediating gate (format-then-retest), the merge-escalation agent.

## Laws worth knowing before changing anything

- **Un-fakeable telemetry.** Shipped means gate-verified and committed; a firing's own word is never
  the record.
- **Zero work loss.** A firing that dies mid-unit is checkpointed as `wip(autopilot): checkpoint` and
  resumed by the next firing.
- **Additive git only.** The engine never rewrites history, never pushes `main`, never force-pushes.

Tests: `pnpm exec vitest run packages/engine`. Mutation configs: `config/mutation/stryker.engine-*`.
