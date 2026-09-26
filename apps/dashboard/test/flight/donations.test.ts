// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  parseDonationEntries,
  createDonationsPreviewApi,
  extractClearsignedText,
  DONATIONS_FILE_PATH,
  SIGNED_DONATIONS_FILE_PATH,
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

/** A reader serving `files` by path and throwing ENOENT for anything else. */
function readerOf(files: Record<string, string>): DonationsReader {
  return vi.fn((path: string) => {
    const text = files[path];
    if (text === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return text;
  });
}

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
    const armored = clearsign(DONATIONS_JSON).replace('[', '-[');

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
    const readFile = readerOf({
      [DONATIONS_FILE_PATH]: DONATIONS_JSON,
      [SIGNED_DONATIONS_FILE_PATH]: clearsign(DONATIONS_JSON),
    });
    const api = createDonationsPreviewApi(readFile);

    expect(await api()).toEqual([{ chain: 'btc', address: 'bc1qexampleaddress' }]);
    expect(readFile).toHaveBeenCalledWith(DONATIONS_FILE_PATH);
    expect(readFile).toHaveBeenCalledWith(SIGNED_DONATIONS_FILE_PATH);
  });

  it('ignores the trailing whitespace and line endings an OpenPGP text signature ignores', async () => {
    const api = createDonationsPreviewApi(
      readerOf({
        [DONATIONS_FILE_PATH]: DONATIONS_JSON.replace(/\n/g, ' \r\n'),
        [SIGNED_DONATIONS_FILE_PATH]: clearsign(DONATIONS_JSON),
      }),
    );

    expect(await api()).toEqual([{ chain: 'btc', address: 'bc1qexampleaddress' }]);
  });

  it('serves nothing when docs/donations.json has no clearsigned copy beside it', async () => {
    const api = createDonationsPreviewApi(readerOf({ [DONATIONS_FILE_PATH]: DONATIONS_JSON }));

    expect(await api()).toEqual([]);
  });

  it('serves nothing when an address was edited after the file was signed', async () => {
    const api = createDonationsPreviewApi(
      readerOf({
        [DONATIONS_FILE_PATH]: DONATIONS_JSON.replace('bc1qexample', 'bc1qattacker'),
        [SIGNED_DONATIONS_FILE_PATH]: clearsign(DONATIONS_JSON),
      }),
    );

    expect(await api()).toEqual([]);
  });

  it('serves nothing when docs/DONATE.asc is not a cleartext-signed message', async () => {
    const api = createDonationsPreviewApi(
      readerOf({
        [DONATIONS_FILE_PATH]: DONATIONS_JSON,
        [SIGNED_DONATIONS_FILE_PATH]: DONATIONS_JSON,
      }),
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
      readerOf({
        [DONATIONS_FILE_PATH]: 'not json{{{',
        [SIGNED_DONATIONS_FILE_PATH]: clearsign('not json{{{'),
      }),
    );

    expect(await api()).toEqual([]);
  });

  it('degrades to an empty list when the JSON parses but is not an array', async () => {
    const notArray = JSON.stringify({ oops: true });
    const api = createDonationsPreviewApi(
      readerOf({
        [DONATIONS_FILE_PATH]: notArray,
        [SIGNED_DONATIONS_FILE_PATH]: clearsign(notArray),
      }),
    );

    expect(await api()).toEqual([]);
  });

  it('accepts custom paths for the address file and its clearsigned copy', async () => {
    const readFile = readerOf({
      'config/donations.json': DONATIONS_JSON,
      'config/DONATE.asc': clearsign(DONATIONS_JSON),
    });
    const api = createDonationsPreviewApi(readFile, 'config/donations.json', 'config/DONATE.asc');

    expect(await api()).toEqual([{ chain: 'btc', address: 'bc1qexampleaddress' }]);
    expect(readFile).toHaveBeenCalledWith('config/donations.json');
    expect(readFile).toHaveBeenCalledWith('config/DONATE.asc');
  });
});
