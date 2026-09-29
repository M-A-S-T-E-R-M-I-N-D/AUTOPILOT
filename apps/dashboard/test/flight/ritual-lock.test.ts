// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileInstanceLock, syncBackLockPath, syncWorktreeBranch } from '@autopilot/engine';
import {
  AUTOFORMAT_LOCK_FILE_NAME,
  RITUAL_LOCK_FILE_NAME,
  resolveLockPath,
  withCheckoutRitualLock,
  withRitualLock,
} from '../../src/flight/ritual-lock.js';

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

describe('AUTOFORMAT_LOCK_FILE_NAME', () => {
  it('is the fixed name RemediatingGate serializes its critical section on', () => {
    expect(AUTOFORMAT_LOCK_FILE_NAME).toBe('autoformat.lock');
  });

  it('is a SEPARATE lockfile from RITUAL_LOCK_FILE_NAME — an autoformat fix on one flight must never wait on an unrelated self-study ritual on another, or vice versa', () => {
    expect(AUTOFORMAT_LOCK_FILE_NAME).not.toBe(RITUAL_LOCK_FILE_NAME);
  });
});

describe('resolveLockPath', () => {
  it("joins the db path's directory with the given lock file name", () => {
    expect(resolveLockPath(join('Z:', 'data', 'store.db'), 'example.lock')).toBe(
      join('Z:', 'data', 'example.lock'),
    );
  });

  it("resolves AUTOFORMAT and RITUAL to DIFFERENT paths from the same db path — the actual invariant fly.ts's two lock call sites depend on, not just the raw constants being unequal", () => {
    const dbPath = join('Z:', 'data', 'store.db');
    const autoformatPath = resolveLockPath(dbPath, AUTOFORMAT_LOCK_FILE_NAME);
    const ritualPath = resolveLockPath(dbPath, RITUAL_LOCK_FILE_NAME);
    expect(autoformatPath).not.toBe(ritualPath);
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

describe('withCheckoutRitualLock — the self-study ritual is one more writer of the checkout lanes sync back into (board ap-mtnceruy-2)', () => {
  function tmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-ritual-checkout-'));
    dirs.push(dir);
    return dir;
  }

  function tmpRepo(): string {
    const dir = tmpDir();
    execFileSync('git', ['-C', dir, 'init', '-q'], { windowsHide: true });
    return dir;
  }

  async function lockPathOf(repo: string): Promise<string> {
    const path = await syncBackLockPath(repo);
    if (path === null) throw new Error('not a repository: ' + repo);
    return path;
  }

  it("never starts the ritual while a sibling lane's sync-back holds the same checkout", async () => {
    const repo = tmpRepo();
    const siblingSyncBack = new FileInstanceLock(await lockPathOf(repo));
    expect(siblingSyncBack.acquire().acquired).toBe(true);
    const ritual = vi.fn(async () => 'regenerated and committed');

    const result = await withCheckoutRitualLock(tmpLockPath(), repo, ritual, {
      syncBack: { waitMs: 0 },
    });

    expect(result).toBeNull();
    expect(ritual).not.toHaveBeenCalled();
    siblingSyncBack.release();
  });

  it("holds the checkout's sync-back lock for the ritual's whole span — a sibling's real sync-back refuses meanwhile", async () => {
    const repo = tmpRepo();
    let siblingSync = '';

    await withCheckoutRitualLock(tmpLockPath(), repo, async () => {
      siblingSync = (await syncWorktreeBranch(repo, 'main', 'lane', undefined, { waitMs: 0 }))
        .details;
    });

    expect(siblingSync).toMatch(/another sync-back into .+ is still running/);
  });

  it('waits out a sibling sync-back that finishes inside the budget, then runs', async () => {
    const repo = tmpRepo();
    const siblingSyncBack = new FileInstanceLock(await lockPathOf(repo));
    expect(siblingSyncBack.acquire().acquired).toBe(true);
    const order: string[] = [];
    const sleep = vi.fn(async () => {
      order.push('sibling merge done');
      siblingSyncBack.release();
    });

    const result = await withCheckoutRitualLock(
      tmpLockPath(),
      repo,
      async () => {
        order.push('ritual');
        return 'ran';
      },
      { syncBack: { waitMs: 10, pollMs: 5, sleep } },
    );

    expect(result).toBe('ran');
    expect(order).toEqual(['sibling merge done', 'ritual']);
  });

  it("waits on a sibling's sync-back WITHOUT holding the ritual lock — that wait never starves another ritual's short retry", async () => {
    const repo = tmpRepo();
    const ritualLock = tmpLockPath();
    const siblingSyncBack = new FileInstanceLock(await lockPathOf(repo));
    expect(siblingSyncBack.acquire().acquired).toBe(true);
    const ritualLockHeldWhileWaiting: boolean[] = [];
    const sleep = vi.fn(async () => {
      ritualLockHeldWhileWaiting.push(existsSync(ritualLock));
      siblingSyncBack.release();
    });

    await withCheckoutRitualLock(ritualLock, repo, async () => 'ran', {
      syncBack: { waitMs: 10, pollMs: 5, sleep },
    });

    expect(ritualLockHeldWhileWaiting).toEqual([false]);
  });

  it('releases both locks once the ritual is done, even when it throws', async () => {
    const repo = tmpRepo();
    const ritualLock = tmpLockPath();

    await expect(
      withCheckoutRitualLock(ritualLock, repo, async () => {
        throw new Error('regen failed');
      }),
    ).rejects.toThrow('regen failed');

    expect(existsSync(ritualLock)).toBe(false);
    expect(existsSync(await lockPathOf(repo))).toBe(false);
  });

  it('a sync-back lock that cannot be taken at all (not held — broken) still runs the ritual, as the sync-back itself does', async () => {
    const broken = {
      acquire: () => {
        throw new Error('EPERM: read-only .git');
      },
      release: vi.fn(),
    };

    const result = await withCheckoutRitualLock(tmpLockPath(), tmpRepo(), async () => 'ran', {
      syncBack: { lock: broken },
    });

    expect(result).toBe('ran');
    expect(broken.release).not.toHaveBeenCalled();
  });

  it('outside a repository there is no sync-back to exclude — the ritual lock alone guards it', async () => {
    const nowhere = tmpDir();
    expect(await syncBackLockPath(nowhere)).toBeNull();

    expect(await withCheckoutRitualLock(tmpLockPath(), nowhere, async () => 'ran')).toBe('ran');
  });
});
