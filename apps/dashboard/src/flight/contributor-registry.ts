// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The standing registry read (board web-mtq07khu-h1kr9u, "STANDING 3/5":
 * "`.github/TRUSTED-CONTRIBUTORS.md` registry read by KEEPER + fleet —
 * tier-aware scope ... while security-hard rules stay immutable at every
 * tier"). `.github/TRUSTED-CONTRIBUTORS.md` is the machine-read record
 * behind `.github/CONTRIBUTOR-STANDING.md`'s tier ladder — this module is
 * the one place that turns its markdown table into structured facts a
 * KEEPER ritual or a fleet self-claim check can trust, so both sides read
 * the same parse instead of growing independent regexes.
 *
 * Deliberately narrow: this is the READ primitive only. Which scope a tier
 * actually unlocks — batch claims, working an `agent-ok`-labeled upstream
 * task — is a decision for the ritual that consumes `tierForLogin`/
 * `isAtLeastTier` (STANDING 4/5's human-reserved-task suggestion, a future
 * batch-claim ritual), never this module. And per `CONTRIBUTOR-STANDING.md`'s
 * "what never relaxes, at any tier": the security-hard KEEPER sweep
 * (`flight/pr-review.ts`'s guard/gate/auth/CI path review) does not
 * consult tier at all — it already applies unconditionally to every PR
 * regardless of author, so no caller of this module should ever wire tier
 * into that path.
 *
 * The read takes an injectable {@link ContributorRegistryReader} (mirrors
 * `donations.ts`'s `DonationsReader` shape) so tests never touch the real
 * filesystem, and degrades to an empty registry — every login then reads
 * as {@link DEFAULT_STANDING_TIER} — on a missing or unparseable file. A
 * registry that fails to load must never silently grant standing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One row of `.github/TRUSTED-CONTRIBUTORS.md`'s table, parsed. */
export interface ContributorRegistryEntry {
  /** GitHub handle, `@`-prefix stripped. */
  readonly login: string;
  readonly tier: string;
  readonly since: string;
  readonly evidence: string;
}

/** The standing ladder, lowest to highest — `.github/CONTRIBUTOR-
 *  STANDING.md`'s four named tiers plus `Maintainer` (the founder row
 *  `TRUSTED-CONTRIBUTORS.md` itself uses, above `Maintainer-delegate`).
 *  `Contributor` is earned dynamically (≥1 merged PR — see
 *  `contributor-dossier.ts`'s `mergedPrCount`) and is never itself a row in
 *  the registry file; it exists on this ladder purely so `isAtLeastTier`
 *  can rank it against the tiers the registry does record. */
export const STANDING_TIER_RANK: readonly string[] = [
  'Newcomer',
  'Contributor',
  'Active partner',
  'Maintainer-delegate',
  'Maintainer',
];

/** What every login not listed in the registry holds — the safe floor,
 *  never a guess upward. Kept as its own literal (not `STANDING_TIER_RANK[0]`)
 *  since indexing a `readonly string[]` types as `string | undefined` under
 *  `noUncheckedIndexedAccess`. */
export const DEFAULT_STANDING_TIER = 'Newcomer';

const TABLE_ROW_PATTERN = /^\s*\|(.+)\|\s*$/;
const SEPARATOR_ROW_PATTERN = /^[\s|:-]+$/;

/**
 * Parses a markdown table's rows into {@link ContributorRegistryEntry}
 * values. Anchors on the `Handle | Tier | Since | Evidence` header (case-
 * insensitively, on the first cell) so a stray unrelated table earlier in
 * the same file is skipped rather than misread as data; the separator row
 * (`| --- | --- | ... |`) is dropped on sight regardless. Any row that
 * isn't exactly 4 cells, or whose handle/tier cell is empty, is dropped —
 * a single malformed line must never take down the whole registry read.
 * Exported for direct unit testing independent of the file read itself.
 */
export function parseContributorRegistry(markdown: string): readonly ContributorRegistryEntry[] {
  const entries: ContributorRegistryEntry[] = [];
  let sawHeader = false;
  for (const line of markdown.split(/\r?\n/)) {
    const match = TABLE_ROW_PATTERN.exec(line);
    if (!match) continue;
    const rowContent = match[1] ?? '';
    if (SEPARATOR_ROW_PATTERN.test(rowContent)) continue;
    const cells = rowContent.split('|').map((cell) => cell.trim());
    if (cells.length !== 4) continue;
    const [handle = '', tier = '', since = '', evidence = ''] = cells;
    if (!sawHeader) {
      if (handle.toLowerCase() === 'handle') sawHeader = true;
      continue;
    }
    if (!handle || !tier) continue;
    const login = handle.startsWith('@') ? handle.slice(1) : handle;
    if (!login) continue;
    entries.push({ login, tier, since, evidence });
  }
  return entries;
}

/** Reads a file's raw text — the injectable seam tests swap for a fake,
 *  mirroring `donations.ts`'s `DonationsReader` shape. */
export type ContributorRegistryReader = (path: string) => string;

const realReadFile: ContributorRegistryReader = (path) => readFileSync(path, 'utf8');

/** Where the standing registry lives — `.github/CONTRIBUTOR-STANDING.md`
 *  names this exact path as the record "both sides' fleets read". */
export const CONTRIBUTOR_REGISTRY_FILE_PATH = join('.github', 'TRUSTED-CONTRIBUTORS.md');

/**
 * Loads and parses the standing registry. A missing file, an unreadable
 * file, or a file with no recognizable table all degrade to an empty list
 * — fail-closed, the same "never guess upward" contract `DEFAULT_STANDING_TIER`
 * documents, and the same shape `donations.ts`'s `createDonationsPreviewApi`
 * uses for its own missing-file default.
 */
export function loadContributorRegistry(
  readFile: ContributorRegistryReader = realReadFile,
  path: string = CONTRIBUTOR_REGISTRY_FILE_PATH,
): readonly ContributorRegistryEntry[] {
  let raw: string;
  try {
    raw = readFile(path);
  } catch {
    return [];
  }
  return parseContributorRegistry(raw);
}

/**
 * The standing tier `login` holds, per `registry` — case-insensitive,
 * `@`-prefix-tolerant on the input the same way parsing tolerates it in the
 * file. A login absent from `registry` reads as {@link DEFAULT_STANDING_TIER},
 * never an assumed higher tier.
 */
export function tierForLogin(login: string, registry: readonly ContributorRegistryEntry[]): string {
  const normalized = (login.startsWith('@') ? login.slice(1) : login).toLowerCase();
  const entry = registry.find((candidate) => candidate.login.toLowerCase() === normalized);
  return entry ? entry.tier : DEFAULT_STANDING_TIER;
}

function tierRank(tier: string): number {
  return STANDING_TIER_RANK.indexOf(tier);
}

/**
 * Whether `tier` meets or exceeds `minimum` on {@link STANDING_TIER_RANK}.
 * A tier neither side recognizes (a typo in the registry, or a future tier
 * this module doesn't know about yet) never satisfies any check — the
 * security-hard default is "no", never a guess.
 */
export function isAtLeastTier(tier: string, minimum: string): boolean {
  const tierIndex = tierRank(tier);
  const minimumIndex = tierRank(minimum);
  if (tierIndex === -1 || minimumIndex === -1) return false;
  return tierIndex >= minimumIndex;
}
