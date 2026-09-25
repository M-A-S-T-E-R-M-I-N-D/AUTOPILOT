// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A gate that crashed from load gets one more run (2026-09-25): a load crash
 * left a base-lane commit parked instead of reaching main.
 */
import { describe, it, expect, vi } from 'vitest';
import type { GateResult } from '../../src/ports.js';
import { RetryLoadedGate, isLoadCrash } from '../../src/adapters/retry-loaded-gate.js';

const LOADED: GateResult = {
  ok: false,
  crashed: true,
  details:
    'pnpm run test:impacted failed (crashed: test workers never started — the machine was too loaded to judge) — gate could not verify the commit',
};
const TIMED_OUT: GateResult = {
  ok: false,
  crashed: true,
  details: 'pnpm run test failed (crashed: timeout) — gate could not verify the commit',
};
const RED: GateResult = { ok: false, details: 'pnpm run test failed (exit 1)' };
const GREEN: GateResult = { ok: true, details: '5 gate command(s) passed' };

function gateOf(...results: GateResult[]) {
  const run = vi.fn();
  for (const r of results) run.mockResolvedValueOnce(r);
  return { run };
}

describe('isLoadCrash', () => {
  it('is true only for a crash the load classifier produced', () => {
    expect(isLoadCrash(LOADED)).toBe(true);
    expect(
      isLoadCrash({
        ok: false,
        crashed: true,
        details: 'Error: [vitest-pool]: Failed to start forks worker for test files x',
      }),
    ).toBe(true);
    expect(isLoadCrash(TIMED_OUT)).toBe(false);
    expect(isLoadCrash(RED)).toBe(false);
    expect(isLoadCrash(GREEN)).toBe(false);
    expect(isLoadCrash({ ok: false, crashed: true })).toBe(false);
  });
});

describe('RetryLoadedGate', () => {
  it('runs once more after a load crash and returns the verdict that run reaches', async () => {
    const inner = gateOf(LOADED, GREEN);
    const onRetry = vi.fn();
    expect(await new RetryLoadedGate({ inner, onRetry }).run()).toBe(GREEN);
    expect(inner.run).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1);
  });

  it('returns a red found on the retry as a red', async () => {
    const inner = gateOf(LOADED, RED);
    expect(await new RetryLoadedGate({ inner }).run()).toBe(RED);
  });

  it('gives up after its retries and returns the last crash', async () => {
    const inner = gateOf(LOADED, LOADED, GREEN);
    expect(await new RetryLoadedGate({ inner }).run()).toBe(LOADED);
    expect(inner.run).toHaveBeenCalledTimes(2);
    const twice = gateOf(LOADED, LOADED, GREEN);
    expect(await new RetryLoadedGate({ inner: twice, retries: 2 }).run()).toBe(GREEN);
  });

  it('never retries a green, a red, or another kind of crash', async () => {
    for (const result of [GREEN, RED, TIMED_OUT]) {
      const inner = gateOf(result, GREEN);
      expect(await new RetryLoadedGate({ inner }).run()).toBe(result);
      expect(inner.run).toHaveBeenCalledTimes(1);
    }
  });
});
