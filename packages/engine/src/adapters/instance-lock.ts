// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cross-platform single-instance guard for the engine loop. The dashboard's
 * FlightRunner already refuses a second flight while one is in-memory-tracked
 * (apps/dashboard/src/flight/runner.ts), but that guard is per-process only —
 * a stray `pnpm dashboard:fly` run from a terminal, or two dashboard servers
 * pointed at the same `.autopilot/autopilot.db`, would race the same SQLite
 * store and target repo with no protection at all. A lockfile closes that gap
 * at the OS level: `openSync(path, 'wx')` is an atomic exclusive create on
 * both POSIX and Windows, so only one process can ever win it. A lock left
 * behind by a process that died without releasing it (SIGKILL, SIGTERM with
 * no graceful handler, a crash) is reclaimed once its owning pid is confirmed
 * dead — `process.kill(pid, 0)` is a liveness probe (sends no signal) that
 * Node implements on Windows too.
 */

import { openSync, closeSync, writeSync, readFileSync, unlinkSync, existsSync } from 'node:fs';

export interface LockInfo {
  readonly pid: number;
  readonly startedAt: number;
}

/** Parses a lockfile's contents; null on anything unparseable (treated as reclaimable). */
export function parseLockInfo(raw: string): LockInfo | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const pid = data['pid'];
    const startedAt = data['startedAt'];
    // No separate `typeof x !== 'number'` guard: Number.isInteger/isFinite already
    // return false for any non-number type per spec, so that check can never fire
    // independently — it would be dead code an equivalent mutant could hide behind.
    if (!Number.isInteger(pid) || (pid as number) <= 0) return null;
    if (!Number.isFinite(startedAt)) return null;
    return { pid: pid as number, startedAt: startedAt as number };
  } catch {
    return null;
  }
}

/** A lock is stale (safe to reclaim) when unparseable OR its owning pid is no longer alive. */
export function isLockStale(info: LockInfo | null, isAlive: (pid: number) => boolean): boolean {
  return info === null || !isAlive(info.pid);
}

/** Cross-platform liveness probe: signal 0 sends nothing, it only checks the pid exists. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the pid exists but we lack permission to signal it — still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface AcquireLockResult {
  readonly acquired: boolean;
  /** Set when acquired is false: the pid currently holding the lock (if known). */
  readonly holderPid?: number;
}

/** Builds a denied result, omitting `holderPid` entirely when unknown (exactOptionalPropertyTypes). */
function denied(info: LockInfo | null): AcquireLockResult {
  return info === null ? { acquired: false } : { acquired: false, holderPid: info.pid };
}

/**
 * A single-instance guard backed by a lockfile at `path`. `isAlive`/`pid`/`now`
 * are injectable so staleness reclaim and ownership are deterministically
 * testable without spawning real processes.
 */
export class FileInstanceLock {
  private owned = false;

  constructor(
    private readonly path: string,
    private readonly isAlive: (pid: number) => boolean = isProcessAlive,
    private readonly pid: number = process.pid,
    private readonly now: () => number = Date.now,
  ) {}

  /** Attempts to win the lock, reclaiming one left by a dead process. */
  acquire(): AcquireLockResult {
    if (this.tryCreate()) return { acquired: true };

    const info = this.readInfo();
    if (!isLockStale(info, this.isAlive)) {
      return denied(info);
    }

    // Stale — reclaim it. A benign race (another process reclaims first) just
    // fails the retry create below and this call reports "not acquired".
    try {
      unlinkSync(this.path);
    } catch {
      /* already gone — fine, retry the create */
    }
    if (this.tryCreate()) return { acquired: true };
    return denied(this.readInfo());
  }

  /** Releases the lock — a no-op unless THIS instance is the current owner (never steals). */
  release(): void {
    if (!this.owned) return;
    const info = this.readInfo();
    if (info !== null && info.pid !== this.pid) {
      this.owned = false; // someone else's lock now (a stale reclaim raced us) — don't touch it
      return;
    }
    try {
      unlinkSync(this.path);
    } catch {
      /* already gone */
    }
    this.owned = false;
  }

  private tryCreate(): boolean {
    try {
      const fd = openSync(this.path, 'wx');
      try {
        writeSync(fd, JSON.stringify({ pid: this.pid, startedAt: this.now() }));
      } finally {
        closeSync(fd);
      }
      this.owned = true;
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
  }

  private readInfo(): LockInfo | null {
    if (!existsSync(this.path)) return null;
    try {
      return parseLockInfo(readFileSync(this.path, 'utf8'));
    } catch {
      return null;
    }
  }
}
