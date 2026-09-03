// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { openStore, migrate } from '@autopilot/store';
import { SqliteProjectStore } from '../../src/adapters/sqlite-project-store.js';
import { taskIdSource } from '../../src/onboard/task-id.js';
import type { BoardTask } from '../../src/onboard/types.js';

/** Overrides `process.platform` for one call, then restores it — same seam
 *  apps/dashboard/test/paths.test.ts uses to exercise both branches of a
 *  win32-conditional regardless of the host OS running the suite. */
function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  }
}

describe('SqliteProjectStore', () => {
  it('registers a project and finds it by root', () => {
    const store = openStore(':memory:');
    migrate(store);
    const ps = new SqliteProjectStore(
      store,
      () => 'task-1',
      () => 1000,
    );

    expect(ps.findByRoot('/repo')).toBeNull();
    ps.register({
      id: 'p1',
      slug: 'r',
      name: 'R',
      rootPath: '/repo',
      soul: 'SOUL',
      gateConfig: '{"ecosystem":"js"}',
      backlogPath: 'docs/BACKLOG-999.md',
    });

    expect(ps.findByRoot('/repo')).toMatchObject({
      id: 'p1',
      slug: 'r',
      name: 'R',
      rootPath: '/repo',
      status: 'registered',
      soul: 'SOUL',
      backlogPath: 'docs/BACKLOG-999.md',
    });
    store.close();
  });

  it('records the backup refs into the versions projection (idempotent)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const ps = new SqliteProjectStore(
      store,
      () => 'task-1',
      () => 1000,
    );
    ps.register({
      id: 'p1',
      slug: 'r',
      name: 'R',
      rootPath: '/repo',
      soul: '',
      gateConfig: '{}',
      backlogPath: null,
    });

    const refs = { myth: 'autopilot/myth', legacy: 'autopilot/legacy', flight: 'autopilot/flight' };
    ps.recordBackup('p1', refs);
    ps.recordBackup('p1', refs); // idempotent — no duplicate rows

    const rows = store.db
      .prepare('SELECT tier, ref FROM versions WHERE project_id = ? ORDER BY tier')
      .all('p1') as { tier: string; ref: string }[];
    expect(rows).toEqual([
      { tier: 'flight', ref: 'autopilot/flight' },
      { tier: 'legacy', ref: 'autopilot/legacy' },
      { tier: 'myth', ref: 'autopilot/myth' },
    ]);
    store.close();
  });

  it('seeds the board into the tasks table (optional severity/dimension)', () => {
    const store = openStore(':memory:');
    migrate(store);
    let n = 0;
    const ps = new SqliteProjectStore(
      store,
      () => `task-${++n}`,
      () => 1000,
    );
    ps.register({
      id: 'p1',
      slug: 'r',
      name: 'R',
      rootPath: '/repo',
      soul: '',
      gateConfig: '{}',
      backlogPath: null,
    });
    ps.seedBoard('p1', [
      { title: 'Orient', body: 'do it', source: 'self' },
      { title: 'Fix', source: 'repo', severity: 'high', dimension: 'cybersecurity' },
    ]);

    const rows = store.db
      .prepare(
        'SELECT title, status, source, severity, dimension FROM tasks WHERE project_id = ? ORDER BY title',
      )
      .all('p1') as {
      title: string;
      status: string;
      source: string;
      severity: string | null;
      dimension: string | null;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: 'Fix',
      status: 'queued',
      source: 'repo',
      severity: 'high',
    });
    expect(rows[1]).toMatchObject({
      title: 'Orient',
      source: 'self',
      severity: null,
      dimension: null,
    });
    store.close();
  });

  it('uses real randomUUID()/Date.now() defaults when no overrides are supplied', () => {
    const store = openStore(':memory:');
    migrate(store);
    const ps = new SqliteProjectStore(store); // no newTaskId/now overrides

    const before = Date.now();
    ps.register({
      id: 'p1',
      slug: 'r',
      name: 'R',
      rootPath: '/repo',
      soul: '',
      gateConfig: '{}',
      backlogPath: null,
    });
    ps.seedBoard('p1', [{ title: 'Orient', source: 'self' }]);

    const row = store.db
      .prepare('SELECT id, created_at FROM tasks WHERE project_id = ?')
      .get('p1') as { id: string; created_at: number };
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(row.created_at).toBeGreaterThanOrEqual(before);
    store.close();
  });

  it('seeds a SECOND project into the same store without id collisions (the second-project crash)', () => {
    // Regression: each fly run injected a fresh `task-${counter}` generator,
    // so the first project ever seeded owned `task-1` forever and the next
    // project's seed crashed with `UNIQUE constraint failed: tasks.id`.
    // Each run gets its own independently-created source, like real fly runs.
    const store = openStore(':memory:');
    migrate(store);
    const board: BoardTask[] = [
      { title: 'Orient', source: 'self' },
      { title: 'Fix', source: 'repo' },
    ];

    const firstRun = new SqliteProjectStore(store, taskIdSource('task'));
    firstRun.register({
      id: 'fly-autopilot',
      slug: 'autopilot',
      name: 'AUTOPILOT',
      rootPath: '/a',
      soul: '',
      gateConfig: '{}',
      backlogPath: null,
    });
    firstRun.seedBoard('fly-autopilot', board);

    const secondRun = new SqliteProjectStore(store, taskIdSource('task'));
    secondRun.register({
      id: 'fly-second',
      slug: 'second',
      name: 'Second',
      rootPath: '/b',
      soul: '',
      gateConfig: '{}',
      backlogPath: null,
    });
    expect(() => secondRun.seedBoard('fly-second', board)).not.toThrow();

    const count = store.db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number };
    expect(count.n).toBe(4);
    store.close();
  });

  it('finds a registered project by root path despite a differently-cased Windows drive letter (win32 only; found live 08-27 at ramp launch, web-mtbaagfd-iylna0)', () => {
    // A bare `resolve()` on the incoming folder arg preserves whatever drive-
    // letter casing the caller passed — it does not normalize it. NTFS paths
    // are case-insensitive, so `C:\\Users\\operator\\project` and
    // `c:\\Users\\operator\\project` are the SAME project; an exact-string
    // findByRoot missed the resume and onboard() minted a second project with
    // the same slug, crashing on the UNIQUE constraint.
    const store = openStore(':memory:');
    migrate(store);
    const ps = new SqliteProjectStore(
      store,
      () => 'task-1',
      () => 1000,
    );
    ps.register({
      id: 'p1',
      slug: 'r',
      name: 'R',
      rootPath: 'C:\\Users\\operator\\project',
      soul: '',
      gateConfig: '{}',
      backlogPath: null,
    });

    withPlatform('win32', () => {
      expect(ps.findByRoot('c:\\Users\\operator\\project')).toMatchObject({ id: 'p1' });
    });
    // Off win32, a differently-cased path is a genuinely different directory
    // on a case-sensitive filesystem — must NOT be folded together.
    withPlatform('linux', () => {
      expect(ps.findByRoot('c:\\Users\\operator\\project')).toBeNull();
    });
    store.close();
  });
});
