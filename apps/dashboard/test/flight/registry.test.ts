// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { FlightRunnerRegistry } from '../../src/flight/registry.js';
import { IDLE_STATUS, type FlightRunnerDeps, type SpawnedFlight } from '../../src/flight/runner.js';

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
  spawns: { folder: string }[];
  childFor: Map<string, ReturnType<typeof fakeChild>>;
} {
  const spawns: { folder: string }[] = [];
  const childFor = new Map<string, ReturnType<typeof fakeChild>>();
  const deps: FlightRunnerDeps = {
    spawnFlight: (folder) => {
      spawns.push({ folder });
      const child = fakeChild();
      childFor.set(folder, child);
      return child;
    },
    folderExists: () => true,
    now: () => 1000,
    requestPause: () => true,
    isPaused: () => false,
    ...overrides,
  };
  return { deps, spawns, childFor };
}

describe('FlightRunnerRegistry', () => {
  it('flies two different folders concurrently — no cross-folder refusal', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    const a = registry.start({ folder: '/work/a' });
    const b = registry.start({ folder: '/work/b' });

    expect(a.started).toBe(true);
    expect(b.started).toBe(true);
    expect(spawns).toHaveLength(2);
    expect(registry.status('/work/a').running).toBe(true);
    expect(registry.status('/work/b').running).toBe(true);
  });

  it('refuses a second flight against the SAME folder while one is running', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a' });
    const second = registry.start({ folder: '/work/a' });

    expect(second.started).toBe(false);
    expect(second.message.toLowerCase()).toContain('already');
    expect(spawns).toHaveLength(1);
  });

  it('keys the SAME folder together even through relative→resolved path differences', () => {
    const { deps, spawns } = makeDeps({ resolveFolder: (f) => '/work/' + f });
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: 'a' });
    const second = registry.start({ folder: 'a' }); // same raw input
    const third = registry.stop('a'); // resolves the same way for lookups too

    expect(second.started).toBe(false);
    expect(third.stopping).toBe(true);
    expect(spawns).toHaveLength(1);
  });

  it('rejects a blank folder without touching any runner', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    const result = registry.start({ folder: '   ' });

    expect(result.started).toBe(false);
    expect(spawns).toEqual([]);
  });

  it('status() on a never-seen folder is idle, not an error', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    expect(registry.status('/never/flown')).toMatchObject({ running: false, folder: null });
  });

  it('stop()/pause() on a never-seen folder are graceful no-ops', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    const stopped = registry.stop('/never/flown');
    const paused = registry.pause('/never/flown');

    expect(stopped.stopping).toBe(false);
    expect(stopped.message).toBe('no flight is running');
    expect(paused.pausing).toBe(false);
    expect(paused.message).toBe('no flight is running');
  });

  it('treats a missing folder the same as blank input — refused, never thrown', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    const result = registry.start({} as unknown as { folder: string });

    expect(result.started).toBe(false);
    expect(result.message).toBe('a folder path is required');
    expect(spawns).toEqual([]);
  });

  it('treats a missing folder as blank even at the concurrency cap — not queued', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    const result = registry.start({} as unknown as { folder: string });

    expect(result.started).toBe(false);
    expect(result.queued).toBeUndefined();
    expect(result.message).toBe('a folder path is required');
    expect(spawns).toHaveLength(1);
  });

  it('refuses a blank folder even when the concurrency cap is already full — not queued', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    const result = registry.start({ folder: '   ' });

    expect(result.started).toBe(false);
    expect(result.queued).toBeUndefined();
    expect(result.message).toBe('a folder path is required');
    expect(spawns).toHaveLength(1);
  });

  it("refuses a running folder's second start with the SAME-folder message even at the cap — not queued", () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    const second = registry.start({ folder: '/work/a' });

    expect(second.started).toBe(false);
    expect(second.queued).toBeUndefined();
    expect(second.message.toLowerCase()).toContain('already flying');
    expect(spawns).toHaveLength(1);
  });

  it('trims whitespace on direct start(), so status lookups by the clean name match', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '  /work/c  ' });

    expect(registry.status('/work/c').running).toBe(true);
  });

  it('trims whitespace when draining a queued folder, so status lookups by the clean name still match', () => {
    const { deps, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '  /work/b  ' });
    childFor.get('/work/a')?.fireExit(0);

    expect(registry.status('/work/b').running).toBe(true);
  });

  it('stop() targets only the named folder — the sibling keeps flying', () => {
    const { deps, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });
    registry.stop('/work/a');

    expect(childFor.get('/work/a')?.killed()).toBe(1);
    expect(childFor.get('/work/b')?.killed()).toBe(0);
    expect(registry.status('/work/b').running).toBe(true);
  });

  it('pause() targets only the named folder', () => {
    const requested: string[] = [];
    const { deps } = makeDeps({
      requestPause: (folder) => {
        requested.push(folder);
        return true;
      },
    });
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });
    registry.pause('/work/a');

    expect(requested).toEqual(['/work/a']);
  });

  it('statusAll() reports every running folder, omits idle ones', () => {
    const { deps, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });
    childFor.get('/work/b')?.fireExit(0); // b finishes cleanly — goes idle

    const all = registry.statusAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.folder).toBe('/work/a');
  });

  it('statusAll() includes a folder that ended paused (Resume offered)', () => {
    const { deps, childFor } = makeDeps({ isPaused: (folder) => folder === '/work/a' });
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a' });
    childFor.get('/work/a')?.fireExit(0);

    const all = registry.statusAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ folder: '/work/a', running: false, paused: true });
  });

  it('statusAll() is empty when nothing has ever flown', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    expect(registry.statusAll()).toEqual([]);
  });

  it('passes initiatedBy through to statusAll() so a fleet-watchdog spawn is distinguishable (web-msqhh7kh-ptjodv)', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b', initiatedBy: 'fleet-watchdog' });

    const byFolder = Object.fromEntries(registry.statusAll().map((s) => [s.folder, s]));
    expect(byFolder['/work/a']?.initiatedBy).toBe('operator');
    expect(byFolder['/work/b']?.initiatedBy).toBe('fleet-watchdog');
  });

  it('a folder can fly again after its own flight exits (per-folder reuse)', () => {
    const { deps, spawns, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a' });
    childFor.get('/work/a')?.fireExit(0);
    const again = registry.start({ folder: '/work/a' });

    expect(again.started).toBe(true);
    expect(spawns).toHaveLength(2);
  });
});

