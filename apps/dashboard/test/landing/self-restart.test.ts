// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { spawn } from 'node:child_process';
import type * as ChildProcess from 'node:child_process';
import {
  createBuildRunner,
  createSelfRestartTrigger,
  needsShell,
} from '../../src/landing/self-restart.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>();
  // Wraps the REAL spawn (calls through) so the "real spawn" describe block
  // below is unaffected — only adds the ability to assert on the exact
  // options object a call was made with.
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A target whose `stopSelf` never resolves until `releaseStop()` is called —
 *  lets a test observe ordering (did start() wait for the port to be freed?)
 *  instead of racing real timers. */
function deferredTarget(url: string | null) {
  const calls: string[] = [];
  let releaseStop: () => void = () => {};
  const stopSelf = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        releaseStop = () => {
          calls.push('stopSelf');
          resolve();
        };
      }),
  );
  const start = vi.fn(() => {
    calls.push('start');
    return { url };
  });
  return { stopSelf, start, calls, release: () => releaseStop() };
}

describe('createSelfRestartTrigger', () => {
  it('releases its own port (stopSelf) BEFORE spawning the replacement — never both bound to the same port at once', async () => {
    const target = deferredTarget('http://127.0.0.1:4317');
    const exit = vi.fn();
    const verifyHealth = vi.fn(() => Promise.resolve(true));
    const trigger = createSelfRestartTrigger({ run: () => Promise.resolve(true) }, target, {
      verifyHealth,
      exit,
    });
    trigger();
    await flush();
    // start() must not have been called yet — stopSelf() hasn't resolved.
    expect(target.start).not.toHaveBeenCalled();
    target.release();
    await flush();
    await flush();
    expect(target.calls).toEqual(['stopSelf', 'start']);
  });

  it('verifies the respawned server is actually healthy before exiting 0', async () => {
    const target = {
      stopSelf: () => Promise.resolve(),
      start: () => ({ url: 'http://127.0.0.1:4317' }),
    };
    const exit = vi.fn();
    const verifyHealth = vi.fn(() => Promise.resolve(true));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const trigger = createSelfRestartTrigger({ run: () => Promise.resolve(true) }, target, {
      verifyHealth,
      exit,
    });
    trigger();
    await flush();
    await flush();
    expect(verifyHealth).toHaveBeenCalledWith('http://127.0.0.1:4317');
    expect(exit).toHaveBeenCalledWith(0);
    // A verified restart is a silent success — no "never answered" warning.
    expect(stderr).not.toHaveBeenCalled();
    stderr.mockRestore();
  });

  it('never calls verifyHealth when the respawned server reports no url — short-circuits to unverified', async () => {
    const target = { stopSelf: () => Promise.resolve(), start: () => ({ url: null }) };
    const exit = vi.fn();
    const verifyHealth = vi.fn(() => Promise.resolve(true));
    const trigger = createSelfRestartTrigger({ run: () => Promise.resolve(true) }, target, {
      verifyHealth,
      exit,
    });
    trigger();
    await flush();
    await flush();
    expect(verifyHealth).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('does NOT silently claim success when the respawned server never answers health — exits nonzero instead', async () => {
    const target = {
      stopSelf: () => Promise.resolve(),
      start: () => ({ url: 'http://127.0.0.1:4317' }),
    };
    const exit = vi.fn();
    const verifyHealth = vi.fn(() => Promise.resolve(false));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const trigger = createSelfRestartTrigger({ run: () => Promise.resolve(true) }, target, {
      verifyHealth,
      exit,
    });
    trigger();
    await flush();
    await flush();
    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr).toHaveBeenCalledWith(
      '[self-restart] rebuild landed but the respawned server never answered its health check — start it manually.\n',
    );
    stderr.mockRestore();
  });

  it('uses the real health check (GET {url}/api/health) when verifyHealth is not overridden', async () => {
    const target = {
      stopSelf: () => Promise.resolve(),
      start: () => ({ url: 'http://127.0.0.1:4317' }),
    };
    const exit = vi.fn();
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const trigger = createSelfRestartTrigger({ run: () => Promise.resolve(true) }, target, {
      exit,
    });
    trigger();
    await flush();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:4317/api/health', expect.anything());
    expect(exit).toHaveBeenCalledWith(0);
    vi.unstubAllGlobals();
  });

  it('exits the real process (not a no-op) when exit is not overridden', async () => {
    const target = { stopSelf: () => Promise.resolve(), start: () => ({ url: null }) };
    const realExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const trigger = createSelfRestartTrigger({ run: () => Promise.resolve(true) }, target);
    trigger();
    await flush();
    await flush();
    expect(realExit).toHaveBeenCalledWith(1);
    realExit.mockRestore();
  });

  it('does NOT restart when the build fails', async () => {
    const target = {
      stopSelf: vi.fn(() => Promise.resolve()),
      start: vi.fn(() => ({ url: 'http://127.0.0.1:4317' })),
    };
    const trigger = createSelfRestartTrigger({ run: () => Promise.resolve(false) }, target);
    trigger();
    await flush();
    expect(target.stopSelf).not.toHaveBeenCalled();
    expect(target.start).not.toHaveBeenCalled();
  });

  it('a REJECTING build is a failed build — no restart, no crash (the landing that killed the server)', async () => {
    // Regression: on Windows, `spawn('pnpm.cmd', …)` without a shell throws a
    // synchronous EINVAL (Node's CVE-2024-27980 hardening). That rejection had
    // no catch, so one landing became an unhandled rejection that killed the
    // SERVER — and the flight running as its child died with it, mid-firing.
    const target = {
      stopSelf: vi.fn(() => Promise.resolve()),
      start: vi.fn(() => ({ url: null })),
    };
    const exit = vi.fn();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const trigger = createSelfRestartTrigger(
      { run: () => Promise.reject(new Error('spawn EINVAL')) },
      target,
      { exit },
    );
    trigger();
    await flush();
    await flush();
    expect(target.stopSelf).not.toHaveBeenCalled();
    expect(target.start).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      '[self-restart] rebuild failed to launch: spawn EINVAL — keeping the current server.\n',
    );
    stderr.mockRestore();
  });

  it('a throw BEFORE the port is released keeps the current server serving (no exit)', async () => {
    const target = {
      stopSelf: vi.fn(() => Promise.reject(new Error('close failed'))),
      start: vi.fn(() => ({ url: null })),
    };
    const exit = vi.fn();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const trigger = createSelfRestartTrigger({ run: () => Promise.resolve(true) }, target, {
      exit,
    });
    trigger();
    await flush();
    await flush();
    expect(target.start).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith('[self-restart] restart failed: close failed\n');
    stderr.mockRestore();
  });

  it('a throw AFTER the port is released exits nonzero — nobody is serving, say so', async () => {
    const target = {
      stopSelf: vi.fn(() => Promise.resolve()),
      start: vi.fn((): { url: string | null } => {
        throw new Error('spawn EINVAL');
      }),
    };
    const exit = vi.fn();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const trigger = createSelfRestartTrigger({ run: () => Promise.resolve(true) }, target, {
      exit,
      verifyHealth: vi.fn(() => Promise.resolve(true)),
    });
    trigger();
    await flush();
    await flush();
    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr).toHaveBeenCalledWith('[self-restart] restart failed: spawn EINVAL\n');
    stderr.mockRestore();
  });

  it('is fire-and-forget — returns before the build settles', () => {
    let settled = false;
    const target = { stopSelf: () => Promise.resolve(), start: () => ({ url: null }) };
    const trigger = createSelfRestartTrigger(
      {
        run: () =>
          new Promise((resolve) =>
            setTimeout(() => {
              settled = true;
              resolve(true);
            }, 10),
          ),
      },
      target,
      // `url: null` -> unverified -> exit(1) once the real 10ms timer fires in
      // the background after this test returns; mock `exit` so that doesn't
      // reach the real process.exit.
      { exit: vi.fn() },
    );
    trigger(); // synchronous — does not await the build internally
    expect(settled).toBe(false);
  });
});

