// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as NodeFs from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readConnectionConfig,
  writeConnectionConfig,
  isAuthMode,
} from '../../src/connection/config.js';

import { execFileSync } from 'node:child_process';
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return {
    ...actual,
    chmodSync: vi.fn(actual.chmodSync),
    writeFileSync: vi.fn(actual.writeFileSync),
    existsSync: vi.fn(actual.existsSync),
  };
});

let dir: string;
let configPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ap-conn-config-'));
  configPath = join(dir, 'connection.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  vi.mocked(chmodSync).mockRestore();
  vi.mocked(writeFileSync).mockRestore();
  vi.mocked(existsSync).mockRestore();
});

describe('isAuthMode', () => {
  it('accepts every known AuthMode', () => {
    expect(isAuthMode('subscription')).toBe(true);
    expect(isAuthMode('api-key')).toBe(true);
    expect(isAuthMode('oauth-token')).toBe(true);
  });

  it('rejects an unrecognized string', () => {
    expect(isAuthMode('bogus-mode')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isAuthMode(42)).toBe(false);
    expect(isAuthMode(undefined)).toBe(false);
  });
});

describe('readConnectionConfig', () => {
  it('falls back to subscription when the stored mode is not a recognized AuthMode', () => {
    writeFileSync(configPath, JSON.stringify({ mode: 'not-a-real-mode', apiKey: 'k' }));
    expect(readConnectionConfig(configPath)).toEqual({ mode: 'subscription', apiKey: 'k' });
  });

  it('degrades to the subscription default when the file is corrupt (unparsable JSON)', () => {
    writeFileSync(configPath, '{ not json');
    expect(readConnectionConfig(configPath)).toEqual({ mode: 'subscription' });
  });

  it('trusts the existsSync check rather than always attempting a read (a lying existsSync short-circuits to the default even though the file is actually readable)', () => {
    writeFileSync(configPath, JSON.stringify({ mode: 'oauth-token', oauthToken: 'tok' }));
    vi.mocked(existsSync).mockReturnValueOnce(false);
    expect(readConnectionConfig(configPath)).toEqual({ mode: 'subscription' });
  });

  it('carries through a string apiKey for api-key mode', () => {
    writeFileSync(configPath, JSON.stringify({ mode: 'api-key', apiKey: 'sk-live-1' }));
    const result = readConnectionConfig(configPath);
    expect(result).toEqual({ mode: 'api-key', apiKey: 'sk-live-1' });
    expect('apiKey' in result).toBe(true);
  });

  it('omits apiKey when the stored value is not a string', () => {
    writeFileSync(configPath, JSON.stringify({ mode: 'api-key', apiKey: 12345 }));
    const result = readConnectionConfig(configPath);
    expect('apiKey' in result).toBe(false);
    expect(result).toEqual({ mode: 'api-key' });
  });

  it('carries through a string oauthToken for oauth-token mode', () => {
    writeFileSync(configPath, JSON.stringify({ mode: 'oauth-token', oauthToken: 'tok-1' }));
    const result = readConnectionConfig(configPath);
    expect(result).toEqual({ mode: 'oauth-token', oauthToken: 'tok-1' });
    expect('oauthToken' in result).toBe(true);
  });

  it('omits oauthToken when the stored value is not a string', () => {
    writeFileSync(configPath, JSON.stringify({ mode: 'oauth-token', oauthToken: true }));
    const result = readConnectionConfig(configPath);
    expect('oauthToken' in result).toBe(false);
    expect(result).toEqual({ mode: 'oauth-token' });
  });
});

describe('writeConnectionConfig', () => {
  it('writes the JSON config with a 0600 mode option', () => {
    writeConnectionConfig(configPath, { mode: 'subscription' });
    expect(writeFileSync).toHaveBeenCalledWith(configPath, expect.any(String), { mode: 0o600 });
    expect(JSON.parse(NodeFs.readFileSync(configPath, 'utf8'))).toEqual({ mode: 'subscription' });
  });

  it('tightens permissions per platform: chmodSync 0600 on POSIX, an owner-only icacls ACL on win32 (security review row 5 — chmod is a documented no-op on Windows)', () => {
    writeConnectionConfig(configPath, { mode: 'subscription' });
    if (process.platform === 'win32') {
      // The REAL ACL applied by icacls: inheritance stripped, exactly one
      // grant — the current user, full control. Verified against the live
      // file rather than a spied call, so the test proves the OUTCOME.
      // The invariant is "no ORDINARY other user can read": the current
      // user holds (F), and every broad principal is gone. Privileged
      // principals (SYSTEM/Administrators) may legitimately remain on a
      // hardened runner — they read anything regardless (which is why the
      // old exactly-one-grant-line assertion failed there: /inheritance:r
      // strips only INHERITED entries, and runner temp dirs stamp explicit
      // ones; the product now also /remove:g's the broad SIDs).
      const acl = execFileSync('icacls', [configPath], { encoding: 'utf8' });
      expect(acl).toContain(`\\${process.env['USERNAME']}:(F)`);
      expect(acl).not.toContain('Everyone');
      expect(acl).not.toContain('BUILTIN\\Users');
      expect(acl).not.toContain('Authenticated Users');
      expect(chmodSync).not.toHaveBeenCalled();
    } else {
      expect(chmodSync).toHaveBeenCalledWith(configPath, 0o600);
    }
  });

  it('swallows a perms-tightening failure (locked-down platform) without throwing', () => {
    if (process.platform !== 'win32') {
      vi.mocked(chmodSync).mockImplementationOnce(() => {
        throw Object.assign(new Error('ENOTSUP: operation not supported'), { code: 'ENOTSUP' });
      });
    }
    expect(() => writeConnectionConfig(configPath, { mode: 'subscription' })).not.toThrow();
    expect(JSON.parse(NodeFs.readFileSync(configPath, 'utf8'))).toEqual({ mode: 'subscription' });
  });
});
