// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The CONNECT popover's LTS chip — the I/O half of epic 0006 "GitHub
 * connected mode", slice 4 (board web-mss4lpwr-gptuk4); the pure comparison
 * policy, `ltsChipMeta`, lives in `packages/engine/src/lts-check.ts`. Checks
 * upstream's latest GitHub Release (`gh api repos/<upstream>/releases/latest
 * --jq .tag_name`) via the same injectable `CliExec` shape `gh-probe.ts`
 * already uses — never throws, degrades to `tag: null` (the chip then shows
 * "unknown") on any failure: `gh` absent, unauthenticated, rate-limited, or
 * upstream genuinely has no releases yet.
 *
 * Caching lives here, not at the HTTP layer: {@link createLtsStatusApi}
 * returns an object holding the last result in closure state.
 * `getCached()` never calls `gh` — it is what a GET on panel-open reads.
 * `check()` is the only path that ever shells out, and only ever runs when
 * the operator clicks the popover's "Check for updates" button (a POST) —
 * "operator-triggered, cached" per the epic's slice 4 acceptance criteria;
 * this module never polls or schedules a re-check itself.
 */

import type { CliExec } from './cli-probe.js';
import { ltsChipMeta, type LtsChipMeta } from '@autopilot/engine';

export interface UpstreamRelease {
  readonly tag: string | null;
}

/** One `gh api repos/<repo>/releases/latest` attempt — never throws. A
 *  non-zero exit (no releases yet, repo not found, `gh` unauthenticated) or
 *  empty output both degrade to `tag: null`, same "absent, not an error"
 *  stance as `getGhStatus`. */
export async function fetchLatestRelease(exec: CliExec, repo: string): Promise<UpstreamRelease> {
  try {
    const { code, stdout } = await exec('gh', [
      'api',
      `repos/${repo}/releases/latest`,
      '--jq',
      '.tag_name',
    ]);
    if (code !== 0) return { tag: null };
    const tag = stdout.trim();
    return { tag: tag.length > 0 ? tag : null };
  } catch {
    return { tag: null };
  }
}

/** One cached LTS check's shape — served by both `getCached()` and
 *  `check()`, and directly by the `/api/connection/gh-lts` HTTP handler. */
export interface LtsCheckResult {
  /** ISO timestamp of the last successful `check()`, or `null` before the
   *  operator has ever triggered one this process lifetime. */
  readonly checkedAt: string | null;
  readonly latestTag: string | null;
  readonly runningVersion: string;
  readonly chip: LtsChipMeta;
}

export interface LtsStatusApi {
  /** The last cached result — never calls `gh`. */
  getCached(): LtsCheckResult;
  /** Operator-triggered: calls `gh api`, updates and returns the cache. */
  check(): Promise<LtsCheckResult>;
}

/** Builds the LTS status API for one running install. `now` is injectable
 *  so tests control the `checkedAt` timestamp deterministically. */
export function createLtsStatusApi(
  exec: CliExec,
  repo: string,
  runningVersion: string,
  now: () => string = () => new Date().toISOString(),
): LtsStatusApi {
  let cached: LtsCheckResult = {
    checkedAt: null,
    latestTag: null,
    runningVersion,
    chip: ltsChipMeta(runningVersion, null),
  };
  return {
    getCached: () => cached,
    check: async () => {
      const { tag } = await fetchLatestRelease(exec, repo);
      cached = {
        checkedAt: now(),
        latestTag: tag,
        runningVersion,
        chip: ltsChipMeta(runningVersion, tag),
      };
      return cached;
    },
  };
}
