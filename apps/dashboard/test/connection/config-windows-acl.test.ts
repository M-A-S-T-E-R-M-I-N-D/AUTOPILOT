// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Windows owner-only ACL, tested on EVERY platform.
 *
 * `restrictToOwnerWindows` is the real counterpart of POSIX 0600 (security
 * review row 5, 2026-09-06): on Windows `chmod` is a documented no-op, so a
 * config file holding an API key is protected by an icacls ACL instead.
 *
 * `config.test.ts` already asserts that ACL — but only `if (process.platform
 * === 'win32')`, by inspecting the real file. Mutation testing runs on
 * `ubuntu-latest`, where that branch never executes, so Stryker reported the
 * whole function as NoCoverage: **20 mutants inside a security control, with
 * nothing in CI able to kill any of them.** A mutant that dropped
 * `/remove:g *S-1-1-0` would leave `Everyone` on the ACL of a file holding an
 * API key, and every CI run would stay green.
 *
 * So this file tests the same function by mocking the platform and the
 * subprocess instead of by observing a real file, which makes it run
 * everywhere. It asserts the exact argv, because in this function the
 * argument list IS the security control: the well-known SIDs are there to be
 * locale-proof (`S-1-1-0` Everyone, `S-1-5-32-545` BUILTIN\Users, `S-1-5-11`
 * Authenticated Users), and `/inheritance:r` alone is not enough because a
 * file born in a directory with EXPLICIT broad ACEs — which GitHub runners
 * create — keeps them.
 *
 * It lives apart from `config.test.ts` deliberately: that file needs the REAL
 * `execFileSync` to read back an actual ACL on Windows, and a module-level
 * mock of `node:child_process` would break it there.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type * as NodeFs from 'node:fs';
import { mkdtempSync, rmSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { writeConnectionConfig } from '../../src/connection/config.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
// chmodSync is spied, not replaced: the POSIX arm of the same branch is only
// exercised on a POSIX box otherwise, so on Windows its mutants survive for
// exactly the mirror-image reason the icacls arm's did on ubuntu. Faking the
// platform in BOTH directions is what makes this pair platform-independent.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return { ...actual, chmodSync: vi.fn(actual.chmodSync) };
});

let dir: string;
let configPath: string;
const realPlatform = process.platform;

/** Pretend to be the platform under test — `platform` is a getter on process. */
function setPlatform(value: string): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ap-conn-acl-'));
  configPath = join(dir, 'connection.json');
  vi.mocked(execFileSync).mockReset();
  vi.mocked(chmodSync).mockClear();
});

afterEach(() => {
  setPlatform(realPlatform);
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('the Windows owner-only ACL', () => {
  it('runs icacls with the exact owner-only argv when the platform is win32', () => {
    setPlatform('win32');
    process.env['USERNAME'] = 'testuser';

    writeConnectionConfig(configPath, { mode: 'subscription' });

    expect(execFileSync).toHaveBeenCalledTimes(1);
    const [command, args, options] = vi.mocked(execFileSync).mock.calls[0]!;
    expect(command).toBe('icacls');
    expect(args).toEqual([
      configPath,
      '/inheritance:r',
      '/grant:r',
      'testuser:F',
      '/remove:g',
      '*S-1-1-0',
      '/remove:g',
      '*S-1-5-32-545',
      '/remove:g',
      '*S-1-5-11',
    ]);
    // windowsHide keeps a console window from flashing on every save; stdio
    // ignore keeps icacls' chatter out of the dashboard's own output.
    expect(options).toMatchObject({ stdio: 'ignore', windowsHide: true });
  });

  it('grants full control to the CURRENT user, not a fixed name', () => {
    setPlatform('win32');
    process.env['USERNAME'] = 'someone.else';

    writeConnectionConfig(configPath, { mode: 'subscription' });

    const [, args] = vi.mocked(execFileSync).mock.calls[0]!;
    expect(args).toContain('someone.else:F');
  });

  it('does not shell out at all when USERNAME is absent', () => {
    setPlatform('win32');
    delete process.env['USERNAME'];

    writeConnectionConfig(configPath, { mode: 'subscription' });

    // No user to grant to means no ACL command — and crucially, still no
    // throw: the config must be written either way.
    expect(execFileSync).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({ mode: 'subscription' });
  });

  it('never runs icacls off win32, and tightens to 0600 instead', () => {
    setPlatform('linux');
    process.env['USERNAME'] = 'testuser';

    writeConnectionConfig(configPath, { mode: 'subscription' });

    expect(execFileSync).not.toHaveBeenCalled();
    // The POSIX arm of the same branch. Asserted here rather than only in
    // config.test.ts's real-platform block, so it is proven on Windows too.
    expect(chmodSync).toHaveBeenCalledWith(configPath, 0o600);
  });

  it('does not chmod on win32 — where it is a documented no-op', () => {
    setPlatform('win32');
    process.env['USERNAME'] = 'testuser';

    writeConnectionConfig(configPath, { mode: 'subscription' });

    expect(chmodSync).not.toHaveBeenCalled();
  });

  it('still writes the config when icacls fails on a locked-down box', () => {
    setPlatform('win32');
    process.env['USERNAME'] = 'testuser';
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('icacls: access denied');
    });

    expect(() => writeConnectionConfig(configPath, { mode: 'api-key', apiKey: 'k' })).not.toThrow();
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({ mode: 'api-key', apiKey: 'k' });
  });
});
