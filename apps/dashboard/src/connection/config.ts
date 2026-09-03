// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Persist the Claude connection choice. The default (subscription) stores NO
 * secret — the CLI's own login carries it. Only the opt-in API-key / OAuth-token
 * modes persist a credential, and only to a git-ignored local file written 0600.
 * The value is never logged and never returned by the status API.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_AUTH, type AuthConfig, type AuthMode } from '@autopilot/engine';

const MODES: readonly AuthMode[] = ['subscription', 'api-key', 'oauth-token'];

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
    const apiKey = typeof raw['apiKey'] === 'string' ? raw['apiKey'] : undefined;
    const oauthToken = typeof raw['oauthToken'] === 'string' ? raw['oauthToken'] : undefined;
    return {
      mode,
      ...(apiKey ? { apiKey } : {}),
      ...(oauthToken ? { oauthToken } : {}),
    };
  } catch {
    return DEFAULT_AUTH;
  }
}

/** Persist the connection config to a git-ignored file, best-effort 0600. */
export function writeConnectionConfig(path: string, config: AuthConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600); // no-op on Windows; tightens perms on POSIX
  } catch {
    /* platform without POSIX perms */
  }
}
