<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# @autopilot/store

Persistence: the SQLite schema, its frozen migration chain, and the telemetry store every other
package writes to or reads from. One file, `.autopilot/autopilot.db`, WAL mode, `better-sqlite3`.

Part of the [AUTOPILOT](../../README.md) monorepo; not published on its own (`private`).

## What lives here

- `schema.ts` / `migrate.ts` — the `MIGRATIONS` chain (append-only; a released migration is never
  edited). `docs/DATA-MODEL.md` is generated from it and CI-verified.
- `db.ts` — `openStore(path, { readonly })`: pragmas, busy-timeout hardening, the readonly mode every
  dashboard read uses.
- `mutate.ts` — every write: tasks, focus, reorder, gate config, SOUL amendments, resets.
- `read.ts`, `read-events.ts`, `stats.ts`, `dora.ts` — the reads the dashboard composes its state from:
  tasks in the one true order, flight logs, activity windows (project-wide and per-firing), economics,
  DORA-for-agents.
- `search.ts`, `vector.ts`, `rank.ts` — the hybrid retrieval leg: FTS5 BM25 ⊕ sqlite-vec kNN fused by
  reciprocal-rank fusion.
- `snapshot.ts`, `maintenance.ts` — store snapshots and the pruning rituals.

## Laws worth knowing

- **Reads never migrate.** A server must `ensureStoreMigrated` at boot; a read path that meets an
  older schema returns nothing rather than mutating.
- **CHECK constraints are the contract.** Task statuses, severities and dimensions are allow-listed in
  the schema; a bad value is refused at the store, not filtered in the UI.

Tests: `pnpm exec vitest run packages/store`. Mutation configs: `config/mutation/stryker.store*`.
