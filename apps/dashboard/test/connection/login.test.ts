// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import {
  loginTerminalCommand,
  launchClaudeLogin,
  realLoginSpawn,
} from '../../src/connection/login.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

// spawn's return type/overloads aren't worth fighting from a test double —
// same untyped-mock approach as apps/dashboard/test/connection/cli-probe.test.ts.
const spawnMock = vi.mocked(spawn) as unknown as {
  mockReset(): void;
  mockImplementation(impl: (...args: unknown[]) => unknown): void;
  mockImplementationOnce(impl: (...args: unknown[]) => unknown): void;
  mock: { calls: unknown[][] };
};

describe('loginTerminalCommand', () => {
  it('opens a cmd terminal running claude on Windows', () => {
    const cmd = loginTerminalCommand('win32', 'login');
    expect(cmd).toEqual({
      bin: 'cmd',
      args: ['/c', 'start', 'AUTOPILOT Claude login', 'cmd', '/k', 'claude'],
    });
  });

  it('uses setup-token when asked', () => {
    const cmd = loginTerminalCommand('win32', 'setup-token');
    expect(cmd).toEqual({
      bin: 'cmd',
      args: ['/c', 'start', 'AUTOPILOT Claude login', 'cmd', '/k', 'claude setup-token'],
    });
  });

  it('uses Terminal via osascript on macOS', () => {
    const cmd = loginTerminalCommand('darwin', 'login');
    expect(cmd).toEqual({
      bin: 'osascript',
      args: ['-e', 'tell application "Terminal" to do script "claude"'],
    });
  });

  it('uses x-terminal-emulator on Linux', () => {
    expect(loginTerminalCommand('linux', 'login')).toEqual({
      bin: 'x-terminal-emulator',
      args: ['-e', 'claude'],
    });
  });
});

describe('launchClaudeLogin', () => {
  it('spawns the platform command and returns it', () => {
    const calls: { bin: string; args: readonly string[] }[] = [];
    const cmd = launchClaudeLogin('login', 'linux', (bin, args) => calls.push({ bin, args }));
    expect(cmd).toEqual({ bin: 'x-terminal-emulator', args: ['-e', 'claude'] });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ bin: 'x-terminal-emulator', args: ['-e', 'claude'] });
  });
});

describe('realLoginSpawn', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('spawns detached + ignored stdio and unrefs the child', () => {
    const on = vi.fn();
    const unref = vi.fn();
    spawnMock.mockImplementation(() => ({ on, unref }));

    realLoginSpawn('x-terminal-emulator', ['-e', 'claude']);

    expect(spawnMock.mock.calls).toHaveLength(1);
    const [bin, args, options] = spawnMock.mock.calls[0] as [string, string[], object];
    expect(bin).toBe('x-terminal-emulator');
    expect(args).toEqual(['-e', 'claude']);
    expect(options).toMatchObject({ detached: true, stdio: 'ignore', windowsHide: false });
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(unref).toHaveBeenCalledOnce();
  });

  it('swallows a missing-terminal error event instead of crashing', () => {
    const on = vi.fn();
    spawnMock.mockImplementation(() => ({ on, unref: vi.fn() }));

    realLoginSpawn('missing-terminal', []);

    const errorHandler = on.mock.calls.find((call) => call[0] === 'error')?.[1] as () => void;
    expect(() => errorHandler()).not.toThrow();
  });

  it('is best-effort when spawn throws synchronously', () => {
    spawnMock.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    expect(() => realLoginSpawn('claude', [])).not.toThrow();
  });
});
