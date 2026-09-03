// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSnapshot, migrate, openStore } from '@autopilot/store';
import { runRestore } from '../src/restore.js';
import { DB_ENV_VAR } from '../src/read/config.js';

async function withTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'ap-restore-'));
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

/** Produce a real, integrity-checkable snapshot file in `backupDir` — restoreSnapshot
 *  opens it as an actual SQLite database, so a placeholder file won't do. */
async function makeSnapshot(backupDir: string, createdAt: number): Promise<string> {
  const store = openStore(':memory:');
  migrate(store);
  const result = await createSnapshot(store, backupDir, () => createdAt);
  store.close();
  if (!result.ok) throw new Error(`test setup: snapshot failed (${result.integrityError})`);
  return result.path.split(/[\\/]/).pop() as string;
}

function collectLog(): { log: (line: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (line: string) => lines.push(line), lines };
}

describe('runRestore', () => {
  it('reports no snapshots found and exits 1 when the backup dir has none', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'store.db');
      const { log, lines } = collectLog();
      const code = await runRestore({ dbPath, argv: [], log });
      expect(code).toBe(1);
      expect(lines[0]).toContain('no snapshots found');
    });
  });

  it('with no argument, lists available snapshots oldest-first and exits 0 without touching the store', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'store.db');
      const backupDir = join(dir, 'backups');
      const older = await makeSnapshot(backupDir, 1_700_000_000_000);
      const newer = await makeSnapshot(backupDir, 1_700_000_100_000);

      const { log, lines } = collectLog();
      const code = await runRestore({ dbPath, argv: [], log });

      expect(code).toBe(0);
      expect(lines[0]).toContain('usage:');
      const listed = lines.slice(2);
      expect(listed[0]).toContain(older);
      expect(listed[1]).toContain(newer);
      expect(existsSync(dbPath)).toBe(false);
    });
  });

  it('reports an unresolvable snapshot name, lists what is available, and exits 1', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'store.db');
      const backupDir = join(dir, 'backups');
      await makeSnapshot(backupDir, 1_700_000_000_000);

      const { log, lines } = collectLog();
      const code = await runRestore({ dbPath, argv: ['does-not-exist.db'], log });

      expect(code).toBe(1);
      expect(lines[0]).toBe('snapshot not found: does-not-exist.db');
    });
  });

  it("resolves 'latest' to the newest snapshot and restores it", async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'store.db');
      const backupDir = join(dir, 'backups');
      await makeSnapshot(backupDir, 1_700_000_000_000);
      const newest = await makeSnapshot(backupDir, 1_700_000_100_000);

      const { log, lines } = collectLog();
      const code = await runRestore({
        dbPath,
        argv: ['latest'],
        log,
        now: () => 1_700_000_200_000,
      });

      expect(code).toBe(0);
      expect(existsSync(dbPath)).toBe(true);
      expect(lines.some((l) => l.includes(newest))).toBe(true);
    });
  });

  it('moves the previous db and its -wal/-shm siblings aside with a timestamp suffix, rather than deleting them', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'store.db');
      const backupDir = join(dir, 'backups');
      await makeSnapshot(backupDir, 1_700_000_000_000);

      writeFileSync(dbPath, 'stale-live-db');
      writeFileSync(`${dbPath}-wal`, 'stale-wal');
      writeFileSync(`${dbPath}-shm`, 'stale-shm');

      const stampMs = 1_700_000_200_000;
      const code = await runRestore({
        dbPath,
        argv: ['latest'],
        log: () => {},
        now: () => stampMs,
      });
      expect(code).toBe(0);

      const stamp = new Date(stampMs).toISOString().replace(/[:.]/g, '-');
      expect(readFileSync(`${dbPath}.pre-restore-${stamp}`, 'utf8')).toBe('stale-live-db');
      expect(readFileSync(`${dbPath}-wal.pre-restore-${stamp}`, 'utf8')).toBe('stale-wal');
      expect(readFileSync(`${dbPath}-shm.pre-restore-${stamp}`, 'utf8')).toBe('stale-shm');
      // Restored in place — not left as the stale placeholder content.
      expect(readFileSync(dbPath, 'utf8')).not.toBe('stale-live-db');
    });
  });

  it('restoring when no prior db or wal/shm siblings exist is a no-op move-aside (first restore ever)', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'store.db');
      const backupDir = join(dir, 'backups');
      const name = await makeSnapshot(backupDir, 1_700_000_000_000);

      const code = await runRestore({ dbPath, argv: [name], log: () => {} });

      expect(code).toBe(0);
      expect(existsSync(dbPath)).toBe(true);
      expect(existsSync(`${dbPath}-wal`)).toBe(false);
      expect(existsSync(`${dbPath}-shm`)).toBe(false);
    });
  });

  it('rejects restoring a corrupt snapshot rather than overwriting the live store with it', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'store.db');
      const backupDir = join(dir, 'backups');
      const corruptName = 'autopilot-2026-01-01T00-00-00-000Z.db';
      mkdirSync(backupDir, { recursive: true });
      writeFileSync(join(backupDir, corruptName), 'not a real sqlite file');

      writeFileSync(dbPath, 'stale-live-db');

      await expect(runRestore({ dbPath, argv: [corruptName], log: () => {} })).rejects.toThrow(
        /refusing to restore a corrupt snapshot/,
      );
      // The live db was already moved aside before the integrity check failed —
      // additive-only, so nothing is silently lost even on this failure path.
      expect(existsSync(dbPath)).toBe(false);
    });
  });

  it('falls back to stdout when log is not provided', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'store.db');
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        const code = await runRestore({ dbPath, argv: [] });
        expect(code).toBe(1);
        expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('no snapshots found'));
      } finally {
        writeSpy.mockRestore();
      }
    });
  });

  it(`falls back to resolveDbPath() (honoring ${DB_ENV_VAR}) when dbPath is not provided`, async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'store.db');
      const original = process.env[DB_ENV_VAR];
      process.env[DB_ENV_VAR] = dbPath;
      try {
        const { log, lines } = collectLog();
        const code = await runRestore({ argv: [], log });
        expect(code).toBe(1);
        expect(lines[0]).toContain('no snapshots found');
        expect(lines[0]).toContain(dir);
      } finally {
        if (original === undefined) delete process.env[DB_ENV_VAR];
        else process.env[DB_ENV_VAR] = original;
      }
    });
  });

  it('falls back to process.argv.slice(2) when argv is not provided', async () => {
    await withTempDir(async (dir) => {
      const dbPath = join(dir, 'store.db');
      const backupDir = join(dir, 'backups');
      await makeSnapshot(backupDir, 1_700_000_000_000);

      const originalArgv = process.argv;
      process.argv = [...originalArgv.slice(0, 2), 'does-not-exist.db'];
      try {
        const { log, lines } = collectLog();
        const code = await runRestore({ dbPath, log });
        expect(code).toBe(1);
        expect(lines[0]).toBe('snapshot not found: does-not-exist.db');
      } finally {
        process.argv = originalArgv;
      }
    });
  });
});
