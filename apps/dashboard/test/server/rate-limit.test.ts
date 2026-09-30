// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../../src/server/rate-limit.js';

describe('createRateLimiter', () => {
  it('allows up to the limit within a window, then denies', () => {
    const limiter = createRateLimiter(3, 1000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 10)).toBe(true);
    expect(limiter.allow('a', 20)).toBe(true);
    expect(limiter.allow('a', 30)).toBe(false);
    expect(limiter.allow('a', 999)).toBe(false);
  });

  it('resets once the window elapses', () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 500)).toBe(true);
    expect(limiter.allow('a', 999)).toBe(false);
    expect(limiter.allow('a', 1000)).toBe(true); // new window starts exactly at windowMs
    expect(limiter.allow('a', 1001)).toBe(true);
    expect(limiter.allow('a', 1002)).toBe(false);
  });

  it('resets a window that expired between two sweeps, exactly at the boundary (2026-09-30)', () => {
    // The sweep runs once per window; a key whose window started after the
    // last sweep expires before the next one, and only allow() itself can
    // see that. The nightly mutation run found nothing asking for it.
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.allow('a', 0)).toBe(true); // sweep at 0
    expect(limiter.allow('b', 600)).toBe(true); // no sweep: 600 < 1000
    expect(limiter.allow('b', 1599)).toBe(false); // b's window is 999ms old
    expect(limiter.allow('b', 1600)).toBe(true); // exactly 1000ms old: a new window
  });

  it('tracks each key independently', () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('b', 0)).toBe(true);
    expect(limiter.allow('a', 1)).toBe(false);
    expect(limiter.allow('b', 1)).toBe(false);
  });

  it('a denied call does not consume budget from the next window', () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 500)).toBe(false);
    expect(limiter.allow('a', 501)).toBe(false);
    expect(limiter.allow('a', 1000)).toBe(true);
  });

  it('denies every call, including the first in a fresh window, when limit is 0', () => {
    const limiter = createRateLimiter(0, 1000);
    expect(limiter.allow('a', 0)).toBe(false);
    expect(limiter.allow('a', 500)).toBe(false);
    expect(limiter.allow('a', 1000)).toBe(false); // still denied in the next window
  });

  describe('expired-window eviction (ap-munfoqmp-1)', () => {
    it('forgets every client whose window has expired, so the map stays bounded', () => {
      const limiter = createRateLimiter(1, 1000);
      for (let i = 0; i < 100; i += 1) limiter.allow(`client-${i}`, 0);
      expect(limiter.trackedKeys()).toBe(100);
      // Exactly one window later every client-* window has expired (the same
      // `>= windowMs` boundary allow() uses to start a fresh window).
      limiter.allow('late', 1000);
      expect(limiter.trackedKeys()).toBe(1);
    });

    it('keeps a client whose window is still open, with its spent budget intact', () => {
      const limiter = createRateLimiter(1, 1000);
      expect(limiter.allow('old', 0)).toBe(true);
      expect(limiter.allow('active', 600)).toBe(true);
      limiter.allow('late', 1000); // sweeps 'old', must spare 'active'
      expect(limiter.trackedKeys()).toBe(2);
      expect(limiter.allow('active', 1001)).toBe(false); // still inside its 600..1600 window
    });

    it('sweeps at most once per window, not on every call', () => {
      const limiter = createRateLimiter(1, 1000);
      limiter.allow('a', 0); // first sweep at 0
      limiter.allow('b', 600);
      limiter.allow('c', 1000); // second sweep at 1000: evicts 'a', spares 'b'
      expect(limiter.trackedKeys()).toBe(2);
      // At 1700 'b' has expired, but the next sweep is not due until 2000.
      limiter.allow('d', 1700);
      expect(limiter.trackedKeys()).toBe(3);
      limiter.allow('e', 2000); // due: evicts 'b' (1400 old) and 'c' (1000 old), spares 'd'
      expect(limiter.trackedKeys()).toBe(2);
    });

    it('an evicted client starts a fresh window with its full budget', () => {
      const limiter = createRateLimiter(1, 1000);
      expect(limiter.allow('a', 0)).toBe(true);
      limiter.allow('late', 1000); // evicts 'a'
      expect(limiter.allow('a', 1000)).toBe(true);
      expect(limiter.allow('a', 1001)).toBe(false);
    });
  });
});
