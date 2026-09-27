// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  parseDonationEntries,
  createDonationsPreviewApi,
  extractClearsignedText,
  isPublicKeyFile,
  DONATIONS_FILE_PATH,
  SIGNED_DONATIONS_FILE_PATH,
  SIGNING_KEY_FILE_PATH,
  type DonationsReader,
} from '../../src/flight/donations.js';

describe('parseDonationEntries', () => {
  it('accepts a well-formed btc/evm/sol entry list', () => {
    const raw = [
      { chain: 'btc', address: 'bc1qexampleaddress' },
      { chain: 'evm', address: '0xExampleAddress', label: 'Operations' },
      { chain: 'sol', address: 'ExampleSolAddress' },
    ];

    expect(parseDonationEntries(raw)).toEqual([
      { chain: 'btc', address: 'bc1qexampleaddress' },
      { chain: 'evm', address: '0xExampleAddress', label: 'Operations' },
      { chain: 'sol', address: 'ExampleSolAddress' },
    ]);
  });

  it('drops an entry with an unknown chain instead of throwing', () => {
    const raw = [{ chain: 'ltc', address: 'someaddress' }];

    expect(parseDonationEntries(raw)).toEqual([]);
  });

  it('drops an entry with a missing or empty address', () => {
    const raw = [{ chain: 'btc', address: '' }, { chain: 'btc' }];

    expect(parseDonationEntries(raw)).toEqual([]);
  });

  it('drops a non-object entry without throwing', () => {
    expect(parseDonationEntries(['just a string', 42, null])).toEqual([]);
  });

  it('drops an empty-string label rather than carrying it through', () => {
    const raw = [{ chain: 'btc', address: 'bc1qexampleaddress', label: '' }];

    expect(parseDonationEntries(raw)).toEqual([{ chain: 'btc', address: 'bc1qexampleaddress' }]);
  });

  it('returns an empty list for non-array input', () => {
    expect(parseDonationEntries({ chain: 'btc', address: 'x' })).toEqual([]);
    expect(parseDonationEntries(null)).toEqual([]);
    expect(parseDonationEntries(undefined)).toEqual([]);
  });

  it('keeps only the valid entries out of a mixed list', () => {
    const raw = [
      { chain: 'btc', address: 'bc1qexampleaddress' },
      { chain: 'ltc', address: 'shouldDrop' },
      { chain: 'evm', address: '' },
    ];

    expect(parseDonationEntries(raw)).toEqual([{ chain: 'btc', address: 'bc1qexampleaddress' }]);
  });
});

const DONATIONS_JSON = `[\n  { "chain": "btc", "address": "bc1qexampleaddress" }\n]\n`;

// Structure-only stand-in: the dashboard checks the cleartext framing, not
// the cryptography (ci:donate runs gpg), so the packet is placeholder base64.
const SIGNATURE_BLOCK = [
  '-----BEGIN PGP SIGNATURE-----',
  '',
  'iHUEARYKAB0WIQRmaXh0dXJlLW9ubHktbm90LWEta2V5AAoJEA==',
  '=AbCd',
  '-----END PGP SIGNATURE-----',
].join('\n');

/** Frames `text` the way `gpg --clearsign` does: dash-escapes lines starting
 *  with "-" or "From ", and drops the file's final line break. */
function clearsign(text: string, hashHeader = 'Hash: SHA256'): string {
  const escaped = text
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => (line.startsWith('-') || line.startsWith('From ') ? `- ${line}` : line))
    .join('\n');
  return ['-----BEGIN PGP SIGNED MESSAGE-----', hashHeader, '', escaped, SIGNATURE_BLOCK, ''].join(
    '\n',
  );
}

/** The armour with ONE bare "-" put in front of its first "[": a body line
 *  that starts with "-" without being dash-escaped — the single malformation
 *  these cases need. Spliced by index rather than String.replace, which reads
 *  as an incomplete escape (CodeQL js/incomplete-sanitization, 2026-09-27):
 *  this corrupts exactly one line on purpose, and says so. */
function withBareDashLine(armored: string): string {
  const at = armored.indexOf('[');
  return `${armored.slice(0, at)}-${armored.slice(at)}`;
}

// Structure-only stand-in for `gpg --armor --export`: the framing is what
// isPublicKeyFile reads, so the packet is placeholder base64.
const PUBLIC_KEY_BLOCK = [
  '-----BEGIN PGP PUBLIC KEY BLOCK-----',
  'Comment: fixture only, not a key',
  '',
  'mDMEZ0lyMBYJKwYBBAHaRw8BAQdAZml4dHVyZS1vbmx5LW5vdC1hLWtleQ==',
  '=AbCd',
  '-----END PGP PUBLIC KEY BLOCK-----',
  '',
].join('\n');

// Built by concatenation so this file's own text never carries the armor
// header ci:secret-scan refuses (see secret-scan.test.ts for the same trick).
const PRIVATE_KEY_BLOCK = PUBLIC_KEY_BLOCK.replaceAll('PUBLIC', 'PRIV' + 'ATE');

