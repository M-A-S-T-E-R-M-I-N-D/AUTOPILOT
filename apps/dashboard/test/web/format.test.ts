// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the fleet dashboard's pure formatting helpers
 * (`web/format.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2, following the same pattern `office-map.ts` proved for the office
 * map's pure geometry. Previously these were hand-typed, untested JS text
 * inside `fleetJs()`'s template string.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fmtBytes,
  fmtCost,
  fmtTokens,
  fmtAgo,
  fmtElapsed,
  fmtDuration,
} from '../../src/web/format.js';

describe('fmtBytes', () => {
  it('formats sub-1024 byte counts as bytes', () => {
    expect(fmtBytes(512)).toBe('512 B');
  });

  it('formats kilobyte-range counts with one decimal', () => {
    expect(fmtBytes(3584)).toBe('3.5 KB');
  });

  it('formats megabyte-range counts with one decimal', () => {
    expect(fmtBytes(2 * 1048576)).toBe('2.0 MB');
  });

  it('does not compound rounding error just under the megabyte boundary', () => {
    // 1048550 / 1024 = 1023.975..., which toFixed(1) rounds to "1024.0" — a
    // naive branch on the raw (unrounded) value keeps this in the KB bucket
    // and renders the malformed "1024.0 KB" instead of promoting to "1.0 MB".
    expect(fmtBytes(1048550)).toBe('1.0 MB');
  });
});

describe('fmtCost', () => {
  it('floors sub-cent positive spend to "<$0.01"', () => {
    expect(fmtCost(0.004)).toBe('<$0.01');
  });

  it('formats zero and undefined as $0.00', () => {
    expect(fmtCost(0)).toBe('$0.00');
    expect(fmtCost(undefined as unknown as number)).toBe('$0.00');
  });

  it('formats normal spend to two decimals', () => {
    expect(fmtCost(12.3)).toBe('$12.30');
  });

  it('puts the minus sign before the dollar sign for negative values', () => {
    // n.toFixed(2) on a negative number already carries its own '-', so a
    // naive '$' + n.toFixed(2) produces the wrong '$-5.00' — this asserts
    // the conventional '-$5.00' instead.
    expect(fmtCost(-5)).toBe('-$5.00');
  });

  it('floors sub-cent negative spend to "-<$0.01" instead of the misleading "-$0.00"', () => {
    // The positive-side floor above exists specifically to avoid rendering a
    // real, nonzero spend as "$0.00" — the same case on the negative side
    // (e.g. a tiny refund/credit) previously fell through to
    // Math.abs(n).toFixed(2), producing the equally misleading "-$0.00".
    expect(fmtCost(-0.004)).toBe('-<$0.01');
  });
});

describe('fmtTokens', () => {
  it('renders sub-1000 counts verbatim', () => {
    expect(fmtTokens(850)).toBe('850');
  });

  it('renders thousands with a k suffix', () => {
    expect(fmtTokens(12345)).toBe('12.3k');
  });

  it('renders millions with an M suffix', () => {
    expect(fmtTokens(1500000)).toBe('1.5M');
  });

  it('does not compound rounding error just under the million boundary', () => {
    // 999950 / 1000 = 999.95, which toFixed(1) rounds to "1000.0" — a naive
    // branch on the raw (unrounded) value keeps this in the 'k' bucket and
    // renders the malformed "1000.0k" instead of promoting to "1.0M".
    expect(fmtTokens(999950)).toBe('1.0M');
  });
});

describe('clock-based formatters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fmtAgo', () => {
    it('reports "just now" for sub-2s gaps', () => {
      expect(fmtAgo(Date.now() - 1000)).toBe('just now');
    });

    it('reports seconds ago under a minute', () => {
      expect(fmtAgo(Date.now() - 30 * 1000)).toBe('30s ago');
    });

    it('reports days ago at day scale', () => {
      expect(fmtAgo(Date.now() - 3 * 24 * 3600 * 1000)).toBe('3d ago');
    });

    it('does not compound rounding error at the minute/hour boundary', () => {
      // 1h 29m 30s: true hour count round(5370/3600) = 1, not 2 — a naive
      // round(round(s/60)/60) first rounds 89.5m up to 90m, then rounds
      // 90/60 up to 2h, jumping a full hour bucket early.
      expect(fmtAgo(Date.now() - 5370 * 1000)).toBe('1h ago');
    });

    it('does not compound rounding error at the hour/day boundary', () => {
      // 35h 30m: true day count round(127800/86400) = 1, not 2 — the same
      // double-rounding bug one bucket up (minutes -> hours -> days).
      expect(fmtAgo(Date.now() - 127800 * 1000)).toBe('1d ago');
    });
  });

  describe('fmtElapsed', () => {
    it('formats sub-minute spans as seconds', () => {
      expect(fmtElapsed(Date.now() - 45 * 1000)).toBe('45s');
    });

    it('formats minute-scale spans as minutes and seconds', () => {
      expect(fmtElapsed(Date.now() - (2 * 60 + 5) * 1000)).toBe('2m 5s');
    });

    it('formats hour-scale spans as hours and minutes', () => {
      expect(fmtElapsed(Date.now() - (3 * 3600 + 15 * 60) * 1000)).toBe('3h 15m');
    });
  });
});

describe('fmtDuration', () => {
  it('formats sub-minute spans as seconds', () => {
    expect(fmtDuration(45 * 1000)).toBe('45s');
  });

  it('formats minute-scale spans as minutes and seconds', () => {
    expect(fmtDuration((2 * 60 + 5) * 1000)).toBe('2m 5s');
  });

  it('formats hour-scale spans as hours and minutes', () => {
    expect(fmtDuration((3 * 3600 + 15 * 60) * 1000)).toBe('3h 15m');
  });

  it('formats day-scale spans as days and hours', () => {
    expect(fmtDuration((2 * 86400 + 5 * 3600) * 1000)).toBe('2d 5h');
  });
});
