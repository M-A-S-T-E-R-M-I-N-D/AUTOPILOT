// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Probe the local GitHub CLI (`gh`) for presence, version, and login identity —
 * the connect panel's GitHub half (docs/epics/0006-github-connected-mode.md,
 * slice 1). Mirrors `cli-probe.ts`'s shape exactly: same injectable `CliExec`,
 * same "never throw, degrade to absent" discipline. AUTOPILOT never stores or
 * proxies a GitHub token — `gh` owns the credential entirely, so this module
 * only ever reads `gh`'s own opinion of its auth state.
 */

import { parseCliVersion, type CliExec } from './cli-probe.js';

export interface GhStatus {
  readonly present: boolean;
  readonly version: string | null;
  readonly authenticated: boolean;
  readonly login: string | null;
}

/**
 * Parse `gh auth status` output for the authenticated account login. A
 * non-zero exit means `gh` considers itself logged out; on success the login
 * appears after "account <name>" (e.g. "Logged in to github.com account
 * octocat"). No login found is still authenticated=true — the info line
 * format is not guaranteed across `gh` versions.
 */
export function parseGhAuthStatus(
  code: number,
  stdout: string,
): Pick<GhStatus, 'authenticated' | 'login'> {
  if (code !== 0) return { authenticated: false, login: null };
  const match = /account\s+(\S+)/.exec(stdout);
  return { authenticated: true, login: match?.[1] ?? null };
}

/** Full gh status: presence + version (cheap `--version`), then auth + login
 *  identity (`gh auth status`) only when present. Never throws. */
export async function getGhStatus(exec: CliExec): Promise<GhStatus> {
  try {
    const { code, stdout } = await exec('gh', ['--version']);
    if (code !== 0) return { present: false, version: null, authenticated: false, login: null };
    const version = parseCliVersion(stdout);
    const auth = await exec('gh', ['auth', 'status']).catch(() => ({ code: 1, stdout: '' }));
    return { present: true, version, ...parseGhAuthStatus(auth.code, auth.stdout) };
  } catch {
    return { present: false, version: null, authenticated: false, login: null };
  }
}
