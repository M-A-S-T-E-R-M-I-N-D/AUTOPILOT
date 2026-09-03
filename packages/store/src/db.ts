// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import Database from 'better-sqlite3';
import { resolve } from 'node:path';

/**
 * better-sqlite3 special-cases these two strings (in-memory / private temp
 * db) — they must pass through untouched rather than being resolved as
 * filesystem paths.
 */
const SPECIAL_PATHS = new Set(['', ':memory:']);

/**
 * Validate and normalize a store path before it reaches the native
 * better-sqlite3 binding. A NUL byte lets a JS string that *looks* validated
 * (e.g. by a caller checking an extension or prefix) get silently truncated
 * by the underlying C string handling, so the file SQLite actually opens can
 * differ from the one any earlier check inspected. Resolving to an absolute
 * path also removes reliance on the process's current working directory.
 */
export function resolveStorePath(path: string): string {
  if (SPECIAL_PATHS.has(path)) return path;
  if (path.includes('\0'))
    throw new Error(`openStore: path must not contain NUL bytes: ${JSON.stringify(path)}`);
  return resolve(path);
}

export interface StoreOptions {
  /**
   * Open the connection read-only (SQLite `SQLITE_OPEN_READONLY`): skips the
   * `journal_mode = WAL` pragma, which writes to the file header and would
   * fail against a read-only handle, and requires the file to already exist.
   * For readers that never write (the dashboard) opening alongside the
   * engine's writer connection.
   */
  readonly readonly?: boolean;
}

const BUSY_ERROR_CODES = new Set(['SQLITE_BUSY', 'SQLITE_BUSY_SNAPSHOT']);

function isBusyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    BUSY_ERROR_CODES.has((error as { code: unknown }).code as string)
  );
}

/** Blocking sleep — the driver is fully synchronous, so a retry loop around
 * it cannot `await`; `Atomics.wait` gives a real delay between attempts
 * without a Promise microtask (which would silently no-op mid-native-call). */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export interface BusyRetryOptions {
  /** Bounded attempts AFTER the first — never unbounded, PARALLEL FLIGHTS 2/6's
   * "bounded retry" requirement. Default 4 (5 attempts total). */
  readonly retries?: number;
  /** Base of the exponential backoff between attempts, in ms. Default 25. */
  readonly baseDelayMs?: number;
}

const DEFAULT_RETRIES = 4;
const DEFAULT_BASE_DELAY_MS = 25;

/**
 * Retry a synchronous SQLite write once a sibling writer holds the lock past
 * the driver's own `busy_timeout` (PRAGMA-level retries already exhausted by
 * the time `SQLITE_BUSY`/`SQLITE_BUSY_SNAPSHOT` reaches JS) — a second,
 * bounded line of defense for the rare case where two concurrent flights
 * (PARALLEL FLIGHTS epic) contend past that window. Exponential backoff with
 * jitter; any other error rethrows immediately, unretried.
 */
export function withBusyRetry<T>(fn: () => T, options: BusyRetryOptions = {}): T {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let attempt = 0;
  for (;;) {
    try {
      return fn();
    } catch (error) {
      if (!isBusyError(error) || attempt >= retries) throw error;
      sleepSync(baseDelayMs * 2 ** attempt + Math.floor(Math.random() * baseDelayMs));
      attempt += 1;
    }
  }
}

/**
 * Wrap a writable connection's `prepare`/`transaction` so every `.run()` and
 * every transaction commit goes through {@link withBusyRetry}. Connection-level
 * (PARALLEL FLIGHTS 2/6's EPIC-SPEC constraint) rather than per-call-site: every
 * writer across every package — engine, onboarding, dashboard mutations — gets
 * the same bounded retry automatically, with zero changes at those call sites.
 */
function hardenWriterAgainstBusy(db: Database.Database): void {
  const originalPrepare = db.prepare.bind(db);
  db.prepare = ((source: string) => {
    const stmt = originalPrepare(source);
    const originalRun = stmt.run.bind(stmt) as (...params: unknown[]) => Database.RunResult;
    stmt.run = ((...params: unknown[]) =>
      withBusyRetry(() => originalRun(...params))) as typeof stmt.run;
    return stmt;
  }) as typeof db.prepare;

  const originalTransaction = db.transaction.bind(db);
  db.transaction = ((fn: (...args: unknown[]) => unknown) => {
    const wrapped = originalTransaction(fn);
    return ((...args: unknown[]) => withBusyRetry(() => wrapped(...args))) as typeof wrapped;
  }) as typeof db.transaction;
}

/**
 * Thin wrapper around the SQLite driver — the concrete adapter behind the
 * engine's `StorePort` (hexagonal ports & adapters, PATTERNS-AND-STANDARDS §1).
 * Keeping the driver isolated here means it can be swapped (e.g. for a WASM
 * build) without touching callers.
 *
 * Sets the pragmas AUTOPILOT relies on: WAL for concurrent readers (the
 * dashboard) alongside the writer (the engine), enforced foreign keys, and a
 * busy timeout so brief lock contention retries instead of throwing — then
 * hardens the writer connection with bounded JS-level retry on top, for
 * contention that outlasts even that timeout (PARALLEL FLIGHTS 2/6).
 *
 * `synchronous = NORMAL` is set explicitly rather than left as WAL mode's
 * implicit default (docs/adr/0007-sqlite-durability-posture.md): this store
 * holds coordination/telemetry state (tasks, leases, metrics) whose
 * durability floor is git — the actual work product — not this database, so
 * NORMAL's small window (a power cut can lose the most recently committed
 * transactions without corrupting the file) is an accepted, named tradeoff
 * against FULL's fsync-per-commit cost under concurrent-flight write load.
 */
export class Store {
  readonly db: Database.Database;

  constructor(path: string, options: StoreOptions = {}) {
    const readonly = options.readonly === true;
    this.db = new Database(resolveStorePath(path), { readonly, fileMustExist: readonly });
    if (!readonly) this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    if (!readonly) this.db.pragma('synchronous = NORMAL');
    if (!readonly) hardenWriterAgainstBusy(this.db);
  }

  close(): void {
    this.db.close();
  }
}

/** Open a store at a filesystem path, or `':memory:'` for an ephemeral database. */
export function openStore(path: string, options?: StoreOptions): Store {
  return new Store(path, options);
}
