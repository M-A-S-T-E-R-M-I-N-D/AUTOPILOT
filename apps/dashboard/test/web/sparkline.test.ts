// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure per-bar sparkline geometry
 * (`web/sparkline.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2. `spark-tooltip.test.ts` already regression-tests this logic
 * indirectly through the rendered SVG bars in `clientJs()`; these tests
 * exercise the real function directly instead.
 */

import { describe, it, expect } from 'vitest';
import { sparkBars } from '../../src/web/sparkline.js';

describe('sparkBars', () => {
  it('scales the tallest bar to fill the height minus the 2px inset', () => {
    const geo = sparkBars([10, 5], 240, 34, 2);
    expect(geo.max).toBe(10);
    expect(geo.total).toBe(15);
    expect(geo.bars[0]!.height).toBe(32);
    expect(geo.bars[1]!.height).toBe(16);
  });

  it('floors a non-zero value at 1px tall so it never renders invisibly thin', () => {
    const geo = sparkBars([1000, 1], 240, 34, 2);
    expect(geo.bars[1]!.height).toBe(1);
  });

  it('sits every bar on the baseline (y + height === chart height)', () => {
    const geo = sparkBars([3, 7, 2], 240, 34, 2);
    for (const bar of geo.bars) {
      expect(bar.y + bar.height).toBe(34);
    }
  });

  it('spaces equal-width bars left to right with the given gap', () => {
    const geo = sparkBars([1, 1, 1], 100, 20, 4);
    const bw = (100 - 4 * 2) / 3;
    expect(geo.bars[0]!.width).toBeCloseTo(bw);
    expect(geo.bars[0]!.x).toBe(0);
    expect(geo.bars[1]!.x).toBeCloseTo(bw + 4);
    expect(geo.bars[2]!.x).toBeCloseTo(2 * (bw + 4));
  });

  it('returns a zero max/total and no bars for an empty series', () => {
    const geo = sparkBars([], 240, 34, 2);
    expect(geo.max).toBe(0);
    expect(geo.total).toBe(0);
    expect(geo.bars).toEqual([]);
  });

  it('treats every value as zero when the whole series is zero, without dividing by zero', () => {
    const geo = sparkBars([0, 0, 0], 240, 34, 2);
    expect(geo.max).toBe(0);
    expect(geo.bars.every((b) => b.height === 0)).toBe(true);
  });
});
