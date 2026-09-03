// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure severity-gauge segment math
 * (`web/gauge.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2. `gauge-langbar-tooltips.test.ts` already regression-tests this
 * logic indirectly through the rendered DOM in `clientJs()`; these tests
 * exercise the real function directly instead.
 */

import { describe, it, expect } from 'vitest';
import { gaugeSegments, cardGaugeLabels, gaugeSegmentMeta } from '../../src/web/gauge.js';

describe('gaugeSegments', () => {
  it('orders segments critical-to-low and keeps their raw counts', () => {
    expect(gaugeSegments({ critical: 1, high: 2, medium: 3, low: 4 })).toEqual([
      { kind: 'critical', count: 1 },
      { kind: 'high', count: 2 },
      { kind: 'medium', count: 3 },
      { kind: 'low', count: 4 },
    ]);
  });

  it('drops severities with a zero count', () => {
    expect(gaugeSegments({ critical: 1, high: 0, medium: 0, low: 1 })).toEqual([
      { kind: 'critical', count: 1 },
      { kind: 'low', count: 1 },
    ]);
  });

  it('returns an empty array when every severity is zero', () => {
    expect(gaugeSegments({ critical: 0, high: 0, medium: 0, low: 0 })).toEqual([]);
  });
});

describe('cardGaugeLabels', () => {
  const fmtAgo = (ts: number) => 'AGO(' + ts + ')';

  it('pluralizes "open findings" for any count other than 1', () => {
    expect(cardGaugeLabels({ openFindings: 3, lastActivityAt: 1 }, fmtAgo).findingsText).toBe(
      '3 open findings',
    );
    expect(cardGaugeLabels({ openFindings: 0, lastActivityAt: 1 }, fmtAgo).findingsText).toBe(
      '0 open findings',
    );
  });

  it('keeps "open finding" singular for exactly 1', () => {
    expect(cardGaugeLabels({ openFindings: 1, lastActivityAt: 1 }, fmtAgo).findingsText).toBe(
      '1 open finding',
    );
  });

  it('formats the last-activity timestamp via the injected fmtAgo', () => {
    expect(cardGaugeLabels({ openFindings: 0, lastActivityAt: 42 }, fmtAgo).activityText).toBe(
      'AGO(42)',
    );
  });

  it('falls back to "no activity yet" when lastActivityAt is null', () => {
    expect(cardGaugeLabels({ openFindings: 0, lastActivityAt: null }, fmtAgo).activityText).toBe(
      'no activity yet',
    );
  });
});

describe('gaugeSegmentMeta', () => {
  it('formats the tip as "<count> <kind>"', () => {
    expect(gaugeSegmentMeta({ kind: 'high', count: 2 }).tip).toBe('2 high');
  });

  it('formats the aria-label as "<kind>: <count>"', () => {
    expect(gaugeSegmentMeta({ kind: 'critical', count: 1 }).ariaLabel).toBe('critical: 1');
  });

  it('keeps the count verbatim even for a single-item segment', () => {
    const meta = gaugeSegmentMeta({ kind: 'low', count: 1 });
    expect(meta.tip).toBe('1 low');
    expect(meta.ariaLabel).toBe('low: 1');
  });
});
