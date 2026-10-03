// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Persist the Claude connection choice. The default (subscription) stores NO
 * secret — the CLI's own login carries it. Only the opt-in API-key / OAuth-token
 * modes, and an endpoint's optional token, persist a credential, and only to a
 * git-ignored local file written 0600. The value is never logged and never
 * returned by the status API.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_AUTH, type AuthConfig, type AuthMode } from '@autopilot/engine';

const MODES: readonly AuthMode[] = [
  'subscription',
  'api-key',
  'oauth-token',
  'endpoint',
  'bedrock',
  'vertex',
];

/** Every string field an `AuthConfig` can carry. `fly.ts` reads a lane's auth
 *  from this file alone, so a field dropped here never reaches the CLI's env. */
const STRING_FIELDS = [
  'apiKey',
  'oauthToken',
  'baseUrl',
  'authToken',
  'awsRegion',
  'gcpProjectId',
  'gcpRegion',
] as const;

export function isAuthMode(value: unknown): value is AuthMode {
  // Stryker disable next-line ConditionalExpression: `.includes()` uses strict
  // equality against a string array, so a non-string `value` can never match
  // regardless of the `typeof` guard — removing it is a runtime no-op, only
  // TypeScript's narrowing (for the `.includes(value)` call below) needs it.
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

/** Read the stored connection config; a missing/corrupt file ⇒ the subscription default. */
export function readConnectionConfig(path: string): AuthConfig {
  if (!existsSync(path)) return DEFAULT_AUTH;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const mode = isAuthMode(raw['mode']) ? raw['mode'] : 'subscription';
    const fields = STRING_FIELDS.flatMap((field) => {
      const value = raw[field];
      return typeof value === 'string' && value !== '' ? [[field, value] as const] : [];
    });
    return { mode, ...Object.fromEntries(fields) };
  } catch {
    return DEFAULT_AUTH;
  }
}

/** Where a Claude flight's `claude` CLI is routed instead of Anthropic's own
 *  API (epic 0036), so the fly bar's row can say so. `host` is set for an
 *  endpoint whose base URL parses, and is only its host: never userinfo, a
 *  path or a query, which a hand-edited file could carry. */
export interface ClaudeBackend {
  readonly kind: 'endpoint' | 'bedrock' | 'vertex';
  readonly host?: string;
}

/** The backend `resolveClaudeEnv` routes `auth` to, judged the way it is: an
 *  endpoint needs its base URL and Vertex its project, or the CLI's env names
 *  neither and it flies Anthropic's own API. Undefined for that API. */
export function claudeBackendOf(auth: AuthConfig): ClaudeBackend | undefined {
  if (auth.mode === 'bedrock') return { kind: 'bedrock' };
  if (auth.mode === 'vertex') return auth.gcpProjectId ? { kind: 'vertex' } : undefined;
  if (auth.mode !== 'endpoint' || !auth.baseUrl) return undefined;
  let host = '';
  try {
    host = new URL(auth.baseUrl).host;
  } catch {
    // Unparseable: the CLI still gets it, so the backend is still named.
  }
  return host ? { kind: 'endpoint', host } : { kind: 'endpoint' };
}

/**
 * Owner-only ACL on Windows — the real counterpart of POSIX 0600, where
 * `chmod` is a documented no-op (security review row 5, 2026-09-06): a
 * config dir on a secondary drive can inherit ACLs far broader than the
 * user profile's, leaving an API key readable by other local accounts.
 * `icacls /inheritance:r` strips inherited grants, then the current user
 * gets full control — nothing else. Best-effort like the chmod path: a
 * hardened box that blocks icacls must not brick saving the config.
 */
function restrictToOwnerWindows(path: string): void {
  const user = process.env['USERNAME'];
  if (!user) return;
  // /inheritance:r strips only INHERITED entries — a file born in a dir with
  // EXPLICIT broad ACEs (GitHub runners do this) keeps them. So the broad
  // principals are also removed by well-known SID (locale-proof: S-1-1-0
  // Everyone, S-1-5-32-545 BUILTIN\Users, S-1-5-11 Authenticated Users).
  // Privileged principals (SYSTEM/Administrators) may remain — they can
  // read anything regardless; the invariant is "no ordinary other user".
  execFileSync(
    'icacls',
    [
      path,
      '/inheritance:r',
      '/grant:r',
      `${user}:F`,
      '/remove:g',
      '*S-1-1-0',
      '/remove:g',
      '*S-1-5-32-545',
      '/remove:g',
      '*S-1-5-11',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
}

/** Persist the connection config to a git-ignored file, owner-only perms
 *  best-effort on BOTH families: 0600 on POSIX, an icacls owner-only ACL on
 *  Windows (where chmod is a no-op). */
export function writeConnectionConfig(path: string, config: AuthConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    if (process.platform === 'win32') restrictToOwnerWindows(path);
    else chmodSync(path, 0o600);
  } catch {
    /* best-effort on locked-down platforms */
  }
}
