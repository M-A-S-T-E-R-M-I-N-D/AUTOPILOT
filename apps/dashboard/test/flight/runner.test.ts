// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  FlightRunner,
  IDLE_STATUS,
  MAX_DASHBOARD_FIRINGS,
  type FlightRunnerDeps,
  type SpawnedFlight,
} from '../../src/flight/runner.js';

/** A controllable fake child: capture exit handlers + record kill() calls. */
function fakeChild(
  pid: number | null = 4242,
): SpawnedFlight & { fireExit: (code: number | null) => void; killed: () => number } {
  const handlers: ((code: number | null) => void)[] = [];
  let kills = 0;
  return {
    pid,
    onExit(cb) {
      handlers.push(cb);
    },
    kill() {
      kills += 1;
    },
    fireExit(code) {
      for (const h of handlers) h(code);
    },
    killed: () => kills,
  };
}

function makeDeps(overrides: Partial<FlightRunnerDeps> = {}): {
  deps: FlightRunnerDeps;
  spawns: {
    folder: string;
    firings: number;
    budgetUsd: number;
    totalBudgetUsd: number | undefined;
  }[];
  child: ReturnType<typeof fakeChild>;
} {
  const spawns: {
    folder: string;
    firings: number;
    budgetUsd: number;
    totalBudgetUsd: number | undefined;
  }[] = [];
  const child = fakeChild();
  const deps: FlightRunnerDeps = {
    spawnFlight: (folder, firings, budgetUsd, totalBudgetUsd) => {
      spawns.push({ folder, firings, budgetUsd, totalBudgetUsd });
      return child;
    },
    folderExists: () => true,
    now: () => 1000,
    requestPause: () => true,
    isPaused: () => false,
    ...overrides,
  };
  return { deps, spawns, child };
}

