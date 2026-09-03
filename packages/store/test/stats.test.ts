// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { median } from '../src/stats.js';

describe('median', () => {
  it('returns null for an empty sample', () => {
    expect(median([])).toBeNull();
  });

  it('returns the middle value for an odd-length sample', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for an even-length sample', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('does not mutate the input array', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it('handles a single-value sample', () => {
    expect(median([42])).toBe(42);
  });
});
