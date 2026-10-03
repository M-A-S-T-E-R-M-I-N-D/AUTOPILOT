// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0036 (GitHub #21 slice S1): the lane cards' engine chip reads each
 * lane's engine off its project, keyed as the engine keys the lane's firing
 * ids, so the merge must key a named lane `<project>--<instance>` and the base
 * flight by the bare project id.
 */
import { describe, it, expect } from 'vitest';
import {
  laneEnginesByProject,
  withLaneEngines,
  type LaneEngineFlight,
} from '../../src/read/lane-engines.js';

const projectIdOf = (folder: string): string => 'fly-' + folder.split('/').pop();

function flight(over: Partial<LaneEngineFlight>): LaneEngineFlight {
  return { running: true, folder: '/work/alpha', instanceId: null, ...over };
}

describe('laneEnginesByProject', () => {
  it('keys a named lane by project and instance, and the base flight by the project alone', () => {
    const byProject = laneEnginesByProject(
      [
        flight({ engine: 'claude', backend: 'bedrock' }),
        flight({ instanceId: 'fleet-2', engine: 'codex' }),
        flight({ instanceId: 'fleet-3', engine: 'gemini' }),
      ],
      projectIdOf,
    );

    expect([...byProject.keys()]).toEqual(['fly-alpha']);
    expect(byProject.get('fly-alpha')).toEqual({
      'fly-alpha': { engine: 'claude', backend: 'bedrock' },
      'fly-alpha--fleet-2': { engine: 'codex' },
      'fly-alpha--fleet-3': { engine: 'gemini' },
    });
  });

  it("names a backend's flight Claude Code when its status names no engine, and keeps an endpoint's host", () => {
    const byProject = laneEnginesByProject(
      [flight({ backend: 'endpoint', backendHost: 'localhost:11434' })],
      projectIdOf,
    );

    expect(byProject.get('fly-alpha')).toEqual({
      'fly-alpha': { engine: 'claude', backend: 'endpoint', backendHost: 'localhost:11434' },
    });
  });

  it('leaves out a flight that names no engine, a paused or idle one, and one with no folder', () => {
    const byProject = laneEnginesByProject(
      [
        flight({}),
        flight({ instanceId: 'fleet-2', engine: 'codex', running: false }),
        flight({ folder: null, engine: 'gemini' }),
      ],
      projectIdOf,
    );

    expect(byProject.size).toBe(0);
  });

  it('groups flights on different folders under their own projects', () => {
    const byProject = laneEnginesByProject(
      [flight({ engine: 'codex' }), flight({ folder: '/work/beta', engine: 'gemini' })],
      projectIdOf,
    );

    expect(byProject.get('fly-alpha')).toEqual({ 'fly-alpha': { engine: 'codex' } });
    expect(byProject.get('fly-beta')).toEqual({ 'fly-beta': { engine: 'gemini' } });
  });

  it('keeps a lane key that names an Object.prototype member as an own property', () => {
    const byProject = laneEnginesByProject([flight({ engine: 'codex' })], () => '__proto__');
    const lanes = byProject.get('__proto__')!;

    expect(Object.hasOwn(lanes, '__proto__')).toBe(true);
    expect(JSON.parse(JSON.stringify(lanes))).toEqual(
      JSON.parse('{"__proto__":{"engine":"codex"}}'),
    );
  });
});

describe('withLaneEngines', () => {
  const view = {
    generatedAt: 5,
    projects: [
      { id: 'fly-alpha', name: 'alpha' },
      { id: 'fly-beta', name: 'beta' },
    ],
  };

  it("puts each project's lanes on that project only, leaving the input untouched", () => {
    const merged = withLaneEngines(view, [flight({ engine: 'codex' })], projectIdOf);

    expect(merged.generatedAt).toBe(5);
    expect(merged.projects[0]).toEqual({
      id: 'fly-alpha',
      name: 'alpha',
      laneEngines: { 'fly-alpha': { engine: 'codex' } },
    });
    expect(merged.projects[1]).toBe(view.projects[1]);
    expect(view.projects[0]).not.toHaveProperty('laneEngines');
  });

  it('returns the view itself when no running flight names an engine', () => {
    expect(withLaneEngines(view, [flight({})], projectIdOf)).toBe(view);
    expect(withLaneEngines(view, [], projectIdOf)).toBe(view);
  });
});
