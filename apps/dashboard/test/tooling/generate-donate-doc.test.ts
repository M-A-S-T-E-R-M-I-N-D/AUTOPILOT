// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  renderDoc,
  renderEntry,
  renderAsciiQr,
  extractClearsignedText,
  findSignedAddressFileProblem,
} from '../../../../scripts/donations/generate-donate-doc.mjs';

const BTC_ENTRY = { chain: 'btc', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' } as const;
const EVM_ENTRY = {
  chain: 'evm',
  address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976',
  label: 'Operations',
} as const;

describe('renderAsciiQr', () => {
  it('renders the address as a block-character QR matrix with no trailing blank lines', () => {
    const ascii = renderAsciiQr(BTC_ENTRY.address);

    expect(ascii).toMatch(/[█▀▄ ]/);
    expect(ascii.endsWith('\n')).toBe(false);
  });
});

describe('renderEntry', () => {
  it('renders a chain heading, the address, and a QR block for an unlabeled entry', () => {
    const md = renderEntry(BTC_ENTRY);

    expect(md).toContain('### Bitcoin');
    expect(md).toContain(BTC_ENTRY.address);
    expect(md).toContain('<summary>QR code</summary>');
  });

  it('appends the label to the heading when one is present', () => {
    const md = renderEntry(EVM_ENTRY);

    expect(md).toContain('### EVM (Ethereum & compatible) — Operations');
  });

  it("carries the wrong-network warning for the entry's chain, naming USDT-TRC20 for EVM", () => {
    const md = renderEntry(EVM_ENTRY);

    expect(md).toContain('USDT-TRC20');
    expect(md).toMatch(/⚠️/);
  });
});

describe('renderDoc', () => {
  it('renders the fail-closed placeholder when no addresses are published', () => {
    const doc = renderDoc([]);

    expect(doc).toContain('No addresses have been published yet');
    expect(doc).not.toContain('### ');
  });

  it('links back to FOUNDATION.md for the Foundation story and transparency commitments', () => {
    const doc = renderDoc([]);

    expect(doc).toContain('[`docs/FOUNDATION.md`](FOUNDATION.md)');
    expect(doc).toContain('FOUNDATION.md#transparency-commitments');
  });

  it('lists every published entry under Addresses', () => {
    const doc = renderDoc([BTC_ENTRY, EVM_ENTRY]);

    expect(doc).toContain('### Bitcoin');
    expect(doc).toContain('### EVM (Ethereum & compatible) — Operations');
    expect(doc).not.toContain('No addresses have been published yet');
  });

  it('is idempotent — rendering the same entries twice produces byte-identical output', () => {
    expect(renderDoc([BTC_ENTRY])).toBe(renderDoc([BTC_ENTRY]));
  });
});

const DONATIONS_JSON = `[\n  { "chain": "btc", "address": "${BTC_ENTRY.address}" }\n]\n`;

// Structure-only stand-in: these tests pin the cleartext framing, not the
// cryptography, so the signature packet is placeholder base64.
const SIGNATURE_BLOCK = [
  '-----BEGIN PGP SIGNATURE-----',
  '',
  'iHUEARYKAB0WIQRmaXh0dXJlLW9ubHktbm90LWEta2V5AAoJEA==',
  '=AbCd',
  '-----END PGP SIGNATURE-----',
].join('\n');

/** Frames `text` the way `gpg --clearsign` does: dash-escapes lines starting
 *  with "-" or "From ", and drops the file's final line break (the break
 *  before the signature block is not part of the signed text). */
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

  it('refuses unsigned text placed before the signed block', () => {
    expect(extractClearsignedText(`send here instead\n${clearsign(DONATIONS_JSON)}`)).toBeNull();
  });

  it('refuses unsigned text placed after the signature block', () => {
    expect(extractClearsignedText(`${clearsign(DONATIONS_JSON)}send here instead\n`)).toBeNull();
  });

  it('refuses a cleartext armor header other than Hash', () => {
    expect(extractClearsignedText(clearsign(DONATIONS_JSON, 'Comment: trust me'))).toBeNull();
  });

  it('refuses a line starting with "-" that is not dash-escaped', () => {
    const armored = clearsign(DONATIONS_JSON).replace('[', '-[');

    expect(extractClearsignedText(armored)).toBeNull();
  });

  it('refuses a message with no signature block', () => {
    const armored = clearsign(DONATIONS_JSON).split('-----BEGIN PGP SIGNATURE-----')[0] ?? '';

    expect(extractClearsignedText(armored)).toBeNull();
  });

  it('refuses a signature block with no signature data', () => {
    const armored = clearsign(DONATIONS_JSON)
      .replace('iHUEARYKAB0WIQRmaXh0dXJlLW9ubHktbm90LWEta2V5AAoJEA==\n', '')
      .replace('=AbCd\n', '');

    expect(extractClearsignedText(armored)).toBeNull();
  });
});

describe('findSignedAddressFileProblem', () => {
  it('passes when neither the address file nor its signature exists yet', () => {
    expect(findSignedAddressFileProblem(null, null)).toBeNull();
  });

  it('fails an address file published without its clearsigned copy', () => {
    expect(findSignedAddressFileProblem(DONATIONS_JSON, null)).toMatch(/without docs\/DONATE\.asc/);
  });

  it('fails a clearsigned copy with no address file beside it', () => {
    expect(findSignedAddressFileProblem(null, clearsign(DONATIONS_JSON))).toMatch(
      /without docs\/donations\.json/,
    );
  });

  it('passes when DONATE.asc signs exactly the committed address file', () => {
    expect(findSignedAddressFileProblem(DONATIONS_JSON, clearsign(DONATIONS_JSON))).toBeNull();
  });

  it('ignores the trailing whitespace and line endings OpenPGP text signatures ignore', () => {
    const committed = DONATIONS_JSON.replace(/\n/g, ' \r\n');

    expect(findSignedAddressFileProblem(committed, clearsign(DONATIONS_JSON))).toBeNull();
  });

  it('fails an address file edited after it was signed', () => {
    const edited = DONATIONS_JSON.replace('bc1qxy2', 'bc1qzz2');

    expect(findSignedAddressFileProblem(edited, clearsign(DONATIONS_JSON))).toMatch(
      /signs different text/,
    );
  });

  it('fails a DONATE.asc that is not a well-formed cleartext-signed message', () => {
    expect(findSignedAddressFileProblem(DONATIONS_JSON, DONATIONS_JSON)).toMatch(/not a single/);
  });
});
