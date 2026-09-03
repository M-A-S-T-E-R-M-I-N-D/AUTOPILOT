// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, type Store, type ProjectRow } from '@autopilot/store';
import {
  reconcileOrphanedFlights,
  createBootReconcileControl,
  type BootReconcileControl,
} from '../../src/control/boot-reconcile.js';
import { engineLockFileName, deriveFlyProjectId } from '../../src/flight/lock.js';

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

describe('reconcileOrphanedFlights (pure)', () => {
  it('reconciles a "flying" project whose owner is confirmed dead', () => {
    const p = { id: 'p1', status: 'flying' } as ProjectRow;
    const reconcile = vi.fn();
    const control: BootReconcileControl = {
      listProjects: () => [p],
      ownerAlive: () => false,
      reconcile,
    };
    const result = reconcileOrphanedFlights(control);
    expect(result.reconciled).toEqual([p]);
    expect(result.stillAlive).toEqual([]);
    expect(reconcile).toHaveBeenCalledExactlyOnceWith(p);
  });

  it('leaves a "flying" project untouched when its owner is still alive', () => {
    const p = { id: 'p1', status: 'flying' } as ProjectRow;
    const reconcile = vi.fn();
    const control: BootReconcileControl = {
      listProjects: () => [p],
      ownerAlive: () => true,
      reconcile,
    };
    const result = reconcileOrphanedFlights(control);
    expect(result.reconciled).toEqual([]);
    expect(result.stillAlive).toEqual([p]);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it.each(['registered', 'paused', 'hibernating', 'needs_you'] as const)(
    'never checks or touches a non-"flying" project (status %s)',
    (status) => {
      const p = { id: 'p1', status } as ProjectRow;
      const ownerAlive = vi.fn();
      const reconcile = vi.fn();
      const control: BootReconcileControl = { listProjects: () => [p], ownerAlive, reconcile };
      const result = reconcileOrphanedFlights(control);
      expect(result).toEqual({ reconciled: [], stillAlive: [] });
      expect(ownerAlive).not.toHaveBeenCalled();
      expect(reconcile).not.toHaveBeenCalled();
    },
  );

  it('reconciles across the whole fleet in one pass, independently per project', () => {
    const dead = { id: 'dead', status: 'flying' } as ProjectRow;
    const alive = { id: 'alive', status: 'flying' } as ProjectRow;
    const idle = { id: 'idle', status: 'registered' } as ProjectRow;
    const reconcile = vi.fn();
    const control: BootReconcileControl = {
      listProjects: () => [dead, alive, idle],
      ownerAlive: (p) => p.id === 'alive',
      reconcile,
    };
    const result = reconcileOrphanedFlights(control);
    expect(result.reconciled).toEqual([dead]);
    expect(result.stillAlive).toEqual([alive]);
    expect(reconcile).toHaveBeenCalledExactlyOnceWith(dead);
  });
});

describe('createBootReconcileControl (real store)', () => {
  it('lists every project regardless of status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-boot-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', join(dir, 'p1'), 'flying');
      project(s, 'p2', join(dir, 'p2'), 'registered');
      s.close();

      const control = createBootReconcileControl(dbPath);
      const ids = control.listProjects().map((p) => p.id);
      expect(ids).toContain('p1');
      expect(ids).toContain('p2');
    } finally {
      cleanupDir(dir);
    }
  });

  it('ownerAlive() is false when no engine lock file exists for the project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-boot-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const control = createBootReconcileControl(dbPath);
      expect(control.ownerAlive({ root_path: target } as ProjectRow)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('ownerAlive() is true when the engine lock records a live pid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-boot-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const lockPath = join(dir, engineLockFileName(deriveFlyProjectId(target)));
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));

      const control = createBootReconcileControl(dbPath);
      expect(control.ownerAlive({ root_path: target } as ProjectRow)).toBe(true);
    } finally {
      cleanupDir(dir);
    }
  });

  it('reconcile() flips the project status back to "registered"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-boot-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', target, 'flying');
      s.close();

      const control = createBootReconcileControl(dbPath);
      control.reconcile({ id: 'p1' } as ProjectRow);

      const check = openStore(dbPath, { readonly: true });
      const row = check.db.prepare('SELECT status FROM projects WHERE id = ?').get('p1') as {
        status: string;
      };
      check.close();
      expect(row.status).toBe('registered');
    } finally {
      cleanupDir(dir);
    }
  });

  it('end-to-end: a project abandoned by a dead flight is reset to "registered"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-boot-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', target, 'flying');
      s.close();

      const lockPath = join(dir, engineLockFileName(deriveFlyProjectId(target)));
      writeFileSync(lockPath, JSON.stringify({ pid: 999_999_999, startedAt: Date.now() }));

      const result = reconcileOrphanedFlights(createBootReconcileControl(dbPath));
      expect(result.reconciled.map((p) => p.id)).toEqual(['p1']);
      expect(result.stillAlive).toEqual([]);

      const check = openStore(dbPath, { readonly: true });
      const row = check.db.prepare('SELECT status FROM projects WHERE id = ?').get('p1') as {
        status: string;
      };
      check.close();
      expect(row.status).toBe('registered');
    } finally {
      cleanupDir(dir);
    }
  });

  it('end-to-end: a genuinely-flying project is left untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-boot-'));
    const dbPath = join(dir, 'a.db');
    const target = join(dir, 'my-project');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', target, 'flying');
      s.close();

      const lockPath = join(dir, engineLockFileName(deriveFlyProjectId(target)));
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));

      const result = reconcileOrphanedFlights(createBootReconcileControl(dbPath));
      expect(result.reconciled).toEqual([]);
      expect(result.stillAlive.map((p) => p.id)).toEqual(['p1']);

      const check = openStore(dbPath, { readonly: true });
      const row = check.db.prepare('SELECT status FROM projects WHERE id = ?').get('p1') as {
        status: string;
      };
      check.close();
      expect(row.status).toBe('flying');
    } finally {
      cleanupDir(dir);
    }
  });
});