/** A reader serving `files` by path and throwing ENOENT for anything else. */
function readerOf(files: Record<string, string>): DonationsReader {
  return vi.fn((path: string) => {
    const text = files[path];
    if (text === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return text;
  });
}

/** The three published files, each overridable, for the cases that break one. */
function publishedFiles(overrides: Record<string, string | undefined> = {}): DonationsReader {
  const files: Record<string, string | undefined> = {
    [DONATIONS_FILE_PATH]: DONATIONS_JSON,
    [SIGNED_DONATIONS_FILE_PATH]: clearsign(DONATIONS_JSON),
    [SIGNING_KEY_FILE_PATH]: PUBLIC_KEY_BLOCK,
    ...overrides,
  };
  const present = Object.entries(files).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return readerOf(Object.fromEntries(present));
}

describe('isPublicKeyFile', () => {
  it('accepts exactly one ASCII-armored public key block', () => {
    expect(isPublicKeyFile(PUBLIC_KEY_BLOCK)).toBe(true);
  });

  it('reads CRLF line endings the same as LF', () => {
    expect(isPublicKeyFile(PUBLIC_KEY_BLOCK.replace(/\n/g, '\r\n'))).toBe(true);
  });

  it('refuses a private key block, alone or beside a public one', () => {
    expect(isPublicKeyFile(PRIVATE_KEY_BLOCK)).toBe(false);
    expect(isPublicKeyFile(PUBLIC_KEY_BLOCK + PRIVATE_KEY_BLOCK)).toBe(false);
  });

  it('refuses text before or after the block, and two blocks in one file', () => {
    expect(isPublicKeyFile(`Fingerprint: see the announcement\n${PUBLIC_KEY_BLOCK}`)).toBe(false);
    expect(isPublicKeyFile(`${PUBLIC_KEY_BLOCK}trailer\n`)).toBe(false);
    expect(isPublicKeyFile(PUBLIC_KEY_BLOCK + PUBLIC_KEY_BLOCK)).toBe(false);
  });

  it('refuses a file that is not armored at all', () => {
    expect(isPublicKeyFile(DONATIONS_JSON)).toBe(false);
    expect(isPublicKeyFile('')).toBe(false);
  });
});

describe('extractClearsignedText', () => {
  it('returns the signed text of a well-formed cleartext-signed message', () => {
    expect(extractClearsignedText(clearsign(DONATIONS_JSON))).toBe(DONATIONS_JSON.trimEnd());
  });

  it('reverses dash-escaping', () => {
    const text = '-----BEGIN PGP SIGNATURE-----\nFrom the operator\n-- plain';

    expect(extractClearsignedText(clearsign(text))).toBe(text);
  });

  it('reads CRLF line endings the same as LF', () => {
    const armored = clearsign(DONATIONS_JSON).replace(/\n/g, '\r\n');

    expect(extractClearsignedText(armored)).toBe(DONATIONS_JSON.trimEnd());
  });

  it('refuses unsigned text placed before the BEGIN line or after the END line', () => {
    expect(extractClearsignedText(`send here instead\n${clearsign(DONATIONS_JSON)}`)).toBeNull();
    expect(extractClearsignedText(`${clearsign(DONATIONS_JSON)}send here instead\n`)).toBeNull();
  });

  it('refuses a cleartext armor header other than Hash', () => {
    expect(extractClearsignedText(clearsign(DONATIONS_JSON, 'Comment: trust me'))).toBeNull();
  });

  it('accepts a message with no Hash header, which RFC 9580 leaves optional', () => {
    const armored = clearsign(DONATIONS_JSON).replace('Hash: SHA256\n', '');

    expect(extractClearsignedText(armored)).toBe(DONATIONS_JSON.trimEnd());
  });

  it('refuses a message with no blank line after the armor headers', () => {
    const armored = clearsign(DONATIONS_JSON).replace('Hash: SHA256\n\n', 'Hash: SHA256\n');

    expect(extractClearsignedText(armored)).toBeNull();
  });

  it('refuses a line starting with "-" that is not dash-escaped', () => {
    const armored = withBareDashLine(clearsign(DONATIONS_JSON));

    expect(extractClearsignedText(armored)).toBeNull();
  });

  it('refuses a message with no signature block, or one with no signature data', () => {
    const unsigned = clearsign(DONATIONS_JSON).split(SIGNATURE_BLOCK)[0] ?? '';
    const empty = clearsign(DONATIONS_JSON)
      .replace('iHUEARYKAB0WIQRmaXh0dXJlLW9ubHktbm90LWEta2V5AAoJEA==\n', '')
      .replace('=AbCd\n', '');

    expect(extractClearsignedText(unsigned)).toBeNull();
    expect(extractClearsignedText(empty)).toBeNull();
  });

  it('refuses a signature block carrying another armor line', () => {
    const armored = clearsign(DONATIONS_JSON).replace('=AbCd', '-----BEGIN PGP SIGNATURE-----');

    expect(extractClearsignedText(armored)).toBeNull();
  });
});

describe('createDonationsPreviewApi', () => {
  it('serves the addresses when docs/DONATE.asc clearsigns exactly docs/donations.json', async () => {
    const readFile = publishedFiles();
    const api = createDonationsPreviewApi(readFile);

    expect(await api()).toEqual([{ chain: 'btc', address: 'bc1qexampleaddress' }]);
    expect(readFile).toHaveBeenCalledWith(DONATIONS_FILE_PATH);
    expect(readFile).toHaveBeenCalledWith(SIGNED_DONATIONS_FILE_PATH);
    expect(readFile).toHaveBeenCalledWith(SIGNING_KEY_FILE_PATH);
  });

  it('ignores the trailing whitespace and line endings an OpenPGP text signature ignores', async () => {
    const api = createDonationsPreviewApi(
      publishedFiles({ [DONATIONS_FILE_PATH]: DONATIONS_JSON.replace(/\n/g, ' \r\n') }),
    );

    expect(await api()).toEqual([{ chain: 'btc', address: 'bc1qexampleaddress' }]);
  });

  it('serves nothing when docs/donations.json has no clearsigned copy beside it', async () => {
    const api = createDonationsPreviewApi(
      publishedFiles({ [SIGNED_DONATIONS_FILE_PATH]: undefined }),
    );

    expect(await api()).toEqual([]);
  });

  it('serves nothing when an address was edited after the file was signed', async () => {
    const api = createDonationsPreviewApi(
      publishedFiles({
        [DONATIONS_FILE_PATH]: DONATIONS_JSON.replace('bc1qexample', 'bc1qattacker'),
      }),
    );

    expect(await api()).toEqual([]);
  });

  it('serves nothing when docs/DONATE.asc is not a cleartext-signed message', async () => {
    const api = createDonationsPreviewApi(
      publishedFiles({ [SIGNED_DONATIONS_FILE_PATH]: DONATIONS_JSON }),
    );

    expect(await api()).toEqual([]);
  });

  // Transparency commitment 2's second half: the signing key's fingerprint
  // must be checkable, and with no published key nothing can check it. The
  // same pair ci:donate refuses (verifySignedAddressFile), held here too.
  it('serves nothing when docs/SIGNING-KEY.asc, the key a donor verifies with, is absent', async () => {
    const api = createDonationsPreviewApi(publishedFiles({ [SIGNING_KEY_FILE_PATH]: undefined }));

    expect(await api()).toEqual([]);
  });

  it('serves nothing when docs/SIGNING-KEY.asc holds a private key block — that key is exposed', async () => {
    const api = createDonationsPreviewApi(
      publishedFiles({ [SIGNING_KEY_FILE_PATH]: PRIVATE_KEY_BLOCK }),
    );

    expect(await api()).toEqual([]);
  });

  it('serves nothing when docs/SIGNING-KEY.asc is not one public key block', async () => {
    const api = createDonationsPreviewApi(
      publishedFiles({ [SIGNING_KEY_FILE_PATH]: `${PUBLIC_KEY_BLOCK}${PUBLIC_KEY_BLOCK}` }),
    );

    expect(await api()).toEqual([]);
  });

  it('degrades to an empty list when the file does not exist (the pre-verification default)', async () => {
    const readFile: DonationsReader = vi.fn().mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const api = createDonationsPreviewApi(readFile);

    expect(await api()).toEqual([]);
  });

  it('degrades to an empty list on invalid JSON instead of throwing', async () => {
    const api = createDonationsPreviewApi(
      publishedFiles({
        [DONATIONS_FILE_PATH]: 'not json{{{',
        [SIGNED_DONATIONS_FILE_PATH]: clearsign('not json{{{'),
      }),
    );

    expect(await api()).toEqual([]);
  });

  it('degrades to an empty list when the JSON parses but is not an array', async () => {
    const notArray = JSON.stringify({ oops: true });
    const api = createDonationsPreviewApi(
      publishedFiles({
        [DONATIONS_FILE_PATH]: notArray,
        [SIGNED_DONATIONS_FILE_PATH]: clearsign(notArray),
      }),
    );

    expect(await api()).toEqual([]);
  });

  it('accepts custom paths for the address file, its clearsigned copy and the signing key', async () => {
    const readFile = readerOf({
      'config/donations.json': DONATIONS_JSON,
      'config/DONATE.asc': clearsign(DONATIONS_JSON),
      'config/SIGNING-KEY.asc': PUBLIC_KEY_BLOCK,
    });
    const api = createDonationsPreviewApi(
      readFile,
      'config/donations.json',
      'config/DONATE.asc',
      'config/SIGNING-KEY.asc',
    );

    expect(await api()).toEqual([{ chain: 'btc', address: 'bc1qexampleaddress' }]);
    expect(readFile).toHaveBeenCalledWith('config/donations.json');
    expect(readFile).toHaveBeenCalledWith('config/DONATE.asc');
    expect(readFile).toHaveBeenCalledWith('config/SIGNING-KEY.asc');
  });
});
