// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure width-encoded segment geometry
 * (`web/timeline-strip.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2. `flight-timeline-strip.test.ts` already
 * regression-tests this logic indirectly through the rendered SVG strip in
 * `clientJs()`; these tests exercise the real function directly instead.
 */

import { describe, it, expect } from 'vitest';
import { timelineSegments } from '../../src/web/timeline-strip.js';

describe('timelineSegments', () => {
  it('sizes each segment proportionally to its share of the total duration', () => {
    const geo = timelineSegments([180000, 60000], 240);
    expect(geo).not.toBeNull();
    expect(geo!.total).toBe(240000);
    expect(geo!.segments[0]!.width).toBeCloseTo(180, 5);
    expect(geo!.segments[1]!.width).toBeCloseTo(60, 5);
  });

  it('lays segments left to right with no gaps, widths summing to the strip width', () => {
    const geo = timelineSegments([100, 100, 200], 240);
    expect(geo!.segments[0]!.x).toBe(0);
    expect(geo!.segments[1]!.x).toBeCloseTo(geo!.segments[0]!.width, 5);
    expect(geo!.segments[2]!.x).toBeCloseTo(geo!.segments[0]!.width + geo!.segments[1]!.width, 5);
    const totalWidth = geo!.segments.reduce((sum, s) => sum + s.width, 0);
    expect(totalWidth).toBeCloseTo(240, 5);
  });

  it('floors a missing/zero duration at a 1ms-equivalent share rather than vanishing', () => {
    const geo = timelineSegments([1000, null, undefined, 0], 240);
    expect(geo).not.toBeNull();
    expect(geo!.segments.length).toBe(4);
    for (const seg of geo!.segments.slice(1)) expect(seg.width).toBeGreaterThan(0);
  });

  it('returns null for an empty series', () => {
    expect(timelineSegments([], 240)).toBeNull();
  });

  it('returns null when no firing has any real duration data', () => {
    expect(timelineSegments([null, undefined, 0], 240)).toBeNull();
  });
});
