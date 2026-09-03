// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { Store } from '@autopilot/store';
import { nextAdaptivePaceMin, type PaceConfig } from '../pace.js';

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;

/**
 * SQLite-backed adaptive-cadence pacer (PATTERNS-AND-STANDARDS §7): sums the
 * project's real gate-verified spend over the trailing hour and week from
 * the same `metrics` projection the dashboard graphs read, then folds it
 * through the pure {@link nextAdaptivePaceMin}. Feeds `LoopDeps.nextPaceMin`.
 */
export class SqlitePacer {
  constructor(
    private readonly store: Store,
    private readonly projectId: string,
    private readonly config: PaceConfig,
    private readonly now: () => number = () => Date.now(),
  ) {}

  nextPaceMin(): Promise<number> {
    const nowMs = this.now();
    const spend = {
      lastHourUsd: this.spendSince(nowMs - HOUR_MS),
      lastWeekUsd: this.spendSince(nowMs - WEEK_MS),
    };
    return Promise.resolve(nextAdaptivePaceMin(spend, this.config));
  }

  private spendSince(sinceMs: number): number {
    const row = this.store.db
      .prepare(
        'SELECT COALESCE(SUM(cost_usd), 0) AS s FROM metrics WHERE project_id = ? AND created_at >= ?',
      )
      .get(this.projectId, sinceMs) as { s: number };
    return row.s;
  }
}
