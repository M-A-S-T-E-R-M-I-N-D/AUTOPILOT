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
});
