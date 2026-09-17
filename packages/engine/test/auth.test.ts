// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  resolveClaudeEnv,
  isAuthReady,
  describeAuth,
  DEFAULT_AUTH,
  type AuthConfig,
} from '../src/auth.js';

const FAKE_KEY = 'sk-ant-test-not-a-real-key';
const FAKE_TOKEN = 'oauth-test-not-a-real-token';
const FAKE_BASE_URL = 'https://compat.example.test/anthropic';

describe('resolveClaudeEnv', () => {
  it('subscription mode STRIPS a stray API key + oauth token (so neither overrides /login)', () => {
    const base = { ANTHROPIC_API_KEY: FAKE_KEY, CLAUDE_CODE_OAUTH_TOKEN: FAKE_TOKEN, PATH: '/bin' };
    const env = resolveClaudeEnv(DEFAULT_AUTH, base);
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['CLAUDE_CODE_OAUTH_TOKEN']).toBeUndefined();
    expect(env['PATH']).toBe('/bin'); // everything else is preserved
  });

  it('does not mutate the caller-supplied base environment', () => {
    const base = { ANTHROPIC_API_KEY: FAKE_KEY };
    resolveClaudeEnv(DEFAULT_AUTH, base);
    expect(base['ANTHROPIC_API_KEY']).toBe(FAKE_KEY); // input untouched
  });

  it('api-key mode sets ANTHROPIC_API_KEY and clears any oauth token', () => {
    const auth: AuthConfig = { mode: 'api-key', apiKey: FAKE_KEY };
    const env = resolveClaudeEnv(auth, { CLAUDE_CODE_OAUTH_TOKEN: FAKE_TOKEN });
    expect(env['ANTHROPIC_API_KEY']).toBe(FAKE_KEY);
    expect(env['CLAUDE_CODE_OAUTH_TOKEN']).toBeUndefined();
  });

  it('oauth-token mode sets CLAUDE_CODE_OAUTH_TOKEN and clears any API key', () => {
    const auth: AuthConfig = { mode: 'oauth-token', oauthToken: FAKE_TOKEN };
    const env = resolveClaudeEnv(auth, { ANTHROPIC_API_KEY: FAKE_KEY });
    expect(env['CLAUDE_CODE_OAUTH_TOKEN']).toBe(FAKE_TOKEN);
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
  });

  it('never sets a credential env var when the value is missing', () => {
    const env = resolveClaudeEnv({ mode: 'api-key' }, {});
    expect('ANTHROPIC_API_KEY' in env).toBe(false);
  });

  it('ignores a stray apiKey/oauthToken field when the mode does not select it', () => {
    const auth: AuthConfig = { mode: 'subscription', apiKey: FAKE_KEY, oauthToken: FAKE_TOKEN };
    const env = resolveClaudeEnv(auth, {});
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['CLAUDE_CODE_OAUTH_TOKEN']).toBeUndefined();
  });

  it('endpoint mode sets ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN and clears the key/oauth pair', () => {
    const auth: AuthConfig = { mode: 'endpoint', baseUrl: FAKE_BASE_URL, authToken: FAKE_TOKEN };
    const env = resolveClaudeEnv(auth, { ANTHROPIC_API_KEY: FAKE_KEY });
    expect(env['ANTHROPIC_BASE_URL']).toBe(FAKE_BASE_URL);
    expect(env['ANTHROPIC_AUTH_TOKEN']).toBe(FAKE_TOKEN);
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
  });

  it('endpoint mode with no authToken sets only the base URL (e.g. an unauthenticated local Ollama server)', () => {
    const env = resolveClaudeEnv({ mode: 'endpoint', baseUrl: FAKE_BASE_URL }, {});
    expect(env['ANTHROPIC_BASE_URL']).toBe(FAKE_BASE_URL);
    expect('ANTHROPIC_AUTH_TOKEN' in env).toBe(false);
  });

  it('never sets ANTHROPIC_BASE_URL when baseUrl is missing, even in endpoint mode', () => {
    const env = resolveClaudeEnv({ mode: 'endpoint' }, {});
    expect('ANTHROPIC_BASE_URL' in env).toBe(false);
  });

  it('every non-endpoint mode strips a stray ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN pair, so a leftover proxy override from a prior endpoint session can never silently redirect subscription/api-key/oauth-token traffic', () => {
    const base = { ANTHROPIC_BASE_URL: FAKE_BASE_URL, ANTHROPIC_AUTH_TOKEN: FAKE_TOKEN };
    expect(resolveClaudeEnv(DEFAULT_AUTH, base)['ANTHROPIC_BASE_URL']).toBeUndefined();
    expect(
      resolveClaudeEnv({ mode: 'api-key', apiKey: FAKE_KEY }, base)['ANTHROPIC_BASE_URL'],
    ).toBeUndefined();
    expect(
      resolveClaudeEnv({ mode: 'oauth-token', oauthToken: FAKE_TOKEN }, base)[
        'ANTHROPIC_AUTH_TOKEN'
      ],
    ).toBeUndefined();
  });
});

