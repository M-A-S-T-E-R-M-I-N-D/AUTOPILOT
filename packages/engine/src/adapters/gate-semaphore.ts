// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * OPERATOR-MACHINE MERCY 2 (board web-mtsvchak-kecyjk, `docs/FAILURE-DOCTRINE.md`
 * row 16): mercy 1 (`spawn-flight.ts`'s `lowerLaneChildPriority` +
 * `fleetGateWorkers`) caps how many workers EACH lane's own vitest uses, but
 * does nothing about how many LANES overlap in the first place — four lanes
 * each capped at 2 vitest workers can still all start typecheck/vitest/build
 * in the same instant, multiplying right back to near-all-core contention.
 * This is the missing cap: a shared-slot counting semaphore ACROSS lanes
 * (separate OS processes, per `spawn-flight.ts`'s `detached: true` spawn),
 * so at most `slots` heavy gate runs execute concurrently regardless of how
 * many lanes are flying; everyone else queues.
 *
 * Generalizes `instance-lock.ts`'s single-owner lockfile mutex (atomic `wx`
 * create, stale-pid reclaim) to N numbered lockfiles — reusing its exact
 * parse/staleness/liveness primitives rather than re-implementing them.
 *
 * FAIL OPEN, not closed: this is a scheduling nicety, not a correctness
 * lock — nothing depends on mutual exclusion here the way a real mutex's
 * callers do. If every slot stays held past `maxWaitMs` (a stuck sibling,
 * clock skew, whatever), `acquire()` gives up waiting and lets the caller run
 * anyway rather than blocking a flight's turn budget indefinitely over a CPU
 * courtesy.
 */

import { openSync, closeSync, writeSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isLockStale, isProcessAlive, parseLockInfo, type LockInfo } from './instance-lock.js';

/** A cross-lane scheduling gate: `acquire()` resolves once a slot is won
 *  (or `maxWaitMs` elapses), returning a release callback to call exactly
 *  once when the held work finishes. */
export interface GateSemaphorePort {
  acquire(): Promise<() => void>;
}

export interface FileGateSemaphoreOptions {
  /** Directory the numbered slot lockfiles live in — shared by every lane
   *  contending for the same semaphore (e.g. the dashboard store's own
   *  directory, alongside `engine-*.lock`). */
  readonly dir: string;
  /** How many gates may hold a slot at once. */
  readonly slots: number;
  readonly isAlive?: (pid: number) => boolean;
  readonly pid?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Poll cadence while every slot is held. */
  readonly pollIntervalMs?: number;
  /** Give up waiting and run unslotted past this — see the FAIL OPEN note above. */
  readonly maxWaitMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 2_000;
// Below GateRunner's own DEFAULT_TIMEOUT_MS (10 min) — a caller that fails
// open here still has time left on its OWN gate timeout afterward, instead
// of the wait itself silently eating the whole budget.
const DEFAULT_MAX_WAIT_MS = 8 * 60 * 1000;

/** A release callback that does nothing — the FAIL OPEN path (no slot held). */
const NOOP_RELEASE = (): void => {};

export class FileGateSemaphore implements GateSemaphorePort {
  private readonly dir: string;
  private readonly slots: number;
  private readonly isAlive: (pid: number) => boolean;
  private readonly pid: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly maxWaitMs: number;

  constructor(opts: FileGateSemaphoreOptions) {
    this.dir = opts.dir;
    this.slots = opts.slots;
    this.isAlive = opts.isAlive ?? isProcessAlive;
    this.pid = opts.pid ?? process.pid;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  }

  async acquire(): Promise<() => void> {
    const deadline = this.now() + this.maxWaitMs;
    for (;;) {
      const slot = this.tryAcquireOnce();
      if (slot !== null) return this.releaserFor(slot);
      if (this.now() >= deadline) return NOOP_RELEASE;
      await this.sleep(this.pollIntervalMs);
    }
  }

  /** One non-blocking sweep across every slot — the index it won, or null. */
  private tryAcquireOnce(): number | null {
    for (let i = 0; i < this.slots; i++) {
      if (this.tryClaim(this.slotPath(i))) return i;
    }
    return null;
  }

  private releaserFor(slot: number): () => void {
    const path = this.slotPath(slot);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const info = this.readInfo(path);
      // Someone else's slot now (a stale reclaim raced us) — never steal it.
      if (info !== null && info.pid !== this.pid) return;
      try {
        unlinkSync(path);
      } catch {
        /* already gone — fine */
      }
    };
  }

  private slotPath(index: number): string {
    return join(this.dir, `gate-semaphore-slot-${index}.lock`);
  }

  private tryClaim(path: string): boolean {
    if (this.tryCreate(path)) return true;
    const info = this.readInfo(path);
    if (!isLockStale(info, this.isAlive)) return false;
    try {
      unlinkSync(path);
    } catch {
      /* already gone — fine, retry the create */
    }
    return this.tryCreate(path);
  }

  private tryCreate(path: string): boolean {
    try {
      const fd = openSync(path, 'wx');
      try {
        writeSync(fd, JSON.stringify({ pid: this.pid, startedAt: this.now() }));
      } finally {
        closeSync(fd);
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
  }

  private readInfo(path: string): LockInfo | null {
    if (!existsSync(path)) return null;
    try {
      return parseLockInfo(readFileSync(path, 'utf8'));
    } catch {
      return null;
    }
  }
}
