// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * How AUTOPILOT authenticates the local Claude Code CLI. The product default is
 * the user's **Claude subscription** (Pro/Max/Team/Enterprise) via the CLI's own
 * `/login` OAuth — no API key, no per-token bill. An **API key**, a headless
 * **subscription OAuth token** (`claude setup-token`), a compatible **endpoint**,
 * **Amazon Bedrock**, and **Google Vertex AI** are opt-in alternatives — every
 * mode drives the same `claude` CLI, routed to a different backend by env vars
 * (docs/epics/0036-provider-parity.md).
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

export type AuthMode =
  'subscription' | 'api-key' | 'oauth-token' | 'endpoint' | 'bedrock' | 'vertex';

export interface AuthConfig {
  readonly mode: AuthMode;
  /** `api-key` mode: the ANTHROPIC_API_KEY value (from the user / a secret store). */
  readonly apiKey?: string;
  /** `oauth-token` mode: the CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`. */
  readonly oauthToken?: string;
  /**
   * `endpoint` mode: an Anthropic-API-compatible base URL (a local Ollama
   * server, DeepSeek's Claude Code-compatible endpoint, a self-hosted
   * gateway, …) — set as `ANTHROPIC_BASE_URL` (code.claude.com/docs/en/env-vars).
   */
  readonly baseUrl?: string;
  /** `endpoint` mode: the bearer credential the endpoint expects, if any (a
   *  local unauthenticated server needs none) — set as `ANTHROPIC_AUTH_TOKEN`. */
  readonly authToken?: string;
  /**
   * `bedrock` mode: the AWS region Amazon Bedrock requests are sent to — set
   * as `AWS_REGION`. Optional: unset, Claude Code falls back to
   * `AWS_DEFAULT_REGION`, the active AWS profile's own region, then
   * `us-east-1` (code.claude.com/docs/en/amazon-bedrock). AWS credentials
   * themselves are never set here — they resolve from the standard AWS SDK
   * credential chain (`AWS_PROFILE`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`,
   * `AWS_BEARER_TOKEN_BEDROCK`, …) already present in the spawn environment.
   */
  readonly awsRegion?: string;
  /** `vertex` mode: the GCP project Google Cloud's Agent Platform (Vertex AI)
   *  requests are addressed to — set as `ANTHROPIC_VERTEX_PROJECT_ID`. Required
   *  for the mode to activate, mirroring `endpoint` mode's required `baseUrl`. */
  readonly gcpProjectId?: string;
  /** `vertex` mode: the Agent Platform region/location (`global`, `us-east5`,
   *  a multi-region such as `eu`/`us`, …) — set as `CLOUD_ML_REGION`. Optional:
   *  unset, Claude Code falls back to `us-east5`. */
  readonly gcpRegion?: string;
}

const API_KEY_ENV = 'ANTHROPIC_API_KEY';
const OAUTH_TOKEN_ENV = 'CLAUDE_CODE_OAUTH_TOKEN';
const BASE_URL_ENV = 'ANTHROPIC_BASE_URL';
const AUTH_TOKEN_ENV = 'ANTHROPIC_AUTH_TOKEN';
const BEDROCK_ENABLE_ENV = 'CLAUDE_CODE_USE_BEDROCK';
const AWS_REGION_ENV = 'AWS_REGION';
const VERTEX_ENABLE_ENV = 'CLAUDE_CODE_USE_VERTEX';
const VERTEX_REGION_ENV = 'CLOUD_ML_REGION';
const VERTEX_PROJECT_ENV = 'ANTHROPIC_VERTEX_PROJECT_ID';

/** The default: the user's Claude subscription via the local Claude Code login. */
export const DEFAULT_AUTH: AuthConfig = { mode: 'subscription' };

/**
 * The environment overrides for spawning the `claude` CLI under `auth`. Returns a
 * NEW env (never mutates the input). The credentials we manage are always cleared
 * first so modes never leak into each other; then the chosen mode's credential is
 * set. Subscription mode leaves all of them unset → the CLI uses its stored
 * `/login` OAuth (and a stray ambient key can no longer override it). The same
 * stripping applies to every other mode's variables: a Bedrock/Vertex enable flag
 * or a proxy override left over from a prior run must never silently redirect
 * traffic meant for a different mode.
 */
export function resolveClaudeEnv(auth: AuthConfig, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  delete env[API_KEY_ENV];
  delete env[OAUTH_TOKEN_ENV];
  delete env[BASE_URL_ENV];
  delete env[AUTH_TOKEN_ENV];
  delete env[BEDROCK_ENABLE_ENV];
  delete env[AWS_REGION_ENV];
  delete env[VERTEX_ENABLE_ENV];
  delete env[VERTEX_REGION_ENV];
  delete env[VERTEX_PROJECT_ENV];

  if (auth.mode === 'api-key' && auth.apiKey) env[API_KEY_ENV] = auth.apiKey;
  if (auth.mode === 'oauth-token' && auth.oauthToken) env[OAUTH_TOKEN_ENV] = auth.oauthToken;
  if (auth.mode === 'endpoint' && auth.baseUrl) {
    env[BASE_URL_ENV] = auth.baseUrl;
    if (auth.authToken) env[AUTH_TOKEN_ENV] = auth.authToken;
  }
  if (auth.mode === 'bedrock') {
    env[BEDROCK_ENABLE_ENV] = '1';
    if (auth.awsRegion) env[AWS_REGION_ENV] = auth.awsRegion;
  }
  if (auth.mode === 'vertex' && auth.gcpProjectId) {
    env[VERTEX_ENABLE_ENV] = '1';
    env[VERTEX_PROJECT_ENV] = auth.gcpProjectId;
    if (auth.gcpRegion) env[VERTEX_REGION_ENV] = auth.gcpRegion;
  }
  return env;
}

/** Whether the config carries the credential its mode requires to authenticate. */
export function isAuthReady(auth: AuthConfig): boolean {
  if (auth.mode === 'api-key') return typeof auth.apiKey === 'string' && auth.apiKey.length > 0;
  if (auth.mode === 'oauth-token') {
    return typeof auth.oauthToken === 'string' && auth.oauthToken.length > 0;
  }
  // A base URL is required; authToken is not — some endpoints (a local,
  // unauthenticated Ollama server) need no credential at all.
  if (auth.mode === 'endpoint') return typeof auth.baseUrl === 'string' && auth.baseUrl.length > 0;
  // A GCP project is required to address Agent Platform requests; awsRegion
  // is not — bedrock mode has no required field (AWS credentials resolve
  // from the ambient SDK chain, outside this config).
  if (auth.mode === 'vertex') {
    return typeof auth.gcpProjectId === 'string' && auth.gcpProjectId.length > 0;
  }
  // Subscription/bedrock rely on credentials outside this config (the CLI's
  // stored login, or the ambient AWS SDK credential chain); readiness can
  // only be confirmed by the CLI itself (run `claude` once, or check `/status`).
  return true;
}

/** A human, secret-free description of how the CLI will authenticate. */
export function describeAuth(auth: AuthConfig): string {
  switch (auth.mode) {
    case 'api-key':
      return 'Anthropic API key';
    case 'oauth-token':
      return 'Claude subscription (headless OAuth token)';
    case 'endpoint':
      return `Custom endpoint (${auth.baseUrl ?? 'not configured'})`;
    case 'bedrock':
      return `Amazon Bedrock${auth.awsRegion ? ` (${auth.awsRegion})` : ''}`;
    case 'vertex':
      return `Google Vertex AI (project: ${auth.gcpProjectId ?? 'not configured'})`;
    default:
      return 'Claude subscription (Claude Code login)';
  }
}