describe('FlightRunner', () => {
  it('starts a flight when the folder exists and none is running', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    const result = runner.start({ folder: '/work/sandbox', firings: 3 });

    expect(result.started).toBe(true);
    // Fixed-firings mode: the exact message, not the total-spend phrasing.
    expect(result.message).toBe('flying /work/sandbox — 3 firing(s)');
    expect(spawns).toEqual([
      { folder: '/work/sandbox', firings: 3, budgetUsd: 10, totalBudgetUsd: undefined },
    ]);
    expect(runner.status()).toMatchObject({
      running: true,
      folder: '/work/sandbox',
      firings: 3,
      startedAt: 1000,
      pid: 4242,
      queued: false,
    });
  });

  it('a fresh runner starts fully idle (paused/queued both false, nothing attributed)', () => {
    const { deps } = makeDeps();
    const runner = new FlightRunner(deps);

    // Comparing against the IDLE_STATUS constant itself would trivially pass
    // even if a mutant flipped one of its literals (both sides would read the
    // same mutated singleton) — assert the literal booleans directly instead.
    expect(runner.status()).toEqual(IDLE_STATUS);
    expect(runner.status().paused).toBe(false);
    expect(runner.status().queued).toBe(false);
  });

  it('defaults firings to 1 when omitted', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/sandbox' });

    expect(spawns[0]?.firings).toBe(1);
  });

  it('refuses when the folder does not exist and never spawns', () => {
    const { deps, spawns } = makeDeps({ folderExists: () => false });
    const runner = new FlightRunner(deps);

    const result = runner.start({ folder: '/nope' });

    expect(result.started).toBe(false);
    expect(result.message.toLowerCase()).toContain('not');
    expect(spawns).toEqual([]);
    expect(runner.status().running).toBe(false);
  });

  it('resolves a relative folder to an absolute path (spawn, status, and message)', () => {
    const seen: string[] = [];
    const { deps, spawns } = makeDeps({
      resolveFolder: (f) => '/work/' + f,
      folderExists: (f) => {
        seen.push(f);
        return false; // force the not-found path to inspect the message
      },
    });
    const runner = new FlightRunner(deps);

    const refused = runner.start({ folder: 'AUTOPILOT' });
    expect(seen).toEqual(['/work/AUTOPILOT']); // existence checked the RESOLVED path
    expect(refused.message).toContain('/work/AUTOPILOT');
    expect(spawns).toEqual([]);

    // And when it exists, the resolved path is what gets flown + reported.
    const ok = new FlightRunner({ ...deps, folderExists: () => true });
    const started = ok.start({ folder: 'AUTOPILOT' });
    expect(started.started).toBe(true);
    expect(started.status.folder).toBe('/work/AUTOPILOT');
  });

  it('rejects a blank folder', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    const result = runner.start({ folder: '   ' });

    expect(result.started).toBe(false);
    expect(result.message).toBe('a folder path is required');
    expect(spawns).toEqual([]);
  });

  it('rejects a missing folder the same way as a blank one (an untyped caller omitting it)', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    // @ts-expect-error — exercising a value outside StartFlightInput's required `folder: string`
    const result = runner.start({});

    expect(result.started).toBe(false);
    expect(result.message).toBe('a folder path is required');
    expect(spawns).toEqual([]);
  });

  it('refuses a second flight while one is already running (one at a time)', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a' });
    const second = runner.start({ folder: '/work/b' });

    expect(second.started).toBe(false);
    expect(second.message).toBe('already flying /work/a — one flight at a time');
    expect(spawns).toHaveLength(1);
  });

  it('passes the operator budget through — floored but NOT capped (operator decides spend)', () => {
    const budgets: number[] = [];
    const { deps } = makeDeps();
    const spy: FlightRunnerDeps = {
      ...deps,
      spawnFlight: (_f, _n, budgetUsd) => {
        budgets.push(budgetUsd);
        return fakeChild();
      },
    };
    let r = new FlightRunner(spy);
    r.start({ folder: '/work/a', budgetUsd: 5 });
    r = new FlightRunner(spy);
    r.start({ folder: '/work/a' }); // default
    r = new FlightRunner(spy);
    r.start({ folder: '/work/a', budgetUsd: 999 }); // NOT clamped — founder's call
    r = new FlightRunner(spy);
    r.start({ folder: '/work/a', budgetUsd: 0.1 }); // floored
    r = new FlightRunner(spy);
    r.start({ folder: '/work/a', budgetUsd: -3 }); // nonsense → default
    r = new FlightRunner(spy);
    r.start({ folder: '/work/a', budgetUsd: 0 }); // zero is <= 0 too → default, not floored to MIN
    // Default follows DEFAULT_BUDGET_USD ($10 — clears the ~$7 natural
    // turn-cap ceiling with headroom; see flight/runner.ts).
    expect(budgets).toEqual([5, 10, 999, 0.5, 10, 10]);
  });

  it('TOTAL-SPEND mode: firings become the safety ceiling and the target is floored at one firing', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    const res = runner.start({ folder: '/work/a', budgetUsd: 10, totalBudgetUsd: 50 });
    expect(res.started).toBe(true);
    expect(res.message).toContain('$50 total');
    expect(spawns[0]).toEqual({
      folder: '/work/a',
      firings: MAX_DASHBOARD_FIRINGS,
      budgetUsd: 10,
      totalBudgetUsd: 50,
    });
    expect(runner.status().totalBudgetUsd).toBe(50);

    // A target below one firing's budget is nonsense — floored to the budget.
    const fresh = makeDeps();
    const r2 = new FlightRunner(fresh.deps);
    r2.start({ folder: '/work/b', budgetUsd: 10, totalBudgetUsd: 3 });
    expect(fresh.spawns[0]?.totalBudgetUsd).toBe(10);
  });

  it('TOTAL-SPEND mode: a non-finite target (NaN) falls back to the per-firing budget', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a', budgetUsd: 5, totalBudgetUsd: NaN });

    expect(spawns[0]?.totalBudgetUsd).toBe(5);
  });

  it('clamps firings into [1, MAX_DASHBOARD_FIRINGS]', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a', firings: 9999 });
    expect(spawns[0]?.firings).toBe(MAX_DASHBOARD_FIRINGS);

    // once that flight exits, a zero/negative request clamps up to 1
    // (fire exit via a fresh runner to keep the assertion isolated)
    const fresh = makeDeps();
    const r2 = new FlightRunner(fresh.deps);
    r2.start({ folder: '/work/b', firings: -5 });
    expect(fresh.spawns[0]?.firings).toBe(1);
  });

  it('TOTAL-SPEND mode: passes totalBudgetUsd through and ignores firings', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    const result = runner.start({
      folder: '/work/a',
      firings: 3,
      budgetUsd: 2,
      totalBudgetUsd: 10,
    });

    expect(spawns).toEqual([
      { folder: '/work/a', firings: MAX_DASHBOARD_FIRINGS, budgetUsd: 2, totalBudgetUsd: 10 },
    ]);
    expect(result.message).toBe('flying /work/a — up to $10 total');
    expect(runner.status()).toMatchObject({ firings: MAX_DASHBOARD_FIRINGS, totalBudgetUsd: 10 });
  });

  it('TOTAL-SPEND mode: floors the total target at the per-firing budget', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a', budgetUsd: 5, totalBudgetUsd: 1 }); // can't even fund one firing

    expect(spawns[0]?.totalBudgetUsd).toBe(5);
  });

  it('fixed-firings mode leaves totalBudgetUsd unset (undefined, not null) on spawnFlight', () => {
    const { deps, spawns } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a', firings: 4 });

    expect(spawns[0]?.totalBudgetUsd).toBeUndefined();
    expect(runner.status().totalBudgetUsd).toBeNull();
  });

  it('clears the running state when the child exits', () => {
    const { deps, child } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a' });
    expect(runner.status().running).toBe(true);

    child.fireExit(0);

    expect(runner.status().running).toBe(false);
    expect(runner.status().folder).toBeNull();
  });

  it('allows a new flight after the previous one exits', () => {
    const { deps, spawns, child } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a' });
    child.fireExit(0);
    const again = runner.start({ folder: '/work/b' });

    expect(again.started).toBe(true);
    expect(spawns).toHaveLength(2);
  });

  it('stop() kills the running child and goes idle once it exits', () => {
    const { deps, child } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a' });
    const res = runner.stop();

    expect(res.stopping).toBe(true);
    expect(res.message).toBe('stopping /work/a…');
    expect(child.killed()).toBe(1);
    // Still running until the process actually dies…
    expect(runner.status().running).toBe(true);
    child.fireExit(null);
    expect(runner.status().running).toBe(false);
  });

  it('stop() is a no-op when nothing is flying', () => {
    const { deps, child } = makeDeps();
    const runner = new FlightRunner(deps);

    const res = runner.stop();

    expect(res.stopping).toBe(false);
    expect(res.message).toBe('no flight is running');
    expect(child.killed()).toBe(0);
  });

  it('after a stopped flight exits, a new flight can start', () => {
    const { deps, spawns, child } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a' });
    runner.stop();
    child.fireExit(null);
    const again = runner.start({ folder: '/work/b' });

    expect(again.started).toBe(true);
    expect(spawns).toHaveLength(2);
  });

  it('pause() records the request but — unlike stop() — never kills the child', () => {
    const requested: string[] = [];
    const { deps, child } = makeDeps({
      requestPause: (folder) => {
        requested.push(folder);
        return true;
      },
    });
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a' });
    const res = runner.pause();

    expect(res.pausing).toBe(true);
    expect(res.message).toBe('pausing /work/a — holding after the firing in progress…');
    expect(requested).toEqual(['/work/a']);
    expect(child.killed()).toBe(0);
    expect(runner.status().running).toBe(true); // still flying — holds after THIS firing
  });

  it('pause() is a no-op when nothing is flying', () => {
    const { deps } = makeDeps();
    const runner = new FlightRunner(deps);

    const res = runner.pause();

    expect(res.pausing).toBe(false);
    expect(res.message).toBe('no flight is running');
  });

  it('pause() fails cleanly when the store has no matching project row', () => {
    const { deps } = makeDeps({ requestPause: () => false });
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a' });
    const res = runner.pause();

    expect(res.pausing).toBe(false);
    expect(res.message.toLowerCase()).toContain('pause');
  });

  it('a flight that exits having honored a pause lands on paused: true, folder retained', () => {
    const { deps, child } = makeDeps({ isPaused: (folder) => folder === '/work/a' });
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a' });
    child.fireExit(0);

    expect(runner.status()).toMatchObject({ running: false, folder: '/work/a', paused: true });
  });

  it('defaults initiatedBy to "operator" when the caller omits it', () => {
    const { deps } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a' });

    expect(runner.status().initiatedBy).toBe('operator');
  });

  it('records initiatedBy: "fleet-watchdog" when the caller sets it', () => {
    const { deps } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a', initiatedBy: 'fleet-watchdog' });

    expect(runner.status().initiatedBy).toBe('fleet-watchdog');
  });

  it('normalizes an unrecognized initiatedBy to "operator" (a display label, not a permission)', () => {
    const { deps } = makeDeps();
    const runner = new FlightRunner(deps);

    // @ts-expect-error — exercising a value outside the FlightInitiator union
    runner.start({ folder: '/work/a', initiatedBy: 'someone-else' });

    expect(runner.status().initiatedBy).toBe('operator');
  });

  it('initiatedBy is null while idle', () => {
    const { deps } = makeDeps();
    const runner = new FlightRunner(deps);

    expect(runner.status().initiatedBy).toBeNull();
  });

  it('instanceId is null while idle, and null on a start that omits it (PARALLEL UNLOCK C)', () => {
    const { deps } = makeDeps();
    const runner = new FlightRunner(deps);

    expect(runner.status().instanceId).toBeNull();

    runner.start({ folder: '/work/a' });

    expect(runner.status().instanceId).toBeNull();
  });

  it('records instanceId when the caller sets it, trimmed', () => {
    const { deps } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a', instanceId: '  2  ' });

    expect(runner.status().instanceId).toBe('2');
  });

  it('treats a blank/whitespace-only instanceId the same as omitted', () => {
    const { deps } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a', instanceId: '   ' });

    expect(runner.status().instanceId).toBeNull();
  });

  it('a paused flight retains its instanceId through the running→paused transition', () => {
    const { deps, child } = makeDeps({ isPaused: () => true });
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a', instanceId: '1' });
    child.fireExit(0);

    expect(runner.status()).toMatchObject({ paused: true, instanceId: '1' });
  });

  it('forwards instanceId to spawnFlight as its 5th arg (PARALLEL UNLOCK C wiring)', () => {
    const seen: (string | undefined)[] = [];
    const { deps } = makeDeps();
    const spy: FlightRunnerDeps = {
      ...deps,
      spawnFlight: (_f, _n, _b, _t, instanceId) => {
        seen.push(instanceId);
        return fakeChild();
      },
    };
    let r = new FlightRunner(spy);
    r.start({ folder: '/work/a', instanceId: '2' });
    r = new FlightRunner(spy);
    r.start({ folder: '/work/b' }); // omitted → undefined, not null

    expect(seen).toEqual(['2', undefined]);
  });

  it('resuming a paused flight is just start() again — no separate resume() exists', () => {
    const { deps, spawns, child } = makeDeps({ isPaused: () => true });
    const runner = new FlightRunner(deps);

    runner.start({ folder: '/work/a' });
    child.fireExit(0);
    expect(runner.status().paused).toBe(true);

    const resumed = runner.start({ folder: '/work/a' });

    expect(resumed.started).toBe(true);
    expect(spawns).toHaveLength(2);
    expect(runner.status().paused).toBe(false); // flying again — no longer "paused"
  });
});

