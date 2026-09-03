// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `pnpm dashboard:restore [snapshot-file|latest]` — the missing half of the
 * store backup story (web-msnsnde8-gv5ndj): `dashboard:fly` snapshots the
 * SQLite store every flight (`.autopilot/backups`, integrity-checked,
 * rotated), but until now there was no runnable path back FROM a snapshot.
 * With no argument, lists what's available. With an argument, restores it —
 * moving the current live DB aside (never deleting) so a bad restore is
 * itself additively recoverable.
 */

import { existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { listSnapshots, restoreSnapshot } from '@autopilot/store';
import { resolveDbPath } from './read/config.js';
import { resolveSnapshotTarget } from './read/backups.js';

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function formatSize(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** Best-effort — a sibling that doesn't exist (no pending WAL) is not an error. */
function moveAside(path: string, stamp: string): void {
  if (!existsSync(path)) return;
  renameSync(path, `${path}.pre-restore-${stamp}`);
}

export interface RunRestoreOptions {
  readonly argv?: readonly string[];
  readonly dbPath?: string;
  readonly log?: (line: string) => void;
  readonly now?: () => number;
}

/**
 * Core `dashboard:restore` logic — argv/dbPath/log/clock are injectable so
 * the CLI's decision tree (no snapshots, no arg, unknown arg, valid target)
 * is unit-testable without touching the real store or `process.argv`.
 * Returns the process exit code the caller should set (0 success, 1
 * usage/lookup failure); throws if the resolved snapshot fails restore.
 */
export async function runRestore(options: RunRestoreOptions = {}): Promise<number> {
  const log = options.log ?? out;
  const dbPath = options.dbPath ?? resolveDbPath();
  const argv = options.argv ?? process.argv.slice(2);
  const now = options.now ?? Date.now;

  const backupDir = join(dirname(dbPath), 'backups');
  const snapshots = listSnapshots(backupDir);

  if (snapshots.length === 0) {
    log(`no snapshots found in ${backupDir} — fly at least one flight first.`);
    return 1;
  }

  const arg = argv[0];
  if (!arg) {
    log('usage: pnpm dashboard:restore <snapshot-file|latest>');
    log('available snapshots (oldest first):');
    for (const s of snapshots) log(`  ${s.name}  (${formatSize(s.sizeBytes)})`);
    return 0;
  }

  const target = resolveSnapshotTarget(snapshots, arg);
  if (!target) {
    log(`snapshot not found: ${arg}`);
    log('available snapshots (oldest first):');
    for (const s of snapshots) log(`  ${s.name}  (${formatSize(s.sizeBytes)})`);
    return 1;
  }

  const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
  moveAside(dbPath, stamp);
  moveAside(`${dbPath}-wal`, stamp);
  moveAside(`${dbPath}-shm`, stamp);

  restoreSnapshot(target.path, dbPath);
  log(`restored ${target.name} (${formatSize(target.sizeBytes)}) → ${dbPath}`);
  log(`previous store (if any) preserved alongside as *.pre-restore-${stamp}`);
  return 0;
}
