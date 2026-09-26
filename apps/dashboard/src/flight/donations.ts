// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Foundation donation addresses (FOUNDATION 1/3, board web-mtq0rsit-ywz1m7) —
 * reads the PGP-signed, custody-verified address file `docs/FOUNDATION.md`
 * promises ("This section and the dashboard's funding area will carry them
 * once verified — never before") and serves it behind `GET /api/donations`
 * (`server/donations.ts`'s `handleDonations`). The file does not exist yet:
 * every read degrades to an empty list, so the masthead heart and Foundation
 * panel (`web/features/foundation.ts`) stay hidden until a real, verified
 * `docs/donations.json` lands — fail-closed, the same "skip, don't guess"
 * contract `flight/publicity.ts`'s `fetchRepoIdentity` uses for an unresolved
 * GitHub identity. The read itself takes an injectable `DonationsReader`
 * (mirrors `CliExec`'s injection shape) so tests never touch the real
 * filesystem.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The three chains the Foundation accepts, per `docs/FOUNDATION.md`. */
export type DonationChain = 'btc' | 'evm' | 'sol';

const KNOWN_CHAINS: ReadonlySet<string> = new Set<DonationChain>(['btc', 'evm', 'sol']);

/** One published donation address, chain-tagged, with an optional label
 *  (e.g. "Operations") for context beside the address in the panel. */
export interface DonationEntry {
  readonly chain: DonationChain;
  readonly address: string;
  readonly label?: string;
}

/** Validates one untrusted JSON entry, degrading anything malformed to
 *  `undefined` rather than throwing — a single bad entry must never take
 *  down the whole donations read. */
function parseEntry(raw: unknown): DonationEntry | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { chain, address, label } = raw as Record<string, unknown>;
  if (typeof chain !== 'string' || !KNOWN_CHAINS.has(chain)) return undefined;
  if (typeof address !== 'string' || address.trim() === '') return undefined;
  const entry: DonationEntry = { chain: chain as DonationChain, address };
  return typeof label === 'string' && label !== '' ? { ...entry, label } : entry;
}

/** Parses the donations file's untrusted JSON content into a clean entry
 *  list, dropping (never throwing on) anything malformed. Exported for
 *  direct unit testing independent of the file read itself. */
export function parseDonationEntries(raw: unknown): readonly DonationEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: DonationEntry[] = [];
  for (const item of raw) {
    const entry = parseEntry(item);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Reads a file's raw text — the injectable seam `createDonationsPreviewApi`
 *  swaps for a fake in tests, mirroring `CliExec`'s real-default shape. */
export type DonationsReader = (path: string) => string;

const realReadFile: DonationsReader = (path) => readFileSync(path, 'utf8');

/** Where the Foundation's verified address file lives once published —
 *  alongside `docs/FOUNDATION.md`, the doc that names this exact path. */
export const DONATIONS_FILE_PATH = join('docs', 'donations.json');

export type DonationsPreviewApi = () => Promise<readonly DonationEntry[]>;

/**
 * Builds the `GET /api/donations` read. A missing file, an unreadable file,
 * or invalid/non-array JSON all degrade to an empty list — the same
 * fail-closed contract `createPublicityPreviewApi` uses for an unresolved
 * repo identity, and the exact "never before [verified]" custody promise
 * `docs/FOUNDATION.md` makes.
 */
export function createDonationsPreviewApi(
  readFile: DonationsReader = realReadFile,
  path: string = DONATIONS_FILE_PATH,
): DonationsPreviewApi {
  return async () => {
    let raw: string;
    try {
      raw = readFile(path);
    } catch {
      return [];
    }
    try {
      return parseDonationEntries(JSON.parse(raw));
    } catch {
      return [];
    }
  };
}
