// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createSnapshot, listSnapshots, pruneSnapshots, restoreSnapshot } from '../src/snapshot.js';

async function withTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'autopilot-snapshot-'));
  try {
    return await fn(dir);
  } finally {
    try {
      // Windows may briefly hold a handle on a just-closed SQLite file
      // (WAL/shm memory-mapping teardown lags the JS close() call) — retry
      // instead of failing an otherwise-passing test on cleanup alone.
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      /* OS reaps a lingering handle later; never fail the test over cleanup */
    }
  }
}

describe('createSnapshot', () => {
  it('produces an integrity-checked, restorable copy of the live store', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'live.db');
      const backupDir = join(dir, 'backups');
      const store = openStore(dbPath);
      migrate(store);
      store.db
        .prepare(
          "INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at) VALUES ('p1', 'p1', 'p1', 'root', 'registered', 1, 1)",
        )
        .run();

      const result = await createSnapshot(store, backupDir, () => 1_700_000_000_000);
      expect(result.ok).toBe(true);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(readdirSync(backupDir)).toEqual([result.path.split(/[/\\]/).pop()]);

      const restored = join(dir, 'restored.db');
      restoreSnapshot(result.path, restored);
      const reopened = openStore(restored, { readonly: true });
      const row = reopened.db.prepare('SELECT id FROM projects').get() as { id: string };
      expect(row.id).toBe('p1');
      reopened.close();
      store.close();
    });
  });

  it('names the file from the injected clock, sortable lexically by time', async () => {
    await withTempDir(async (dir) => {
      const store = openStore(':memory:');
      migrate(store);
      const backupDir = join(dir, 'backups');
      const result = await createSnapshot(store, backupDir, () => Date.UTC(2026, 0, 2, 3, 4, 5));
      store.close();
      expect(result.ok).toBe(true);
      expect(result.path).toContain('2026-01-02');
    });
  });

  it('reports (never throws) when the backup call itself fails', async () => {
    await withTempDir(async (dir) => {
      const store = openStore(':memory:');
      migrate(store);
      const backupDir = join(dir, 'backups');
      const now = () => 1_700_000_000_000;
      // Pre-seed the exact destination path with a non-SQLite file — the
      // native backup API refuses to write over it ("file is not a
      // database"), which is the realistic shape of a backup-time failure
      // (a corrupt/foreign file already occupying the slot, a full disk,
      // permissions) — createSnapshot must surface this as ok:false, not throw.
      mkdirSync(backupDir, { recursive: true });
      const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
      const collidingPath = join(backupDir, `autopilot-${stamp}.db`);
      writeFileSync(collidingPath, 'not a sqlite file');

      const result = await createSnapshot(store, backupDir, now);
      store.close();
      expect(result.ok).toBe(false);
      expect(result.integrityError).toBeDefined();
    });
  });

  it('compacts free pages left by deleted rows, so backups do not inherit source bloat', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'live.db');
      const backupDir = join(dir, 'backups');
      const store = openStore(dbPath);
      migrate(store);
      store.db
        .prepare(
          "INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at) VALUES ('p1', 'p1', 'p1', 'root', 'registered', 1, 1)",
        )
        .run();
      // Insert-then-delete a batch of large rows: SQLite (no auto_vacuum)
      // leaves the pages those rows occupied on its internal freelist rather
      // than shrinking the file — exactly the "10 copies of a bloated DB"
      // shape EVALUATION-2026-08-27-silent-gate.md §3.8 measured live (82.1
      // MB of trigram index + 32.7 MB of never-reclaimed freelist). A plain
      // page-copy backup inherits that freelist as-is.
      const insert = store.db.prepare(
        "INSERT INTO events (project_id, type, payload, created_at) VALUES ('p1', 'bloat', ?, 1)",
      );
      const payload = 'x'.repeat(4000);
      const insertMany = store.db.transaction(() => {
        for (let i = 0; i < 500; i++) insert.run(payload);
      });
      insertMany();
      store.db.exec('DELETE FROM events');

      const result = await createSnapshot(store, backupDir, () => 1_700_000_000_000);
      store.close();
      expect(result.ok).toBe(true);

      const snapshot = new Database(result.path, { readonly: true, fileMustExist: true });
      const freelistCount = snapshot.pragma('freelist_count', { simple: true }) as number;
      snapshot.close();
      expect(freelistCount).toBe(0);
    });
  });

  it('reports (never throws) when the backup completes but fails its own integrity check', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'live.db');
      let store = openStore(dbPath);
      migrate(store);
      store.close();

      // Corrupt the on-disk header's "number of freelist pages" field (a
      // real page-level defect PRAGMA integrity_check specifically
      // validates) without touching anything sqlite_open() itself checks —
      // the file still opens fine, and Database#backup happily streams the
      // corrupt page verbatim into the copy, so this is the realistic shape
      // of "the backup succeeded but the result is bad" (disk-level bitrot
      // on the source), unlike the sibling test above where backup itself
      // is refused outright.
      const buf = readFileSync(dbPath);
      buf.writeUInt32BE(9999, 36);
      writeFileSync(dbPath, buf);

      store = openStore(dbPath);
      const backupDir = join(dir, 'backups');
      const result = await createSnapshot(store, backupDir, () => 1_700_000_000_000);
      store.close();
      expect(result.ok).toBe(false);
      expect(result.integrityError).toMatch(/freelist/i);
      // The corrupt backup file must not be left behind for a later restore
      // to pick up.
      expect(readdirSync(backupDir)).toEqual([]);
    });
  });
});