/** Unlike `makeDeps()`, `childFor` there is keyed by folder alone — two
 *  instances of the SAME folder would overwrite each other's entry. This
 *  helper instead keeps every spawned child in call order, so a test can
 *  address instance N's child directly regardless of folder collisions. */
function makeIndexedDeps(overrides: Partial<FlightRunnerDeps> = {}): {
  deps: FlightRunnerDeps;
  children: ReturnType<typeof fakeChild>[];
} {
  const children: ReturnType<typeof fakeChild>[] = [];
  const deps: FlightRunnerDeps = {
    spawnFlight: () => {
      const child = fakeChild(1000 + children.length);
      children.push(child);
      return child;
    },
    folderExists: () => true,
    now: () => 1000,
    requestPause: () => true,
    isPaused: () => false,
    ...overrides,
  };
  return { deps, children };
}

describe('FlightRunnerRegistry N-way same-folder spawn (PARALLEL UNLOCK C)', () => {
  it('two DIFFERENT instanceIds against the SAME folder both start — no collision', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    const a = registry.start({ folder: '/work/a', instanceId: '1' });
    const b = registry.start({ folder: '/work/a', instanceId: '2' });

    expect(a.started).toBe(true);
    expect(b.started).toBe(true);
    expect(spawns).toHaveLength(2);
    expect(spawns.every((s) => s.folder === '/work/a')).toBe(true);
  });

  it('omitting instanceId on both starts still refuses the second — unchanged default behavior', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a' });
    const second = registry.start({ folder: '/work/a' });

    expect(second.started).toBe(false);
    expect(spawns).toHaveLength(1);
  });

  it('a bare (no instanceId) start and a named instance of the same folder are independent, but a repeat of either is refused', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a', instanceId: '1' });
    const bare = registry.start({ folder: '/work/a' });
    expect(bare.started).toBe(true); // bare-folder key was never started before

    const dup = registry.start({ folder: '/work/a', instanceId: '1' });
    expect(dup.started).toBe(false); // same key as the first start

    expect(spawns).toHaveLength(2);
  });

  it('blank/whitespace-only instanceId is treated the same as omitted', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a', instanceId: '   ' });
    const second = registry.start({ folder: '/work/a' });

    expect(second.started).toBe(false); // same bare-folder key as the blank instanceId
    expect(spawns).toHaveLength(1);
  });

  it('records instanceId on the running status, null for a bare start', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a', instanceId: '1' });
    registry.start({ folder: '/work/b' });

    expect(registry.status('/work/a', '1').instanceId).toBe('1');
    expect(registry.status('/work/b').instanceId).toBeNull();
  });

  it('status(folder, instanceId) reports each instance independently; a never-started instance/bare-key stays idle', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a', instanceId: '1' });

    expect(registry.status('/work/a', '1').running).toBe(true);
    expect(registry.status('/work/a', '2').running).toBe(false);
    expect(registry.status('/work/a').running).toBe(false);
  });

  it('statusAll() reports two instances of the same folder as two distinct entries', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a', instanceId: '1' });
    registry.start({ folder: '/work/a', instanceId: '2' });

    const all = registry.statusAll();
    expect(all).toHaveLength(2);
    const byInstance = Object.fromEntries(all.map((s) => [s.instanceId, s]));
    expect(byInstance['1']?.folder).toBe('/work/a');
    expect(byInstance['2']?.folder).toBe('/work/a');
  });

  it('stop(folder, instanceId) targets only the named instance — its sibling of the SAME folder keeps flying', () => {
    const { deps, children } = makeIndexedDeps();
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a', instanceId: '1' });
    registry.start({ folder: '/work/a', instanceId: '2' });
    registry.stop('/work/a', '1');

    expect(children[0]?.killed()).toBe(1);
    expect(children[1]?.killed()).toBe(0);
    expect(registry.status('/work/a', '2').running).toBe(true);
  });

  it('pause(folder, instanceId) targets only the named instance', () => {
    const requested: string[] = [];
    const { deps } = makeIndexedDeps({
      requestPause: (folder) => {
        requested.push(folder);
        return true;
      },
    });
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a', instanceId: '1' });
    registry.start({ folder: '/work/a', instanceId: '2' });
    registry.pause('/work/a', '1');

    expect(requested).toEqual(['/work/a']);
  });

  it('two named instances of the same folder queue and drain independently under a concurrency cap', () => {
    const { deps, children } = makeIndexedDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    const a = registry.start({ folder: '/work/a', instanceId: '1' });
    const b = registry.start({ folder: '/work/a', instanceId: '2' });

    expect(a.started).toBe(true);
    expect(b.started).toBe(false);
    expect(b.queued).toBe(true);
    expect(registry.status('/work/a', '2').queued).toBe(true);

    children[0]?.fireExit(0);

    expect(registry.status('/work/a', '2').running).toBe(true);
  });
});

