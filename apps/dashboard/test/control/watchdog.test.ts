// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type AddressInfo } from 'node:net';
import { DashboardControl } from '../../src/control/control.js';
import { watchdogTick, runWatchdog, type WatchdogControl } from '../../src/control/watchdog.js';
import type { ControlConfig, StatusResult } from '../../src/control/types.js';

const FAKE_SERVER = `
import { createServer } from 'node:http';
const port = Number(process.env.AUTOPILOT_DASHBOARD_PORT);
const s = createServer((_, res) => { res.writeHead(200); res.end('{"ok":true}'); });
s.listen(port, '127.0.0.1');
process.on('SIGTERM', () => process.exit(0));
`;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

// On POSIX, a SIGKILLed process lingers as a zombie — still visible to
// kill(pid, 0) — until its parent reaps it, which Node does asynchronously
// via a SIGCHLD handler on the event loop. Checking liveness synchronously
// right after the kill can still observe "alive", flaking watchdog tests on
// Linux/macOS CI runners (Windows has no zombie state, so this resolves on
// the first check there).
function waitForPidGone(pid: number, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const poll = (): void => {
      try {
        process.kill(pid, 0);
      } catch {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        resolve();
        return;
      }
      setTimeout(poll, 5);
    };
    poll();
  });
}

describe('watchdogTick (mock control — no real process)', () => {
  it('does not restart a server already running', () => {
    const running: StatusResult = { state: 'running', pid: 42, port: 1, url: 'http://x' };
    const start = vi.fn();
    const control: WatchdogControl = { status: () => running, start };
    const result = watchdogTick(control);
    expect(result.revived).toBe(false);
    expect(result.status).toBe(running);
    expect(start).not.toHaveBeenCalled();
  });

  it('starts the server when stopped, and reports revived', () => {
    const stopped: StatusResult = { state: 'stopped', pid: null, port: null, url: null };
    const revivedStatus: StatusResult = { state: 'running', pid: 7, port: 1, url: 'http://x' };
    const start = vi.fn(() => revivedStatus);
    const control: WatchdogControl = { status: () => stopped, start };
    const result = watchdogTick(control);
    expect(result.revived).toBe(true);
    expect(result.status).toBe(revivedStatus);
    expect(start).toHaveBeenCalledOnce();
  });
});

describe('runWatchdog (mock control — no real process)', () => {
  it('ticks immediately, then again on the interval, until aborted', async () => {
    vi.useFakeTimers();
    try {
      const stopped: StatusResult = { state: 'stopped', pid: null, port: null, url: null };
      const start = vi.fn(() => ({ state: 'running', pid: 1, port: 1, url: 'http://x' }) as const);
      const control: WatchdogControl = { status: () => stopped, start };
      const onTick = vi.fn();
      const ac = new AbortController();

      const run = runWatchdog(control, { intervalMs: 10, onTick }, ac.signal);
      // virtual clock, not wall-clock — deterministic regardless of machine speed:
      // one immediate tick + three interval ticks (10/20/30ms) inside a 35ms advance.
      await vi.advanceTimersByTimeAsync(35);
      ac.abort();
      await run;

      expect(onTick.mock.calls.length).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves immediately without ticking when the signal is already aborted', async () => {
    const control: WatchdogControl = {
      status: () => ({ state: 'running', pid: 1, port: 1, url: 'http://x' }),
      start: vi.fn(),
    };
    const onTick = vi.fn();
    const ac = new AbortController();
    ac.abort();
    await runWatchdog(control, { intervalMs: 10, onTick }, ac.signal);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('does not throw when no onTick callback is provided', async () => {
    vi.useFakeTimers();
    try {
      const stopped: StatusResult = { state: 'stopped', pid: null, port: null, url: null };
      const start = vi.fn(() => ({ state: 'running', pid: 1, port: 1, url: 'http://x' }) as const);
      const control: WatchdogControl = { status: () => stopped, start };
      const ac = new AbortController();

      const run = runWatchdog(control, { intervalMs: 10 }, ac.signal);
      await vi.advanceTimersByTimeAsync(15);
      ac.abort();
      await expect(run).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes its abort listener after the first abort — a second abort event is a no-op', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    try {
      const stopped: StatusResult = { state: 'stopped', pid: null, port: null, url: null };
      const start = vi.fn(() => ({ state: 'running', pid: 1, port: 1, url: 'http://x' }) as const);
      const control: WatchdogControl = { status: () => stopped, start };
      const onTick = vi.fn();
      const ac = new AbortController();

      const run = runWatchdog(control, { intervalMs: 10, onTick }, ac.signal);
      await vi.advanceTimersByTimeAsync(15);
      ac.abort();
      await run;

      const callsAfterFirstAbort = clearSpy.mock.calls.length;
      // A real AbortSignal only ever fires 'abort' once via controller.abort(), so
      // dispatch a second one directly (it's a plain EventTarget) to prove the
      // listener was actually removed rather than merely never re-triggered.
      ac.signal.dispatchEvent(new Event('abort'));
      expect(clearSpy.mock.calls.length).toBe(callsAfterFirstAbort);
    } finally {
      clearSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('watchdogTick (real DashboardControl + spawned process)', () => {
  let dir: string;
  let config: ControlConfig;
  let control: DashboardControl;
  const started: number[] = [];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-wd-'));
    writeFileSync(join(dir, 'fake-server.mjs'), FAKE_SERVER);
    config = {
      stateDir: join(dir, '.run'),
      serverEntry: join(dir, 'fake-server.mjs'),
      port: await freePort(),
      nodeBin: process.execPath,
    };
    control = new DashboardControl(config, () => 1000);
  });

  afterEach(() => {
    const r = control.status();
    for (const pid of [...started, r.pid ?? 0]) {
      if (pid > 0) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('leaves a running server alone', () => {
    const a = control.start();
    if (a.pid) started.push(a.pid);
    const result = watchdogTick(control);
    expect(result.revived).toBe(false);
    expect(result.status.pid).toBe(a.pid);
  });

  it('revives a server that was never started', () => {
    const result = watchdogTick(control);
    if (result.status.pid) started.push(result.status.pid);
    expect(result.revived).toBe(true);
    expect(result.status.state).toBe('running');
    expect(control.status().state).toBe('running');
  });

  it('replaces a stale record (dead pid) with a freshly started server', async () => {
    const a = control.start();
    // Simulate a crash: kill the process out from under the state record, so
    // the next tick finds a dead pid (the "replace" half of start/revive/replace).
    if (a.pid) {
      process.kill(a.pid, 'SIGKILL');
      await waitForPidGone(a.pid);
    }
    const result = watchdogTick(control);
    if (result.status.pid) started.push(result.status.pid);
    expect(result.revived).toBe(true);
    expect(result.status.pid).not.toBe(a.pid);
    expect(control.status().state).toBe('running');
  });
});
