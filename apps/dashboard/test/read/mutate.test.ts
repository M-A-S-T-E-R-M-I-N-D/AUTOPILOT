// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  openStore,
  migrate,
  proposeSoulAmendment,
  ratifySoulAmendment,
  proposeFleetWisdomAmendment,
  type Store,
} from '@autopilot/store';
import {
  ensureStoreMigrated,
  createTaskInStore,
  setTaskStatusInStore,
  deleteTaskInStore,
  markSoulReviewedInStore,
  proposeSoulAmendmentInStore,
  ratifySoulAmendmentInStore,
  unratifySoulAmendmentInStore,
  dismissSoulProposalInStore,
  ratifyFleetWisdomAmendmentInStore,
  dismissFleetWisdomProposalInStore,
  deleteProjectFromStore,
  resetProjectTelemetryInStore,
  requestFlightPauseInStore,
  isProjectPausedInStore,
  setTaskFocusInStore,
  reorderTasksInStore,
  unpinTasksInStore,
} from '../../src/read/mutate.js';
import { readFleetFromStore } from '../../src/read/source.js';

function project(
  id: string,
  slug: string,
  status: string,
  gateConfig: string | null,
  s: Store,
): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, slug, slug, `/tmp/${slug}`, status, gateConfig, 100, 100);
}

function task(
  id: string,
  projectId: string,
  title: string,
  status: string,
  focus: 0 | 1,
  s: Store,
): void {
  s.db
    .prepare(
      `INSERT INTO tasks (id, project_id, title, status, focus, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'self', ?, ?)`,
    )
    .run(id, projectId, title, status, focus, 100, 100);
}

function firing(
  projectId: string,
  firingId: string,
  item: string,
  shipped: 0 | 1,
  createdAt: number,
  s: Store,
): void {
  s.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, created_at)
       VALUES (?, ?, ?, 'feat', ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      firingId,
      item,
      `sha-${firingId}`,
      shipped,
      shipped ? 'passed' : 'reverted',
      createdAt,
    );
}

/** A valid SQLite file with none of our tables — every mutate function's
 *  try-block throws on the missing table, exercising its catch-branch degrade. */
function unmigratedDbPath(prefix: string): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(dir, 'a.db');
  openStore(dbPath).close();
  return { dir, dbPath };
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

describe('ensureStoreMigrated', () => {
  it('returns false for a missing DB and true (idempotently) for a real one', () => {
    expect(ensureStoreMigrated(join(tmpdir(), 'nope', 'missing.db'))).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), 'autopilot-mig-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(ensureStoreMigrated(dbPath)).toBe(true);
      expect(ensureStoreMigrated(dbPath)).toBe(true); // no-op second run
      // And the read path sees a healthy (empty) fleet, not a crash.
      expect(readFleetFromStore(dbPath, 1).empty).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns false when the file exists but is not a valid SQLite database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-mig-bad-'));
    const dbPath = join(dir, 'a.db');
    try {
      writeFileSync(dbPath, 'not a real sqlite database');
      expect(ensureStoreMigrated(dbPath)).toBe(false);
    } finally {
      // better-sqlite3 keeps its handle on a failed open (no Database instance
      // ever returned to close), so on Windows the file can still be briefly
      // locked here — best-effort cleanup, never fail the test over it.
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        /* best-effort temp cleanup */
      }
    }
  });
});

