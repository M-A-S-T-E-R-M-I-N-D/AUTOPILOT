// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Store } from './db.js';

const SNAPSHOT_PREFIX = 'autopilot-';
const SNAPSHOT_SUFFIX = '.db';

/** Default number of rotated snapshots kept on disk (oldest pruned first). */
export const DEFAULT_SNAPSHOT_RETENTION = 10;

export interface SnapshotResult {
  readonly ok: boolean;
  readonly path: string;
  readonly sizeBytes: number;
  readonly createdAt: number;
  /** Set when `ok` is false — the corrupt file has already been deleted. */
  readonly integrityError?: string;
}

export interface SnapshotInfo {
  readonly name: string;
  readonly path: string;
  readonly sizeBytes: number;
}

function snapshotFileNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(SNAPSHOT_PREFIX) && f.endsWith(SNAPSHOT_SUFFIX))
    .sort();
}

/**
 * List snapshots in `dir` oldest-first (same lexical/chronological order
 * `pruneSnapshots` relies on) — the read side of the restore path: an
 * operator (or the `dashboard:restore` CLI) needs to see what's available
 * and how big each one is before picking one to restore.
 */
export function listSnapshots(dir: string): SnapshotInfo[] {
  return snapshotFileNames(dir).map((name) => {
    const path = join(dir, name);
    return { name, path, sizeBytes: statSync(path).size };
  });
}

function snapshotFileName(createdAt: number): string {
  // Colons/dots aren't safe in filenames on Windows; the ISO stamp still
  // sorts lexically in chronological order, which pruneSnapshots relies on.
  const stamp = new Date(createdAt).toISOString().replace(/[:.]/g, '-');
  return `${SNAPSHOT_PREFIX}${stamp}${SNAPSHOT_SUFFIX}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * `Database#backup` copies raw pages, including page 1's header — so a
 * source in WAL mode (the live store always is, `db.ts`) leaves the backup
 * file flagged as WAL too, even though no `-wal`/`-shm` sibling exists yet.
 * Merely opening that flagged file later (even read-only, e.g. for
 * `integrity_check`) makes SQLite spontaneously create those siblings and
 * never clean them up — silently turning one "backup file" into three, and
 * leaving a stray WAL that a naive restore (copying just the `.db`) would
 * miss. Switching to a rollback journal right after backup forces SQLite to
 * checkpoint and drop WAL bookkeeping, so the file on disk is genuinely
 * single-file and self-contained from here on.
 */
function consolidateToRollbackJournal(path: string): void {
  const db = new Database(path);
  try {
    db.pragma('journal_mode = DELETE');
  } finally {
    db.close();
  }
}

/**
 * `Database#backup` also copies the source's freelist pages verbatim — rows
 * deleted on the live store leave pages SQLite has freed but never shrunk
 * the file for (no `auto_vacuum` in `schema.ts`), so every backup silently
 * inherits that bloat too (EVALUATION-2026-08-27-silent-gate.md §3.8 found
 * 32.7 MB of never-reclaimed freelist repeated across 10 rotated snapshots).
 * `VACUUM` rewrites the file without those freed pages, but it also rewrites
 * page 1's header — including the freelist-count field `checkIntegrity`
 * relies on to catch on-disk corruption — so this must only run *after* the
 * backup has already passed its integrity check, never before, or a
 * corrupt source would get silently laundered into a clean-looking backup.
 */
function compact(path: string): void {
  const db = new Database(path);
  try {
    db.exec('VACUUM');
  } finally {
    db.close();
  }
}

/**
 * Run SQLite's own `PRAGMA integrity_check` against a database file — the
 * authoritative page-level corruption check, distinct from "the file merely
 * exists". Opens read-only so it never competes with a live writer. A file
 * that isn't even a valid SQLite database (foreign content, zero bytes) fails
 * to open at all — that's reported as an integrity error too, not thrown.
 */
function checkIntegrity(path: string): string | undefined {
  let db: Database.Database | undefined;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
    const rows = db.pragma('integrity_check') as { integrity_check: string }[];
    const problems = rows.filter((r) => r.integrity_check !== 'ok').map((r) => r.integrity_check);
    return problems.length > 0 ? problems.join('; ') : undefined;
  } catch (err) {
    return errorMessage(err);
  } finally {
    db?.close();
  }
}

/**
 * Snapshot a live store into `dir` using SQLite's online backup API
 * (`better-sqlite3`'s `Database#backup`, backed by `sqlite3_backup_init`) —
 * safe against a concurrent WAL writer (the engine keeps writing telemetry
 * mid-flight), unlike a plain file copy which can capture a torn page. The
 * new file is integrity-checked before being trusted; a corrupt result
 * (disk full mid-copy, etc.) is deleted immediately rather than left on disk
 * as a silent bad backup someone might restore from later.
 */
export async function createSnapshot(
  store: Store,
  dir: string,
  now: () => number = Date.now,
): Promise<SnapshotResult> {
  mkdirSync(dir, { recursive: true });
  const createdAt = now();
  const path = join(dir, snapshotFileName(createdAt));
  try {
    await store.db.backup(path);
    consolidateToRollbackJournal(path);
  } catch (err) {
    cleanup(path);
    return { ok: false, path, sizeBytes: 0, createdAt, integrityError: errorMessage(err) };
  }
  const integrityError = checkIntegrity(path);
  if (integrityError) {
    cleanup(path);
    return { ok: false, path, sizeBytes: 0, createdAt, integrityError };
  }
  compact(path);
  return { ok: true, path, sizeBytes: statSync(path).size, createdAt };
}

function cleanup(path: string): void {
  for (const p of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      rmSync(p, { force: true });
    } catch {
      /* best-effort cleanup of a failed/corrupt backup */
    }
  }
}

/**
 * Keep only the `keep` most recent snapshots in `dir` — the ISO-timestamp
 * filename sorts lexically in chronological order, so a plain string sort
 * is enough to find the oldest. Returns the paths removed, for logging.
 */
export function pruneSnapshots(dir: string, keep: number = DEFAULT_SNAPSHOT_RETENTION): string[] {
  const files = snapshotFileNames(dir);
  const toRemove = files.slice(0, Math.max(0, files.length - Math.max(0, keep)));
  const removed: string[] = [];
  for (const f of toRemove) {
    const path = join(dir, f);
    cleanup(path); // also sweeps -wal/-shm siblings of any pre-consolidation snapshot
    removed.push(path);
  }
  return removed;
}

/**
 * Restore a snapshot to `destPath` — integrity-checked first so a corrupt or
 * tampered snapshot is refused rather than silently becoming the live store.
 * Copies rather than moves: the snapshot stays in the backup directory in
 * case the restore itself needs to be undone.
 */
export function restoreSnapshot(snapshotPath: string, destPath: string): void {
  const integrityError = checkIntegrity(snapshotPath);
  if (integrityError) {
    throw new Error(`refusing to restore a corrupt snapshot (${snapshotPath}): ${integrityError}`);
  }
  mkdirSync(dirname(destPath), { recursive: true });
  copyFileSync(snapshotPath, destPath);
}
