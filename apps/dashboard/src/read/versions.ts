// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE VERSIONS SCREEN'S DATA (board ap-mui2h3s1-1, slice 1).
 *
 * MASTER-PLAN §7 names three tiers of a locked repo's history, and the lock
 * ritual (packages/onboarding/src/backup/ritual.ts) writes them as plain git
 * refs: MYTH, the pristine pre-touch state (tag `autopilot/myth`); LEGACY, the
 * lock-on baseline and restore floor (tag `autopilot/legacy`); and the FLIGHT
 * LOG, every commit on `autopilot/flight` since LEGACY. Nothing read them back,
 * so the promised Versions screen had no timeline to draw.
 *
 * The flight log follows first parents only: each entry is a state the flight
 * branch actually held, which is what a restore would bring back. A lane's own
 * commits reach the branch through its merge and appear as that one entry.
 *
 * {@link readVersionDiff} (slice 3) says what changed between two versions:
 * one row per file with its added and removed line counts, for the screen to
 * show before anything is restored.
 *
 * Read-only by construction: every question asked of git is a `log` or a
 * plumbing `diff-tree`. Pure except {@link gitReaderFor}, which runs git; a
 * missing ref, a folder that is not a repository, or any git failure reads as
 * "no such version" (or no diff), never an error.
 */
import { execFileSync } from 'node:child_process';
import { FLIGHT_BRANCH, LEGACY_TAG, MYTH_TAG } from '@autopilot/onboarding';

export type VersionKind = 'myth' | 'legacy' | 'flight';

export interface VersionEntry {
  readonly kind: VersionKind;
  readonly sha: string;
  /** Committer date, strict ISO 8601, as git printed it. */
  readonly committedAt: string;
  readonly subject: string;
}

export interface VersionsTimeline {
  readonly myth: VersionEntry | null;
  readonly legacy: VersionEntry | null;
  /** Flight-branch states since LEGACY, newest first, at most the cap. */
  readonly flight: readonly VersionEntry[];
  /** True when the flight log holds more than the cap returned. */
  readonly truncated: boolean;
}

export interface VersionDiffFile {
  readonly path: string;
  /** Lines added and removed; null for a binary file, which has no lines. */
  readonly added: number | null;
  readonly removed: number | null;
}

export interface VersionDiff {
  /** Changed files in the order git lists them (its tree order), at most the cap. */
  readonly files: readonly VersionDiffFile[];
  /** Counted over every changed file, including any past the cap. */
  readonly totals: { readonly files: number; readonly added: number; readonly removed: number };
  /** True when more files changed than the cap returned. */
  readonly truncated: boolean;
}

/** Runs one git command against the repository; null when git fails. */
export type GitRead = (args: readonly string[]) => string | null;

export const DEFAULT_MAX_FLIGHT_VERSIONS = 50;
export const DEFAULT_MAX_DIFF_FILES = 200;

/** Unit separator between fields: a commit subject never contains one. */
const FIELD_SEP = '\x1f';
const LOG_FORMAT = '--format=%H%x1f%cI%x1f%s';
const SHA_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
/** `added<TAB>removed<TAB>path`; a binary file counts `-` for both. */
const NUMSTAT_RECORD = /^(\d+|-)\t(\d+|-)\t(.+)$/s;
const GIT_TIMEOUT_MS = 5000;
const GIT_MAX_BUFFER = 4 * 1024 * 1024;

const MYTH_REF = `refs/tags/${MYTH_TAG}`;
const LEGACY_REF = `refs/tags/${LEGACY_TAG}`;
const FLIGHT_RANGE = `${LEGACY_REF}..refs/heads/${FLIGHT_BRANCH}`;