describe('createTaskInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      createTaskInStore(join(tmpdir(), 'ap-dash-create-missing-8821', 'missing.db'), {
        id: 't1',
        projectId: 'p1',
        title: 'Fix it',
        createdAt: 1,
      }),
    ).toBe(false);
  });

  it('adds a task to an existing project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-create-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      s.close();

      const ok = createTaskInStore(dbPath, {
        id: 't1',
        projectId: 'p1',
        title: 'Fix the bug',
        severity: 'high',
        dimension: 'cybersecurity',
        createdAt: 100,
      });
      expect(ok).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db.prepare('SELECT title, status, severity FROM tasks WHERE id = ?').get('t1');
      s2.close();
      expect(row).toEqual({ title: 'Fix the bug', status: 'queued', severity: 'high' });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false when the project does not exist (FK rejects the insert)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-create-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(
        createTaskInStore(dbPath, { id: 't1', projectId: 'nope', title: 'x', createdAt: 1 }),
      ).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-create-bad-');
    try {
      expect(
        createTaskInStore(dbPath, { id: 't1', projectId: 'p1', title: 'x', createdAt: 1 }),
      ).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('setTaskStatusInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      setTaskStatusInStore(
        join(tmpdir(), 'ap-dash-status-missing-3391', 'missing.db'),
        't1',
        'done',
        1,
      ),
    ).toBe(false);
  });

  it('moves a task to a new status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-status-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      task('t1', 'p1', 'Fix the bug', 'queued', 0, s);
      s.close();

      expect(setTaskStatusInStore(dbPath, 't1', 'done', 200)).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db.prepare('SELECT status FROM tasks WHERE id = ?').get('t1');
      s2.close();
      expect(row).toEqual({ status: 'done' });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false for an unknown task id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-status-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(setTaskStatusInStore(dbPath, 'nope', 'done', 1)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-status-bad-');
    try {
      expect(setTaskStatusInStore(dbPath, 't1', 'done', 1)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('markSoulReviewedInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      markSoulReviewedInStore(join(tmpdir(), 'ap-dash-soul-missing-6671', 'missing.db'), 'p1', 1),
    ).toBe(false);
  });

  it('marks a project SOUL reviewed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      s.close();

      expect(markSoulReviewedInStore(dbPath, 'p1', 200)).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db
        .prepare('SELECT soul_reviewed, updated_at FROM projects WHERE id = ?')
        .get('p1');
      s2.close();
      expect(row).toEqual({ soul_reviewed: 1, updated_at: 200 });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false for an unknown project id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(markSoulReviewedInStore(dbPath, 'nope', 1)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-soul-bad-');
    try {
      expect(markSoulReviewedInStore(dbPath, 'p1', 1)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('proposeSoulAmendmentInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      proposeSoulAmendmentInStore(
        join(tmpdir(), 'ap-dash-soul-propose-missing-6674', 'missing.db'),
        'p1',
        'hand-written text',
        1,
      ),
    ).toBe(false);
  });

  it('records a hand-written proposal in the pending slot without touching the live soul', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-propose-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      s.close();

      expect(proposeSoulAmendmentInStore(dbPath, 'p1', 'hand-written text', 200)).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db
        .prepare('SELECT soul, soul_proposed, soul_proposed_at FROM projects WHERE id = ?')
        .get('p1');
      s2.close();
      expect(row).toEqual({
        soul: null,
        soul_proposed: 'hand-written text',
        soul_proposed_at: 200,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false for blank text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-propose-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      s.close();
      expect(proposeSoulAmendmentInStore(dbPath, 'p1', '   ', 1)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false for an unknown project id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-propose-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(proposeSoulAmendmentInStore(dbPath, 'nope', 'text', 1)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-soul-propose-bad-');
    try {
      expect(proposeSoulAmendmentInStore(dbPath, 'p1', 'text', 1)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('ratifySoulAmendmentInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      ratifySoulAmendmentInStore(
        join(tmpdir(), 'ap-dash-soul-ratify-missing-6672', 'missing.db'),
        'p1',
        1,
      ),
    ).toBe(false);
  });

  it('applies the pending proposal as the live SOUL and marks it reviewed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-ratify-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      proposeSoulAmendment(s, 'p1', 'proposed soul text', 100);
      s.close();

      expect(ratifySoulAmendmentInStore(dbPath, 'p1', 200)).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db
        .prepare('SELECT soul, soul_reviewed, soul_proposed, updated_at FROM projects WHERE id = ?')
        .get('p1');
      s2.close();
      expect(row).toEqual({
        soul: 'proposed soul text',
        soul_reviewed: 1,
        soul_proposed: null,
        updated_at: 200,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false when there is no pending proposal to ratify', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-ratify-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      s.close();
      expect(ratifySoulAmendmentInStore(dbPath, 'p1', 1)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-soul-ratify-bad-');
    try {
      expect(ratifySoulAmendmentInStore(dbPath, 'p1', 1)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('unratifySoulAmendmentInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      unratifySoulAmendmentInStore(
        join(tmpdir(), 'ap-dash-soul-unratify-missing-6674', 'missing.db'),
        'p1',
        1,
      ),
    ).toBe(false);
  });

  it('restores the SOUL text a ratify overwrote and clears the snapshot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-unratify-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      proposeSoulAmendment(s, 'p1', 'first soul text', 100);
      ratifySoulAmendment(s, 'p1', 200);
      proposeSoulAmendment(s, 'p1', 'second soul text', 300);
      ratifySoulAmendment(s, 'p1', 400);
      s.close();

      expect(unratifySoulAmendmentInStore(dbPath, 'p1', 500)).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db
        .prepare(
          'SELECT soul, soul_previous, soul_previous_at, updated_at FROM projects WHERE id = ?',
        )
        .get('p1');
      s2.close();
      expect(row).toEqual({
        soul: 'first soul text',
        soul_previous: null,
        soul_previous_at: null,
        updated_at: 500,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false when there is nothing to undo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-unratify-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      s.close();
      expect(unratifySoulAmendmentInStore(dbPath, 'p1', 1)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-soul-unratify-bad-');
    try {
      expect(unratifySoulAmendmentInStore(dbPath, 'p1', 1)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('dismissSoulProposalInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      dismissSoulProposalInStore(
        join(tmpdir(), 'ap-dash-soul-dismiss-missing-6673', 'missing.db'),
        'p1',
        1,
      ),
    ).toBe(false);
  });

  it('clears the pending proposal without touching soul or soul_reviewed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-dismiss-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      proposeSoulAmendment(s, 'p1', 'proposed soul text', 100);
      s.close();

      expect(dismissSoulProposalInStore(dbPath, 'p1', 200)).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db
        .prepare('SELECT soul, soul_reviewed, soul_proposed, updated_at FROM projects WHERE id = ?')
        .get('p1');
      s2.close();
      expect(row).toEqual({ soul: null, soul_reviewed: 0, soul_proposed: null, updated_at: 200 });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false when there is no pending proposal to dismiss', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-soul-dismiss-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      s.close();
      expect(dismissSoulProposalInStore(dbPath, 'p1', 1)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-soul-dismiss-bad-');
    try {
      expect(dismissSoulProposalInStore(dbPath, 'p1', 1)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('ratifyFleetWisdomAmendmentInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      ratifyFleetWisdomAmendmentInStore(
        join(tmpdir(), 'ap-dash-fleet-wisdom-ratify-missing-6675', 'missing.db'),
      ),
    ).toBe(false);
  });

  it('applies the pending proposal as the live wisdom text and clears the slot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fleet-wisdom-ratify-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      proposeFleetWisdomAmendment(s, 'checkpoint pattern confirmed fleet-wide', 100);
      s.close();

      expect(ratifyFleetWisdomAmendmentInStore(dbPath)).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db
        .prepare(`SELECT wisdom, wisdom_proposed, wisdom_proposed_at FROM fleet WHERE id = 'fleet'`)
        .get();
      s2.close();
      expect(row).toEqual({
        wisdom: 'checkpoint pattern confirmed fleet-wide',
        wisdom_proposed: null,
        wisdom_proposed_at: null,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false when there is no pending proposal to ratify', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fleet-wisdom-ratify-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(ratifyFleetWisdomAmendmentInStore(dbPath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-fleet-wisdom-ratify-bad-');
    try {
      expect(ratifyFleetWisdomAmendmentInStore(dbPath)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('dismissFleetWisdomProposalInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      dismissFleetWisdomProposalInStore(
        join(tmpdir(), 'ap-dash-fleet-wisdom-dismiss-missing-6676', 'missing.db'),
      ),
    ).toBe(false);
  });

  it('clears the pending proposal without touching the live wisdom text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fleet-wisdom-dismiss-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      proposeFleetWisdomAmendment(s, 'checkpoint pattern confirmed fleet-wide', 100);
      s.close();

      expect(dismissFleetWisdomProposalInStore(dbPath)).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db
        .prepare(`SELECT wisdom, wisdom_proposed, wisdom_proposed_at FROM fleet WHERE id = 'fleet'`)
        .get();
      s2.close();
      expect(row).toEqual({ wisdom: '', wisdom_proposed: null, wisdom_proposed_at: null });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false when there is no pending proposal to dismiss', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-fleet-wisdom-dismiss-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(dismissFleetWisdomProposalInStore(dbPath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-fleet-wisdom-dismiss-bad-');
    try {
      expect(dismissFleetWisdomProposalInStore(dbPath)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('deleteTaskInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      deleteTaskInStore(join(tmpdir(), 'ap-dash-del-task-missing-4471', 'missing.db'), 't1'),
    ).toBe(false);
  });

  it('removes an existing task', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-del-task-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      task('t1', 'p1', 'Fix the bug', 'queued', 0, s);
      s.close();

      expect(deleteTaskInStore(dbPath, 't1')).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db.prepare('SELECT 1 FROM tasks WHERE id = ?').get('t1');
      s2.close();
      expect(row).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false for an unknown task id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-del-task-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(deleteTaskInStore(dbPath, 'nope')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-del-task-bad-');
    try {
      expect(deleteTaskInStore(dbPath, 't1')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('deleteProjectFromStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      deleteProjectFromStore(join(tmpdir(), 'ap-dash-del-proj-missing-5561', 'missing.db'), 'p1'),
    ).toBe(false);
  });

  it('removes an existing project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-del-proj-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      s.close();

      expect(deleteProjectFromStore(dbPath, 'p1')).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db.prepare('SELECT 1 FROM projects WHERE id = ?').get('p1');
      s2.close();
      expect(row).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false for an unknown project id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-del-proj-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(deleteProjectFromStore(dbPath, 'nope')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-del-proj-bad-');
    try {
      expect(deleteProjectFromStore(dbPath, 'p1')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('resetProjectTelemetryInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      resetProjectTelemetryInStore(
        join(tmpdir(), 'ap-dash-reset-missing-6671', 'missing.db'),
        'p1',
      ),
    ).toBe(false);
  });

  it('wipes metrics + events but keeps the project and its board', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-reset-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      task('t1', 'p1', 'Fix the bug', 'queued', 0, s);
      firing('p1', 'p1:firing-1', 'AP-1', 1, 100, s);
      s.close();

      expect(resetProjectTelemetryInStore(dbPath, 'p1')).toBe(true);

      const s2 = openStore(dbPath);
      const metrics = s2.db.prepare('SELECT 1 FROM metrics WHERE project_id = ?').all('p1');
      const proj = s2.db.prepare('SELECT 1 FROM projects WHERE id = ?').get('p1');
      const taskRow = s2.db.prepare('SELECT 1 FROM tasks WHERE id = ?').get('t1');
      s2.close();
      expect(metrics).toEqual([]);
      expect(proj).toBeDefined();
      expect(taskRow).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false for an unknown project id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-reset-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(resetProjectTelemetryInStore(dbPath, 'nope')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-reset-bad-');
    try {
      expect(resetProjectTelemetryInStore(dbPath, 'p1')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('requestFlightPauseInStore / isProjectPausedInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      requestFlightPauseInStore(
        join(tmpdir(), 'ap-dash-pause-missing-7781', 'missing.db'),
        '/tmp/a',
      ),
    ).toBe(false);
    expect(
      isProjectPausedInStore(join(tmpdir(), 'ap-dash-pause-missing-7781', 'missing.db'), '/tmp/a'),
    ).toBe(false);
  });

  it('records the request, and reflects status once the flight honors it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-pause-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      s.close();

      expect(requestFlightPauseInStore(dbPath, '/tmp/alpha')).toBe(true);
      // Requested, but the flight hasn't landed on 'paused' yet.
      expect(isProjectPausedInStore(dbPath, '/tmp/alpha')).toBe(false);

      const s2 = openStore(dbPath);
      s2.db.prepare("UPDATE projects SET status = 'paused' WHERE id = 'p1'").run();
      s2.close();
      expect(isProjectPausedInStore(dbPath, '/tmp/alpha')).toBe(true);
    } finally {
      cleanupDir(dir);
    }
  });

  it('returns false for a folder with no matching project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-pause-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      expect(requestFlightPauseInStore(dbPath, '/tmp/ghost')).toBe(false);
      expect(isProjectPausedInStore(dbPath, '/tmp/ghost')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-pause-bad-');
    try {
      expect(requestFlightPauseInStore(dbPath, '/tmp/alpha')).toBe(false);
      expect(isProjectPausedInStore(dbPath, '/tmp/alpha')).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('setTaskFocusInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      setTaskFocusInStore(
        join(tmpdir(), 'ap-dash-focus-missing-7781', 'missing.db'),
        't1',
        true,
        1,
      ),
    ).toBe(false);
  });

  it('locks focus onto a workable task', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-focus-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      task('t1', 'p1', 'Fix the bug', 'queued', 0, s);
      s.close();

      expect(setTaskFocusInStore(dbPath, 't1', true, 200)).toBe(true);

      const s2 = openStore(dbPath);
      const row = s2.db.prepare('SELECT focus FROM tasks WHERE id = ?').get('t1');
      s2.close();
      expect(row).toEqual({ focus: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('refuses to force focus onto a task that is already done', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-focus-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      task('t1', 'p1', 'Fix the bug', 'done', 0, s);
      s.close();

      setTaskFocusInStore(dbPath, 't1', true, 200);

      const s2 = openStore(dbPath);
      const row = s2.db.prepare('SELECT focus FROM tasks WHERE id = ?').get('t1');
      s2.close();
      expect(row).toEqual({ focus: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-focus-bad-');
    try {
      expect(setTaskFocusInStore(dbPath, 't1', true, 1)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('reorderTasksInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      reorderTasksInStore(
        join(tmpdir(), 'ap-dash-reorder-missing-8891', 'missing.db'),
        'p1',
        ['t1'],
        1,
      ),
    ).toBe(false);
  });

  it('applies the operator ordering as task priority', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-reorder-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      task('t1', 'p1', 'First', 'queued', 0, s);
      task('t2', 'p1', 'Second', 'queued', 0, s);
      s.close();

      expect(reorderTasksInStore(dbPath, 'p1', ['t2', 't1'], 300)).toBe(true);

      const s2 = openStore(dbPath);
      const rows = s2.db
        .prepare(
          'SELECT id, priority, priority_pinned FROM tasks WHERE project_id = ? ORDER BY priority',
        )
        .all('p1');
      s2.close();
      // priority_pinned = 1: this is the operator's OWN reorder path — the
      // only caller reachable from `/api/task/reorder` — so takeoff triage
      // must leave these positions alone (web-mt1bwkrf-v5pnx2).
      expect(rows).toEqual([
        { id: 't2', priority: 0, priority_pinned: 1 },
        { id: 't1', priority: 1, priority_pinned: 1 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false when no listed id belongs to the project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-reorder-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      s.close();
      expect(reorderTasksInStore(dbPath, 'p1', ['nope'], 1)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-reorder-bad-');
    try {
      expect(reorderTasksInStore(dbPath, 'p1', ['t1'], 1)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('unpinTasksInStore', () => {
  it('returns false when the DB file does not exist', () => {
    expect(
      unpinTasksInStore(
        join(tmpdir(), 'ap-dash-unpin-missing-9912', 'missing.db'),
        'p1',
        ['t1'],
        1,
      ),
    ).toBe(false);
  });

  it('releases pins on the given tasks without touching priority', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-unpin-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      task('t1', 'p1', 'First', 'queued', 0, s);
      task('t2', 'p1', 'Second', 'queued', 0, s);
      s.db.prepare('UPDATE tasks SET priority = ?, priority_pinned = 1 WHERE id = ?').run(0, 't1');
      s.db.prepare('UPDATE tasks SET priority = ?, priority_pinned = 1 WHERE id = ?').run(1, 't2');
      s.close();

      expect(unpinTasksInStore(dbPath, 'p1', ['t1'], 300)).toBe(true);

      const s2 = openStore(dbPath);
      const rows = s2.db
        .prepare('SELECT id, priority, priority_pinned FROM tasks WHERE project_id = ? ORDER BY id')
        .all('p1');
      s2.close();
      expect(rows).toEqual([
        { id: 't1', priority: 0, priority_pinned: 0 },
        { id: 't2', priority: 1, priority_pinned: 1 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('returns false when none of the listed ids were pinned', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-unpin-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      project('p1', 'alpha', 'flying', null, s);
      task('t1', 'p1', 'First', 'queued', 0, s);
      s.close();
      expect(unpinTasksInStore(dbPath, 'p1', ['t1'], 1)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('degrades to false when the store throws (unmigrated DB)', () => {
    const { dir, dbPath } = unmigratedDbPath('ap-dash-unpin-bad-');
    try {
      expect(unpinTasksInStore(dbPath, 'p1', ['t1'], 1)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });
});
