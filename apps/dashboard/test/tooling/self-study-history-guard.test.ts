// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression guard for the data-loss this file is named after, caught live on
 * 2026-09-06: a flight flown from a FRESH CLONE regenerated the committed
 * self-study snapshot from that machine's brand-new telemetry store and
 * republished 1 firing over the 136 the paper already recorded — deleting four
 * days of telemetry, $233 of recorded spend, and whole §4 analysis sections
 * (TDD compliance, board diversity, evaluation labels, warm sessions).
 *
 * `.autopilot/autopilot.db` is git-ignored per-machine runtime state
 * (FLIGHT-CONTAINMENT.md) while the DATA blocks are a COMMITTED cumulative
 * record, so the two can legitimately disagree — but only in one direction.
 * Firings are append-only: a regeneration may hold the count steady or grow
 * it, never shrink it. A shrink means the machine is missing history it is
 * about to overwrite.
 */
import { describe, it, expect } from 'vitest';
import {
  historyRegressionReason,
  allowHistoryLoss,
  ALLOW_HISTORY_LOSS_ENV,
} from '../../../../scripts/self-study/history-guard.mjs';

describe('historyRegressionReason', () => {
  it('allows the write when there is no previous snapshot to compare against', () => {
    // The very first run, or a tree whose DATA:SERIES block predates the
    // rollup — degrades to "no delta", the same convention the generator's
    // previousSeriesSnapshot() already uses.
    expect(historyRegressionReason(null, { firings: 3 })).toBeNull();
  });

  it('allows the write when the store grew (the ordinary flight-end case)', () => {
    expect(historyRegressionReason({ firings: 135 }, { firings: 136 })).toBeNull();
  });

  it('allows the write when the count held steady (a no-op refresh)', () => {
    expect(historyRegressionReason({ firings: 136 }, { firings: 136 })).toBeNull();
  });

  it('REFUSES the write when the store reports fewer firings than the committed snapshot', () => {
    const reason = historyRegressionReason({ firings: 136 }, { firings: 1 });
    expect(reason).not.toBeNull();
    expect(reason).toContain('136');
    expect(reason).toContain('1');
  });

  it('refuses on a single lost firing — the guard is not a fuzzy threshold', () => {
    expect(historyRegressionReason({ firings: 2 }, { firings: 1 })).not.toBeNull();
  });

  it('treats a missing firings count as zero rather than throwing', () => {
    expect(historyRegressionReason({}, {})).toBeNull();
    expect(historyRegressionReason({ firings: 5 }, {})).not.toBeNull();
  });

  it('names the fix in the reason so the operator knows what to do next', () => {
    const reason = historyRegressionReason({ firings: 136 }, { firings: 1 });
    expect(reason).toMatch(/append-only/i);
    expect(reason).toMatch(/regenerate|restore/i);
  });
});

describe('allowHistoryLoss', () => {
  it('is off by default — the guard protects an operator who set nothing', () => {
    expect(allowHistoryLoss({})).toBe(false);
  });

  it('opts out only on an exact "1", not on any truthy string', () => {
    expect(allowHistoryLoss({ [ALLOW_HISTORY_LOSS_ENV]: '1' })).toBe(true);
    expect(allowHistoryLoss({ [ALLOW_HISTORY_LOSS_ENV]: 'true' })).toBe(false);
    expect(allowHistoryLoss({ [ALLOW_HISTORY_LOSS_ENV]: '0' })).toBe(false);
    expect(allowHistoryLoss({ [ALLOW_HISTORY_LOSS_ENV]: '' })).toBe(false);
  });
});
