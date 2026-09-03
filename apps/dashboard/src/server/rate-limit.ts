// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A minimal fixed-window rate limiter (ap-msjbcx9w-3): caps how often one client
 * key may pass `allow()` inside a rolling window. Used to bound quota-spending
 * endpoints (`/api/ask`, `/api/ask/stream`) against a runaway loop from a single
 * client — the loopback host guard stops other machines, not a misbehaving local
 * script. `nowMs` is injected (never `Date.now()` internally) so the window logic
 * is deterministically testable.
 */
export interface RateLimiter {
  /** True and consumes one unit if `key` is under the limit for the window containing `nowMs`; false (no consumption) once the limit is reached. */
  allow(key: string, nowMs: number): boolean;
}

interface Window {
  readonly startedAt: number;
  count: number;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Window>();
  return {
    allow(key, nowMs) {
      if (limit <= 0) return false;
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