describe('FlightRunnerRegistry concurrency cap (PARALLEL FLIGHTS 5/6, shared-quota fairness)', () => {
  it('with no cap set, an unbounded number of folders fly concurrently (default unchanged)', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);

    const a = registry.start({ folder: '/work/a' });
    const b = registry.start({ folder: '/work/b' });
    const c = registry.start({ folder: '/work/c' });

    expect([a, b, c].every((r) => r.started)).toBe(true);
    expect(spawns).toHaveLength(3);
  });

  it('queues a start beyond the cap instead of refusing it', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    const a = registry.start({ folder: '/work/a' });
    const b = registry.start({ folder: '/work/b' });

    expect(a.started).toBe(true);
    expect(b.started).toBe(false);
    expect(b.queued).toBe(true);
    expect(b.message.toLowerCase()).toContain('queued');
    expect(b.status).toEqual({ ...IDLE_STATUS, folder: '/work/b', queued: true });
    expect(spawns).toHaveLength(1); // b never actually spawned yet
  });

  it('auto-starts the queued folder once a running slot frees up', () => {
    const { deps, spawns, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });
    expect(spawns).toHaveLength(1);

    childFor.get('/work/a')?.fireExit(0);

    expect(spawns).toHaveLength(2);
    expect(spawns[1]).toEqual({ folder: '/work/b' });
    expect(registry.status('/work/b').running).toBe(true);
  });

  it('drains the queue in FIFO order across more than one waiting folder', () => {
    const { deps, spawns, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });
    registry.start({ folder: '/work/c' });
    expect(spawns).toHaveLength(1);

    childFor.get('/work/a')?.fireExit(0);
    expect(spawns.map((s) => s.folder)).toEqual(['/work/a', '/work/b']);

    childFor.get('/work/b')?.fireExit(0);
    expect(spawns.map((s) => s.folder)).toEqual(['/work/a', '/work/b', '/work/c']);
  });

  it('a repeated start on an already-queued folder reports "already queued" without double-queueing', () => {
    const { deps, spawns, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });
    const again = registry.start({ folder: '/work/b' });

    expect(again.started).toBe(false);
    expect(again.queued).toBe(true);
    expect(again.message.toLowerCase()).toContain('already queued');
    expect(again.status).toEqual({ ...IDLE_STATUS, folder: '/work/b', queued: true });

    childFor.get('/work/a')?.fireExit(0);
    expect(spawns).toHaveLength(2); // b spawned exactly once, not twice
  });

  it('status() reports a queued folder as queued, not idle', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });

    const status = registry.status('/work/b');
    expect(status.queued).toBe(true);
    expect(status.running).toBe(false);
  });

  it('statusAll() lists both the running folder and the queued one', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });

    const all = registry.statusAll();
    expect(all).toHaveLength(2);
    const byFolder = Object.fromEntries(all.map((s) => [s.folder, s]));
    expect(byFolder['/work/a']).toMatchObject({ running: true, queued: false });
    expect(byFolder['/work/b']).toMatchObject({ running: false, queued: true });
  });

  it('stop() on a queued folder cancels it out of the queue instead of erroring', () => {
    const { deps, spawns, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });
    const cancelled = registry.stop('/work/b');

    expect(cancelled.stopping).toBe(true);
    expect(cancelled.message).toBe('removed /work/b from the flight queue');
    expect(registry.status('/work/b').queued).toBe(false);

    childFor.get('/work/a')?.fireExit(0);
    expect(spawns).toHaveLength(1); // the cancelled folder never spawns
  });

  it('stop() on a queued folder removes only that folder — sibling folders stay queued', () => {
    const { deps, spawns, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });
    registry.start({ folder: '/work/c' });
    registry.stop('/work/b');

    childFor.get('/work/a')?.fireExit(0);

    // b was cancelled; c was still queued and starts once a's slot frees.
    expect(spawns).toHaveLength(2);
    expect(spawns.map((s) => s.folder)).toEqual(['/work/a', '/work/c']);
    expect(registry.status('/work/c').running).toBe(true);
  });

  it('stop() on a queued folder matches even when the original request had surrounding whitespace', () => {
    const { deps, spawns, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 1);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '  /work/b  ' });
    registry.stop('/work/b');

    childFor.get('/work/a')?.fireExit(0);

    expect(spawns).toHaveLength(1); // the cancelled folder never spawns
  });

  it('signals spawnFlight when another folder is ALREADY running (MACHINE BUDGET, web-mt1qa7ij-c6wqgi)', () => {
    // The registry is the one thing that actually knows the live running
    // count — this closes the hole where only an instanceId'd spawn ever
    // got the fleet vitest-worker cap, even though a "base" (no-instanceId)
    // flight starting while siblings already fly is exactly the scenario
    // the cap exists for.
    const calls: unknown[][] = [];
    const { deps } = makeDeps({
      spawnFlight: (...args) => {
        calls.push(args);
        return fakeChild();
      },
    });
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.[6]).toBe(false); // a started alone — nothing else running yet
    expect(calls[1]?.[6]).toBe(true); // b started while a was already running
  });

  it('does not signal siblings-flying for the first flight after the only other one exits', () => {
    const calls: unknown[][] = [];
    const { deps, childFor } = makeDeps({
      spawnFlight: (folder, ...rest) => {
        calls.push([folder, ...rest]);
        const child = fakeChild();
        childFor.set(folder, child);
        return child;
      },
    });
    const registry = new FlightRunnerRegistry(deps);

    registry.start({ folder: '/work/a' });
    childFor.get('/work/a')?.fireExit(0);
    registry.start({ folder: '/work/b' });

    expect(calls[1]?.[6]).toBe(false);
  });

  it('freeing a slot only starts as many queued folders as the cap allows', () => {
    const { deps, spawns, childFor } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, 2);

    registry.start({ folder: '/work/a' });
    registry.start({ folder: '/work/b' });
    registry.start({ folder: '/work/c' });
    registry.start({ folder: '/work/d' });
    expect(spawns).toHaveLength(2);

    childFor.get('/work/a')?.fireExit(0);

    // Exactly one more slot freed — exactly one more queued folder starts.
    expect(spawns).toHaveLength(3);
    expect(spawns.map((s) => s.folder)).toEqual(['/work/a', '/work/b', '/work/c']);
  });
});

