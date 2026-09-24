// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The FACTS `preflight.ts` judges, gathered from the machine: git state of
 * the target and its lane worktrees, the engine lock files, the rescue refs,
 * the build's freshness, free disk, the `claude` binary. Synchronous on
 * purpose — `FlightRunner.start()` is synchronous and every caller of it
 * (the Fly button, the fleet launcher, the fleet watchdog) gets the same
 * gate — and every probe is injectable so the gatherer itself is testable
 * against a real scratch repository without a real `claude`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseLockInfo,
  isProcessAlive,
  parseWorktreeList,
  canonicalWorktreePath,
  describeAuth,
  DEFAULT_CLI_TIMEOUT_MS,
  DEFAULT_CLI_IDLE_TIMEOUT_MS,
} from '@autopilot/engine';
import { cliTimeoutMsFromEnv, cliIdleTimeoutMsFromEnv } from './budget.js';
import { sha256Of } from '../landing/freshness.js';
import { readConnectionConfig } from '../connection/config.js';
import type { PreflightFacts } from './preflight.js';

/** Runs `git` in `cwd`; null on any failure (not a repo, git missing). */
export type GitRun = (cwd: string, args: readonly string[]) => string | null;

export const defaultGitRun: GitRun = (cwd, args) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
};

/** The `claude --version` line, or null when the binary is not there. */
export type CliVersionProbe = () => string | null;

let cachedCliVersion: { value: string | null } | null = null;

export const defaultCliVersionProbe: CliVersionProbe = () => {
  // One probe per process: the answer does not change while the dashboard
  // runs, and a second `claude --version` costs a second nobody asked for.
  if (cachedCliVersion !== null) return cachedCliVersion.value;
  let value: string | null;
  try {
    value = execFileSync('claude', ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    value = null;
  }
  cachedCliVersion = { value };
  return value;
};

/** The hot path of every firing, relative to the repository root that ships
 *  the dashboard. Freshness is judged by CONTENT, the same way the landing
 *  code is (`landing/freshness.ts`): the build step writes a sha256 of each
 *  of these into {@link FLIGHT_STAMP_FILE}, and a source whose hash no
 *  longer matches has not been built. Modification times cannot do this —
 *  `tsc -b` leaves an output alone when its source's content is unchanged,
 *  and a formatter or a checkout touches sources without changing them. */
export const HOT_SOURCES = [
  'apps/dashboard/src/fly.ts',
  'packages/engine/src/loop.ts',
  'packages/engine/src/firing.ts',
  'packages/engine/src/adapters/claude-cli.ts',
  'packages/engine/src/adapters/worktree.ts',
] as const;

/** Written by `scripts/build/stamp-landing-code.mjs` after `tsc -b`. */
export const FLIGHT_STAMP_FILE = 'apps/dashboard/dist/flight/freshness-stamp.json';

export interface GatherOptions {
  readonly runGit?: GitRun;
  readonly cliVersion?: CliVersionProbe;
  /** Free bytes on the volume holding `target`; injectable for tests. */
  readonly freeBytes?: (target: string) => number | null;
  /** The repository the dashboard itself runs from (for build freshness);
   *  omitted means "unknown", which reports null rather than guessing. */
  readonly repoRoot?: string;
  /** Overrides the auth description instead of reading `connection.json`
   *  beside the store (`dbDir`) — tests inject this rather than writing a
   *  real config file. */
  readonly authDescription?: string;
  readonly laneCount?: number;
  readonly env?: NodeJS.ProcessEnv;
}

export function defaultFreeBytes(target: string): number | null {
  try {
    const s = statfsSync(target);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

function readStamp(repoRoot: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(repoRoot, FLIGHT_STAMP_FILE), 'utf8'));
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** True when any hot source's content differs from what the last build
 *  stamped (or the stamp has no entry for a source that exists); null
 *  when there is no stamp or no source to compare — a packaged install
 *  without sources, or a checkout never built. */
export function distOlderThanSource(repoRoot: string): boolean | null {
  const stamp = readStamp(repoRoot);
  if (stamp === null) return null;
  let compared = 0;
  for (const source of HOT_SOURCES) {
    let content: Uint8Array;
    try {
      content = readFileSync(join(repoRoot, source));
    } catch {
      continue;
    }
    if (stamp[source] !== sha256Of(content)) return true;
    compared += 1;
  }
  return compared === 0 ? null : false;
}

/** Engine lock files under `dbDir` whose owner process is dead. */
export function staleEngineLocks(dbDir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dbDir);
  } catch {
    return [];
  }
  const stale: string[] = [];
  for (const entry of entries) {
    if (!entry.startsWith('engine-') || !entry.endsWith('.lock')) continue;
    let raw: string;
    try {
      raw = readFileSync(join(dbDir, entry), 'utf8');
    } catch {
      continue;
    }
    const info = parseLockInfo(raw);
    if (info !== null && !isProcessAlive(info.pid)) stale.push(entry);
  }
  return stale;
}

