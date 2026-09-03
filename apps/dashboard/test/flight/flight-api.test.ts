// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { createFlightApi } from '../../src/flight/flight-api.js';
import { FlightRunnerRegistry } from '../../src/flight/registry.js';
import type { FlightRunnerDeps, SpawnedFlight } from '../../src/flight/runner.js';

/** A controllable fake child, one per `start()` call — mirrors registry.test.ts. */
function fakeChild(pid = 4242): SpawnedFlight & { killed: () => number } {
  let kills = 0;
  return {
    pid,
    onExit: () => {},
    kill: () => {
      kills += 1;
    },
    killed: () => kills,
  };
}

function makeDeps(): { deps: FlightRunnerDeps; children: ReturnType<typeof fakeChild>[] } {
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
  };
  return { deps, children };
}

describe('createFlightApi', () => {
  it('stop(folder, instanceId) actually stops the named instance — OPS BUG web-mt1w1ik9-zfgaeb', () => {
    // A same-folder fleet: two instances flying the SAME folder at once
    // (PARALLEL UNLOCK C). Only instance "1" is targeted for stop.
    const { deps, children } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);
    const api = createFlightApi(registry);

    registry.start({ folder: '/work/a', instanceId: '1' });
    registry.start({ folder: '/work/a', instanceId: '2' });

    const result = api.stop('/work/a', '1');

    expect(result.stopping).toBe(true);
    expect(result.message).not.toBe('no flight is running');
    expect(children[0]?.killed()).toBe(1);
    expect(children[1]?.killed()).toBe(0);
    expect(api.statusAll?.().find((s) => s.instanceId === '2')?.running).toBe(true);
  });

  it('pause(folder, instanceId) targets only the named instance', () => {
    const requested: string[] = [];
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps, Infinity);
    const registryWithPauseSpy = new FlightRunnerRegistry({
      ...deps,
      requestPause: (folder) => {
        requested.push(folder);
        return true;
      },
    });
    void registry; // unused placeholder kept out of the assertion path
    const api = createFlightApi(registryWithPauseSpy);

    registryWithPauseSpy.start({ folder: '/work/a', instanceId: '1' });
    registryWithPauseSpy.start({ folder: '/work/a', instanceId: '2' });

    const result = api.pause('/work/a', '1');

    expect(result.pausing).toBe(true);
    expect(requested).toEqual(['/work/a']);
  });

  it('stop() with no folder falls back to whichever folder is actually running — legacy single-flight UI', () => {
    const { deps, children } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);
    const api = createFlightApi(registry);

    registry.start({ folder: '/work/a' });

    const result = api.stop();

    expect(result.stopping).toBe(true);
    expect(children[0]?.killed()).toBe(1);
  });

  it('start() forwards the full input, including instanceId, to the registry', () => {
    const { deps } = makeDeps();
    const registry = new FlightRunnerRegistry(deps);
    const api = createFlightApi(registry);

    api.start({ folder: '/work/a', instanceId: '1' });
    api.start({ folder: '/work/a', instanceId: '2' });

    expect(api.statusAll?.()).toHaveLength(2);
  });
});
