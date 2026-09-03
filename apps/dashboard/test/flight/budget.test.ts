// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { totalBudgetExhausted, cliTimeoutMsFromEnv } from '../../src/flight/budget.js';

describe('totalBudgetExhausted', () => {
  it('never stops fixed-firings mode (no total target set)', () => {
    expect(totalBudgetExhausted(0, undefined, 2)).toBe(false);
    expect(totalBudgetExhausted(9999, undefined, 2)).toBe(false);
  });

  it('keeps firing while the remainder can still fund one more firing', () => {
    // $10 total, $2/firing spent so far → $8 left, plenty for a $2 firing.
    expect(totalBudgetExhausted(2, 10, 2)).toBe(false);
  });

  it('stops the instant the remainder can no longer fund another firing', () => {
    // $10 total, $8.50 spent → $1.50 left, short of the $2 floor.
    expect(totalBudgetExhausted(8.5, 10, 2)).toBe(true);
  });

  it('stops exactly at the boundary (remainder equal to the per-firing budget still funds one)', () => {
    expect(totalBudgetExhausted(8, 10, 2)).toBe(false); // exactly $2 left → funds one more
    expect(totalBudgetExhausted(8.01, 10, 2)).toBe(true); // a cent short → stop
  });
});

describe('cliTimeoutMsFromEnv (THIRD CAP, wall-clock — operator/launcher tunable)', () => {
  // Research basis (RESEARCH-LIBRARY): layered budgets with EXPLICIT gates are
  // the consensus; a fixed 30-min CLI wall clock silently became the binding
  // cap under 10-way contention (envelope-less deaths, cost unknown). The
  // launcher can now widen it per round via AUTOPILOT_CLI_TIMEOUT_MS.
  it('parses a positive integer of milliseconds', () => {
    expect(cliTimeoutMsFromEnv({ AUTOPILOT_CLI_TIMEOUT_MS: '2700000' })).toBe(2_700_000);
  });

  it('returns undefined (driver default) when unset, blank, non-numeric, or non-positive', () => {
    expect(cliTimeoutMsFromEnv({})).toBeUndefined();
    expect(cliTimeoutMsFromEnv({ AUTOPILOT_CLI_TIMEOUT_MS: '' })).toBeUndefined();
    expect(cliTimeoutMsFromEnv({ AUTOPILOT_CLI_TIMEOUT_MS: 'forever' })).toBeUndefined();
    expect(cliTimeoutMsFromEnv({ AUTOPILOT_CLI_TIMEOUT_MS: '0' })).toBeUndefined();
    expect(cliTimeoutMsFromEnv({ AUTOPILOT_CLI_TIMEOUT_MS: '-5' })).toBeUndefined();
  });
});
