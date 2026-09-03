// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { makeCliExec, parseCliVersion, probeClaudeCli } from '../../src/connection/cli-probe.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

// execFile is heavily overloaded (options shape picks the callback signature);
// fighting that overload set from a test double buys nothing, so the mock is
// driven through its untyped vi.fn() surface instead — same pattern as
// packages/engine/test/adapters/claude-cli.test.ts.
const execFileMock = vi.mocked(execFile) as unknown as {
  mockReset(): void;
  mockImplementation(impl: (...args: unknown[]) => unknown): void;
  mock: { calls: unknown[][] };
};

type ExecFileCallback = (
  error: (Error & { code?: unknown }) | null,
  stdout: string | null,
  stderr: string,
) => void;

function mockExecFileResult(
  error: (Error & { code?: unknown }) | null,
  stdout: string | null,
): void {
  execFileMock.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as ExecFileCallback;
    cb(error, stdout, '');
    return {};
  });
}

describe('makeCliExec', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('resolves code 0 and the stdout on a clean run', async () => {
    mockExecFileResult(null, '1.2.3 (Claude Code)');

    const exec = makeCliExec();
    const result = await exec('claude', ['--version']);

    expect(result).toEqual({ code: 0, stdout: '1.2.3 (Claude Code)', stderr: '' });
  });

  it('calls execFile with the given binary/args and no-shell options', async () => {
    mockExecFileResult(null, '');

    const exec = makeCliExec({ PATH: '/usr/bin' }, 5_000);
    await exec('claude', ['--version']);

    expect(execFileMock.mock.calls).toHaveLength(1);
    const [binary, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(binary).toBe('claude');
    expect(args).toEqual(['--version']);
    expect(options).toMatchObject({
      windowsHide: true,
      timeout: 5_000,
      env: { PATH: '/usr/bin' },
      maxBuffer: 8 * 1024 * 1024,
    });
  });

  it('maps a numeric err.code straight through as the exit code', async () => {
    mockExecFileResult(Object.assign(new Error('boom'), { code: 127 }), 'partial');

    const exec = makeCliExec();
    const result = await exec('claude', ['--version']);

    expect(result).toEqual({ code: 127, stdout: 'partial', stderr: '' });
  });

  it('falls back to exit code 1 when the error carries no numeric code (e.g. ENOENT)', async () => {
    mockExecFileResult(Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }), '');

    const exec = makeCliExec();
    const result = await exec('claude', ['--version']);

    expect(result).toEqual({ code: 1, stdout: '', stderr: '' });
  });

  it('treats a null stdout as an empty string', async () => {
    mockExecFileResult(null, null);

    const exec = makeCliExec();
    const result = await exec('claude', ['--version']);

    expect(result.stdout).toBe('');
  });
});

describe('parseCliVersion', () => {
  it('extracts an x.y.z version from surrounding text', () => {
    expect(parseCliVersion('1.2.3 (Claude Code)')).toBe('1.2.3');
  });

  it('extracts the version even when it is not at the start', () => {
    expect(parseCliVersion('Claude Code version 10.20.30 build')).toBe('10.20.30');
  });

  it('falls back to the trimmed text when no x.y.z pattern is present', () => {
    expect(parseCliVersion('  unknown output  ')).toBe('unknown output');
  });

  it('returns null for empty stdout', () => {
    expect(parseCliVersion('')).toBeNull();
  });

  it('returns null for whitespace-only stdout', () => {
    expect(parseCliVersion('   \n\t  ')).toBeNull();
  });
});

describe('probeClaudeCli', () => {
  it('reports present + parsed version on a clean exit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '1.2.3' });

    const result = await probeClaudeCli(exec);

    expect(result).toEqual({ present: true, version: '1.2.3' });
  });

  it('defaults the binary to "claude"', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '1.2.3' });

    await probeClaudeCli(exec);

    expect(exec).toHaveBeenCalledWith('claude', ['--version']);
  });

  it('probes the given binary instead of the default', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '1.2.3' });

    await probeClaudeCli(exec, 'claude-custom');

    expect(exec).toHaveBeenCalledWith('claude-custom', ['--version']);
  });

  it('reports absent on a non-zero exit code, even with stdout present', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '1.2.3' });

    const result = await probeClaudeCli(exec);

    expect(result).toEqual({ present: false, version: null });
  });

  it('reports absent when exec rejects', async () => {
    const exec: CliExec = vi.fn().mockRejectedValue(new Error('spawn ENOENT'));

    const result = await probeClaudeCli(exec);

    expect(result).toEqual({ present: false, version: null });
  });
});
