// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * OVER-THE-AIR UPDATE (operator ask, 2026-09-05): a user running an older
 * version sees a sticky masthead banner with a one-click update — and the
 * update NEVER clobbers their progress. The whole design bends around that
 * one promise:
 *
 * - Dirty working tree → refuse by default, telling the user their work is
 *   untouched — or, when they explicitly choose the stash strategy, park it
 *   in `git stash` (with `-u`) and say exactly how to get it back.
 * - Local commits the released line doesn't have → `git pull --ff-only`
 *   refuses by construction; we surface "push or land your work first" and
 *   touch nothing. If we stashed for this attempt, the stash is popped back
 *   so the tree is byte-for-byte what it was.
 * - A live flight on this checkout → refuse (`isAnyFlightLockLive` is the
 *   same cross-process check landing uses); updating under a flying agent
 *   is exactly the primary-checkout race documented in epic 0002.
 *
 * The version check shells `git ls-remote --tags origin` — no GitHub API,
 * no token, works for every clone — and compares the highest `v<x.y.z>` tag
 * against the running `PRODUCT_VERSION`. Results are cached (default 6h) so
 * the masthead poll costs one subprocess per session, not per tick.
 *
 * Both APIs take the injectable `CommandRunner` (`github/execute.ts`) so
 * tests never touch a real git/network — the same seam every execute leg in
 * this codebase already uses.
 */

import { realRunner, type CommandRunner } from '../github/execute.js';

/** Highest `refs/tags/v<x.y.z>` version in `git ls-remote --tags` output —
 *  undefined when no such tag exists. Pre-release-suffixed tags are ignored
 *  (an OTA banner should never advertise `v1.0.0-rc.1` to end users). */
export function latestVersionFromTags(lsRemoteOutput: string): string | undefined {
  let best: string | undefined;
  for (const line of lsRemoteOutput.split('\n')) {
    const match = /refs\/tags\/v(\d+\.\d+\.\d+)(?:\^\{\})?$/.exec(line.trim());
    if (!match) continue;
    const version = match[1]!;
    if (best === undefined || isNewerVersion(version, best)) best = version;
  }
  return best;
}

/** Numeric SemVer comparison: is `candidate` strictly newer than `current`?
 *  Unparseable inputs compare as NOT newer — an OTA banner must never fire
 *  off garbage. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string): number[] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}

export interface UpdateCheckResult {
  readonly current: string;
  readonly latest?: string | undefined;
  readonly updateAvailable: boolean;
  readonly checkedAt: number;
}

export type UpdateCheckApi = (force?: boolean) => Promise<UpdateCheckResult>;

const DEFAULT_CHECK_CACHE_MS = 6 * 60 * 60 * 1000;

/** Builds the version-check read. Degrades to "no update" on any git/network
 *  failure — a banner that cries wolf when offline would train users to
 *  ignore it. */
export function createUpdateCheckApi(
  cwd: string,
  currentVersion: string,
  runCommand: CommandRunner = realRunner,
  cacheMs: number = DEFAULT_CHECK_CACHE_MS,
  now: () => number = Date.now,
): UpdateCheckApi {
  let cached: UpdateCheckResult | undefined;
  return async (force = false) => {
    if (!force && cached && now() - cached.checkedAt < cacheMs) return cached;
    let latest: string | undefined;
    try {
      const result = await runCommand('git', ['ls-remote', '--tags', 'origin'], cwd);
      if (result.exitCode === 0) latest = latestVersionFromTags(result.stdout);
    } catch {
      latest = undefined;
    }
    cached = {
      current: currentVersion,
      latest,
      updateAvailable: latest !== undefined && isNewerVersion(latest, currentVersion),
      checkedAt: now(),
    };
    return cached;
  };
}

export type UpdateExecuteReason =
  | 'updated'
  | 'up-to-date'
  | 'flight-live'
  | 'dirty'
  | 'diverged'
  | 'pull-failed'
  | 'install-failed';

