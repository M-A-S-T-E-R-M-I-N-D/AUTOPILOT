// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Tell whether the user is ACTUALLY authenticated — not merely whether the CLI is
 * installed. Two signals:
 *   1. a cheap, non-spending heuristic: does the Claude Code credentials file exist
 *      (written by `/login`)?  Paths per the official docs.
 *   2. a definitive check: a minimal real `claude -p` call (spends a tiny bit),
 *      run only on demand behind a "Test connection" button.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseModelEnvelope } from '@autopilot/engine';
import type { CliExec } from './cli-probe.js';

export type Exists = (path: string) => boolean;

/**
 * Path to the Claude Code credentials file, or null when it can't be located
 * (e.g. macOS stores creds in the Keychain, not a file). Honors CLAUDE_CONFIG_DIR;
 * else `%USERPROFILE%\.claude` on Windows / `$HOME/.claude` elsewhere.
 */
export function credentialsFilePath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string | null {
  const configDir = env['CLAUDE_CONFIG_DIR'];
  if (configDir) return join(configDir, '.credentials.json');
  if (platform === 'darwin') return null; // Keychain — no file to probe
  const home = platform === 'win32' ? env['USERPROFILE'] : env['HOME'];
  return home ? join(home, '.claude', '.credentials.json') : null;
}

/**
 * Best-effort "has the CLI been logged in": true/false when we can check the
 * credentials file, `null` when we can't tell (macOS Keychain / unknown home).
 */
export function hasStoredLogin(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: Exists = existsSync,
): boolean | null {
  const path = credentialsFilePath(env, platform);
  if (path === null) return null;
  return exists(path);
}

export interface AuthProbe {
  readonly authenticated: boolean;
  readonly detail: string;
}

export type ProbeRun = () => Promise<{ code: number; stdout: string }>;

/** The minimal probe args — one turn, JSON envelope, trivial prompt. */
export const AUTH_PROBE_ARGS: readonly string[] = [
  '-p',
  'Reply with exactly: OK',
  '--max-turns',
  '1',
  '--output-format',
  'json',
];

/**
 * Definitive auth check: interpret a real `claude -p` envelope. A returned result
 * with no error ⇒ authenticated; an api_error/exit ⇒ not (with the reason).
 */
export async function verifyClaudeAuth(run: ProbeRun): Promise<AuthProbe> {
  try {
    const { code, stdout } = await run();
    const envelope = parseModelEnvelope(stdout);
    if (envelope && !envelope.isError && envelope.result) {
      return { authenticated: true, detail: envelope.modelUsed ?? 'authenticated' };
    }
    if (envelope && (envelope.apiErrorStatus || envelope.isError)) {
      return { authenticated: false, detail: `error: ${envelope.apiErrorStatus ?? 'auth failed'}` };
    }
    if (code !== 0)
      return { authenticated: false, detail: `claude exited ${code} — likely not logged in` };
    return { authenticated: false, detail: 'no response from claude' };
  } catch {
    return { authenticated: false, detail: 'could not run claude' };
  }
}

/** Build a probe runner that spawns the real `claude -p` with the given exec. */
export function claudeAuthProbe(exec: CliExec): ProbeRun {
  return () => exec('claude', AUTH_PROBE_ARGS);
}
