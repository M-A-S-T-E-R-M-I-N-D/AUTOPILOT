// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  percentile,
  summarizeInteractionTiming,
} from '../../../../scripts/cockpit-metrics-interaction.mjs';

describe('percentile', () => {
  it('returns the nearest-rank value for an unsorted sample', () => {
    // Arrange: 5 values, p75 rank = ceil(0.75 * 5) = 4 → 4th smallest.
    const sample = [5, 1, 3, 2, 4];

    // Act
    const p75 = percentile(sample, 75);

    // Assert
    expect(p75).toBe(4);
  });

  it('returns the max at p=100 and the min at p=0', () => {
    const sample = [7, 2, 9, 4];

    expect(percentile(sample, 100)).toBe(9);
    expect(percentile(sample, 0)).toBe(2);
  });

  it('returns the single element for a one-value sample at any percentile', () => {
    expect(percentile([42], 75)).toBe(42);
    expect(percentile([42], 1)).toBe(42);
  });

  it('returns 0 when there are no interactions to measure', () => {
    expect(percentile([], 75)).toBe(0);
  });

  it('never mutates the input sample', () => {
    const sample = [3, 1, 2];

    percentile(sample, 75);

    expect(sample).toEqual([3, 1, 2]);
  });
});

describe('summarizeInteractionTiming', () => {
  it('reports p75/max latency and the longest main-thread block across all sources', () => {
    // Arrange: 4 dispatch durations (p75 rank 3 → 3rd smallest = 4), a slower tick,
    // and a bundle eval slower still — longest task must pick the eval.
    const timings = { evalMs: 20, tickDrains: [6, 12], durations: [1, 3, 4, 9] };

    // Act
    const summary = summarizeInteractionTiming(timings);

    // Assert
    expect(summary).toEqual({
      interactions: 4,
      inpP75: 4,
      inpMax: 9,
      evalMs: 20,
      maxTickMs: 12,
      longestTask: 20,
    });
  });

  it('picks the slowest interaction as the longest task when it beats eval and ticks', () => {
    const summary = summarizeInteractionTiming({
      evalMs: 2,
      tickDrains: [3],
      durations: [1, 15],
    });

    expect(summary.longestTask).toBe(15);
    expect(summary.inpMax).toBe(15);
  });

  it('degrades to eval-only when a render has no interactions and no ticks', () => {
    const summary = summarizeInteractionTiming({ evalMs: 5, tickDrains: [], durations: [] });

    expect(summary).toEqual({
      interactions: 0,
      inpP75: 0,
      inpMax: 0,
      evalMs: 5,
      maxTickMs: 0,
      longestTask: 5,
    });
  });
});
