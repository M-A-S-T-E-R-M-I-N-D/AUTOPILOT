// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
  createSpawnFlight,
  forceKillProcess,
  STOP_GRACE_MS,
} from '../../src/flight/spawn-flight.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

// spawn's return type/overloads aren't worth fighting from a test double —
// same untyped-mock approach as apps/dashboard/test/connection/login.test.ts.
const spawnMock = vi.mocked(spawn) as unknown as {
  mockReset(): void;
  mockReturnValue(value: unknown): void;
  mock: { calls: unknown[][] };
};

function fakeChild(): {
  pid: number;
  once: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
} {
  return { pid: 4242, once: vi.fn(), unref: vi.fn(), on: vi.fn() };
}

describe('createSpawnFlight', () => {
  let dir: string;
  // This suite asserts what DOES/DOESN'T ride in the spawned child's env,
  // built from `...process.env` — so it must not inherit the CURRENT
  // process's own AUTOPILOT_FLIGHT_INSTANCE_ID or AUTOPILOT_FLEET_TASK_SCOPE.
  // Both are normally unset, but a firing running INSIDE a parallel-instance
  // flight worktree, or a fleet member scoped to a board partition (this one
  // included), has them set for real, which would otherwise leak into every
  // `options.env` assertion below and make this suite fail from inside its
  // own instance's worktree while passing everywhere else.
  const originalInstanceId = process.env['AUTOPILOT_FLIGHT_INSTANCE_ID'];
  const originalTaskScope = process.env['AUTOPILOT_FLEET_TASK_SCOPE'];

  beforeEach(() => {
    spawnMock.mockReset();
    dir = mkdtempSync(join(tmpdir(), 'autopilot-spawn-flight-'));
    delete process.env['AUTOPILOT_FLIGHT_INSTANCE_ID'];
    delete process.env['AUTOPILOT_FLEET_TASK_SCOPE'];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalInstanceId === undefined) {
      delete process.env['AUTOPILOT_FLIGHT_INSTANCE_ID'];
    } else {
      process.env['AUTOPILOT_FLIGHT_INSTANCE_ID'] = originalInstanceId;
    }
    if (originalTaskScope === undefined) {
      delete process.env['AUTOPILOT_FLEET_TASK_SCOPE'];
    } else {
      process.env['AUTOPILOT_FLEET_TASK_SCOPE'] = originalTaskScope;
    }
  });

  it('spawns the flight DETACHED — a server crash/restart must never kill it', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    // A nested, not-yet-created dir — proves mkdirSync's recursive log-dir
    // prep actually ran, not just that mkdtempSync's own dir already existed.
    const logDir = join(dir, '.autopilot-run');
    const flightLogPath = join(logDir, 'flight.log');

    createSpawnFlight('/repo/dist/fly.js', () => flightLogPath)('/target', 3, 5);

    expect(existsSync(logDir)).toBe(true);
    const [bin, argv, options] = spawnMock.mock.calls[0] as [string, string[], object];
    expect(bin).toBe(process.execPath);
    expect(argv).toEqual(['/repo/dist/fly.js', '/target', '3', '5']);
    // The actual fix: without `detached: true`, a Windows server crash/restart
    // (or landing/self-restart.ts's own process.exit()) tears the flight's own
    // process-group/job-object down with it — killing quota-spending work the
    // operator never asked to stop.
    expect(options).toMatchObject({ detached: true });
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it('marks the child AUTOPILOT_FLIGHT=1 — control.ts refuses stop/restart on this signal', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))('/target', 1, 5);

    const [, , options] = spawnMock.mock.calls[0] as [string, string[], { env?: object }];
    expect(options.env).toMatchObject({ AUTOPILOT_FLIGHT: '1' });
    // The rest of the parent's env still rides along — this is additive, not a replacement.
    expect(options.env).toMatchObject(process.env);
  });

  it('appends the TOTAL-SPEND 5th argv only when provided', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))('/target', 1, 5, 20);

    const [, argv] = spawnMock.mock.calls[0] as [string, string[], object];
    expect(argv).toEqual(['/repo/dist/fly.js', '/target', '1', '5', '20']);
  });

  it('derives the log path from the FOLDER being flown — two folders never share one log', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const flightLogPathFor = vi.fn((folder: string) => join(dir, `flight-${folder}.log`));

    createSpawnFlight('/repo/dist/fly.js', flightLogPathFor)('target-a', 1, 5);

    expect(flightLogPathFor).toHaveBeenCalledWith('target-a');
    expect(existsSync(join(dir, 'flight-target-a.log'))).toBe(true);
  });

  it('returns a SpawnedFlight whose kill() signals the real child', () => {
    const child = fakeChild();
    const kill = vi.fn();
    spawnMock.mockReturnValue({ ...child, kill });

    const spawned = createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
      '/target',
      1,
      5,
    );
    expect(spawned.pid).toBe(4242);

    spawned.kill();
    expect(kill).toHaveBeenCalledOnce();
  });

  it('onExit relays the real exit code via a ONE-TIME "exit" listener', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const spawned = createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
      '/target',
      1,
      5,
    );
    const cb = vi.fn();
    spawned.onExit(cb);

    const exitCall = child.once.mock.calls.find(([event]) => event === 'exit') as
      [string, (code: number | null) => void] | undefined;
    expect(exitCall).toBeDefined();
    exitCall?.[1](0);
    expect(cb).toHaveBeenCalledWith(0);
  });

  it('onExit treats a spawn "error" as a null exit code, not a hang', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const spawned = createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
      '/target',
      1,
      5,
    );
    const cb = vi.fn();
    spawned.onExit(cb);

    const errorCall = child.once.mock.calls.find(([event]) => event === 'error') as
      [string, () => void] | undefined;
    expect(errorCall).toBeDefined();
    errorCall?.[1]();
    expect(cb).toHaveBeenCalledWith(null);
  });

  it('routes stdin ignored, stdout+stderr to the SAME log fd', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))('/target', 1, 5);

    const [, , options] = spawnMock.mock.calls[0] as [string, string[], { stdio: unknown[] }];
    expect(options.stdio[0]).toBe('ignore');
    expect(typeof options.stdio[1]).toBe('number');
    expect(options.stdio[1]).toBe(options.stdio[2]);
  });

  describe('instanceId (PARALLEL UNLOCK C — N-way same-folder spawn)', () => {
    it('omitting instanceId never sets AUTOPILOT_FLIGHT_INSTANCE_ID (backward compatible)', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))('/target', 1, 5);

      const [, , options] = spawnMock.mock.calls[0] as [string, string[], { env?: object }];
      expect(options.env).not.toHaveProperty('AUTOPILOT_FLIGHT_INSTANCE_ID');
    });

    it('rides a given instanceId as an env var, never argv (no positional collision)', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
        '/target',
        1,
        5,
        undefined,
        '2',
      );

      const [, argv, options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { env?: Record<string, string> },
      ];
      expect(argv).toEqual(['/repo/dist/fly.js', '/target', '1', '5']);
      expect(options.env).toMatchObject({ AUTOPILOT_FLIGHT_INSTANCE_ID: '2' });
    });

    it('derives the log path WITH the instanceId — two instances of one folder never share a log', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);
      const flightLogPathFor = vi.fn((folder: string, instanceId?: string) =>
        join(dir, `flight-${folder}${instanceId ? `--${instanceId}` : ''}.log`),
      );

      createSpawnFlight('/repo/dist/fly.js', flightLogPathFor)('target-a', 1, 5, undefined, '1');

      expect(flightLogPathFor).toHaveBeenCalledWith('target-a', '1');
      expect(existsSync(join(dir, 'flight-target-a--1.log'))).toBe(true);
    });
  });

  describe('task scope (FLEET SCOPE PARTITIONER — spec-scoped decomposition)', () => {
    it('rides a given taskScope as a comma-joined env var', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
        '/target',
        2,
        5,
        undefined,
        'fleet-2',
        ['t-1', 't-2', 't-3'],
      );

      const [, , options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { env?: Record<string, string> },
      ];
      expect(options.env).toMatchObject({ AUTOPILOT_FLEET_TASK_SCOPE: 't-1,t-2,t-3' });
    });

    it('omits the env var entirely when no scope (or an empty scope) is given', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
        '/target',
        2,
        5,
        undefined,
        'fleet-2',
        [],
      );

      const [, , options] = spawnMock.mock.calls[0] as [string, string[], { env?: object }];
      expect(options.env).not.toHaveProperty('AUTOPILOT_FLEET_TASK_SCOPE');
    });

    it('strips a scope inherited from its OWN process.env when no scope is given (a scoped fleet member spawning an unscoped child must not leak its partition)', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);
      process.env['AUTOPILOT_FLEET_TASK_SCOPE'] = 'stale-parent-t1,stale-parent-t2';

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
        '/target',
        2,
        5,
        undefined,
        'fleet-2',
        [],
      );

      const [, , options] = spawnMock.mock.calls[0] as [string, string[], { env?: object }];
      expect(options.env).not.toHaveProperty('AUTOPILOT_FLEET_TASK_SCOPE');
    });
  });

  describe('fleet gate-worker cap (MACHINE BUDGET in code, not prompt prose)', () => {
    // Why: three fleet instances once launched all-core test runs at the same
    // moment and starved the box until the dashboard process died, taking
    // every flight with it (2026-08-17). The FLEET prompt's machine-budget
    // rule is awareness only — this env cap is the enforcement: every gate
    // `vitest run` (and any agent-run `pnpm test`) inside a FLEET member
    // inherits a small worker ceiling, so N concurrent gates can't multiply
    // into N × all-cores. Solo flights keep vitest's full default parallelism
    // — they have the machine to themselves.
    const savedFleetWorkers = process.env['AUTOPILOT_FLEET_GATE_WORKERS'];

    beforeEach(() => {
      delete process.env['AUTOPILOT_FLEET_GATE_WORKERS'];
      delete process.env['VITEST_MAX_FORKS'];
      delete process.env['VITEST_MAX_THREADS'];
    });

    afterEach(() => {
      if (savedFleetWorkers === undefined) {
        delete process.env['AUTOPILOT_FLEET_GATE_WORKERS'];
      } else {
        process.env['AUTOPILOT_FLEET_GATE_WORKERS'] = savedFleetWorkers;
      }
    });

    it('caps VITEST_MAX_FORKS and VITEST_MAX_THREADS to 2 for a FLEET member (instanceId set)', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
        '/target',
        1,
        5,
        undefined,
        '3',
      );

      const [, , options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { env?: Record<string, string> },
      ];
      expect(options.env).toMatchObject({ VITEST_MAX_FORKS: '2', VITEST_MAX_THREADS: '2' });
    });

    it('never caps a SOLO flight (no instanceId) — it has the machine to itself', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))('/target', 1, 5);

      const [, , options] = spawnMock.mock.calls[0] as [string, string[], { env?: object }];
      expect(options.env).not.toHaveProperty('VITEST_MAX_FORKS');
      expect(options.env).not.toHaveProperty('VITEST_MAX_THREADS');
    });

    it('honors an operator override via AUTOPILOT_FLEET_GATE_WORKERS', () => {
      process.env['AUTOPILOT_FLEET_GATE_WORKERS'] = '4';
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
        '/target',
        1,
        5,
        undefined,
        '2',
      );

      const [, , options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { env?: Record<string, string> },
      ];
      expect(options.env).toMatchObject({ VITEST_MAX_FORKS: '4', VITEST_MAX_THREADS: '4' });
    });

    it('falls back to the default on a non-positive-integer override', () => {
      process.env['AUTOPILOT_FLEET_GATE_WORKERS'] = 'all-of-them';
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
        '/target',
        1,
        5,
        undefined,
        '2',
      );

      const [, , options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { env?: Record<string, string> },
      ];
      expect(options.env).toMatchObject({ VITEST_MAX_FORKS: '2', VITEST_MAX_THREADS: '2' });
    });

    // STPA finding web-mt1qa7ij-c6wqgi: a "base" (no-instanceId) flight that
    // starts while OTHER flights are already running was escaping the cap
    // entirely — only an instanceId'd spawn ever got capped, regardless of
    // real concurrency. The registry is the one thing that actually knows
    // the live running count (`FlightRunnerRegistry`, flight/registry.ts), so
    // it forwards that as a 7th `siblingsFlying` argument.
    it('caps a spawn with NO instanceId when the caller signals siblings are already flying', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
        '/target',
        1,
        5,
        undefined,
        undefined,
        undefined,
        true,
      );

      const [, , options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { env?: Record<string, string> },
      ];
      expect(options.env).toMatchObject({ VITEST_MAX_FORKS: '2', VITEST_MAX_THREADS: '2' });
      // Still no fake instance identity — this is the bare/base flight, just capped.
      expect(options.env).not.toHaveProperty('AUTOPILOT_FLIGHT_INSTANCE_ID');
    });

    it('does not cap a solo spawn when the caller explicitly signals no siblings are flying', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      createSpawnFlight('/repo/dist/fly.js', () => join(dir, 'flight.log'))(
        '/target',
        1,
        5,
        undefined,
        undefined,
        undefined,
        false,
      );

      const [, , options] = spawnMock.mock.calls[0] as [string, string[], { env?: object }];
      expect(options.env).not.toHaveProperty('VITEST_MAX_FORKS');
      expect(options.env).not.toHaveProperty('VITEST_MAX_THREADS');
    });
  });

  describe('STOP ESCALATION (STPA finding web-mt1qa7go-9zjnc0)', () => {
    // Why: a hung CLI child has, in past incidents, ignored SIGTERM forever —
    // only a manual taskkill cleared it. kill() now escalates on its own
    // after a grace window; forceKill is injected here so the timing
    // assertions never depend on the actual OS the test runs on (CI runs
    // ubuntu/windows/macos).
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('escalates via forceKill when the child outlives the grace window', () => {
      const child = fakeChild();
      const kill = vi.fn();
      spawnMock.mockReturnValue({ ...child, kill });
      const forceKill = vi.fn();

      const spawned = createSpawnFlight(
        '/repo/dist/fly.js',
        () => join(dir, 'flight.log'),
        forceKill,
      )('/target', 1, 5);

      spawned.kill();
      expect(kill).toHaveBeenCalledOnce();
      expect(forceKill).not.toHaveBeenCalled();

      vi.advanceTimersByTime(STOP_GRACE_MS);
      expect(forceKill).toHaveBeenCalledOnce();
      expect(forceKill).toHaveBeenCalledWith(4242);
    });

    it('never escalates once the child actually exits before the grace window elapses', () => {
      const child = fakeChild();
      const kill = vi.fn();
      spawnMock.mockReturnValue({ ...child, kill });
      const forceKill = vi.fn();

      const spawned = createSpawnFlight(
        '/repo/dist/fly.js',
        () => join(dir, 'flight.log'),
        forceKill,
      )('/target', 1, 5);

      spawned.kill();
      const exitCall = child.once.mock.calls.find(([event]) => event === 'exit') as
        [string, (code: number | null) => void] | undefined;
      expect(exitCall).toBeDefined();
      exitCall?.[1](0);

      vi.advanceTimersByTime(STOP_GRACE_MS * 10);
      expect(forceKill).not.toHaveBeenCalled();
    });
  });

  describe('forceKillProcess (default escalation strategy)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('on win32, spawns a whole-tree taskkill against the pid', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      forceKillProcess(4242, 'win32');

      const [bin, argv, options] = spawnMock.mock.calls[0] as [string, string[], object];
      expect(bin).toBe('taskkill');
      expect(argv).toEqual(['/pid', '4242', '/t', '/f']);
      expect(options).toMatchObject({ stdio: 'ignore' });
      expect(child.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('a taskkill spawn error is swallowed, never left to crash the server', () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child);

      forceKillProcess(4242, 'win32');

      const errorCall = child.on.mock.calls.find(([event]) => event === 'error') as
        [string, () => void] | undefined;
      expect(errorCall).toBeDefined();
      expect(() => errorCall?.[1]()).not.toThrow();
    });

    it('on POSIX, SIGKILLs the whole detached process group (negative pid)', () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      forceKillProcess(4242, 'linux');

      expect(killSpy).toHaveBeenCalledOnce();
      expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');
    });

    it('swallows an already-exited process.kill error instead of throwing', () => {
      vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      expect(() => forceKillProcess(4242, 'darwin')).not.toThrow();
    });
  });
});
