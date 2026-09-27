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
 * GitHub identity. FOUNDATION 3/3 (board web-mtq0rtub-jxpptv) adds the
 * clearsigned twin `docs/DONATE.asc`: no address is served unless that file
 * signs exactly the address file's text. The read itself takes an injectable
 * `DonationsReader` (mirrors `CliExec`'s injection shape) so tests never
 * touch the real filesystem.
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

/** The `gpg --clearsign` of {@link DONATIONS_FILE_PATH} (FOUNDATION 3/3,
 *  board web-mtq0rtub-jxpptv): `docs/FOUNDATION.md`'s transparency
 *  commitment 2 publishes addresses only as this clearsigned file. */
export const SIGNED_DONATIONS_FILE_PATH = join('docs', 'DONATE.asc');

const CLEARSIGN_BEGIN = '-----BEGIN PGP SIGNED MESSAGE-----';
const SIGNATURE_BEGIN = '-----BEGIN PGP SIGNATURE-----';
const SIGNATURE_END = '-----END PGP SIGNATURE-----';
const HASH_HEADER = /^Hash: [A-Za-z0-9-]+(?:, ?[A-Za-z0-9-]+)*$/;
const BASE64_LINE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Returns the signed text of an RFC 9580 §7 cleartext-signed message, or
 * `null` unless `armored` is exactly one well-formed message: nothing before
 * the BEGIN line or after the END line (unsigned text a reader would take for
 * signed), no cleartext armor header but Hash, and no text line starting with
 * "-" that is not dash-escaped. The same framing rules `ci:donate`'s
 * `extractClearsignedText` (scripts/donations/generate-donate-doc.mjs)
 * applies; `generate-donate-doc.test.ts` holds the two to one verdict.
 */
export function extractClearsignedText(armored: string): string | null {
  const lines = armored.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines[0] !== CLEARSIGN_BEGIN || lines.at(-1) !== SIGNATURE_END) return null;

  const blank = lines.indexOf('');
  if (blank === -1 || !lines.slice(1, blank).every((line) => HASH_HEADER.test(line))) return null;

  const sigStart = lines.indexOf(SIGNATURE_BEGIN, blank);
  if (sigStart === -1) return null;
  const sigBody = lines.slice(sigStart + 1, -1);
  if (sigBody.some((line) => line.startsWith('-')) || !sigBody.some((l) => BASE64_LINE.test(l))) {
    return null;
  }

  const text: string[] = [];
  for (const line of lines.slice(blank + 1, sigStart)) {
    if (line.startsWith('- ')) text.push(line.slice(2));
    else if (line.startsWith('-')) return null;
    else text.push(line);
  }
  return text.join('\n');
}

/** The text an OpenPGP text signature actually covers: line endings and
 *  trailing spaces/tabs don't count, nor does the final line break. */
function canonicalText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

export type DonationsPreviewApi = () => Promise<readonly DonationEntry[]>;

/**
 * Builds the `GET /api/donations` read. It serves an address only while
 * `signedPath` clearsigns exactly the address file's text — the dashboard
 * half of transparency commitment 2, so an address edited after signing, or
 * an address file with no signed copy beside it, never reaches the panel
 * even in a checkout `ci:donate` has not gated. It checks the framing and the
 * text, not the cryptography: `ci:donate` runs gpg on every landing, and a
 * donor runs it themselves (`docs/DONATE.md#verify-before-you-trust`). A
 * missing or unreadable file, a mismatch, or invalid/non-array JSON all
 * degrade to an empty list — the same fail-closed contract
 * `createPublicityPreviewApi` uses for an unresolved repo identity, and the
 * exact "never before [verified]" custody promise `docs/FOUNDATION.md` makes.
 */
export function createDonationsPreviewApi(
  readFile: DonationsReader = realReadFile,
  path: string = DONATIONS_FILE_PATH,
  signedPath: string = SIGNED_DONATIONS_FILE_PATH,
): DonationsPreviewApi {
  return async () => {
    let raw: string;
    let signed: string | null;
    try {
      raw = readFile(path);
      signed = extractClearsignedText(readFile(signedPath));
    } catch {
      return [];
    }
    if (signed === null || canonicalText(signed) !== canonicalText(raw)) return [];
    try {
      return parseDonationEntries(JSON.parse(raw));
    } catch {
      return [];
    }
  };
}
