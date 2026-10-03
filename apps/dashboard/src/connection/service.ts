// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The connection service behind the dashboard's connect screen: report status
 * and apply a new choice. The status DTO carries only booleans + a description —
 * NEVER the secret value. `connect` validates the request, persists the config,
 * and re-reports status.
 */

import { describeAuth, isAuthReady, type AuthConfig, type AuthMode } from '@autopilot/engine';
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
  readonly baseUrl?: unknown;
  readonly authToken?: unknown;
  readonly awsRegion?: unknown;
  readonly gcpProjectId?: unknown;
  readonly gcpRegion?: unknown;
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
  if (config.mode === 'endpoint') {
    // Stryker disable next-line ConditionalExpression,EqualityOperator: same
    // guarantee again — both callers drop an empty or whitespace-only authToken.
    return typeof config.authToken === 'string' && config.authToken.length > 0;
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
    // What the mode itself requires: an endpoint needs its base URL, not a
    // token (a local server takes none), and Bedrock's credentials are the
    // ambient AWS chain's, which only the Test button can confirm.
    ready = isAuthReady(config);
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

/** A string field trimmed, or `undefined` when absent, not a string, or blank. */
function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
}

/** One word naming a cloud region or a GCP project: `eu-west-1`, `global`,
 *  `my-project`, or a legacy domain-scoped project such as `example.com:proj`. */
const CLOUD_NAME = /^[A-Za-z0-9._:-]+$/;

function cloudName(value: unknown, what: string): string | undefined {
  const name = trimmed(value);
  if (name !== undefined && !CLOUD_NAME.test(name)) {
    throw new Error(`${what} must be one word of letters, digits, '.', ':', '_' or '-'`);
  }
  return name;
}

/**
 * The endpoint's base URL, as given. It must be http(s), and it must carry no
 * secret: `describeAuth` names an endpoint by this URL in the status DTO, so
 * userinfo, a query (`?key=…`) or a fragment would reach every screen that
 * renders the description. A credential belongs in the token field, which
 * the status never returns.
 */
function endpointBaseUrl(value: unknown): string {
  const text = trimmed(value);
  if (text === undefined) throw new Error('an endpoint base URL is required');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error('the endpoint base URL must be an http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('the endpoint base URL must be an http(s) URL');
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error(
      'the endpoint base URL must carry no credentials, query or fragment; put a credential in the token field',
    );
  }
  return text;
}

/** The modes that route the same `claude` CLI to another backend (auth.ts).
 *  Each keeps its own fields only, so no other mode's leftovers are stored. */
function routedConfig(input: ConnectInput): AuthConfig | null {
  if (input.mode === 'endpoint') {
    const baseUrl = endpointBaseUrl(input.baseUrl);
    const authToken = trimmed(input.authToken);
    return { mode: 'endpoint', baseUrl, ...(authToken ? { authToken } : {}) };
  }
  if (input.mode === 'bedrock') {
    const awsRegion = cloudName(input.awsRegion, 'the AWS region');
    return { mode: 'bedrock', ...(awsRegion ? { awsRegion } : {}) };
  }
  if (input.mode === 'vertex') {
    const gcpProjectId = cloudName(input.gcpProjectId, 'the GCP project');
    if (gcpProjectId === undefined) throw new Error('a GCP project is required');
    const gcpRegion = cloudName(input.gcpRegion, 'the GCP region');
    return { mode: 'vertex', gcpProjectId, ...(gcpRegion ? { gcpRegion } : {}) };
  }
  return null;
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
  return routedConfig(input) ?? { mode: 'subscription' }; // subscription clears any stored credential
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
