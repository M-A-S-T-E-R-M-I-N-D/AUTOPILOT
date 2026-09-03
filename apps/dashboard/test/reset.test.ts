// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReset } from '../src/reset.js';
import { DB_ENV_VAR } from '../src/read/config.js';

async function withTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'ap-reset-'));
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

function collectLog(): { log: (line: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (line: string) => lines.push(line), lines };
}

describe('runReset', () => {
  it('removes the store db + wal/shm siblings and the demo dir', async () => {
    await withTempDir((dir) => {
      const dbPath = join(dir, 'autopilot.db');
      writeFileSync(dbPath, 'db');
      writeFileSync(`${dbPath}-wal`, 'wal');
      writeFileSync(`${dbPath}-shm`, 'shm');
      mkdirSync(join(dir, 'demo', 'sample-repo'), { recursive: true });
      writeFileSync(join(dir, 'demo', 'sample-repo', 'file.txt'), 'x');

      runReset({ dbPath, log: () => {} });

      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(`${dbPath}-wal`)).toBe(false);
      expect(existsSync(`${dbPath}-shm`)).toBe(false);
      expect(existsSync(join(dir, 'demo'))).toBe(false);
    });
  });

  it('does not touch a connection/login file sitting alongside the store', async () => {
    await withTempDir((dir) => {
      const dbPath = join(dir, 'autopilot.db');
      const connectionPath = join(dir, 'connection.json');
      writeFileSync(dbPath, 'db');
      writeFileSync(connectionPath, '{"token":"kept"}');

      runReset({ dbPath, log: () => {} });

      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(connectionPath)).toBe(true);
    });
  });

  it('is a no-op, not an error, when the db and demo dir are already absent', async () => {
    await withTempDir((dir) => {
      const dbPath = join(dir, 'autopilot.db');
      expect(() => runReset({ dbPath, log: () => {} })).not.toThrow();
      expect(existsSync(dbPath)).toBe(false);
    });
  });

  it('logs the cleared-fleet message and the next-step hint', async () => {
    await withTempDir((dir) => {
      const dbPath = join(dir, 'autopilot.db');
      const { log, lines } = collectLog();

      runReset({ dbPath, log });

      expect(lines[0]).toContain('Fleet cleared');
      expect(lines[1]).toContain('dashboard:fly');
    });
  });

  it('falls back to stdout when log is not provided', async () => {
    await withTempDir((dir) => {
      const dbPath = join(dir, 'autopilot.db');
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        runReset({ dbPath });
        expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Fleet cleared'));
      } finally {
        writeSpy.mockRestore();
      }
    });
  });

  it(`falls back to resolveDbPath() (honoring ${DB_ENV_VAR}) when dbPath is not provided`, async () => {
    await withTempDir((dir) => {
      const dbPath = join(dir, 'autopilot.db');
      writeFileSync(dbPath, 'db');
      const original = process.env[DB_ENV_VAR];
      process.env[DB_ENV_VAR] = dbPath;
      try {
        runReset({ log: () => {} });
        expect(existsSync(dbPath)).toBe(false);
      } finally {
        if (original === undefined) delete process.env[DB_ENV_VAR];
        else process.env[DB_ENV_VAR] = original;
      }
    });
  });
});