describe('pruneSnapshots', () => {
  it('keeps only the N most recent snapshots by filename order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-snapshot-'));
    try {
      const names = [
        'autopilot-2026-01-01T00-00-00-000Z.db',
        'autopilot-2026-01-02T00-00-00-000Z.db',
        'autopilot-2026-01-03T00-00-00-000Z.db',
        'not-a-snapshot.txt',
      ];
      for (const n of names) writeFileSync(join(dir, n), 'x');

      const removed = pruneSnapshots(dir, 2);
      expect(removed).toEqual([join(dir, 'autopilot-2026-01-01T00-00-00-000Z.db')]);
      expect(readdirSync(dir).sort()).toEqual(
        [
          'autopilot-2026-01-02T00-00-00-000Z.db',
          'autopilot-2026-01-03T00-00-00-000Z.db',
          'not-a-snapshot.txt',
        ].sort(),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is a no-op on a directory that does not exist yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-snapshot-'));
    rmSync(dir, { recursive: true, force: true }); // never re-created
    expect(pruneSnapshots(dir, 5)).toEqual([]);
  });
});

describe('restoreSnapshot', () => {
  it('refuses to restore a file that fails integrity_check', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-snapshot-'));
    try {
      const badSnapshot = join(dir, 'bad.db');
      writeFileSync(badSnapshot, 'not a sqlite file');
      expect(() => restoreSnapshot(badSnapshot, join(dir, 'dest.db'))).toThrow(/corrupt/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('listSnapshots', () => {
  it('lists snapshots oldest-first with their size, ignoring unrelated files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-snapshot-'));
    try {
      writeFileSync(join(dir, 'autopilot-2026-01-02T00-00-00-000Z.db'), 'bb');
      writeFileSync(join(dir, 'autopilot-2026-01-01T00-00-00-000Z.db'), 'a');
      writeFileSync(join(dir, 'not-a-snapshot.txt'), 'x');

      const result = listSnapshots(dir);
      expect(result.map((s) => s.name)).toEqual([
        'autopilot-2026-01-01T00-00-00-000Z.db',
        'autopilot-2026-01-02T00-00-00-000Z.db',
      ]);
      expect(result.map((s) => s.sizeBytes)).toEqual([1, 2]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty list for a directory that does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-snapshot-'));
    rmSync(dir, { recursive: true, force: true });
    expect(listSnapshots(dir)).toEqual([]);
  });
});
