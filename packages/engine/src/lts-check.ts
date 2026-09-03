// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * LTS chip policy (epic 0006 "GitHub connected mode", slice 4 "LTS chip":
 * board web-mss4lpwr-gptuk4). Pure decision of what the CONNECT popover's
 * calm version chip should say, given the version this install is running
 * and the upstream repo's latest GitHub Release tag (`gh api
 * repos/<upstream>/releases/latest`, fetched by the dashboard's I/O layer —
 * `apps/dashboard/src/connection/gh-lts.ts`). Mirrors `github-sync.ts`'s
 * staging: policy stays pure and dependency-free here, the real `gh` call
 * and its once-per-operator-click caching live in `dashboard`.
 */

/** `'unknown'` when there is no latest tag to compare against (network/gh
 *  unavailable, or genuinely no releases upstream yet) — the chip then only
 *  ever states the running version, never a stale or guessed comparison. */
export type LtsStatus = 'up-to-date' | 'update-available' | 'ahead' | 'unknown';

export interface LtsChipMeta {
  readonly status: LtsStatus;
  readonly text: string;
}

/**
 * Compares two dotted numeric versions (`"0.13.0"`-style — the only shape
 * this repo's own `package.json` versions and release tags ever take, per
 * `release.ts`'s `bumpVersion`). Negative when `a` < `b`, positive when
 * `a` > `b`, zero when equal. Missing/non-numeric segments compare as `0`,
 * so `"1.2"` and `"1.2.0"` are equal — same leniency `parseCliVersion`
 * already extends to `--version` output elsewhere in this codebase.
 */
export function compareSemver(a: string, b: string): number {
  const partsA = a.split('.').map((p) => Number(p) || 0);
  const partsB = b.split('.').map((p) => Number(p) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Builds the LTS chip's status + calm display text. `latestTag` is the raw
 * `gh api .../releases/latest` tag name (e.g. `"v0.13.0"`, `"0.13.0"`, or
 * `null` when no check has succeeded yet) — a leading `"v"` is stripped
 * before comparing. Alignment is never automatic (epic 0006's "alignment
 * stays an operator action"): this function only ever describes state, it
 * never recommends or triggers an update.
 */
export function ltsChipMeta(runningVersion: string, latestTag: string | null): LtsChipMeta {
  if (!latestTag) {
    return { status: 'unknown', text: `you run v${runningVersion}` };
  }
  const latestVersion = latestTag.replace(/^v/, '');
  const cmp = compareSemver(runningVersion, latestVersion);
  if (cmp === 0) {
    return { status: 'up-to-date', text: `up to date — v${runningVersion}` };
  }
  if (cmp < 0) {
    return {
      status: 'update-available',
      text: `v${latestVersion} available — you run v${runningVersion}`,
    };
  }
  return {
    status: 'ahead',
    text: `you run v${runningVersion} (ahead of upstream v${latestVersion})`,
  };
}
