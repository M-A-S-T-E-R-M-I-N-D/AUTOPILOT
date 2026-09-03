// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileInstanceLock } from '@autopilot/engine';
import { RITUAL_LOCK_FILE_NAME, withRitualLock } from '../../src/flight/ritual-lock.js';

const dirs: string[] = [];

function tmpLockPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'autopilot-ritual-lock-'));
  dirs.push(dir);
  return join(dir, 'ritual.lock');
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('RITUAL_LOCK_FILE_NAME', () => {
  it('is the fixed name shared across every flight launched from this checkout', () => {
    expect(RITUAL_LOCK_FILE_NAME).toBe('ritual.lock');
  });
});

describe('withRitualLock', () => {
  it('runs fn and returns its result when the lock is free', async () => {
    const lockPath = tmpLockPath();
    const result = await withRitualLock(lockPath, async () => 'done');
    expect(result).toBe('done');
  });

  it('releases the lock after fn resolves — the lockfile is gone afterward', async () => {
    const lockPath = tmpLockPath();
    await withRitualLock(lockPath, async () => undefined);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('releases the lock even when fn throws', async () => {
    const lockPath = tmpLockPath();
    await expect(
      withRitualLock(lockPath, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('waits for a held lock to free up, then runs fn (no injected sleep needed — 0ms delay)', async () => {
    const lockPath = tmpLockPath();
    const order: string[] = [];

    // Hold the lock ourselves first, exactly as a sibling flight's ritual would.
    const holder = withRitualLock(lockPath, async () => {
      order.push('holder-start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('holder-end');
    });

    // Give the holder a tick to actually acquire before the waiter starts polling.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const waiter = withRitualLock(
      lockPath,
      async () => {
        order.push('waiter-start');
      },
      { delayMs: 5, maxAttempts: 50 },
    );

    await Promise.all([holder, waiter]);
    expect(order).toEqual(['holder-start', 'holder-end', 'waiter-start']);
  });

  it('gives up and returns null when the lock never frees within maxAttempts', async () => {
    const lockPath = tmpLockPath();
    const releaseHolder = withRitualLock(lockPath, () => new Promise(() => {})); // never resolves
    void releaseHolder;

    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await withRitualLock(lockPath, async () => 'should not run', {
      maxAttempts: 3,
      delayMs: 1,
    });
    expect(result).toBeNull();
  });

  it('tries acquire exactly maxAttempts times, sleeping between attempts but not after the last', async () => {
    const lockPath = tmpLockPath();
    const releaseHolder = withRitualLock(lockPath, () => new Promise(() => {})); // never resolves
    void releaseHolder;

    await new Promise((resolve) => setTimeout(resolve, 5));

    const acquireSpy = vi.spyOn(FileInstanceLock.prototype, 'acquire');
    const sleep = vi.fn(async () => {});

    const result = await withRitualLock(lockPath, async () => 'should not run', {
      maxAttempts: 3,
      delayMs: 1,
      sleep,
    });

    expect(result).toBeNull();
    expect(acquireSpy).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    acquireSpy.mockRestore();
  });

  it('defaults delayMs to 500ms when not provided', async () => {
    const lockPath = tmpLockPath();
    const releaseHolder = withRitualLock(lockPath, () => new Promise(() => {})); // never resolves
    void releaseHolder;

    await new Promise((resolve) => setTimeout(resolve, 5));

    const sleep = vi.fn(async () => {});
    const result = await withRitualLock(lockPath, async () => 'should not run', {
      maxAttempts: 2,
      sleep,
    });

    expect(result).toBeNull();
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('never lets two concurrent callers run fn at the same time (true mutual exclusion)', async () => {
    const lockPath = tmpLockPath();
    let active = 0;
    let maxActive = 0;

    const run = () =>
      withRitualLock(
        lockPath,
        async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active -= 1;
        },
        { delayMs: 2, maxAttempts: 100 },
      );

    await Promise.all([run(), run(), run()]);
    expect(maxActive).toBe(1);
  });
});