describe('createBuildRunner (real spawn)', () => {
  it('resolves true on a clean exit', async () => {
    const runner = createBuildRunner(process.execPath, ['-e', 'process.exit(0)'], process.cwd());
    expect(await runner.run()).toBe(true);
  });

  it('spawns with its own stdio ignored, the console window hidden, and no shell for a plain binary', async () => {
    const runner = createBuildRunner(process.execPath, ['-e', 'process.exit(0)'], process.cwd());
    await runner.run();
    expect(spawn).toHaveBeenCalledWith(process.execPath, ['-e', 'process.exit(0)'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    });
  });

  it('resolves false on a non-zero exit', async () => {
    const runner = createBuildRunner(process.execPath, ['-e', 'process.exit(1)'], process.cwd());
    expect(await runner.run()).toBe(false);
  });

  it('resolves false when the binary does not exist', async () => {
    const runner = createBuildRunner('nope-not-a-real-binary-xyz', [], process.cwd());
    expect(await runner.run()).toBe(false);
  });

  it('resolves false when spawn throws SYNCHRONOUSLY instead of crashing (Windows EINVAL shape)', async () => {
    // '' is an invalid binary on every platform — spawn throws synchronously,
    // the same failure shape as Windows' EINVAL for `.cmd` shims. Before the
    // fix this rejected (and, unhandled, took the whole server down).
    const runner = createBuildRunner('', [], process.cwd());
    expect(await runner.run()).toBe(false);
  });
});

describe('needsShell', () => {
  it('requires a shell for Windows batch shims (.cmd/.bat, any case)', () => {
    expect(needsShell('pnpm.cmd', 'win32')).toBe(true);
    expect(needsShell('PNPM.CMD', 'win32')).toBe(true);
    expect(needsShell('build.bat', 'win32')).toBe(true);
  });

  it('never for plain binaries, never off Windows', () => {
    expect(needsShell('pnpm', 'win32')).toBe(false);
    expect(needsShell('node', 'win32')).toBe(false);
    expect(needsShell('pnpm.cmd', 'linux')).toBe(false);
    expect(needsShell('pnpm.cmd', 'darwin')).toBe(false);
  });

  it('anchors at the end — a name that merely contains .cmd/.bat mid-string does not match', () => {
    expect(needsShell('pnpm.cmdx', 'win32')).toBe(false);
    expect(needsShell('notbat.exe', 'win32')).toBe(false);
  });
});
