// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  openSync,
  closeSync,
} from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileInstanceLock,
  parseLockInfo,
  isLockStale,
  isProcessAlive,
} from '../../src/adapters/instance-lock.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    unlinkSync: vi.fn(actual.unlinkSync),
    openSync: vi.fn(actual.openSync),
    closeSync: vi.fn(actual.closeSync),
  };
});

describe('parseLockInfo', () => {
  it('parses a well-formed lock payload', () => {
    expect(parseLockInfo('{"pid":123,"startedAt":456}')).toEqual({ pid: 123, startedAt: 456 });
  });

  it.each([
    'not json',
    '{}',
    '{"pid":"123","startedAt":456}',
    '{"pid":0,"startedAt":456}',
    '{"pid":-1,"startedAt":1}',
    '{"pid":1.5,"startedAt":1}',
    '{"pid":123,"startedAt":"456"}',
  ])('returns null for unparseable/invalid content: %s', (raw) => {
    expect(parseLockInfo(raw)).toBeNull();
  });
});

describe('isLockStale', () => {
  it('is stale when info is null (corrupt/missing)', () => {
    expect(isLockStale(null, () => true)).toBe(true);
  });

  it('is stale when the owning pid is no longer alive', () => {
    expect(isLockStale({ pid: 1, startedAt: 0 }, () => false)).toBe(true);
  });

  it('is NOT stale when the owning pid is alive', () => {
    expect(isLockStale({ pid: 1, startedAt: 0 }, () => true)).toBe(false);
  });
});

