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

import { FileInstanceLock } from '@autopilot/engine';

/** Shared across every flight launched from this checkout, independent of target project. */
export const RITUAL_LOCK_FILE_NAME = 'ritual.lock';

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
