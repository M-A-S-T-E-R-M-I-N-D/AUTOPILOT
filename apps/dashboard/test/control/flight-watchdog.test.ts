// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, type Store, type ProjectRow } from '@autopilot/store';
import type * as AutopilotStore from '@autopilot/store';
import {
  flightWatchdogTick,
  createFlightWatchdogControl,
  canSpawnFlight,
  type FlightWatchdogControl,
} from '../../src/control/flight-watchdog.js';
import { engineLockFileName, deriveFlyProjectId } from '../../src/flight/lock.js';

vi.mock('@autopilot/store', async (importOriginal) => {
  const actual = await importOriginal<typeof AutopilotStore>();
  return { ...actual, openStore: vi.fn(actual.openStore) };
});

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

describe('flightWatchdogTick (pure)', () => {
  it('spawns when the project was never onboarded (status null)', () => {
    const spawnFlight = vi.fn();
    const control: FlightWatchdogControl = { projectStatus: () => null, spawnFlight };
    const result = flightWatchdogTick(control);
    expect(result).toEqual({ spawned: true, status: null });
    expect(spawnFlight).toHaveBeenCalledOnce();
  });

  it('spawns when the project is idle (registered)', () => {
    const spawnFlight = vi.fn();
    const control: FlightWatchdogControl = { projectStatus: () => 'registered', spawnFlight };
    const result = flightWatchdogTick(control);
    expect(result).toEqual({ spawned: true, status: 'registered' });
    expect(spawnFlight).toHaveBeenCalledOnce();
  });

  it('does not spawn when a flight is already flying', () => {
    const spawnFlight = vi.fn();
    const control: FlightWatchdogControl = { projectStatus: () => 'flying', spawnFlight };
    const result = flightWatchdogTick(control);
    expect(result).toEqual({ spawned: false, status: 'flying' });
    expect(spawnFlight).not.toHaveBeenCalled();
  });

  it('does not spawn over an explicit operator pause (Resume must be the one to clear it)', () => {
    const spawnFlight = vi.fn();
    const control: FlightWatchdogControl = { projectStatus: () => 'paused', spawnFlight };
    const result = flightWatchdogTick(control);
    expect(result.spawned).toBe(false);
    expect(spawnFlight).not.toHaveBeenCalled();
  });

  it.each(['hibernating', 'needs_you'] as const)(
    'does not spawn over reserved status %s',
    (status) => {
      const spawnFlight = vi.fn();
      const control: FlightWatchdogControl = { projectStatus: () => status, spawnFlight };
      const result = flightWatchdogTick(control);
      expect(result.spawned).toBe(false);
      expect(spawnFlight).not.toHaveBeenCalled();
    },
  );

  it('reconciles a stuck "flying" status when the recorded owner is no longer alive', () => {
    // A flight that died ungracefully (SIGKILL, host reboot) never reaches its
    // own `finally` block (fly.ts) that flips status off 'flying' — without
    // this reconciliation the project would stay 'flying' forever, since
    // FLYABLE_STATUSES excludes it unconditionally.
    const spawnFlight = vi.fn();
    const control: FlightWatchdogControl = {
      projectStatus: () => 'flying',
      flyingOwnerAlive: () => false,
      spawnFlight,
    };
    const result = flightWatchdogTick(control);
    expect(result).toEqual({ spawned: true, status: 'flying' });
    expect(spawnFlight).toHaveBeenCalledOnce();
  });

  it('leaves a genuinely-flying project alone when flyingOwnerAlive reports true', () => {
    const spawnFlight = vi.fn();
    const control: FlightWatchdogControl = {
      projectStatus: () => 'flying',
      flyingOwnerAlive: () => true,
      spawnFlight,
    };
    const result = flightWatchdogTick(control);
    expect(result).toEqual({ spawned: false, status: 'flying' });
    expect(spawnFlight).not.toHaveBeenCalled();
  });
});

