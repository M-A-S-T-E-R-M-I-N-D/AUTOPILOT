// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The connection service behind the dashboard's connect screen: report status
 * and apply a new choice. The status DTO carries only booleans + a description —
 * NEVER the secret value. `connect` validates the request, persists the config,
 * and re-reports status.
 */

import { describeAuth, type AuthConfig, type AuthMode } from '@autopilot/engine';
import { readConnectionConfig, writeConnectionConfig, isAuthMode } from './config.js';
import { probeClaudeCli, type CliExec, type CliProbe } from './cli-probe.js';
import {
  hasStoredLogin,
  verifyClaudeAuth,
  type Exists,
  type ProbeRun,
  type AuthProbe,
} from './verify.js';

export interface ConnectionStatus {
  readonly mode: AuthMode;
  /** True if the mode's credential is stored — the value itself is never exposed. */
  readonly hasCredential: boolean;
  readonly cliPresent: boolean;
  readonly cliVersion: string | null;
  /** Subscription: has the CLI actually been logged in? (null = can't tell, e.g. macOS). */
  readonly loggedIn: boolean | null;
  /** Honest readiness — requires real login evidence, not merely an installed CLI. */
  readonly ready: boolean;
  readonly description: string;
}

export interface ConnectInput {
  readonly mode?: unknown;
  readonly apiKey?: unknown;
  readonly oauthToken?: unknown;
}

export interface ConnectionDeps {
  readonly configPath: string;
  readonly exec: CliExec;
  /** Environment + platform + fs-exists for the stored-login heuristic (injectable for tests). */
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly exists?: Exists;
  /** Builds the definitive auth probe for a config (a real `claude -p`). */
  readonly probe?: (config: AuthConfig) => ProbeRun;
}

function credentialStored(config: AuthConfig): boolean {
  if (config.mode === 'api-key')
    // Stryker disable next-line ConditionalExpression,EqualityOperator: both callers
    // that ever produce an api-key AuthConfig guarantee a non-empty apiKey —
    // readConnectionConfig (config.ts) drops a falsy apiKey entirely rather than
    // storing it, and validateConnect (below) throws on an empty/whitespace-only
    // one. So whenever `typeof === 'string'` passes here, length is always >= 1;
    // `> 0` can never observe a 0 to distinguish it from `>= 0` or an always-true.
    return typeof config.apiKey === 'string' && config.apiKey.length > 0;
  if (config.mode === 'oauth-token') {
    // Stryker disable next-line ConditionalExpression,EqualityOperator: same
    // guarantee as the api-key branch above, for oauthToken.
    return typeof config.oauthToken === 'string' && config.oauthToken.length > 0;
  }
  return false;
}

function toStatus(config: AuthConfig, probe: CliProbe, loggedIn: boolean | null): ConnectionStatus {
  const hasCredential = credentialStored(config);
  let ready: boolean;
  if (!probe.present) {
    ready = false;
  } else if (config.mode === 'subscription') {
    // Honest: an installed CLI is NOT a login. Require the credentials file; treat
    // "can't tell" (macOS Keychain) as ready-optimistic — the Test button confirms.
    ready = loggedIn !== false;
  } else {
    ready = hasCredential;
  }
  return {
    mode: config.mode,
    hasCredential,
    cliPresent: probe.present,
    cliVersion: probe.version,
    loggedIn,
    ready,
    description: describeAuth(config),
  };
}

function storedLoginFor(config: AuthConfig, deps: ConnectionDeps): boolean | null {
  if (config.mode !== 'subscription') return null;
  return hasStoredLogin(deps.env ?? process.env, deps.platform ?? process.platform, deps.exists);
}

/** Validate a connect request into an AuthConfig, or throw on bad input. */
export function validateConnect(input: ConnectInput): AuthConfig {
  if (!isAuthMode(input.mode)) throw new Error('invalid auth mode');
  if (input.mode === 'api-key') {
    if (typeof input.apiKey !== 'string' || input.apiKey.trim().length === 0) {
      throw new Error('an API key is required');
    }
    return { mode: 'api-key', apiKey: input.apiKey.trim() };
  }
  if (input.mode === 'oauth-token') {
    if (typeof input.oauthToken !== 'string' || input.oauthToken.trim().length === 0) {
      throw new Error('an OAuth token is required');
    }
    return { mode: 'oauth-token', oauthToken: input.oauthToken.trim() };
  }
  return { mode: 'subscription' }; // clears any stored credential
}

export async function getConnectionStatus(deps: ConnectionDeps): Promise<ConnectionStatus> {
  const config = readConnectionConfig(deps.configPath);
  const probe = await probeClaudeCli(deps.exec);
  return toStatus(config, probe, storedLoginFor(config, deps));
}

export async function applyConnection(
  deps: ConnectionDeps,
  input: ConnectInput,
): Promise<ConnectionStatus> {
  const config = validateConnect(input);
  writeConnectionConfig(deps.configPath, config);
  const probe = await probeClaudeCli(deps.exec);
  return toStatus(config, probe, storedLoginFor(config, deps));
}

/**
 * The DEFINITIVE check: run a minimal real `claude -p` under the stored auth and
 * report whether it authenticated. Spends a tiny bit of quota — on demand only.
 */
export async function testConnection(deps: ConnectionDeps): Promise<AuthProbe> {
  const config = readConnectionConfig(deps.configPath);
  if (!deps.probe) return { authenticated: false, detail: 'no probe configured' };
  return verifyClaudeAuth(deps.probe(config));
}
