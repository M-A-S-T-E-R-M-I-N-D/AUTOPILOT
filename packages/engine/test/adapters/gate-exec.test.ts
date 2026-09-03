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
    expect(options).toEqual({ cwd: '/work/repo', timeout: 4321, windowsHide: true });
  });

  it('falls back to the default timeout when none is given', async () => {
    const cmd: GateCommandSpec = { bin: 'tsc', args: ['-b'], label: 'typecheck' };
    await new GateRunner({ cwd: '/work/repo', commands: [cmd] }).run();

    const [, , options] = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(options['timeout']).toBe(10 * 60 * 1000);
  });
});
