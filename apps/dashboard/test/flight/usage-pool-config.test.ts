// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  subscriptionPriceUsdFromEnv,
  usagePoolDirsFromEnv,
} from '../../src/flight/usage-pool-config.js';

describe('subscriptionPriceUsdFromEnv', () => {
  it('parses a positive AUTOPILOT_SUBSCRIPTION_PRICE_USD', () => {
    expect(subscriptionPriceUsdFromEnv({ AUTOPILOT_SUBSCRIPTION_PRICE_USD: '200' })).toBe(200);
  });

  it('defaults to null when unset, blank, zero, negative, or non-numeric (never a guess)', () => {
    expect(subscriptionPriceUsdFromEnv({})).toBeNull();
    expect(subscriptionPriceUsdFromEnv({ AUTOPILOT_SUBSCRIPTION_PRICE_USD: '' })).toBeNull();
    expect(subscriptionPriceUsdFromEnv({ AUTOPILOT_SUBSCRIPTION_PRICE_USD: '0' })).toBeNull();
    expect(subscriptionPriceUsdFromEnv({ AUTOPILOT_SUBSCRIPTION_PRICE_USD: '-5' })).toBeNull();
    expect(subscriptionPriceUsdFromEnv({ AUTOPILOT_SUBSCRIPTION_PRICE_USD: 'abc' })).toBeNull();
  });
});

describe('usagePoolDirsFromEnv', () => {
  it('splits AUTOPILOT_USAGE_POOL_DIRS on commas and trims blanks', () => {
    expect(
      // Synthetic POSIX-shaped fixture, deliberately not a home-directory
      // shape: `ci:no-personal-paths` reads `/home/<name>/…` as a real
      // operator path and fails the gate on it (2026-08-24). What this test
      // exercises is comma-splitting and blank-trimming — the leading
      // segment is irrelevant to that.
      usagePoolDirsFromEnv({ AUTOPILOT_USAGE_POOL_DIRS: '/srv/a/.claude, /srv/a/.other ,,' }),
    ).toEqual(['/srv/a/.claude', '/srv/a/.other']);
  });

  it('defaults to an empty list when unset (no scan, never a guessed scope)', () => {
    expect(usagePoolDirsFromEnv({})).toEqual([]);
  });
});