describe('isAuthReady', () => {
  it('is always ready for subscription (the CLI login carries it)', () => {
    expect(isAuthReady(DEFAULT_AUTH)).toBe(true);
  });

  it('needs a non-empty key / token for the opt-in modes', () => {
    expect(isAuthReady({ mode: 'api-key' })).toBe(false);
    expect(isAuthReady({ mode: 'api-key', apiKey: '' })).toBe(false);
    expect(isAuthReady({ mode: 'api-key', apiKey: FAKE_KEY })).toBe(true);
    expect(isAuthReady({ mode: 'oauth-token' })).toBe(false);
    expect(isAuthReady({ mode: 'oauth-token', oauthToken: '' })).toBe(false);
    expect(isAuthReady({ mode: 'oauth-token', oauthToken: FAKE_TOKEN })).toBe(true);
  });

  it('endpoint mode needs a non-empty base URL, but not an authToken (some proxies are unauthenticated)', () => {
    expect(isAuthReady({ mode: 'endpoint' })).toBe(false);
    expect(isAuthReady({ mode: 'endpoint', baseUrl: '' })).toBe(false);
    expect(isAuthReady({ mode: 'endpoint', baseUrl: FAKE_BASE_URL })).toBe(true);
  });
});

describe('DEFAULT_AUTH', () => {
  it('defaults to subscription mode', () => {
    expect(DEFAULT_AUTH.mode).toBe('subscription');
  });
});

describe('describeAuth', () => {
  it('is human-readable and never leaks the secret', () => {
    expect(describeAuth(DEFAULT_AUTH)).toBe('Claude subscription (Claude Code login)');
    const desc = describeAuth({ mode: 'api-key', apiKey: FAKE_KEY });
    expect(desc).toMatch(/api key/i);
    expect(desc).not.toContain(FAKE_KEY);
  });

  it('describes oauth-token mode without leaking the token', () => {
    const desc = describeAuth({ mode: 'oauth-token', oauthToken: FAKE_TOKEN });
    expect(desc).toBe('Claude subscription (headless OAuth token)');
    expect(desc).not.toContain(FAKE_TOKEN);
  });

  it('describes endpoint mode with the base URL but never the auth token', () => {
    const desc = describeAuth({ mode: 'endpoint', baseUrl: FAKE_BASE_URL, authToken: FAKE_TOKEN });
    expect(desc).toBe(`Custom endpoint (${FAKE_BASE_URL})`);
    expect(desc).not.toContain(FAKE_TOKEN);
  });

  it('describes endpoint mode with no base URL set yet without throwing', () => {
    expect(describeAuth({ mode: 'endpoint' })).toBe('Custom endpoint (not configured)');
  });
});

describe('resolveClaudeEnv — endpoint mode without a base URL sets NOTHING', () => {
  it('leaves both endpoint variables absent as keys, not present-but-undefined', () => {
    // The guard is `mode === 'endpoint' && baseUrl`. With the baseUrl half
    // gone, the env gains ANTHROPIC_BASE_URL as a key holding undefined — and
    // the auth token rides in beside it, pointed at no endpoint at all. A
    // value check cannot see that; a key check can.
    const env = resolveClaudeEnv({ mode: 'endpoint', authToken: FAKE_TOKEN } as AuthConfig, {});
    expect('ANTHROPIC_BASE_URL' in env).toBe(false);
    expect('ANTHROPIC_AUTH_TOKEN' in env).toBe(false);
  });
});

describe('resolveClaudeEnv — a baseUrl on a NON-endpoint config is ignored', () => {
  it('never sets ANTHROPIC_BASE_URL for api-key mode, even when the config happens to carry one', () => {
    // The guard is `mode === 'endpoint' && baseUrl`, and the mode half is
    // what says a stray baseUrl on an api-key config is not an instruction.
    // Without it, an api-key session would be pointed at whatever URL the
    // config file last held — the key sent to an endpoint nobody chose.
    const env = resolveClaudeEnv(
      { mode: 'api-key', apiKey: 'sk-test', baseUrl: 'http://localhost:9' } as AuthConfig,
      {},
    );
    expect('ANTHROPIC_BASE_URL' in env).toBe(false);
    expect(env['ANTHROPIC_API_KEY']).toBe('sk-test');
  });
});
