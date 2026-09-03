<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0007. SQLite durability posture: `synchronous = NORMAL`, deliberately

Status: Accepted

## Context

`packages/store/src/db.ts` sets `journal_mode = WAL` on every writer
connection but never touched the `synchronous` pragma, so it ran on
SQLite's own WAL-mode default: `NORMAL`. Nobody chose that — it was simply
never overridden. Under `NORMAL`, SQLite fsyncs at WAL checkpoints rather
than on every commit; the database file itself never corrupts, but a real
power loss or OS crash between checkpoints can roll back the most recently
committed transactions. `FULL` fsyncs on every commit, eliminating that
window at the cost of one fsync per write.

The store holds `projects`, `tasks`, `events`, `metrics`, `fleet`, and
`firing_seq` — the fleet's coordination and telemetry ledger (task status,
leases, spend). It does **not** hold the actual work product: every
substantive change a flight makes lands as a git commit, and git's own
object writes are that product's durability floor. Losing the last few
seconds of *coordination* state to a power cut — a task's status reverting,
a metrics row missing — is recoverable by construction: task claims are
leased and expire, task completion is re-derived from `GitVcs.fileExists`
against HEAD (`markTaskDoneIfShipped`), and firing outcomes are idempotent.
Nothing downstream trusts this store as the single durable record of
anything git already recorded.

Concurrent flights (PARALLEL FLIGHTS epic) write to this same database from
multiple lanes, already contending for locks (`withBusyRetry`,
`busy_timeout = 5000`). `FULL`'s per-commit fsync multiplies that contention
window across every writer; `NORMAL` does not.

## Decision

Set `synchronous = NORMAL` **explicitly** on the writer connection in
`db.ts`, with a comment pointing at this ADR. Behavior is unchanged from
before (it was already SQLite's WAL default) — what changes is that the
choice is now a recorded decision, not an unexamined default, so a future
reader doesn't have to rediscover it under a `PRAGMA synchronous` audit or
after a real data-loss incident.

## Consequences

Positive: no fsync-per-commit tax on an already lock-contended writer path
under the fleet's concurrent-flight load; the choice and its reasoning are
now discoverable in one place instead of being silently inherited from a
driver default.

Tradeoff, accepted: a genuine power cut or OS crash between WAL checkpoints
can lose the most recent commits to this store (never corrupt it). This is
acceptable only because the store is a coordination ledger recoverable from
git and lease expiry, not the durability floor itself — a future table that
becomes the sole record of something git doesn't capture would need its own
review before inheriting this posture.

## Related

- `packages/store/src/db.ts`
- `docs/adr/0003-myth-legacy-flight-branch-backup-ritual.md` (git — the FLIGHT
  LOG — as the actual durability/restore floor this decision leans on)
