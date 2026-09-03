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
});
