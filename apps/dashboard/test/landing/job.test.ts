// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * DURABLE LANDING JOBS (`apps/dashboard/src/landing/job.ts`) — the layer that
 * turned "I press LAND and nothing happens" into a job with a lifetime an
 * operator can watch.
 *
 * Every collaborator is injected, so the whole self-healing loop — including
 * the flight wait — runs here with no git, no store, and a fake clock.
 */

import { describe, it, expect, vi } from 'vitest';
import { createLandingJobRegistry, type LandingJobRegistry } from '../../src/landing/job.js';
import type { LandingExecuteApiResult } from '../../src/landing/execute.js';

const LANDED: LandingExecuteApiResult = {
  ok: true,
  reason: 'landed',
  details: 'landed autopilot/flight onto main',
  restarting: false,
};

const FLIGHT_RUNNING: LandingExecuteApiResult = {
  ok: false,
  reason: 'flight-running',
  details: 'a flight is currently running against this project',
  restarting: false,
};

const GATE_RED: LandingExecuteApiResult = {
  ok: false,
  reason: 'gate-red',
  details: 'pnpm run test failed (exit 1)',
  restarting: false,
};

/** A registry whose sleep resolves immediately, so the wait loop's iterations
 *  are driven by the test's own await points rather than real time. */
function registryWith(
  execute: (projectId: string) => Promise<LandingExecuteApiResult | null>,
  extra: Partial<Parameters<typeof createLandingJobRegistry>[0]> = {},
): LandingJobRegistry {
  return createLandingJobRegistry({
    execute,
    sleep: () => Promise.resolve(),
    pollMs: 1,
    ...extra,
  });
}

