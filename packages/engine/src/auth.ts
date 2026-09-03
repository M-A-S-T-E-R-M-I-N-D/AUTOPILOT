// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * How AUTOPILOT authenticates the local Claude Code CLI. The product default is
 * the user's **Claude subscription** (Pro/Max/Team/Enterprise) via the CLI's own
 * `/login` OAuth — no API key, no per-token bill. An **API key** and a headless
 * **subscription OAuth token** (`claude setup-token`) are opt-in alternatives.
 *
 * Grounded in the official credential precedence: in `-p`/headless mode
 * `ANTHROPIC_API_KEY` is ALWAYS used when present and silently overrides the
 * subscription login. So "subscription" mode must actively STRIP a stray key from
 * the spawned environment — otherwise a key left in the shell would hijack the
 * account. (docs.anthropic.com/en/docs/claude-code/iam)
 *
 * Secrets (the key / token) live only in the runtime `AuthConfig`, are never
 * hardcoded or logged, and flow straight into the spawned CLI's env.
 */

export type AuthMode = 'subscription' | 'api-key' | 'oauth-token';

export interface AuthConfig {
  readonly mode: AuthMode;
  /** `api-key` mode: the ANTHROPIC_API_KEY value (from the user / a secret store). */
  readonly apiKey?: string;
  /** `oauth-token` mode: the CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`. */
  readonly oauthToken?: string;
}

const API_KEY_ENV = 'ANTHROPIC_API_KEY';
const OAUTH_TOKEN_ENV = 'CLAUDE_CODE_OAUTH_TOKEN';

/** The default: the user's Claude subscription via the local Claude Code login. */
export const DEFAULT_AUTH: AuthConfig = { mode: 'subscription' };

/**
 * The environment overrides for spawning the `claude` CLI under `auth`. Returns a
 * NEW env (never mutates the input). The credentials we manage are always cleared
 * first so modes never leak into each other; then the chosen mode's credential is
 * set. Subscription mode leaves BOTH unset → the CLI uses its stored `/login`
 * OAuth (and a stray ambient key can no longer override it).
 */
export function resolveClaudeEnv(auth: AuthConfig, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  delete env[API_KEY_ENV];
  delete env[OAUTH_TOKEN_ENV];

  if (auth.mode === 'api-key' && auth.apiKey) env[API_KEY_ENV] = auth.apiKey;
  if (auth.mode === 'oauth-token' && auth.oauthToken) env[OAUTH_TOKEN_ENV] = auth.oauthToken;
  return env;
}

/** Whether the config carries the credential its mode requires to authenticate. */
export function isAuthReady(auth: AuthConfig): boolean {
  if (auth.mode === 'api-key') return typeof auth.apiKey === 'string' && auth.apiKey.length > 0;
  if (auth.mode === 'oauth-token') {
    return typeof auth.oauthToken === 'string' && auth.oauthToken.length > 0;
  }
  // Subscription relies on the CLI's own stored login; readiness can only be
  // confirmed by the CLI itself (run `claude` once, or check `/status`).
  return true;
}

/** A human, secret-free description of how the CLI will authenticate. */
export function describeAuth(auth: AuthConfig): string {
  switch (auth.mode) {
    case 'api-key':
      return 'Anthropic API key';
    case 'oauth-token':
      return 'Claude subscription (headless OAuth token)';
    default:
      return 'Claude subscription (Claude Code login)';
  }
}