/** One entry per `git log` record; a line that is not a commit record is skipped. */
export function parseVersionLog(stdout: string, kind: VersionKind): VersionEntry[] {
  const entries: VersionEntry[] = [];
  for (const raw of stdout.split('\n')) {
    const [sha, committedAt, ...rest] = raw.replace(/\r$/, '').split(FIELD_SEP);
    if (sha === undefined || !SHA_PATTERN.test(sha)) continue;
    if (committedAt === undefined || committedAt === '') continue;
    entries.push({ kind, sha, committedAt, subject: rest.join(FIELD_SEP) });
  }
  return entries;
}

function readTag(git: GitRead, ref: string, kind: VersionKind): VersionEntry | null {
  const out = git(['log', '-1', LOG_FORMAT, ref, '--']);
  return out === null ? null : (parseVersionLog(out, kind)[0] ?? null);
}

/**
 * The timeline the Versions screen draws. Without LEGACY there is no flight
 * log to list — "since the lock-on" has no start — so an un-locked repo reads
 * as an empty timeline rather than as its whole history.
 */
export function readVersions(
  git: GitRead,
  maxFlight: number = DEFAULT_MAX_FLIGHT_VERSIONS,
): VersionsTimeline {
  const cap =
    Number.isInteger(maxFlight) && maxFlight > 0 ? maxFlight : DEFAULT_MAX_FLIGHT_VERSIONS;
  const myth = readTag(git, MYTH_REF, 'myth');
  const legacy = readTag(git, LEGACY_REF, 'legacy');
  if (legacy === null) return { myth, legacy, flight: [], truncated: false };

  // One row past the cap is asked for: that is how "more exists" is known.
  const out = git([
    'log',
    '--first-parent',
    `--max-count=${cap + 1}`,
    LOG_FORMAT,
    FLIGHT_RANGE,
    '--',
  ]);
  const all = out === null ? [] : parseVersionLog(out, 'flight');
  return { myth, legacy, flight: all.slice(0, cap), truncated: all.length > cap };
}

/** A full SHA-1 or SHA-256 commit id, lowercase — the only revision the diff accepts. */
export function isCommitSha(value: string): boolean {
  return SHA_PATTERN.test(value);
}

/** One file per NUL-terminated `--numstat -z` record; anything else is skipped. */
export function parseDiffNumstat(stdout: string): VersionDiffFile[] {
  const files: VersionDiffFile[] = [];
  for (const record of stdout.split('\0')) {
    const match = NUMSTAT_RECORD.exec(record);
    if (match === null) continue;
    const [, added, removed, path] = match;
    files.push({
      path: path!,
      added: added === '-' ? null : Number(added),
      removed: removed === '-' ? null : Number(removed),
    });
  }
  return files;
}

/**
 * What changed from version `from` to version `to`, or null when either is not
 * a full commit id or git cannot read the diff. Only a full commit id ever
 * reaches git, so no option or ref name can ride in on a query parameter.
 * `diff-tree` is plumbing: the repository's diff drivers, text conversions
 * and rename settings do not change what it prints.
 */
export function readVersionDiff(
  git: GitRead,
  from: string,
  to: string,
  maxFiles: number = DEFAULT_MAX_DIFF_FILES,
): VersionDiff | null {
  if (!isCommitSha(from) || !isCommitSha(to)) return null;
  const cap = Number.isInteger(maxFiles) && maxFiles > 0 ? maxFiles : DEFAULT_MAX_DIFF_FILES;
  const out = git(['diff-tree', '-r', '--no-renames', '--numstat', '-z', from, to, '--']);
  if (out === null) return null;
  const all = parseDiffNumstat(out);
  const totals = {
    files: all.length,
    added: all.reduce((sum, f) => sum + (f.added ?? 0), 0),
    removed: all.reduce((sum, f) => sum + (f.removed ?? 0), 0),
  };
  return { files: all.slice(0, cap), totals, truncated: all.length > cap };
}

/** A {@link GitRead} bound to one folder: bounded, windowless, stderr discarded. */
export function gitReaderFor(rootPath: string): GitRead {
  return (args) => {
    try {
      return execFileSync('git', ['-C', rootPath, ...args], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return null;
    }
  };
}
