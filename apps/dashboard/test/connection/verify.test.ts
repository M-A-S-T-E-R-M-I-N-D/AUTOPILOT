// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  credentialsFilePath,
  hasStoredLogin,
  verifyClaudeAuth,
  claudeAuthProbe,
  AUTH_PROBE_ARGS,
  type ProbeRun,
} from '../../src/connection/verify.js';

// Non-path-looking home tokens so the no-personal-paths gate stays clean.
const NIX_HOME = 'NIXHOME';
const WIN_HOME = 'WINHOME';

describe('credentialsFilePath', () => {
  it('honors CLAUDE_CONFIG_DIR', () => {
    const p = credentialsFilePath({ CLAUDE_CONFIG_DIR: 'CFGDIR' }, 'linux');
    expect(p?.replace(/\\/g, '/')).toBe('CFGDIR/.credentials.json');
  });

  it('uses USERPROFILE/.claude on Windows and HOME/.claude on Linux', () => {
    expect(credentialsFilePath({ USERPROFILE: WIN_HOME }, 'win32')?.replace(/\\/g, '/')).toBe(
      'WINHOME/.claude/.credentials.json',
    );
    expect(credentialsFilePath({ HOME: NIX_HOME }, 'linux')?.replace(/\\/g, '/')).toBe(
      'NIXHOME/.claude/.credentials.json',
    );
  });

  it('returns null on macOS (Keychain) and when home is unknown', () => {
    expect(credentialsFilePath({ HOME: NIX_HOME }, 'darwin')).toBeNull();
    expect(credentialsFilePath({}, 'linux')).toBeNull();
  });
});

describe('hasStoredLogin', () => {
  it('is true/false from the credentials-file existence', () => {
    const env = { HOME: NIX_HOME };
    expect(hasStoredLogin(env, 'linux', () => true)).toBe(true);
    expect(hasStoredLogin(env, 'linux', () => false)).toBe(false);
  });

  it('is null when the file cannot be located (macOS / no home)', () => {
    expect(hasStoredLogin({ HOME: NIX_HOME }, 'darwin', () => true)).toBeNull();
    expect(hasStoredLogin({}, 'linux', () => true)).toBeNull();
  });
});

function run(code: number, stdout: string): ProbeRun {
  return () => Promise.resolve({ code, stdout });
}

describe('verifyClaudeAuth', () => {
  it('is authenticated when the probe returns a result with no error', async () => {
    const probe = await verifyClaudeAuth(
      run(0, JSON.stringify({ result: 'OK', is_error: false, modelUsage: { fable: {} } })),
    );
    expect(probe.authenticated).toBe(true);
    expect(probe.detail).toBe('fable');
  });

  it('falls back to "authenticated" detail when the envelope has no modelUsed', async () => {
    const probe = await verifyClaudeAuth(run(0, JSON.stringify({ result: 'OK', is_error: false })));
    expect(probe.authenticated).toBe(true);
    expect(probe.detail).toBe('authenticated');
  });

  it('is not authenticated on an api error envelope', async () => {
    const probe = await verifyClaudeAuth(
      run(0, JSON.stringify({ is_error: true, api_error_status: '401' })),
    );
    expect(probe.authenticated).toBe(false);
    expect(probe.detail).toContain('401');
  });

  it('is not authenticated when apiErrorStatus is set without isError', async () => {
    const probe = await verifyClaudeAuth(run(0, JSON.stringify({ api_error_status: '500' })));
    expect(probe.authenticated).toBe(false);
    expect(probe.detail).toBe('error: 500');
  });

  it('falls back to "auth failed" detail when isError is true with no apiErrorStatus', async () => {
    const probe = await verifyClaudeAuth(run(0, JSON.stringify({ is_error: true })));
    expect(probe.authenticated).toBe(false);
    expect(probe.detail).toBe('error: auth failed');
  });

  it('is not authenticated on a non-zero exit with no envelope', async () => {
    const probe = await verifyClaudeAuth(run(1, 'not logged in'));
    expect(probe.authenticated).toBe(false);
    expect(probe.detail).toBe('claude exited 1 — likely not logged in');
  });

  it('is not authenticated on a zero exit with an unparseable/empty envelope', async () => {
    const probe = await verifyClaudeAuth(run(0, 'not json'));
    expect(probe.authenticated).toBe(false);
    expect(probe.detail).toBe('no response from claude');
  });

  it('is not authenticated on a zero exit with an envelope carrying no error signal', async () => {
    const probe = await verifyClaudeAuth(run(0, JSON.stringify({})));
    expect(probe.authenticated).toBe(false);
    expect(probe.detail).toBe('no response from claude');
  });

  it('is not authenticated when the probe itself throws', async () => {
    const probe = await verifyClaudeAuth(() => Promise.reject(new Error('spawn failed')));
    expect(probe.authenticated).toBe(false);
    expect(probe.detail).toBe('could not run claude');
  });
});

describe('AUTH_PROBE_ARGS', () => {
  it('is the minimal one-turn JSON probe', () => {
    expect(AUTH_PROBE_ARGS).toEqual([
      '-p',
      'Reply with exactly: OK',
      '--max-turns',
      '1',
      '--output-format',
      'json',
    ]);
  });
});

describe('claudeAuthProbe', () => {
  it('runs the CLI with the auth-probe args', async () => {
    const exec = vi.fn().mockResolvedValue({ code: 0, stdout: '{}' });
    const probe = claudeAuthProbe(exec);
    await probe();
    expect(exec).toHaveBeenCalledWith('claude', AUTH_PROBE_ARGS);
  });
});