function countLines(text: string | null): number {
  if (text === null) return 0;
  return text.split('\n').filter((line) => line.trim() !== '').length;
}

export function gatherPreflightFacts(
  target: string,
  dbDir: string,
  opts: GatherOptions = {},
): PreflightFacts {
  const runGit = opts.runGit ?? defaultGitRun;
  const env = opts.env ?? process.env;

  const status = runGit(target, ['status', '--porcelain']);
  const targetDirty = status === null ? null : countLines(status);

  const name = runGit(target, ['config', 'user.name']);
  const email = runGit(target, ['config', 'user.email']);
  const gitIdentity = {
    name: name !== null && name.trim() !== '' ? name.trim() : null,
    email: email !== null && email.trim() !== '' ? email.trim() : null,
  };

  const dirtyLanes: string[] = [];
  const worktrees = runGit(target, ['worktree', 'list', '--porcelain']);
  if (worktrees !== null) {
    // git echoes each worktree in its OS-canonical spelling (symlinks
    // resolved, Windows 8.3 names expanded); the target arrives as the
    // caller typed it — compare both in canonical form (worktree.ts).
    const main = canonicalWorktreePath(target);
    for (const entry of parseWorktreeList(worktrees)) {
      if (canonicalWorktreePath(entry.path) === main) continue;
      if (!existsSync(entry.path)) continue;
      const laneStatus = runGit(entry.path, ['status', '--porcelain']);
      if (laneStatus !== null && countLines(laneStatus) > 0) dirtyLanes.push(entry.path);
    }
  }

  const parked = runGit(target, ['for-each-ref', 'refs/autopilot/parked']);
  const parkedHeads = countLines(parked);

  const version = (opts.cliVersion ?? defaultCliVersionProbe)();

  return {
    targetDirty,
    gitIdentity,
    freeBytes: (opts.freeBytes ?? defaultFreeBytes)(target),
    distOlderThanSource: opts.repoRoot === undefined ? null : distOlderThanSource(opts.repoRoot),
    staleLocks: staleEngineLocks(dbDir),
    dirtyLanes,
    parkedHeads,
    cli: { found: version !== null, version },
    // `dbDir` is the same directory main.ts and cli.ts each derive their
    // connection.json path from (dirname(dbPath)) — reading the REAL
    // configured mode here means every caller gets an honest answer without
    // having to thread its own connection config through (BUG: this used to
    // hardcode the subscription description regardless of mode).
    authDescription:
      opts.authDescription ?? describeAuth(readConnectionConfig(join(dbDir, 'connection.json'))),
    caps: {
      wallClockMin: Math.round((cliTimeoutMsFromEnv(env) ?? DEFAULT_CLI_TIMEOUT_MS) / 60_000),
      idleMin: Math.round((cliIdleTimeoutMsFromEnv(env) ?? DEFAULT_CLI_IDLE_TIMEOUT_MS) / 60_000),
    },
    laneCount: opts.laneCount ?? 1,
  };
}
