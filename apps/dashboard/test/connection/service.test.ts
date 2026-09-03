// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getConnectionStatus,
  applyConnection,
  testConnection,
  validateConnect,
  type ConnectionDeps,
} from '../../src/connection/service.js';
import { readConnectionConfig } from '../../src/connection/config.js';
import { parseCliVersion, probeClaudeCli, type CliExec } from '../../src/connection/cli-probe.js';

const KEY = 'sk-ant-test-not-real';
const TOKEN = 'oauth-test-not-real';

let dir: string;
let configPath: string;

const cliPresent: CliExec = () => Promise.resolve({ code: 0, stdout: '1.2.3 (Claude Code)' });
const cliMissing: CliExec = () => Promise.reject(new Error('ENOENT'));

// Deterministic stored-login: a fake HOME + injectable existence (no real fs).
function deps(exec: CliExec, loggedIn = true): ConnectionDeps {
  return {
    configPath,
    exec,
    env: { HOME: 'TESTHOME' },
    platform: 'linux',
    exists: () => loggedIn,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ap-conn-'));
  configPath = join(dir, 'connection.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('validateConnect', () => {
  it('rejects an unknown mode', () => {
    expect(() => validateConnect({ mode: 'nope' })).toThrow(/invalid auth mode/);
  });

  it('requires a non-empty api key / oauth token', () => {
    expect(() => validateConnect({ mode: 'api-key', apiKey: '  ' })).toThrow(/API key/);
    expect(() => validateConnect({ mode: 'oauth-token' })).toThrow(/OAuth token/);
  });

  it('trims and keeps the credential; subscription carries none', () => {
    expect(validateConnect({ mode: 'api-key', apiKey: '  k  ' })).toEqual({
      mode: 'api-key',
      apiKey: 'k',
    });
    expect(validateConnect({ mode: 'subscription' })).toEqual({ mode: 'subscription' });
  });

  it('rejects a whitespace-only oauth token (trims before the length check)', () => {
    expect(() => validateConnect({ mode: 'oauth-token', oauthToken: '   ' })).toThrow(
      /OAuth token/,
    );
  });

  it('trims the oauth token before storing it', () => {
    expect(validateConnect({ mode: 'oauth-token', oauthToken: '  tok  ' })).toEqual({
      mode: 'oauth-token',
      oauthToken: 'tok',
    });
  });
});

describe('getConnectionStatus', () => {
  it('defaults to subscription and reflects a present CLI', async () => {
    const status = await getConnectionStatus(deps(cliPresent));
    expect(status).toMatchObject({
      mode: 'subscription',
      hasCredential: false,
      cliPresent: true,
      cliVersion: '1.2.3',
      loggedIn: true,
      ready: true,
    });
    expect(status.description).toMatch(/subscription/i);
  });

  it('is NOT ready for subscription when there is no stored login (the honesty fix)', async () => {
    const status = await getConnectionStatus(deps(cliPresent, false));
    expect(status.cliPresent).toBe(true); // CLI installed…
    expect(status.loggedIn).toBe(false); // …but never logged in
    expect(status.ready).toBe(false); // so NOT connected
  });

  it('is not ready when the CLI is missing', async () => {
    const status = await getConnectionStatus(deps(cliMissing));
    expect(status.cliPresent).toBe(false);
    expect(status.ready).toBe(false);
  });

  it('reports no credential when a stored api key is empty (raw config edge case)', async () => {
    writeFileSync(configPath, JSON.stringify({ mode: 'api-key', apiKey: '' }));
    const status = await getConnectionStatus(deps(cliPresent));
    expect(status).toMatchObject({ mode: 'api-key', hasCredential: false, ready: false });
  });

  it('reports no credential when a stored oauth token is empty (raw config edge case)', async () => {
    writeFileSync(configPath, JSON.stringify({ mode: 'oauth-token', oauthToken: '' }));
    const status = await getConnectionStatus(deps(cliPresent));
    expect(status).toMatchObject({ mode: 'oauth-token', hasCredential: false, ready: false });
  });

  it('ignores a stray credential field from a corrupt/legacy config when mode is subscription', async () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        mode: 'subscription',
        apiKey: 'leftover-key',
        oauthToken: 'leftover-token',
      }),
    );
    const status = await getConnectionStatus(deps(cliPresent));
    expect(status).toMatchObject({ mode: 'subscription', hasCredential: false });
  });

  it('resolves stored-login existence from the injected env, not the real process.env', async () => {
    let capturedPath: string | undefined;
    const status = await getConnectionStatus({
      configPath,
      exec: cliPresent,
      env: { HOME: 'TESTHOME' },
      platform: 'linux',
      exists: (path) => {
        capturedPath = path;
        return true;
      },
    });
    expect(capturedPath).toBe(join('TESTHOME', '.claude', '.credentials.json'));
    expect(status.loggedIn).toBe(true);
  });

  it('testConnection reports "no probe configured" when deps.probe is not provided', async () => {
    const result = await testConnection(deps(cliPresent));
    expect(result).toEqual({ authenticated: false, detail: 'no probe configured' });
  });

  it('testConnection reports authenticated / not from a real-style envelope', async () => {
    const ok = await testConnection({
      ...deps(cliPresent),
      probe: () => () =>
        Promise.resolve({ code: 0, stdout: JSON.stringify({ result: 'OK', is_error: false }) }),
    });
    expect(ok.authenticated).toBe(true);

    const bad = await testConnection({
      ...deps(cliPresent),
      probe: () => () =>
        Promise.resolve({
          code: 0,
          stdout: JSON.stringify({ is_error: true, api_error_status: '401' }),
        }),
    });
    expect(bad.authenticated).toBe(false);
  });
});

