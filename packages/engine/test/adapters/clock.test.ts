// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { SystemClock } from '../../src/adapters/clock.js';

describe('SystemClock', () => {
  it('nowEpochSec floors the current epoch milliseconds down to whole seconds', () => {
    vi.useFakeTimers();
    try {
      // A sub-second remainder (.999) distinguishes floor from round/ceil/truncate-up.
      vi.setSystemTime(new Date('2026-08-13T12:34:56.999Z'));
      const clock = new SystemClock();
      expect(clock.nowEpochSec()).toBe(Math.floor(Date.now() / 1000));
      expect(clock.nowEpochSec()).toBe(1786624496);
    } finally {
      vi.useRealTimers();
    }
  });

  it('nowEpochSec advances one-for-one with real elapsed seconds', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-13T00:00:00.000Z'));
      const clock = new SystemClock();
      const first = clock.nowEpochSec();
      vi.setSystemTime(new Date('2026-08-13T00:00:07.000Z'));
      expect(clock.nowEpochSec()).toBe(first + 7);
    } finally {
      vi.useRealTimers();
    }
  });

  it('nowIso returns the current instant as a millisecond-precision ISO 8601 string', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-13T12:34:56.789Z'));
      const clock = new SystemClock();
      expect(clock.nowIso()).toBe('2026-08-13T12:34:56.789Z');
    } finally {
      vi.useRealTimers();
    }
  });
});
