// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from 'node:fs';
import { openStore, taskEconomics, UNPRICED_FIRING_SQL, type Store } from '@autopilot/store';

/**
 * How many firings on each task carry no price (epic 0036): a Codex or Gemini
 * run, or one killed before its envelope, whose record says `costUsd: null`
 * while the metrics column stores 0 ({@link UNPRICED_FIRING_SQL}). `taskEconomics`
 * sums that 0 into `cumulativeCostUsd`, so the runaway chip names these beside
 * the total instead of reading them as free. A task with none is absent.
 */
export function unpricedFiringsByTask(db: Store['db'], projectId: string): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT m.item AS taskId, COUNT(*) AS n
         FROM metrics m
        WHERE m.project_id = ? AND m.item IS NOT NULL AND ${UNPRICED_FIRING_SQL}
        GROUP BY m.item`,
    )
    .all(projectId) as { taskId: string; n: number }[];
  return new Map(rows.map((r) => [r.taskId, r.n]));
}

export interface TaskCostHistory {
  readonly firings: number;
  readonly usd: number;
  /** Firings among `firings` whose run reported no price, so `usd` holds none
   *  of their cost (epic 0036). Absent when every firing was priced. */
  readonly unpriced?: number;
}

/**
 * Every task's lifetime firings and cost for `projectId`, keyed by task id —
 * the 🍀 fit scorer's history signal (issue #44): a `github-<n>` row tells
 * what flying that issue has cost so far, and how many of its firings carry
 * no price. Degrades to an empty map on a missing or broken store, like
 * every other read here.
 */
export function readTaskEconomicsFromStore(
  dbPath: string,
  projectId: string,
): ReadonlyMap<string, TaskCostHistory> {
  if (!existsSync(dbPath)) return new Map();
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const unpricedById = unpricedFiringsByTask(store.db, projectId);
    return new Map(
      taskEconomics(store.db, projectId).map((e) => {
        const unpriced = unpricedById.get(e.taskId);
        return [
          e.taskId,
          {
            firings: e.firingCount,
            usd: e.cumulativeCostUsd,
            ...(unpriced === undefined ? {} : { unpriced }),
          },
        ];
      }),
    );
  } catch {
    return new Map();
  } finally {
    store?.close();
  }
}
