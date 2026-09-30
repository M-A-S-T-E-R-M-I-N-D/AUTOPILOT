// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A minimal fixed-window rate limiter (ap-msjbcx9w-3): caps how often one client
 * key may pass `allow()` inside a rolling window. Used to bound quota-spending
 * endpoints (`/api/ask`, `/api/ask/stream`) against a runaway loop from a single
 * client — the loopback host guard stops other machines, not a misbehaving local
 * script. `nowMs` is injected (never `Date.now()` internally) so the window logic
 * is deterministically testable.
 *
 * Expired windows are swept at most once per `windowMs` (ap-munfoqmp-1), so the
 * map holds only clients seen in roughly the last two windows instead of every
 * client key the process has ever served. The sweep is O(keys) per window,
 * amortized O(1) per call.
 */
export interface RateLimiter {
  /** True and consumes one unit if `key` is under the limit for the window containing `nowMs`; false (no consumption) once the limit is reached. */
  allow(key: string, nowMs: number): boolean;
}

/** The concrete limiter: a {@link RateLimiter} that can also report how many client keys it is holding. */
export interface TrackedRateLimiter extends RateLimiter {
  /** How many client keys currently hold a window. */
  trackedKeys(): number;
}

interface Window {
  readonly startedAt: number;
  count: number;
}

export function createRateLimiter(limit: number, windowMs: number): TrackedRateLimiter {
  const windows = new Map<string, Window>();
  let lastSweepAt = Number.NEGATIVE_INFINITY;
  const sweepExpired = (nowMs: number): void => {
    if (nowMs - lastSweepAt < windowMs) return;
    lastSweepAt = nowMs;
    for (const [key, window] of windows) {
      if (nowMs - window.startedAt >= windowMs) windows.delete(key);
    }
  };
  return {
    trackedKeys: () => windows.size,
    allow(key, nowMs) {
      if (limit <= 0) return false;
      sweepExpired(nowMs);
      const current = windows.get(key);
      if (current === undefined || nowMs - current.startedAt >= windowMs) {
        windows.set(key, { startedAt: nowMs, count: 1 });
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
  };
}
