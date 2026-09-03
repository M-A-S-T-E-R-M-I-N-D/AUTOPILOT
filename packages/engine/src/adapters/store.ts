// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { COMMIT_KINDS, withBusyRetry, type Store, type CommitKind } from '@autopilot/store';
import type { StorePort } from '../ports.js';
import type { FiringRecord } from '../telemetry.js';

function toCommitKind(kind: string | null): CommitKind | null {
  return kind !== null && (COMMIT_KINDS as readonly string[]).includes(kind)
    ? (kind as CommitKind)
    : null;
}

/**
 * The one canonical `firing_id` shape, shared by the writer below and every
 * reader that reconstructs it (fly.ts activity/trace lookups). Project-scoped
 * so it stays unique across a multi-project fleet, and — the 3-way fleet
 * crash (PARALLEL UNLOCK C debrief) — INSTANCE-scoped when a same-folder
 * fleet instance is flying: three instances sharing one store all minted
 * `<project>:firing-<n>` from the same lifetime count, the first insert won
 * metrics' UNIQUE(firing_id), and the other two processes died mid-firing on
 * SQLITE_CONSTRAINT_UNIQUE — exactly one ship per instance.
 */
export function firingIdOf(projectId: string, firing: number, instanceId?: string): string {
  const key = instanceId ? `${projectId}--${instanceId}` : projectId;
  return `${key}:firing-${firing}`;
}

/**
 * SQLite StorePort adapter (PATTERNS-AND-STANDARDS §7). Each firing writes twice:
 * the full immutable record to the append-only `events` log (event sourcing), and
 * a queryable projection to `metrics` (indexed for the dashboard graphs). The
 * `firing_id` comes from {@link firingIdOf} — project- and instance-scoped.
 */
export class SqliteFiringStore implements StorePort {
  constructor(
    private readonly store: Store,
    private readonly projectId: string,
    private readonly now: () => number = () => Date.now(),
    private readonly instanceId?: string,
  ) {}

  recordFiring(record: FiringRecord): void {
    const createdAt = this.now();
    const firingId = firingIdOf(this.projectId, record.firing, this.instanceId);

    this.store.db
      .prepare(
        'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(this.projectId, firingId, 'firing', JSON.stringify(record), createdAt);

    this.store.db
      .prepare(
        `INSERT INTO metrics
           (project_id, firing_id, item, kind, sha, head_before, head_after, shipped, self_reported, model,
            cost_usd, real_cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            turns, duration_ms, gate_result, head_advanced, sha_verified, commit_subject,
            completion, completion_missing, test_first, picked_rank, deviation_reason, resumed, extended, created_at)
         VALUES
           (@project_id, @firing_id, @item, @kind, @sha, @head_before, @head_after, @shipped, @self_reported, @model,
            @cost_usd, @real_cost_usd, @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
            @turns, @duration_ms, @gate_result, @head_advanced, @sha_verified, @commit_subject,
            @completion, @completion_missing, @test_first, @picked_rank, @deviation_reason, @resumed, @extended, @created_at)`,
      )
      .run({
        project_id: this.projectId,
        firing_id: firingId,
        item: record.item,
        kind: toCommitKind(record.kind),
        sha: record.sha,
        head_before: record.headBefore,
        head_after: record.headAfter,
        shipped: record.shipped ? 1 : 0,
        self_reported: record.iterMetrics === 'ok' ? 1 : 0,
        model: record.model,
        cost_usd: record.costUsd ?? 0,
        real_cost_usd: record.realCostUsd,
        input_tokens: record.tokensIn ?? 0,
        output_tokens: record.tokensOut ?? 0,
        cache_read_tokens: record.cacheRead ?? 0,
        cache_write_tokens: record.cacheCreate ?? 0,
        turns: record.numTurns ?? 0,
        duration_ms: record.durationMs ?? 0,
        gate_result: record.gateResult,
        head_advanced: record.headAdvanced ? 1 : 0,
        sha_verified: record.shaVerified ? 1 : 0,
        commit_subject: record.commitSubject,
        completion: record.completion,
        completion_missing: record.completionMissing ? 1 : 0,
        test_first: record.testFirst === null ? null : record.testFirst ? 1 : 0,
        picked_rank: record.pickedRank,
        deviation_reason: record.deviationReason,
        resumed: record.resumed === null ? null : record.resumed ? 1 : 0,
        extended: record.extended ? 1 : null,
        created_at: createdAt,
      });
  }

  /** Count of firings recorded for this project. A pure read — it does NOT
   *  allocate a firing number; see {@link reserveNextFiring} for that. */
  firingCount(): number {
    const row = this.store.db
      .prepare('SELECT COUNT(*) AS c FROM metrics WHERE project_id = ?')
      .get(this.projectId) as { c: number };
    return row.c;
  }

  /**
   * Atomically reserve and return the next firing number for this project
   * (board web-mtbay6wd-hz0p0m). loop.ts used to compute this as
   * `(await deps.firingCount()) + 1` — a plain read of `COUNT(*) FROM
   * metrics` — but the firing this number is used for can run for minutes
   * before `recordFiring` ever writes a row, so two fleet lanes racing that
   * read (both before either recorded anything) computed the identical next
   * number. This single INSERT..ON CONFLICT..RETURNING statement is atomic
   * against concurrent writers the same way any other SQLite write already
   * is here (WAL + busy_timeout + {@link withBusyRetry}, see
   * `@autopilot/store`'s db.ts) — so two lanes calling it back-to-back, with
   * nothing recorded in between, still land on distinct sequential numbers.
   * `firing_seq` (schema v22) is seeded from each project's existing
   * `metrics` row count on migration, so an already-flying project's
   * numbering stays continuous across the upgrade.
   */
  reserveNextFiring(): number {
    const row = withBusyRetry(() =>
      this.store.db
        .prepare(
          `INSERT INTO firing_seq (project_id, n) VALUES (?, 1)
             ON CONFLICT(project_id) DO UPDATE SET n = n + 1
             RETURNING n`,
        )
        .get(this.projectId),
    ) as { n: number };
    return row.n;
  }
}