export interface UpdateExecuteResult {
  readonly ok: boolean;
  readonly reason: UpdateExecuteReason;
  readonly details: string;
  /** Present when the caller chose the stash strategy and the stash was
   *  created (and, on success, KEPT — `git stash pop` restores it). */
  readonly stashed?: boolean;
  /** True when the server is about to restart onto the new build — the
   *  client should expect the connection to drop and then reload. */
  readonly restarting?: boolean;
}

export type UpdateExecuteApi = (strategy?: 'stash') => Promise<UpdateExecuteResult>;

export interface UpdateExecuteDeps {
  /** Cross-process "a flight owns this checkout" check (`flight/lock.ts`). */
  readonly isFlightLive: () => boolean;
  /** Fires the detached rebuild-and-restart (control CLI); called last. */
  readonly restart: () => void;
}

/**
 * Builds the one-click update execute. Order of guards is the point: flight
 * lock → dirty tree → ff-only pull → install → restart. Every refusal path
 * leaves the tree exactly as found (including popping a stash this attempt
 * created), and every message tells the user what their next move is.
 */
export function createUpdateExecuteApi(
  cwd: string,
  deps: UpdateExecuteDeps,
  runCommand: CommandRunner = realRunner,
): UpdateExecuteApi {
  return async (strategy) => {
    if (deps.isFlightLive()) {
      return {
        ok: false,
        reason: 'flight-live',
        details:
          'A flight is live on this checkout — updating under it risks exactly the mid-flight clobber the harness guards against. Let it land (or stop it), then update.',
      };
    }

    const status = await runCommand('git', ['status', '--porcelain'], cwd);
    if (status.exitCode !== 0) {
      return {
        ok: false,
        reason: 'pull-failed',
        details: status.stderr.trim() || 'git status failed',
      };
    }
    const dirtyCount = status.stdout.split('\n').filter((l) => l.trim() !== '').length;

    let stashed = false;
    if (dirtyCount > 0) {
      if (strategy !== 'stash') {
        return {
          ok: false,
          reason: 'dirty',
          details:
            `${dirtyCount} file(s) carry local progress — nothing was touched. ` +
            'Commit and push it, or choose "stash and update" to park it safely (git stash pop brings it back after).',
        };
      }
      const stash = await runCommand(
        'git',
        ['stash', 'push', '-u', '-m', `autopilot-pre-update-${new Date().toISOString()}`],
        cwd,
      );
      if (stash.exitCode !== 0) {
        return {
          ok: false,
          reason: 'dirty',
          details: stash.stderr.trim() || 'git stash failed — nothing was touched.',
        };
      }
      stashed = true;
    }

    const pull = await runCommand('git', ['pull', '--ff-only', 'origin'], cwd);
    if (pull.exitCode !== 0) {
      if (stashed) await runCommand('git', ['stash', 'pop'], cwd);
      const diverged = /fatal:|non-fast-forward|divergent|not possible to fast-forward/i.test(
        pull.stderr,
      );
      return {
        ok: false,
        reason: diverged ? 'diverged' : 'pull-failed',
        details: diverged
          ? 'Your clone carries commits the released line does not have — push or land them first; nothing was touched (your stash, if made, was restored).'
          : pull.stderr.trim() || 'git pull failed',
      };
    }
    if (/Already up to date/i.test(pull.stdout)) {
      if (stashed) await runCommand('git', ['stash', 'pop'], cwd);
      return { ok: true, reason: 'up-to-date', details: 'Already on the latest version.' };
    }

    const install = await runCommand('pnpm', ['install', '--frozen-lockfile'], cwd);
    if (install.exitCode !== 0) {
      return {
        ok: false,
        reason: 'install-failed',
        details:
          (install.stderr.trim() || 'pnpm install failed') +
          (stashed ? ' — your stashed progress is intact (git stash pop).' : ''),
      };
    }

    deps.restart();
    return {
      ok: true,
      reason: 'updated',
      details: stashed
        ? 'Updated — restarting onto the new build. Your progress is parked in git stash; run "git stash pop" to bring it back.'
        : 'Updated — restarting onto the new build.',
      stashed,
      restarting: true,
    };
  };
}
