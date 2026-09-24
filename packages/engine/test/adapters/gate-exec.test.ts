// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { GateRunner, type GateCommandSpec } from '../../src/adapters/gate.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

// execFile is heavily overloaded (options shape picks the callback signature);
// fighting that overload set from a test double buys nothing, so the mock is
// driven through its untyped vi.fn() surface instead — same approach as
// claude-cli.test.ts's execFile mock.
const execFileMock = vi.mocked(execFile) as unknown as {
  mockReset(): void;
  mockImplementation(impl: (...args: unknown[]) => unknown): void;
  mock: { calls: unknown[][] };
};

type ExecFileCallback = (error: (Error & { code?: unknown }) | null) => void;

describe('GateRunner default execFile wiring (real exec, mocked node:child_process)', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      cb(null);
      return {};
    });
  });

  it('passes cwd, timeout, and windowsHide through to the real execFile — no exec seam injected', async () => {
    const cmd: GateCommandSpec = { bin: 'tsc', args: ['-b'], label: 'typecheck' };
    await new GateRunner({ cwd: '/work/repo', commands: [cmd], timeoutMs: 4321 }).run();

    expect(execFileMock.mock.calls).toHaveLength(1);
    const [, , options] = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    // Exact equality (not toMatchObject) — an options object collapsed to {}
    // would otherwise pass a merely-partial check.
    // maxBuffer (2026-09-13): a full test run's output must never itself read as
    // a crash — execFile kills a child past the default 1 MiB and reports it so.
    expect(options).toEqual({
      cwd: '/work/repo',
      timeout: 4321,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
  });

  /**
   * A STEP NEVER WAITS ON STDIN (2026-09-24). `execFile` hands the child a
   * pipe for stdin and never closes it. The fleet's pushed-range secret scan
   * reads ref updates from stdin the way a pre-push hook is fed them, so as a
   * gate step it blocked until the thirty-minute step timeout and was reported
   * as crashed with no verdict — on every lane, twice per flight. The gate now
   * ends the child's stdin the moment it is spawned, so every step sees EOF.
   */
  it("ends the child's stdin right after spawning, so a step that reads it gets EOF at once", async () => {
    const end = vi.fn();
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      cb(null);
      return { stdin: { end } };
    });
    const cmd: GateCommandSpec = { bin: 'node', args: ['scripts/reads-stdin.mjs'], label: 'scan' };
    await new GateRunner({ cwd: '/work/repo', commands: [cmd] }).run();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('does not reject a step whose child has no stdin handle', async () => {
    // The callback fires on a later tick, as the real execFile's does. With a
    // synchronous callback the promise has already resolved when stdin is
    // touched, and a throw there is swallowed — which is how a `stdin.end()`
    // without the optional chain survived the first mutation run.
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      setImmediate(() => cb(null));
      return {};
    });
    const cmd: GateCommandSpec = { bin: 'tsc', args: ['-b'], label: 'typecheck' };
    await expect(
      new GateRunner({ cwd: '/work/repo', commands: [cmd] }).run(),
    ).resolves.toBeDefined();
  });

  it('falls back to the default timeout when none is given', async () => {
    const cmd: GateCommandSpec = { bin: 'tsc', args: ['-b'], label: 'typecheck' };
    await new GateRunner({ cwd: '/work/repo', commands: [cmd] }).run();

    const [, , options] = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(options['timeout']).toBe(20 * 60 * 1000);
  });
});