describe('applyConnection', () => {
  it('persists an API key (0600 file) and reports hasCredential WITHOUT exposing it', async () => {
    const status = await applyConnection(deps(cliPresent), { mode: 'api-key', apiKey: KEY });
    expect(status).toMatchObject({ mode: 'api-key', hasCredential: true, ready: true });
    // The secret is never part of the status DTO.
    expect(JSON.stringify(status)).not.toContain(KEY);
    // It IS persisted to the local config (used later by the harness).
    expect(existsSync(configPath)).toBe(true);
    expect(readConnectionConfig(configPath)).toEqual({ mode: 'api-key', apiKey: KEY });
  });

  it('switching to subscription clears a previously stored credential', async () => {
    const oauthStatus = await applyConnection(deps(cliPresent), {
      mode: 'oauth-token',
      oauthToken: TOKEN,
    });
    expect(oauthStatus).toMatchObject({
      mode: 'oauth-token',
      hasCredential: true,
      ready: true,
      loggedIn: null,
    });
    expect(readConnectionConfig(configPath)).toMatchObject({ oauthToken: TOKEN });

    const status = await applyConnection(deps(cliPresent), { mode: 'subscription' });
    expect(status).toMatchObject({ mode: 'subscription', hasCredential: false });
    expect(readFileSync(configPath, 'utf8')).not.toContain(TOKEN);
  });

  it('rejects invalid input (bubbles the validation error)', async () => {
    await expect(applyConnection(deps(cliPresent), { mode: 'api-key' })).rejects.toThrow(/API key/);
  });
});

describe('cli-probe', () => {
  it('parses a semver from --version output', () => {
    expect(parseCliVersion('1.2.3 (Claude Code)')).toBe('1.2.3');
    expect(parseCliVersion('weird-build')).toBe('weird-build');
    expect(parseCliVersion('   ')).toBeNull();
  });

  it('reports absent when the probe exits non-zero', async () => {
    const probe = await probeClaudeCli(() => Promise.resolve({ code: 127, stdout: '' }));
    expect(probe).toEqual({ present: false, version: null });
  });
});