describe('isProcessAlive', () => {
  it('reports the current process as alive', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('reports a pid that cannot exist as not alive', () => {
    // PID 0 is reserved/invalid to signal on both POSIX and Windows.
    expect(isProcessAlive(999_999_999)).toBe(false);
  });

  it('treats EPERM as alive — the pid exists, we just lack permission to signal it', () => {
    const originalKill = process.kill;
    process.kill = vi.fn(() => {
      throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    }) as unknown as typeof process.kill;
    try {
      expect(isProcessAlive(1)).toBe(true);
    } finally {
      process.kill = originalKill;
    }
  });
});

describe('FileInstanceLock', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), 'autopilot-lock-'));
    lockPath = join(dir, 'engine.lock');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('acquires a free lock and writes pid + startedAt', () => {
    const lock = new FileInstanceLock(
      lockPath,
      () => true,
      4242,
      () => 1000,
    );
    expect(lock.acquire()).toEqual({ acquired: true });
    expect(existsSync(lockPath)).toBe(true);
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toEqual({ pid: 4242, startedAt: 1000 });
    // A genuinely free lock wins on the FIRST create attempt: no reclaim
    // dance (no unlink of a "stale" lock that was never there) and the fd
    // from that one openSync is always closed.
    expect(unlinkSync).not.toHaveBeenCalled();
    expect(closeSync).toHaveBeenCalledTimes(1);
  });

  it('refuses a second acquire while the holder is alive, reporting its pid', () => {
    const holder = new FileInstanceLock(lockPath, () => true, 111);
    expect(holder.acquire()).toEqual({ acquired: true });

    const challenger = new FileInstanceLock(lockPath, () => true, 222);
    expect(challenger.acquire()).toEqual({ acquired: false, holderPid: 111 });
    // Must read as text, not raw bytes — a Buffer happens to JSON.parse the
    // same for plain-ASCII fixtures, so only pinning the call args (not the
    // outcome) catches a regression here.
    expect(readFileSync).toHaveBeenCalledWith(lockPath, 'utf8');
  });

  it('reclaims a lock left by a dead process', () => {
    writeFileSync(lockPath, JSON.stringify({ pid: 999, startedAt: 1 }));
    const lock = new FileInstanceLock(lockPath, () => false, 333);
    expect(lock.acquire()).toEqual({ acquired: true });
    expect(JSON.parse(readFileSync(lockPath, 'utf8')).pid).toBe(333);
  });

  it('reclaims a corrupt/unparseable lockfile', () => {
    writeFileSync(lockPath, 'not json at all');
    const lock = new FileInstanceLock(lockPath, () => true, 333);
    expect(lock.acquire()).toEqual({ acquired: true });
  });

  it('release() removes the lockfile when this instance owns it', () => {
    const lock = new FileInstanceLock(lockPath, () => true, 111);
    lock.acquire();
    lock.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('release() is a no-op when the lock was never acquired', () => {
    expect(() => new FileInstanceLock(lockPath).release()).not.toThrow();
    expect(existsSync(lockPath)).toBe(false);
    // Never owning the lock means release() must exit at its very first
    // guard — it should never even look at the filesystem.
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it('release() does not steal a lock now owned by someone else', () => {
    const first = new FileInstanceLock(lockPath, () => false, 111);
    first.acquire();
    // Simulate another process reclaiming after `first` went stale/died.
    writeFileSync(lockPath, JSON.stringify({ pid: 222, startedAt: 2 }));
    first.release();
    expect(existsSync(lockPath)).toBe(true);
    expect(JSON.parse(readFileSync(lockPath, 'utf8')).pid).toBe(222);
  });

  it('release() truly gives up ownership after losing a race — a second call is a no-op', () => {
    const first = new FileInstanceLock(lockPath, () => false, 111);
    first.acquire();
    writeFileSync(lockPath, JSON.stringify({ pid: 222, startedAt: 2 }));
    first.release(); // mismatch branch: must clear ownership even though it didn't delete
    unlinkSync(lockPath); // simulate the real owner (222) cleaning up after itself
    vi.mocked(unlinkSync).mockClear();
    expect(() => first.release()).not.toThrow();
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it('release() does not crash when the lockfile vanished before release despite owning it', () => {
    const lock = new FileInstanceLock(lockPath, () => true, 111);
    lock.acquire();
    unlinkSync(lockPath); // external removal — release() must not assume info is non-null
    expect(() => lock.release()).not.toThrow();
  });

  it('a full acquire/release cycle lets a later instance acquire cleanly', () => {
    const first = new FileInstanceLock(lockPath, () => true, 111);
    expect(first.acquire()).toEqual({ acquired: true });
    first.release();
    vi.mocked(unlinkSync).mockClear();
    // A successful delete must also clear ownership — a repeat release()
    // afterward is a no-op, not a second (harmless but observable) unlink.
    expect(() => first.release()).not.toThrow();
    expect(unlinkSync).not.toHaveBeenCalled();

    const second = new FileInstanceLock(lockPath, () => true, 222);
    expect(second.acquire()).toEqual({ acquired: true });
  });

  it('propagates unexpected lock-creation errors (non-EEXIST)', () => {
    // A missing parent directory throws ENOENT, not EEXIST — tryCreate must
    // rethrow rather than treat it as "someone else holds the lock".
    const badPath = join(dir, 'missing-subdir', 'engine.lock');
    const lock = new FileInstanceLock(badPath, () => true, 111);
    expect(() => lock.acquire()).toThrow(/ENOENT/);
  });

  it('reclaims a lock whose file cannot be read despite existing (TOCTOU/permission race)', () => {
    writeFileSync(lockPath, JSON.stringify({ pid: 999, startedAt: 1 }));
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    });

    const lock = new FileInstanceLock(lockPath, () => true, 333);
    expect(lock.acquire()).toEqual({ acquired: true });
    expect(JSON.parse(readFileSync(lockPath, 'utf8')).pid).toBe(333);
  });

  it('loses a benign reclaim race: unlink of a stale lock fails, retry-create also fails', () => {
    // Simulates: our unlink lost to a concurrent process (or the file was
    // already gone) while the on-disk lock is still a live, readable one.
    writeFileSync(lockPath, JSON.stringify({ pid: 999, startedAt: 1 }));
    vi.mocked(unlinkSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    });

    const lock = new FileInstanceLock(lockPath, () => false, 333);
    expect(lock.acquire()).toEqual({ acquired: false, holderPid: 999 });
  });

  it('reports acquired:false with no holderPid when create keeps losing races against a file that never lands (TOCTOU)', () => {
    // openSync always reports EEXIST, but nothing ever actually writes the
    // file — simulates a create that keeps losing to a sibling process whose
    // own write we never observe. readInfo() must short-circuit on
    // existsSync (never call readFileSync) and denied(null) must omit
    // holderPid entirely, not report a stale/fabricated one.
    vi.mocked(openSync).mockImplementation(() => {
      throw Object.assign(new Error('EEXIST: file already exists'), { code: 'EEXIST' });
    });

    const lock = new FileInstanceLock(lockPath, () => true, 333);
    expect(lock.acquire()).toEqual({ acquired: false });
    expect(existsSync(lockPath)).toBe(false);
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it('release() swallows an unlink failure (lockfile already gone) without throwing', () => {
    const lock = new FileInstanceLock(lockPath, () => true, 111);
    lock.acquire();
    vi.mocked(unlinkSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    });
    expect(() => lock.release()).not.toThrow();
  });
});