describe('FlightRunner.adopt (RUNBOOK §4 — reattaching a flight this runner never spawned)', () => {
  it('reports running with the adopted pid/folder/instanceId, and null for everything it cannot know', () => {
    const { deps, spawns, child } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.adopt(child, '/work/orphan', '3');

    expect(spawns).toHaveLength(0); // adopt() never calls deps.spawnFlight
    expect(runner.status()).toEqual({
      running: true,
      folder: '/work/orphan',
      firings: null,
      totalBudgetUsd: null,
      startedAt: null,
      pid: child.pid,
      paused: false,
      queued: false,
      initiatedBy: null,
      instanceId: '3',
    });
  });

  it('goes idle when the adopted child exits and was not paused', () => {
    const { deps, child } = makeDeps({ isPaused: () => false });
    const runner = new FlightRunner(deps);

    runner.adopt(child, '/work/orphan', null);
    child.fireExit(null);

    expect(runner.status()).toEqual(IDLE_STATUS);
  });

  it('goes paused (not idle) when the adopted child exits after honoring a pause request', () => {
    const { deps, child } = makeDeps({ isPaused: () => true });
    const runner = new FlightRunner(deps);

    runner.adopt(child, '/work/orphan', '7');
    child.fireExit(null);

    expect(runner.status()).toMatchObject({
      running: false,
      folder: '/work/orphan',
      paused: true,
      instanceId: '7',
    });
  });

  it('stop() kills the adopted child exactly like a spawned one', () => {
    const { deps, child } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.adopt(child, '/work/orphan', null);
    const result = runner.stop();

    expect(result.stopping).toBe(true);
    expect(child.killed()).toBe(1);
  });

  it('an adopted runner rejects start() as "already flying", same as a spawned one', () => {
    const { deps, child } = makeDeps();
    const runner = new FlightRunner(deps);

    runner.adopt(child, '/work/orphan', null);
    const result = runner.start({ folder: '/work/orphan' });

    expect(result.started).toBe(false);
    expect(result.message).toContain('already flying');
  });
});