describe('createFlightWatchdogControl (real store)', () => {
  it('reads null for a folder that was never onboarded', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fwd-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const control = createFlightWatchdogControl({
        dbPath,
        targetFolder: join(dir, 'nonexistent-project'),
        spawnFlight: vi.fn() as never,
        firings: 1,
        budgetUsd: 1,
      });
      expect(control.projectStatus()).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('reads the matching project row status by resolved root_path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fwd-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', target, 'flying');
      s.close();

      const control = createFlightWatchdogControl({
        dbPath,
        targetFolder: target,
        spawnFlight: vi.fn() as never,
        firings: 1,
        budgetUsd: 1,
      });
      expect(control.projectStatus()).toBe('flying');
    } finally {
      cleanupDir(dir);
    }
  });

  it('opens the store read-only — projectStatus() never writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fwd-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      vi.mocked(openStore).mockClear();
      const control = createFlightWatchdogControl({
        dbPath,
        targetFolder: join(dir, 'nonexistent-project'),
        spawnFlight: vi.fn() as never,
        firings: 1,
        budgetUsd: 1,
      });
      control.projectStatus();
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });

  it('spawnFlight() forwards the configured folder/firings/budget', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fwd-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const spawnFlight = vi.fn();
      const control = createFlightWatchdogControl({
        dbPath,
        targetFolder: target,
        spawnFlight,
        firings: 3,
        budgetUsd: 2.5,
        totalBudgetUsd: 10,
      });
      control.spawnFlight();
      expect(spawnFlight).toHaveBeenCalledWith(target, 3, 2.5, 10);
    } finally {
      cleanupDir(dir);
    }
  });

  it('flyingOwnerAlive() is false when no engine lock file exists for the project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fwd-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const control = createFlightWatchdogControl({
        dbPath,
        targetFolder: target,
        spawnFlight: vi.fn() as never,
        firings: 1,
        budgetUsd: 1,
      });
      expect(control.flyingOwnerAlive?.()).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('flyingOwnerAlive() is false when the engine lock records a pid that is no longer alive', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fwd-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const lockPath = join(dir, engineLockFileName(deriveFlyProjectId(target)));
      writeFileSync(lockPath, JSON.stringify({ pid: 999_999_999, startedAt: Date.now() }));

      const control = createFlightWatchdogControl({
        dbPath,
        targetFolder: target,
        spawnFlight: vi.fn() as never,
        firings: 1,
        budgetUsd: 1,
      });
      expect(control.flyingOwnerAlive?.()).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('flyingOwnerAlive() is true when the engine lock records a live pid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fwd-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const lockPath = join(dir, engineLockFileName(deriveFlyProjectId(target)));
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));

      const control = createFlightWatchdogControl({
        dbPath,
        targetFolder: target,
        spawnFlight: vi.fn() as never,
        firings: 1,
        budgetUsd: 1,
      });
      expect(control.flyingOwnerAlive?.()).toBe(true);
    } finally {
      cleanupDir(dir);
    }
  });

  it('end-to-end: reconciles a "flying" project abandoned by a dead flight (host reboot / SIGKILL)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fwd-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', target, 'flying');
      s.close();

      const lockPath = join(dir, engineLockFileName(deriveFlyProjectId(target)));
      writeFileSync(lockPath, JSON.stringify({ pid: 999_999_999, startedAt: Date.now() }));

      const spawnFlight = vi.fn();
      const control = createFlightWatchdogControl({
        dbPath,
        targetFolder: target,
        spawnFlight,
        firings: 1,
        budgetUsd: 1,
      });

      const result = flightWatchdogTick(control);
      expect(result).toEqual({ spawned: true, status: 'flying' });
      expect(spawnFlight).toHaveBeenCalledOnce();
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('canSpawnFlight (pure guard)', () => {
  it('allows spawning when the server is running and nothing else is in flight', () => {
    expect(
      canSpawnFlight({ serverRunning: true, spawnedFlightRunning: false, landInProgress: false }),
    ).toBe(true);
  });

  it('refuses to spawn while the server is not confirmed running', () => {
    expect(
      canSpawnFlight({ serverRunning: false, spawnedFlightRunning: false, landInProgress: false }),
    ).toBe(false);
  });

  it('refuses to spawn while a previously-spawned flight is still running', () => {
    expect(
      canSpawnFlight({ serverRunning: true, spawnedFlightRunning: true, landInProgress: false }),
    ).toBe(false);
  });

  it('refuses to spawn while a landing tick is mid checkout/merge against the same repo', () => {
    // GitVcs.land() checks the base branch out, merges, then checks the
    // flight branch back out — a flight spawned into that window would
    // start work against whichever branch happens to be checked out at
    // that instant. Landing must finish (or abort) before a new flight
    // touches the same working tree.
    expect(
      canSpawnFlight({ serverRunning: true, spawnedFlightRunning: false, landInProgress: true }),
    ).toBe(false);
  });
});
