// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * PARALLEL FLIGHTS 6/6 (`docs/epics/0001-parallel-flights.md` slice 6):
 * flight-end rituals (self-study PAPER regen + commit, and any future
 * landing/release opt-ins) write into THIS dashboard checkout's own working
 * tree (`process.cwd()`) regardless of which project was flown — two flights
 * against DIFFERENT projects ending at the same moment would otherwise race
 * the same `git commit`, corrupting history or hitting a dirty-tree refusal
 * caused entirely by a sibling flight. `withRitualLock` serializes that
 * critical section across processes using the same atomic-create lockfile
 * primitive as the per-project engine lock (`FileInstanceLock`), but WAITS
 * for the lock instead of refusing outright — the goal is two clean
 * sequential commits, not a skipped ritual.
 */

import { dirname, join } from 'node:path';
import {
  FileInstanceLock,
  primaryFlightHolder,
  syncBackLock,
  withSyncBackMutex,
  type SyncBackMutexOptions,
} from '@autopilot/engine';

/** Shared across every flight launched from this checkout, independent of target project. */
export const RITUAL_LOCK_FILE_NAME = 'ritual.lock';

/**
 * Guards `RemediatingGate`'s fixer→commit→re-verify critical section
 * (`packages/engine/src/adapters/remediating-gate.ts`) — a SEPARATE lock
 * from `RITUAL_LOCK_FILE_NAME` so an autoformat fix on one flight never
 * waits on an unrelated self-study regen on another, and vice versa. Closes
 * the race `docs/DOCTRINE-COORDINATION.md`'s "AUTOFORMAT is not yet a
 * single writer" section names: two lanes racing this section can commit,
 * revert, and re-commit the exact same autoformat fix out from under each
 * other (`docs/debriefs/2026-09-06-red-main-revert-cascade.md`'s firing-179
 * addendum).
 */
export const AUTOFORMAT_LOCK_FILE_NAME = 'autoformat.lock';

/**
 * The on-disk path for a named lock, colocated with `dbPath`'s directory —
 * the same lock directory every sibling instance flying this checkout
 * already shares. `fly.ts` has two call sites that each build this path
 * (the AUTOFORMAT critical section and the self-study PAPER ritual); before
 * this function existed both repeated the identical `join(dirname(dbPath),
 * X)` expression inline, so only the raw `X` constants — never the actual
 * composed path a swapped or mistyped constant would produce — had any test
 * coverage. Factoring the composition into one function both call sites
 * share closes that gap and makes it directly testable.
 */
export function resolveLockPath(dbPath: string, lockFileName: string): string {
  return join(dirname(dbPath), lockFileName);
}

export interface RitualLockOptions {
  /** How many times to retry acquiring before giving up. Default 30. */
  readonly maxAttempts?: number;
  /** Delay between attempts, in ms. Default 500 (≈15s worst-case wait). */
  readonly delayMs?: number;
  /** Injectable so tests don't burn real wall-clock time waiting. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` under a cross-process mutex at `lockPath`, waiting (bounded) for
 * a sibling flight's ritual to finish rather than racing it. Returns `fn`'s
 * result, or `null` when the lock never freed up within `maxAttempts` — a
 * best-effort ceiling so a stuck sibling can never hang a flight forever;
 * callers treat `null` the same as any other best-effort ritual skip.
 */
export async function withRitualLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  options: RitualLockOptions = {},
): Promise<T | null> {
  const maxAttempts = options.maxAttempts ?? 30;
  const delayMs = options.delayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;

  const lock = new FileInstanceLock(lockPath);
  let acquired = false;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (lock.acquire().acquired) {
      acquired = true;
      break;
    }
    if (attempt < maxAttempts - 1) await sleep(delayMs);
  }
  if (!acquired) return null;

  try {
    return await fn();
  } finally {
    lock.release();
  }
}

export interface CheckoutRitualLockOptions {
  /** The ritual lock's own retry budget (`withRitualLock`). */
  readonly ritual?: RitualLockOptions;
  /** How long to wait for a sibling lane's sync-back into `checkout`. */
  readonly syncBack?: SyncBackMutexOptions;
}

/**
 * A flight-end ritual that writes and commits into `checkout` (board
 * ap-mtnceruy-2). `withRitualLock` alone orders rituals against each other,
 * but every lane's sync-back merges into that same checkout's working tree
 * and index under a different lock (`syncBackLockPath`, in the git common
 * dir) — so a self-study regen could dirty `docs/SELF-STUDY` between a
 * sibling's clean-tree check and its merge, or stage it right before that
 * merge's commit and ride along under a `chore: sync` subject. Holding the
 * sync-back lock too makes the ritual one more writer the sync-back mutex
 * already orders. Taken sync-back-first: a ritual waits out a sibling's
 * merge on that lock's own minutes-long budget WITHOUT holding the ritual
 * lock, whose ~15s retry would otherwise starve every other ritual ending
 * meanwhile; nothing takes the ritual lock and then the sync-back lock, so
 * the two cannot deadlock. `null` when either lock stays held past its
 * budget — the same best-effort skip `withRitualLock` gives. A lock that
 * cannot be taken at all runs the ritual anyway, as the sync-back itself
 * does: the lock machinery failing never costs a ritual it did not before.
 * A checkout another live flight is flying directly (the engine's
 * primary-flight marker) is skipped, `null`: that flight's firing is editing
 * the very tree the ritual would regenerate and commit. Checked once the
 * sync-back lock is held, as `syncWorktreeBranch` does, so a claim made
 * while this ritual waited on a sibling's merge still counts.
 */
export async function withCheckoutRitualLock<T>(
  ritualLockPath: string,
  checkout: string,
  fn: () => Promise<T>,
  options: CheckoutRitualLockOptions = {},
): Promise<T | null> {
  const ritual = async (): Promise<T | null> =>
    (await primaryFlightHolder(checkout)) === null
      ? withRitualLock(ritualLockPath, fn, options.ritual)
      : null;
  const syncBack = options.syncBack ?? {};
  const lock = await syncBackLock(checkout, syncBack);
  if (lock === null) return ritual();
  const outcome = await withSyncBackMutex(lock, syncBack, ritual);
  if (outcome.acquired) return outcome.result;
  return 'unavailable' in outcome ? ritual() : null;
}
