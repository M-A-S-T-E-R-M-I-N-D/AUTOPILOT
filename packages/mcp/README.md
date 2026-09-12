<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# @autopilot/mcp

Retrieval as MCP: read-only tools over a project's search index, reusable by the dashboard's Ask
and by any harness that speaks the Model Context Protocol — so a model's "home" is the indexed
repository, not a pasted excerpt.

Part of the [AUTOPILOT](../../README.md) monorepo; not published on its own (`private`).

## What lives here

- `control.ts` — the control surface exposed as tools (search, docs, live state) — every tool reads;
  none writes.
- `info.ts` — the package's self-description for the dashboard's Info panel.

## Laws worth knowing

- **Read-only by construction.** Content comes from the store's index, root-jailed at index time; the
  MCP layer never touches the filesystem.

Tests: `pnpm exec vitest run packages/mcp`.
