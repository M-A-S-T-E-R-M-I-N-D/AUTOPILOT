// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the live worker card's per-firing progress bar's
 * pure math (`web/live-progress.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2, eighteenth cut. `live-worker-progress.test.ts`
 * already regression-tests this logic indirectly through the rendered DOM
 * in `clientJs()`; these tests exercise the real function directly instead.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { liveProgressOf } from '../../src/web/live-progress.js';
import { fmtElapsed, fmtDuration } from '../../src/web/format.js';

const NOW = 1_700_000_000_000;

describe('liveProgressOf', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes elapsed vs. average as a percentage', () => {
    const result = liveProgressOf(NOW - 60_000, 80_000, fmtElapsed, fmtDuration);

    // elapsed 60s against an 80s average = 75%
    expect(result.pct).toBe(75);
    expect(result.pctCapped).toBe(75);
    expect(result.isOver).toBe(false);
    expect(result.label).toBe('1m 0s of an average 1m 20s (75%)');
  });

  it('calls out an overrun instead of clipping the label at 100%', () => {
    const result = liveProgressOf(NOW - 15_000, 10_000, fmtElapsed, fmtDuration);

    // elapsed 15s against a 10s average = 150%, uncapped
    expect(result.pct).toBe(150);
    expect(result.pctCapped).toBe(100);
    expect(result.isOver).toBe(true);
    expect(result.label).toBe('15s of an average 10s — running longer than usual');
  });

  it('caps pctCapped at 100 but keeps pct uncapped for the overrun check', () => {
    const result = liveProgressOf(NOW - 200_000, 100_000, fmtElapsed, fmtDuration);

    expect(result.pct).toBe(200);
    expect(result.pctCapped).toBe(100);
  });

  it('floors at 0% when the firing appears to have not started yet', () => {
    const result = liveProgressOf(NOW + 5_000, 100_000, fmtElapsed, fmtDuration);

    expect(result.pct).toBe(0);
    expect(result.pctCapped).toBe(0);
    expect(result.isOver).toBe(false);
  });
});