describe('landing job registry', () => {
  it('returns the execute result unchanged — the POST contract every existing caller depends on', async () => {
    const jobs = registryWith(async () => LANDED);
    await expect(jobs.start('p1')).resolves.toEqual(LANDED);
  });

  it('reports null (unknown project) without leaving a job behind to poll', async () => {
    const jobs = registryWith(async () => null);
    await expect(jobs.start('nope')).resolves.toBeNull();
    expect(jobs.stateOf('nope')).toBeNull();
  });

  it('keeps a finished job readable, so a reload — or the self-restart a green land triggers — still learns the outcome', async () => {
    const jobs = registryWith(async () => LANDED);
    await jobs.start('p1');

    const state = jobs.stateOf('p1');
    expect(state?.phase).toBe('finished');
    expect(state?.result).toEqual(LANDED);
  });

  it('expires a finished job once its TTL lapses, so a stale verdict never masquerades as fresh news', async () => {
    let clock = 1_000;
    const jobs = registryWith(async () => LANDED, {
      now: () => clock,
      resultTtlMs: 500,
    });
    await jobs.start('p1');
    expect(jobs.stateOf('p1')).not.toBeNull();

    clock += 501;
    expect(jobs.stateOf('p1')).toBeNull();
  });

  it('joins a second press onto the running job instead of starting a second gate — two concurrent merges into one base is the git race the whole refusal exists to prevent', async () => {
    let calls = 0;
    let release: (r: LandingExecuteApiResult) => void = () => {};
    const jobs = registryWith(() => {
      calls++;
      return new Promise<LandingExecuteApiResult>((resolve) => {
        release = resolve;
      });
    });

    const first = jobs.start('p1');
    const second = jobs.start('p1');
    expect(calls).toBe(1);

    release(LANDED);
    await expect(first).resolves.toEqual(LANDED);
    await expect(second).resolves.toEqual(LANDED);
    expect(calls).toBe(1);
  });

  it('renders live gate steps from the REAL gate run, so the panel can say which step is running instead of going silent for minutes', async () => {
    const jobs = registryWith(async (pid) => {
      jobs.onGateProgress(pid, { kind: 'start', label: 'pnpm run test', index: 4, total: 5 });
      expect(jobs.stateOf(pid)?.steps).toEqual([{ label: 'pnpm run test', state: 'running' }]);
      jobs.onGateProgress(pid, {
        kind: 'end',
        label: 'pnpm run test',
        index: 4,
        total: 5,
        pass: true,
        durationMs: 140_000,
      });
      return LANDED;
    });

    await jobs.start('p1');
    expect(jobs.stateOf('p1')?.stepIndex).toBe(4);
    expect(jobs.stateOf('p1')?.stepTotal).toBe(5);
  });

  it("replaces a step's running entry with its verdict rather than listing the same label twice", async () => {
    const jobs = registryWith(async (pid) => {
      jobs.onGateProgress(pid, { kind: 'start', label: 'lint', index: 1, total: 2 });
      jobs.onGateProgress(pid, {
        kind: 'end',
        label: 'lint',
        index: 1,
        total: 2,
        pass: false,
        durationMs: 12,
      });
      return GATE_RED;
    });

    await jobs.start('p1');
    expect(jobs.stateOf('p1')?.steps).toEqual([{ label: 'lint', state: 'fail', durationMs: 12 }]);
  });

  describe('self-healing: a flight-running refusal is not the end of the attempt', () => {
    it('asks the flight to stop gracefully, waits for it to clear, then lands on its own', async () => {
      let flying = true;
      const requestPause = vi.fn(() => {
        // A graceful pause takes effect after the current firing — model that
        // as the flight clearing on the next poll, never instantly.
        flying = false;
      });
      const execute = vi.fn(async () => (flying ? FLIGHT_RUNNING : LANDED));
      const jobs = registryWith(execute, {
        isFlightRunning: () => flying,
        requestPause,
      });

      // The caller still gets the refusal's own reason (unchanged contract),
      // now saying plainly that the landing is queued behind the flight.
      const first = await jobs.start('p1');
      expect(first?.reason).toBe('flight-running');
      expect(first?.details).toContain('QUEUED');
      expect(requestPause).toHaveBeenCalledWith('p1');

      // ...while the job carries the operator's intent through to a real land.
      await vi.waitFor(() => {
        expect(jobs.stateOf('p1')?.phase).toBe('finished');
      });
      expect(jobs.stateOf('p1')?.result).toEqual(LANDED);
      expect(execute).toHaveBeenCalledTimes(2);
    });

    it('reports the wait as a phase of its own, so a queued landing reads as working — not as a failure', async () => {
      const jobs = registryWith(async () => FLIGHT_RUNNING, {
        isFlightRunning: () => true,
        sleep: () => new Promise<void>(() => {}), // park in the wait forever
      });

      await jobs.start('p1');
      expect(jobs.stateOf('p1')?.phase).toBe('waiting-for-flight');
      expect(jobs.stateOf('p1')?.note).toContain('landing automatically');
    });

    it('requests the pause ONCE per job — re-asking every poll would spam the store with an intent no truer the second time', async () => {
      let clock = 0;
      let polls = 0;
      const requestPause = vi.fn();
      // A flight that never clears: the loop polls until the ceiling, which is
      // exactly the shape that would re-request a pause on every pass.
      const jobs = registryWith(async () => FLIGHT_RUNNING, {
        isFlightRunning: () => {
          polls++;
          return true;
        },
        requestPause,
        now: () => clock,
        sleep: () => {
          clock += 10_000;
          return Promise.resolve();
        },
        maxWaitMs: 50_000,
      });

      await jobs.start('p1');
      await vi.waitFor(() => {
        expect(jobs.stateOf('p1')?.phase).toBe('finished');
      });
      expect(polls).toBeGreaterThan(1);
      expect(requestPause).toHaveBeenCalledTimes(1);
    });

    it('keeps waiting when a NEW flight starts in the gap, instead of surfacing a refusal the operator already asked it to handle', async () => {
      let attempts = 0;
      const jobs = registryWith(
        async () => {
          attempts++;
          return attempts >= 3 ? LANDED : FLIGHT_RUNNING;
        },
        {
          isFlightRunning: () => false, // always "clear", but execute disagrees twice
          maxWaitMs: 60_000,
        },
      );

      await jobs.start('p1');
      await vi.waitFor(() => {
        expect(jobs.stateOf('p1')?.phase).toBe('finished');
      });
      expect(jobs.stateOf('p1')?.result).toEqual(LANDED);
    });

    it('gives up honestly at the wait ceiling, so a wedged flight can never strand a job forever', async () => {
      let clock = 0;
      const jobs = registryWith(async () => FLIGHT_RUNNING, {
        isFlightRunning: () => true,
        now: () => clock,
        sleep: () => {
          clock += 10_000;
          return Promise.resolve();
        },
        maxWaitMs: 30_000,
      });

      await jobs.start('p1');
      await vi.waitFor(() => {
        expect(jobs.stateOf('p1')?.phase).toBe('finished');
      });
      expect(jobs.stateOf('p1')?.result?.ok).toBe(false);
      expect(jobs.stateOf('p1')?.result?.details).toContain('press LAND again');
    });

    it('tells a second presser their landing is already queued rather than starting a competing one', async () => {
      const execute = vi.fn(async () => FLIGHT_RUNNING);
      const jobs = registryWith(execute, {
        isFlightRunning: () => true,
        sleep: () => new Promise<void>(() => {}),
      });

      await jobs.start('p1');
      // A human's second press lands well after the first attempt settled —
      // wait for the job to actually be in its holding phase, the state a
      // real second press would find.
      await vi.waitFor(() => {
        expect(jobs.stateOf('p1')?.phase).toBe('waiting-for-flight');
      });

      const second = await jobs.start('p1');
      expect(second?.details).toContain('already queued');
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('never waits at all when no flight-registry consult was injected — the refusal stands as it always did', async () => {
      const execute = vi.fn(async () => FLIGHT_RUNNING);
      const jobs = registryWith(execute, { maxWaitMs: 0 });

      await expect(jobs.start('p1')).resolves.toEqual(FLIGHT_RUNNING);
      await vi.waitFor(() => {
        expect(jobs.stateOf('p1')?.phase).toBe('finished');
      });
      expect(execute).toHaveBeenCalledTimes(1);
    });
  });

  it('finishes the job honestly when the landing itself throws, rather than leaving a phase that will never advance', async () => {
    const jobs = registryWith(async () => {
      throw new Error('git exploded');
    });

    await expect(jobs.start('p1')).rejects.toThrow('git exploded');
    await vi.waitFor(() => {
      expect(jobs.stateOf('p1')?.phase).toBe('finished');
    });
    expect(jobs.stateOf('p1')?.result?.details).toContain('press LAND again');
  });

  it('ignores gate progress for a project with no job, and after one has finished — a late callback can never resurrect a settled job', async () => {
    const jobs = registryWith(async () => LANDED);
    expect(() =>
      jobs.onGateProgress('ghost', { kind: 'start', label: 'x', index: 1, total: 1 }),
    ).not.toThrow();

    await jobs.start('p1');
    jobs.onGateProgress('p1', { kind: 'start', label: 'late', index: 9, total: 9 });
    expect(jobs.stateOf('p1')?.steps).toEqual([]);
    expect(jobs.stateOf('p1')?.phase).toBe('finished');
  });
});

describe('landing job registry — surviving the restart a green land itself causes', () => {
  const LANDED_RECORD: LandingExecuteApiResult = {
    ok: true,
    reason: 'landed',
    details: 'landed autopilot/flight onto main',
    restarting: false,
  };

  it('answers from the durable record when this process holds no job — a self-hosted land REPLACES the process that ran it, so an empty registry is the normal case, not "nothing happened"', () => {
    const jobs = registryWith(async () => LANDED, {
      recentOutcome: () => LANDED_RECORD,
    });

    const state = jobs.stateOf('p1');
    expect(state?.phase).toBe('finished');
    expect(state?.result).toEqual(LANDED_RECORD);
    expect(state?.note).toContain('before the dashboard restarted');
  });

  it('still reports nothing when there is neither a job nor a recent record — an idle panel must never claim a landing', () => {
    const jobs = registryWith(async () => LANDED, { recentOutcome: () => null });
    expect(jobs.stateOf('p1')).toBeNull();
  });

  it("prefers this process's own live job over the durable record, so a running gate is never masked by an older success", async () => {
    const jobs = registryWith(async () => FLIGHT_RUNNING, {
      isFlightRunning: () => true,
      sleep: () => new Promise<void>(() => {}),
      recentOutcome: () => LANDED_RECORD,
    });

    await jobs.start('p1');
    expect(jobs.stateOf('p1')?.phase).toBe('waiting-for-flight');
  });
});
