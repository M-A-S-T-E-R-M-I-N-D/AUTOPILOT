// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from 'node:fs';
import { openStore, taskEconomics, type Store } from '@autopilot/store';

export interface TaskCostHistory {
  readonly firings: number;
  readonly usd: number;
}

/**
 * Every task's lifetime firings and cost for `projectId`, keyed by task id —
 * the 🍀 fit scorer's history signal (issue #44): a `github-<n>` row tells
 * what flying that issue has cost so far. Degrades to an empty map on a
 * missing or broken store, like every other read here.
 */
export function readTaskEconomicsFromStore(
  dbPath: string,
  projectId: string,
): ReadonlyMap<string, TaskCostHistory> {
  if (!existsSync(dbPath)) return new Map();
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    return new Map(
      taskEconomics(store.db, projectId).map((e) => [
        e.taskId,
        { firings: e.firingCount, usd: e.cumulativeCostUsd },
      ]),
    );
  } catch {
    return new Map();
  } finally {
    store?.close();
  }
}
