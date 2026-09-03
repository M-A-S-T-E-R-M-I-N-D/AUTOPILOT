// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, type Store, type ProjectRow } from '@autopilot/store';
import type * as AutopilotStore from '@autopilot/store';
import {
  fleetFlightWatchdogTick,
  createFleetFlightWatchdogControl,
  type FleetFlightWatchdogControl,
} from '../../src/control/fleet-watchdog.js';

vi.mock('@autopilot/store', async (importOriginal) => {
  const actual = await importOriginal<typeof AutopilotStore>();
  return { ...actual, openStore: vi.fn(actual.openStore) };
});

function makeProject(overrides: Partial<ProjectRow> & { id: string }): ProjectRow {
  return {
    slug: overrides.id,
    name: overrides.id,
    root_path: `/projects/${overrides.id}`,
    status: 'registered',
    soul: null,
    soul_reviewed: 0,
    soul_proposed: null,
    soul_proposed_at: null,
    soul_previous: null,
    soul_previous_at: null,
    gate_config: null,
    metadata: null,
    backlog_path: null,
    pause_requested: 0,
    created_at: 100,
    updated_at: 100,
    ...overrides,
  };
}

function project(s: Store, id: string, rootPath: string, status: ProjectRow['status']): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, id, id, rootPath, status, 100, 100);
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

describe('fleetFlightWatchdogTick (pure)', () => {
  it('spawns every idle project and skips the rest, in listProjects() order', () => {
    const projects = [
      makeProject({ id: 'p-flying', status: 'flying' }),
      makeProject({ id: 'p-registered', status: 'registered' }),
      makeProject({ id: 'p-paused', status: 'paused' }),
      makeProject({ id: 'p-hibernating', status: 'hibernating' }),
      makeProject({ id: 'p-needs-you', status: 'needs_you' }),
    ];
    const spawnFlight = vi.fn();
    const control: FleetFlightWatchdogControl = { listProjects: () => projects, spawnFlight };

    const result = fleetFlightWatchdogTick(control);

    expect(result.spawned).toEqual([projects[1]]);
    expect(spawnFlight).toHaveBeenCalledOnce();
    expect(spawnFlight).toHaveBeenCalledWith(projects[1]);
  });

  it('spawns nothing when no project is idle', () => {
    const projects = [makeProject({ id: 'p1', status: 'flying' })];
    const spawnFlight = vi.fn();
    const control: FleetFlightWatchdogControl = { listProjects: () => projects, spawnFlight };

    const result = fleetFlightWatchdogTick(control);

    expect(result.spawned).toEqual([]);
    expect(spawnFlight).not.toHaveBeenCalled();
  });

  it('treats an empty fleet as a no-op', () => {
    const spawnFlight = vi.fn();
    const control: FleetFlightWatchdogControl = { listProjects: () => [], spawnFlight };

    expect(fleetFlightWatchdogTick(control)).toEqual({ spawned: [] });
    expect(spawnFlight).not.toHaveBeenCalled();
  });

  it('spawns a never-onboarded-equivalent status alongside a registered one', () => {
    const projects = [
      makeProject({ id: 'p-registered', status: 'registered' }),
      makeProject({ id: 'p-other-idle', status: 'registered' }),
    ];
    const spawnFlight = vi.fn();
    const control: FleetFlightWatchdogControl = { listProjects: () => projects, spawnFlight };

    const result = fleetFlightWatchdogTick(control);

    expect(result.spawned).toEqual(projects);
    expect(spawnFlight).toHaveBeenCalledTimes(2);
  });
});

describe('createFleetFlightWatchdogControl (real store)', () => {
  it('lists every registered project fresh from the store', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fleetwd-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', join(dir, 'proj-1'), 'registered');
      project(s, 'p2', join(dir, 'proj-2'), 'flying');
      s.close();

      const control = createFleetFlightWatchdogControl({ dbPath, spawnFlight: vi.fn() });
      const projects = control.listProjects();
      expect(projects.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    } finally {
      cleanupDir(dir);
    }
  });

  it('opens the store read-only — listProjects() never writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fleetwd-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      vi.mocked(openStore).mockClear();
      const control = createFleetFlightWatchdogControl({ dbPath, spawnFlight: vi.fn() });
      control.listProjects();
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });

  it('spawnFlight() forwards the project row to the injected spawner', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fleetwd-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const spawnFlight = vi.fn();
      const control = createFleetFlightWatchdogControl({ dbPath, spawnFlight });
      const p = makeProject({ id: 'p1' });
      control.spawnFlight(p);
      expect(spawnFlight).toHaveBeenCalledOnce();
      expect(spawnFlight).toHaveBeenCalledWith(p);
    } finally {
      cleanupDir(dir);
    }
  });

  it('end-to-end: fleetFlightWatchdogTick over a real store spawns only the idle project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fleetwd-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'idle', join(dir, 'idle-project'), 'registered');
      project(s, 'busy', join(dir, 'busy-project'), 'flying');
      s.close();

      const spawnFlight = vi.fn();
      const control = createFleetFlightWatchdogControl({ dbPath, spawnFlight });
      const result = fleetFlightWatchdogTick(control);

      expect(result.spawned.map((p) => p.id)).toEqual(['idle']);
      expect(spawnFlight).toHaveBeenCalledOnce();
      expect(spawnFlight).toHaveBeenCalledWith(expect.objectContaining({ id: 'idle' }));
    } finally {
      cleanupDir(dir);
    }
  });
});
