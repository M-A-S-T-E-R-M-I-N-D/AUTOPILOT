// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { openStore, resolveStorePath, withBusyRetry } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const HOLD_LOCK_WORKER = new URL('./fixtures/hold-lock-worker.mjs', import.meta.url);

class BusyError extends Error {
  readonly code: string;
  constructor(code = 'SQLITE_BUSY') {
    super(code);
    this.code = code;
  }
}

describe('openStore', () => {
  it('defaults to a writable WAL-mode connection', () => {
    const store = openStore(':memory:');
    expect(store.db.pragma('journal_mode', { simple: true })).toBe('memory'); // WAL is a no-op on :memory:
    expect(store.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(store.db.readonly).toBe(false);
    store.close();
  });

  it('sets synchronous = NORMAL explicitly on a writer (docs/adr/0007)', () => {
    const store = openStore(':memory:');
    expect(store.db.pragma('synchronous', { simple: true })).toBe(1); // 1 === NORMAL
    store.close();
  });

  it('opens a real file writable by default, WAL-mode on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-store-'));
    const dbPath = join(dir, 'telemetry.db');
    try {
      const store = openStore(dbPath);
      expect(store.db.pragma('journal_mode', { simple: true })).toBe('wal');
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('{ readonly } opens an existing database without writing, reads still work', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-store-'));
    const dbPath = join(dir, 'telemetry.db');
    try {
      const writer = openStore(dbPath);
      migrate(writer);
      writer.close();

      const reader = openStore(dbPath, { readonly: true });
      expect(reader.db.readonly).toBe(true);
      const row = reader.db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number };
      expect(row.c).toBe(0);
      expect(() => reader.db.prepare('DELETE FROM projects').run()).toThrow(/readonly/i);
      reader.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('{ readonly } refuses to open a database that does not exist yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-store-'));
    const dbPath = join(dir, 'never-created.db');
    try {
      expect(() => openStore(dbPath, { readonly: true })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveStorePath', () => {
  it('passes ":memory:" through untouched', () => {
    expect(resolveStorePath(':memory:')).toBe(':memory:');
  });

  it('passes the empty string through untouched (better-sqlite3 private temp db)', () => {
    expect(resolveStorePath('')).toBe('');
  });

  it('resolves a relative path to an absolute one', () => {
    const relative = join('some', 'nested', 'store.db');
    expect(resolveStorePath(relative)).toBe(resolve(relative));
  });

  it('leaves an already-absolute path unchanged in shape (normalized)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-store-'));
    const dbPath = join(dir, 'telemetry.db');
    try {
      expect(resolveStorePath(dbPath)).toBe(resolve(dbPath));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a path containing a NUL byte', () => {
    expect(() => resolveStorePath('store.db\0.evil')).toThrow(/NUL/);
  });

  it('openStore rejects a NUL-byte path before it reaches better-sqlite3', () => {
    expect(() => openStore('store.db\0.evil')).toThrow(/NUL/);
  });
});

describe('withBusyRetry', () => {
  it('returns the first successful result without retrying', () => {
    let calls = 0;
    const result = withBusyRetry(() => {
      calls += 1;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries SQLITE_BUSY (and SQLITE_BUSY_SNAPSHOT) until it succeeds, within the bound', () => {
    let calls = 0;
    const result = withBusyRetry(
      () => {
        calls += 1;
        if (calls <= 2) throw new BusyError(calls === 1 ? 'SQLITE_BUSY' : 'SQLITE_BUSY_SNAPSHOT');
        return 'ok';
      },
      { retries: 4, baseDelayMs: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up and rethrows once the bounded retries are exhausted — never unbounded', () => {
    let calls = 0;
    expect(() =>
      withBusyRetry(
        () => {
          calls += 1;
          throw new BusyError();
        },
        { retries: 2, baseDelayMs: 1 },
      ),
    ).toThrow('SQLITE_BUSY');
    expect(calls).toBe(3); // initial attempt + 2 retries, then stop
  });

  it('rethrows a non-busy error immediately, without retrying', () => {
    let calls = 0;
    expect(() =>
      withBusyRetry(() => {
        calls += 1;
        throw new Error('SQLITE_CONSTRAINT');
      }),
    ).toThrow('SQLITE_CONSTRAINT');
    expect(calls).toBe(1);
  });
});

describe('Store writer hardening', () => {
  it('a normal write on a writable Store still succeeds (wrapping is transparent)', () => {
    const store = openStore(':memory:');
    migrate(store);
    const info = store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();
    expect(info.changes).toBe(1);
    const tx = store.db.transaction(() => {
      store.db.prepare("UPDATE projects SET status = 'paused' WHERE id = 'p1'").run();
    });
    tx();
    const row = store.db.prepare('SELECT status FROM projects WHERE id = ?').get('p1') as {
      status: string;
    };
    expect(row.status).toBe('paused');
    store.close();
  });

  it('a second real writer holding the lock on disk does not fail the first — bounded retry bridges it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-store-busy-'));
    const dbPath = join(dir, 'telemetry.db');
    try {
      const setup = openStore(dbPath);
      migrate(setup);
      setup.close();

      const worker = new Worker(HOLD_LOCK_WORKER, { workerData: { dbPath, holdMs: 120 } });
      try {
        await new Promise<void>((resolve, reject) => {
          worker.once('error', reject);
          worker.once('message', (message) => {
            if (message === 'locked') resolve();
          });
        });

        // Deliberately shorter than the worker's hold: the driver's own
        // busy_timeout alone cannot bridge this gap — only our JS-level
        // retry (bounded, exponential backoff) can.
        const store = openStore(dbPath);
        store.db.pragma('busy_timeout = 10');

        const info = store.db
          .prepare(
            `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
               VALUES ('p2', 'p2', 'p2', '/tmp/p2', 'flying', 1, 1)`,
          )
          .run();
        expect(info.changes).toBe(1);
        store.close();
      } finally {
        await worker.terminate();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10_000);
});