describe('FlightRunnerRegistry.adopt (RUNBOOK §4 — reattaching a flight this registry never spawned)', () => {
  it('gives an adopted folder a real status instead of IDLE', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);
    const child = fakeChild(9999);

    registry.adopt('/work/orphan', child);

    expect(registry.status('/work/orphan')).toMatchObject({
      running: true,
      folder: '/work/orphan',
      pid: 9999,
    });
  });

  it('stop() against an adopted folder kills the real pid instead of reporting "no flight is running"', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);
    const child = fakeChild(9999);
    registry.adopt('/work/orphan', child);

    const result = registry.stop('/work/orphan');

    expect(result.stopping).toBe(true);
    expect(child.killed()).toBe(1);
  });

  it('pause() against an adopted folder records the pause request through the shared deps', () => {
    const requested: string[] = [];
    const { deps } = makeDeps({
      requestPause: (folder) => {
        requested.push(folder);
        return true;
      },
    });
    const registry = new FlightRunnerRegistry(deps);
    registry.adopt('/work/orphan', fakeChild(9999));

    const result = registry.pause('/work/orphan');

    expect(result.pausing).toBe(true);
    expect(requested).toEqual(['/work/orphan']);
  });

  it('an adopted instance carries its instanceId through status/statusAll', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);
    registry.adopt('/work/orphan', fakeChild(9999), 'fleet-2');

    expect(registry.status('/work/orphan', 'fleet-2')).toMatchObject({ instanceId: 'fleet-2' });
    expect(registry.statusAll()).toContainEqual(
      expect.objectContaining({ folder: '/work/orphan', instanceId: 'fleet-2', running: true }),
    );
  });

  it('resolves the folder before adopting, same as start() — a raw and an already-resolved lookup agree', () => {
    const { deps } = makeDeps({ resolveFolder: (f) => `/resolved/${f}` });
    const registry = new FlightRunnerRegistry(deps);

    registry.adopt('orphan', fakeChild(9999));

    expect(registry.status('orphan').running).toBe(true);
  });

  it('is a no-op when this registry already has a runner for the key — never overrides a genuinely spawned/adopted flight', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);
    registry.start({ folder: '/work/a' });

    const adoptedChild = fakeChild(9999);
    registry.adopt('/work/a', adoptedChild);

    expect(spawns).toHaveLength(1);
    expect(registry.status('/work/a').pid).not.toBe(9999);
  });

  it('reports the adopted flight in statusAll() alongside genuinely spawned ones', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);
    registry.start({ folder: '/work/a' });
    registry.adopt('/work/orphan', fakeChild(9999));

    const folders = registry.statusAll().map((s) => s.folder);
    expect(folders).toEqual(expect.arrayContaining(['/work/a', '/work/orphan']));
  });

  it('an adopted flight going idle on exit can be started fresh afterward', () => {
    const { deps, spawns } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);
    const child = fakeChild(9999);
    registry.adopt('/work/orphan', child);

    child.fireExit(null);
    expect(registry.status('/work/orphan').running).toBe(false);

    const result = registry.start({ folder: '/work/orphan' });
    expect(result.started).toBe(true);
    expect(spawns).toEqual([{ folder: '/work/orphan' }]);
  });
});
