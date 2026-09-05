// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type AddressInfo } from 'node:net';
import { DashboardControl } from '../../src/control/control.js';
import type { ControlConfig } from '../../src/control/types.js';
import { STOP_GRACE_MS } from '../../src/flight/spawn-flight.js';

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

describe('DashboardControl (real spawn lifecycle)', () => {
  let dir: string;
  let config: ControlConfig;
  let control: DashboardControl;
  const started: number[] = [];
  // Hermetic against the ambient environment: these tests assume
  // AUTOPILOT_FLIGHT is unset so stop()/restart() behave normally. This repo
  // flies itself (self-hosted), which sets AUTOPILOT_FLIGHT=1 on the WHOLE
  // process tree (spawn-flight.ts) — including this test runner when the gate
  // executes inside a real flight — and would otherwise trip the suicide
  // guard here and fail tests that have nothing to do with it. The nested
  // "flight suicide guard" describe below still manages the var itself for
  // its own assertions; restoring the true ambient value after each test
  // keeps that block's behavior (and any sibling test file sharing this
  // worker process) unaffected.
  const ORIGINAL_FLIGHT_ENV = process.env['AUTOPILOT_FLIGHT'];

  beforeEach(async () => {
    delete process.env['AUTOPILOT_FLIGHT'];
    dir = mkdtempSync(join(tmpdir(), 'autopilot-ctl-'));
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
    if (ORIGINAL_FLIGHT_ENV === undefined) delete process.env['AUTOPILOT_FLIGHT'];
    else process.env['AUTOPILOT_FLIGHT'] = ORIGINAL_FLIGHT_ENV;
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

  it('reports stopped before any start', () => {
    expect(control.status().state).toBe('stopped');
  });

  it('starts (running, live pid, record written) then stops (record cleared)', () => {
    const s = control.start();
    if (s.pid) started.push(s.pid);
    expect(s.state).toBe('running');
    expect(s.url).toContain('127.0.0.1');
    expect(control.status().state).toBe('running');
    expect(existsSync(join(config.stateDir, 'dashboard.json'))).toBe(true);

    control.stop();
    expect(control.status().state).toBe('stopped');
    expect(existsSync(join(config.stateDir, 'dashboard.json'))).toBe(false);
  });

  it('start is idempotent when already running', () => {
    const a = control.start();
    if (a.pid) started.push(a.pid);
    const b = control.start();
    expect(b.pid).toBe(a.pid); // never spawned a second server
    control.stop();
  });

  it('restart replaces the process', async () => {
    const a = control.start();
    if (a.pid) started.push(a.pid);
    const b = await control.restart();
    if (b.pid) started.push(b.pid);
    expect(b.state).toBe('running');
    expect(b.pid).not.toBe(a.pid);
    control.stop();
  });

  // Real-OS-signal integration testing (this describe block's own philosophy,
  // see the "stop() escalation" describe below) can't make a real child
  // "still alive after SIGTERM" on Windows — process.kill(pid, 'SIGTERM')
  // unconditionally terminates there, so a real slow-exiting child can never
  // actually race start(). Mocked process.kill + fake timers exercise the
  // ordering directly instead, the same seam the escalation tests already use.
  describe('restart() port-release race (BUG ap-mt2sz1zv-2)', () => {
    let killSpy: ReturnType<typeof vi.spyOn>;
    let startSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mkdirSync(config.stateDir, { recursive: true });
      writeFileSync(
        join(config.stateDir, 'dashboard.json'),
        JSON.stringify({ pid: 987654, port: config.port, startedAt: 1 }),
      );
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      killSpy.mockRestore();
      startSpy.mockRestore();
    });

    function mockStart(): void {
      startSpy = vi.spyOn(DashboardControl.prototype, 'start').mockReturnValue({
        state: 'running',
        pid: 555,
        port: config.port,
        url: `http://127.0.0.1:${config.port}`,
      });
    }

    it('never spawns the replacement while the OLD pid keeps reporting alive, even well past a single poll interval', async () => {
      killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as typeof process.kill); // always alive: signal-0 probes never throw
      // A forceKill that also can't actually kill it (fully wedged) — the
      // superseding fix (BUG web-mto5bxd1-x00maq, describe block below) means
      // restart() no longer trusts a bare timeout as proof of death and
      // guesses by spawning anyway; it now REFUSES instead. A dedicated
      // instance + injected forceKill keeps this off the real OS `taskkill`
      // the shared `control`'s default would otherwise spawn.
      const forceKill = vi.fn();
      const stubborn = new DashboardControl(config, () => 1000, forceKill);
      startSpy = vi.spyOn(DashboardControl.prototype, 'start').mockReturnValue({
        state: 'running',
        pid: 555,
        port: config.port,
        url: `http://127.0.0.1:${config.port}`,
      });

      const restarting = stubborn.restart();
      const assertion = expect(restarting).rejects.toThrow(/pid 987654/);
      await vi.advanceTimersByTimeAsync(0);
      expect(startSpy).not.toHaveBeenCalled();

      // Well past a single poll tick, still alive — the old buggy restart()
      // called start() synchronously with no wait at all, so any nonzero
      // delay before start() fires here is already proof it's actually
      // polling, not just skipping the check.
      await vi.advanceTimersByTimeAsync(200);
      expect(startSpy).not.toHaveBeenCalled();

      // Bounded total wait (SIGTERM window + forceKill confirm window) even
      // for a pid that never reports dead (wedged/signal lost) — restart()
      // must not hang forever, but it must also never guess: refuse rather
      // than spawn a replacement next to a server it can't confirm is gone.
      await vi.advanceTimersByTimeAsync(STOP_GRACE_MS * 2);
      await assertion;
      expect(forceKill).toHaveBeenCalledWith(987654);
      expect(startSpy).not.toHaveBeenCalled();
    });

    it('spawns the replacement promptly once the OLD pid is confirmed exited, without waiting the full grace period', async () => {
      let probes = 0;
      killSpy = vi.spyOn(process, 'kill').mockImplementation(((
        pid: number,
        signal?: string | number,
      ) => {
        if (signal === 0) {
          probes += 1;
          if (probes <= 4) return true; // alive through restart()'s/stop()'s own checks + a couple of real poll ticks
          throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' }); // exited by then
        }
        return true; // SIGTERM "succeeds"
      }) as typeof process.kill);
      mockStart();

      const restarting = control.restart();
      await vi.advanceTimersByTimeAsync(0);
      expect(startSpy).not.toHaveBeenCalled();

      // Comfortably clears the couple of poll ticks the mock needs to report
      // dead, comfortably short of the full STOP_GRACE_MS bound.
      await vi.advanceTimersByTimeAsync(200);
      const result = await restarting;

      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(result.pid).toBe(555);
    });
  });

  describe('restart() confirmed-kill escalation + port-squatter fallback (BUG web-mto5bxd1-x00maq)', () => {
    let killSpy: ReturnType<typeof vi.spyOn>;
    let startSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mkdirSync(config.stateDir, { recursive: true });
      writeFileSync(
        join(config.stateDir, 'dashboard.json'),
        JSON.stringify({ pid: 987654, port: config.port, startedAt: 1 }),
      );
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      killSpy.mockRestore();
      startSpy?.mockRestore();
    });

    function mockStart(): void {
      startSpy = vi.spyOn(DashboardControl.prototype, 'start').mockReturnValue({
        state: 'running',
        pid: 555,
        port: config.port,
        url: `http://127.0.0.1:${config.port}`,
      });
    }

    it('refuses to start a replacement when the old pid survives BOTH SIGTERM and a forceKill — never the "two main.js processes" guess', async () => {
      // A truly wedged process: signal-0 probes never throw (always alive),
      // and the injected forceKill is a no-op (simulates one that also fails
      // to actually kill it) — the field failure this recurred as.
      killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as typeof process.kill);
      const forceKill = vi.fn();
      const stubborn = new DashboardControl(config, () => 1000, forceKill);
      mockStart();

      const restarting = stubborn.restart();
      const assertion = expect(restarting).rejects.toThrow(/pid 987654/);
      // Clears the SIGTERM-only wait, then restart()'s OWN forceKill escalation,
      // then its post-forceKill confirm window — comfortably past every bound.
      await vi.advanceTimersByTimeAsync(STOP_GRACE_MS * 3);
      await assertion;

      expect(forceKill).toHaveBeenCalledWith(987654);
      expect(startSpy).not.toHaveBeenCalled(); // never spawns a guess-and-hope replacement
    });

    it('escalates via its OWN forceKill call once SIGTERM alone times out, then proceeds as soon as death is confirmed', async () => {
      let killed = false;
      const forceKill = vi.fn(() => {
        killed = true;
      });
      killSpy = vi.spyOn(process, 'kill').mockImplementation(((
        _pid: number,
        signal?: string | number,
      ) => {
        if (signal === 0) {
          if (killed) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
          return true;
        }
        return true; // SIGTERM "succeeds" but the process ignores it
      }) as typeof process.kill);
      const escalating = new DashboardControl(config, () => 1000, forceKill);
      mockStart();

      const restarting = escalating.restart();
      await vi.advanceTimersByTimeAsync(STOP_GRACE_MS); // exhausts the SIGTERM-only wait
      await vi.advanceTimersByTimeAsync(100); // a couple poll ticks to observe the now-dead pid
      const result = await restarting;

      expect(forceKill).toHaveBeenCalledWith(987654);
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(result.pid).toBe(555);
    });

    it('kills whoever is squatting the port when the recorded pid is already gone (RUNBOOK "stale server" gap — an untracked process)', async () => {
      killSpy = vi.spyOn(process, 'kill').mockImplementation(((
        _pid: number,
        signal?: string | number,
      ) => {
        if (signal === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' }); // recorded pid already gone
        return true;
      }) as typeof process.kill);
      const forceKill = vi.fn();
      const findPortOwner = vi.fn().mockReturnValue(424242);
      const squatterAware = new DashboardControl(config, () => 1000, forceKill, findPortOwner);
      mockStart();

      const result = await squatterAware.restart();

      expect(findPortOwner).toHaveBeenCalledWith(config.port);
      expect(forceKill).toHaveBeenCalledWith(424242);
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(result.pid).toBe(555);
    });

    it('never kills a squatter pid when none is found (port genuinely free)', async () => {
      killSpy = vi.spyOn(process, 'kill').mockImplementation(((
        _pid: number,
        signal?: string | number,
      ) => {
        if (signal === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
        return true;
      }) as typeof process.kill);
      const forceKill = vi.fn();
      const findPortOwner = vi.fn().mockReturnValue(null);
      const clean = new DashboardControl(config, () => 1000, forceKill, findPortOwner);
      mockStart();

      await clean.restart();

      expect(findPortOwner).toHaveBeenCalledWith(config.port);
      expect(forceKill).not.toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('start({replace: true}) spawns a fresh process even while a live server is recorded — the self-restart caller IS that live server', () => {
    // Field failure (3 landings in a row): the post-landing self-restart calls
    // start() from INSIDE the old, still-alive server. Plain start() sees the
    // recorded pid alive, says "already running", spawns NOTHING — and the
    // health probe then polls a port whose listener was just closed. replace
    // skips the reuse check: the caller knows it is the process being replaced.
    const a = control.start();
    if (a.pid) started.push(a.pid);
    const reused = control.start();
    expect(reused.pid).toBe(a.pid); // plain start() reuses — unchanged behavior
    const b = control.start({ replace: true });
    if (b.pid) started.push(b.pid);
    expect(b.state).toBe('running');
    expect(b.pid).not.toBe(a.pid);
    control.stop();
  });

  describe('stop() escalation (STPA finding web-mt1qa7go-9zjnc0)', () => {
    // Real-OS-signal integration testing (this describe block's parent
    // philosophy) can't exercise the "still alive after SIGTERM" branch on
    // Windows: `process.kill(pid, 'SIGTERM')` unconditionally terminates the
    // target there (verified empirically — Windows has no advisory-signal
    // semantics), so a real child can never actually ignore it. `forceKill`
    // injection (same seam `createSpawnFlight` uses) plus fake timers let
    // this exercise the scheduling/escalation logic directly, platform-
    // independent, mirroring `spawn-flight.test.ts`'s own approach.
    let killSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mkdirSync(config.stateDir, { recursive: true });
      writeFileSync(
        join(config.stateDir, 'dashboard.json'),
        JSON.stringify({ pid: 987654, port: config.port, startedAt: 1 }),
      );
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      killSpy.mockRestore();
    });

    it('escalates via forceKill once the pid is still alive past the grace window', () => {
      killSpy = vi.spyOn(process, 'kill').mockReturnValue(true); // SIGTERM "succeeds"; signal-0 probes never throw = still alive
      const forceKill = vi.fn();
      const escalating = new DashboardControl(config, () => 1000, forceKill);

      const result = escalating.stop();
      expect(result.state).toBe('stopped'); // the record clears immediately, unchanged contract
      expect(forceKill).not.toHaveBeenCalled();

      vi.advanceTimersByTime(STOP_GRACE_MS);
      expect(forceKill).toHaveBeenCalledExactlyOnceWith(987654);
    });

    it('does not escalate once the pid has actually exited before the grace window elapses', () => {
      killSpy = vi.spyOn(process, 'kill').mockImplementation(((
        pid: number,
        signal?: string | number,
      ) => {
        if (signal === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' }); // exited by then
        return true;
      }) as typeof process.kill);
      const forceKill = vi.fn();
      const escalating = new DashboardControl(config, () => 1000, forceKill);

      escalating.stop();
      vi.advanceTimersByTime(STOP_GRACE_MS);
      expect(forceKill).not.toHaveBeenCalled();
    });
  });

  it('cleans a stale record (dead pid) and reports stopped', () => {
    mkdirSync(config.stateDir, { recursive: true });
    writeFileSync(
      join(config.stateDir, 'dashboard.json'),
      JSON.stringify({ pid: 999999, port: config.port, startedAt: 1 }),
    );
    expect(control.status().state).toBe('stopped');
    expect(existsSync(join(config.stateDir, 'dashboard.json'))).toBe(false);
  });

  it('doctor checks the built server + writable state dir', () => {
    const checks = control.doctor();
    expect(checks.find((c) => c.name === 'server-built')?.ok).toBe(true);
    expect(checks.find((c) => c.name === 'state-dir-writable')?.ok).toBe(true);
    const missing = new DashboardControl({ ...config, serverEntry: join(dir, 'nope.mjs') });
    expect(missing.doctor().find((c) => c.name === 'server-built')?.ok).toBe(false);
  });

  it('doctor reports state-dir unwritable when a path segment is a file, not a dir', () => {
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'x');
    const blocked = new DashboardControl({ ...config, stateDir: join(blocker, 'sub') });
    expect(blocked.doctor().find((c) => c.name === 'state-dir-writable')?.ok).toBe(false);
  });

  describe('doctor otlp check (optional — never fails)', () => {
    const ORIGINAL_OTLP_ENDPOINT = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    const ORIGINAL_OTLP_TRACES_ENDPOINT = process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];

    afterEach(() => {
      if (ORIGINAL_OTLP_ENDPOINT === undefined) delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
      else process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = ORIGINAL_OTLP_ENDPOINT;
      if (ORIGINAL_OTLP_TRACES_ENDPOINT === undefined) {
        delete process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
      } else {
        process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'] = ORIGINAL_OTLP_TRACES_ENDPOINT;
      }
    });

    it('reports not-configured (still ok) when no OTLP endpoint env var is set', () => {
      delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
      delete process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
      const check = control.doctor().find((c) => c.name === 'otlp (optional)');
      expect(check?.ok).toBe(true);
      expect(check?.detail).toContain('not configured');
    });

    it('reports the resolved traces endpoint when OTLP is configured', () => {
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://collector.local:4318';
      delete process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
      const check = control.doctor().find((c) => c.name === 'otlp (optional)');
      expect(check?.ok).toBe(true);
      expect(check?.detail).toBe(
        'exporting flight traces to http://collector.local:4318/v1/traces',
      );
    });
  });

  it('treats an unreadable state record (path is a directory, not a file) as stopped', () => {
    mkdirSync(join(config.stateDir, 'dashboard.json'), { recursive: true });
    expect(control.status().state).toBe('stopped');
  });

  describe('flight suicide guard (AUTOPILOT_FLIGHT=1)', () => {
    const ORIGINAL = process.env['AUTOPILOT_FLIGHT'];

    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env['AUTOPILOT_FLIGHT'];
      else process.env['AUTOPILOT_FLIGHT'] = ORIGINAL;
    });

    it('stop() refuses with a teaching message and leaves the server running', () => {
      const s = control.start();
      if (s.pid) started.push(s.pid);
      process.env['AUTOPILOT_FLIGHT'] = '1';

      expect(() => control.stop()).toThrow(/AUTOPILOT_FLIGHT=1/);
      expect(control.status().state).toBe('running');
    });

    it('restart() refuses the same way, without touching the running server', async () => {
      const s = control.start();
      if (s.pid) started.push(s.pid);
      process.env['AUTOPILOT_FLIGHT'] = '1';

      await expect(control.restart()).rejects.toThrow(/AUTOPILOT_FLIGHT=1/);
      expect(control.status().pid).toBe(s.pid);
    });

    it('stop() proceeds normally once AUTOPILOT_FLIGHT is unset', () => {
      const s = control.start();
      if (s.pid) started.push(s.pid);
      process.env['AUTOPILOT_FLIGHT'] = '1';
      expect(() => control.stop()).toThrow();
      delete process.env['AUTOPILOT_FLIGHT'];

      control.stop();
      expect(control.status().state).toBe('stopped');
    });
  });
});
