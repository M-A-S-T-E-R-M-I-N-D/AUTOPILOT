// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileGateSemaphore } from '../../src/adapters/gate-semaphore.js';

describe('FileGateSemaphore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-gate-semaphore-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('acquires a free slot immediately, writing pid + startedAt', async () => {
    const sem = new FileGateSemaphore({
      dir,
      slots: 2,
      pid: 111,
      now: () => 1000,
      isAlive: () => true,
    });
    const release = await sem.acquire();
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, files[0]!), 'utf8'))).toEqual({
      pid: 111,
      startedAt: 1000,
    });
    release();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('fills every distinct slot before any lane has to wait', async () => {
    const acquired: number[] = [];
    for (let i = 0; i < 3; i++) {
      const sem = new FileGateSemaphore({ dir, slots: 3, pid: 100 + i, isAlive: () => true });
      await sem.acquire();
      acquired.push(i);
    }
    expect(acquired).toHaveLength(3);
    expect(readdirSync(dir)).toHaveLength(3);
  });

  it('a 4th lane queues (polls) until a held slot is released, then wins it', async () => {
    const holders = await Promise.all(
      [0, 1].map(async (i) => {
        const sem = new FileGateSemaphore({ dir, slots: 2, pid: 200 + i, isAlive: () => true });
        return sem.acquire();
      }),
    );
    expect(readdirSync(dir)).toHaveLength(2); // both slots held

    let polls = 0;
    const waiter = new FileGateSemaphore({
      dir,
      slots: 2,
      pid: 999,
      isAlive: () => true,
      pollIntervalMs: 1,
      sleep: async () => {
        polls++;
        if (polls === 2) holders[0]!(); // free a slot on the 2nd poll
      },
    });
    await waiter.acquire();
    expect(polls).toBeGreaterThanOrEqual(2);
    expect(readdirSync(dir)).toHaveLength(2); // the freed slot + the still-held one
  });

  it('reclaims a slot left by a dead lane instead of waiting for it', async () => {
    writeFileSync(
      join(dir, 'gate-semaphore-slot-0.lock'),
      JSON.stringify({ pid: 777, startedAt: 1 }),
    );
    const sem = new FileGateSemaphore({ dir, slots: 1, pid: 333, isAlive: () => false });
    const release = await sem.acquire();
    expect(JSON.parse(readFileSync(join(dir, 'gate-semaphore-slot-0.lock'), 'utf8')).pid).toBe(333);
    release();
  });

  it('release() does not steal a slot now owned by someone else (stale reclaim raced it)', async () => {
    const sem = new FileGateSemaphore({ dir, slots: 1, pid: 111, isAlive: () => false });
    const release = await sem.acquire();
    const path = join(dir, 'gate-semaphore-slot-0.lock');
    writeFileSync(path, JSON.stringify({ pid: 222, startedAt: 2 })); // simulate a reclaim by another lane
    release();
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(222);
  });

  it('release() is idempotent — calling it twice only ever removes the slot once', async () => {
    const sem = new FileGateSemaphore({ dir, slots: 1, pid: 111, isAlive: () => true });
    const release = await sem.acquire();
    release();
    expect(() => release()).not.toThrow();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('FAILS OPEN — gives up waiting past maxWaitMs and runs unslotted rather than blocking forever', async () => {
    // Every slot stays held for the whole test — simulates a wedged sibling.
    const jammed = new FileGateSemaphore({ dir, slots: 1, pid: 1, isAlive: () => true });
    await jammed.acquire();

    let now = 0;
    const waiter = new FileGateSemaphore({
      dir,
      slots: 1,
      pid: 2,
      isAlive: () => true,
      now: () => now,
      maxWaitMs: 100,
      pollIntervalMs: 10,
      sleep: async () => {
        now += 10;
      },
    });
    const release = await waiter.acquire();
    // Still exactly one slot file on disk — jammed's own, never a second one:
    // a fail-open caller must not fabricate a slot it doesn't actually hold.
    expect(readdirSync(dir)).toHaveLength(1);
    expect(() => release()).not.toThrow(); // no-op release, safe to call
    expect(readdirSync(dir)).toHaveLength(1); // still jammed's own slot, untouched
  });

  it('two lanes racing the same slot never both win it', async () => {
    const a = new FileGateSemaphore({ dir, slots: 1, pid: 1, isAlive: () => true });
    const b = new FileGateSemaphore({
      dir,
      slots: 1,
      pid: 2,
      isAlive: () => true,
      pollIntervalMs: 5,
    });
    const releaseA = await a.acquire();
    let bWon = false;
    const bAcquire = b.acquire().then((release) => {
      bWon = true;
      return release;
    });
    // b must still be waiting — a holds the only slot.
    await new Promise((r) => setTimeout(r, 20));
    expect(bWon).toBe(false);
    releaseA();
    const releaseB = await bAcquire;
    expect(bWon).toBe(true);
    releaseB();
  });
});
