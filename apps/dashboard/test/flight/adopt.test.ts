// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adoptFlight, type AdoptFlightDeps } from '../../src/flight/adopt.js';

describe('adoptFlight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the wrapped pid', () => {
    const deps: AdoptFlightDeps = { isAlive: () => true, killPid: () => {} };
    expect(adoptFlight(4242, deps).pid).toBe(4242);
  });

  it('kill() signals the pid via killPid, not any spawned child handle', () => {
    const killed: number[] = [];
    const deps: AdoptFlightDeps = { isAlive: () => true, killPid: (pid) => killed.push(pid) };
    adoptFlight(4242, deps).kill();
    expect(killed).toEqual([4242]);
  });

  it('onExit fires once the poll observes the pid is no longer alive', () => {
    let alive = true;
    const deps: AdoptFlightDeps = { isAlive: () => alive, killPid: () => {}, pollIntervalMs: 100 };
    const cb = vi.fn();
    adoptFlight(4242, deps).onExit(cb);

    vi.advanceTimersByTime(300);
    expect(cb).not.toHaveBeenCalled();

    alive = false;
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(null);
  });

  it('stops polling once onExit has fired (no further isAlive calls)', () => {
    let alive = true;
    const isAlive = vi.fn(() => alive);
    const deps: AdoptFlightDeps = { isAlive, killPid: () => {}, pollIntervalMs: 100 };
    adoptFlight(4242, deps).onExit(() => {});

    vi.advanceTimersByTime(100);
    alive = false;
    vi.advanceTimersByTime(100);
    const callsAtExit = isAlive.mock.calls.length;

    vi.advanceTimersByTime(1000);
    expect(isAlive.mock.calls.length).toBe(callsAtExit);
  });

  it('defaults the poll interval to something that never fires eagerly', () => {
    const deps: AdoptFlightDeps = { isAlive: () => false, killPid: () => {} };
    const cb = vi.fn();
    adoptFlight(4242, deps).onExit(cb);

    vi.advanceTimersByTime(4_999);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
