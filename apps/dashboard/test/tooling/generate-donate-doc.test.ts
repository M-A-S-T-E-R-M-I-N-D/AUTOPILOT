// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  renderDoc,
  renderEntry,
  renderAsciiQr,
  extractClearsignedText,
  findSignedAddressFileProblem,
  readSignatureStatus,
  verifySignedAddressFile,
  type GpgResult,
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

  it('tells the reader the addresses ship clearsigned and how to verify them, published or not', () => {
    for (const doc of [renderDoc([]), renderDoc([BTC_ENTRY, EVM_ENTRY])]) {
      expect(doc).toContain('## Verify before you trust');
      expect(doc).toContain('gpg --import docs/SIGNING-KEY.asc');
      expect(doc).toContain('gpg --verify docs/DONATE.asc');
      expect(doc).toContain('independent channel');
      expect(doc).toContain('do not send');
    }
  });

  it('names the same key as the one that signs release tags, linking the RELEASING.md leg', () => {
    expect(renderDoc([])).toContain('(RELEASING.md#signed-tags--the-qubes-pattern-foundation-33)');
  });

  it('puts the verify step between the addresses and the before-you-send warnings', () => {
    const doc = renderDoc([BTC_ENTRY]);

    expect(doc.indexOf('## Addresses')).toBeLessThan(doc.indexOf('## Verify before you trust'));
    expect(doc.indexOf('## Verify before you trust')).toBeLessThan(
      doc.indexOf('## Before you send'),
    );
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

// Status lines as real `gpg --status-fd 1` printed them (GnuPG 2.4.5, a
// throwaway ed25519 key): the key import, then the verify of a clearsigned file.
const FPR = '9E05D3EBFF4B5F130755EF3711F8334136D581E3';
const OTHER_FPR = '0123456789ABCDEF0123456789ABCDEF01234567';
const IMPORT_STATUS = [
  `[GNUPG:] KEY_CONSIDERED ${FPR} 0`,
  '[GNUPG:] IMPORTED 11F8334136D581E3 Probe Operator <probe@example.invalid>',
  `[GNUPG:] IMPORT_OK 1 ${FPR}`,
  '[GNUPG:] IMPORT_RES 1 0 1 0 0 0 0 0 0 0 0 0 0 0 0',
].join('\n');
const GOODSIG = '[GNUPG:] GOODSIG 11F8334136D581E3 Probe Operator <probe@example.invalid>';
const validsig = (hashAlgo = '10', primary = FPR): string =>
  `[GNUPG:] VALIDSIG ${FPR} 2026-09-26 1790399659 0 4 0 22 ${hashAlgo} 01 ${primary}`;
const verifyStatus = (...lines: string[]): string =>
  ['[GNUPG:] NEWSIG', `[GNUPG:] KEY_CONSIDERED ${FPR} 0`, ...lines].join('\n');
const GOOD_VERIFY = verifyStatus(GOODSIG, validsig(), '[GNUPG:] TRUST_UNDEFINED 0 pgp');

describe('readSignatureStatus', () => {
  it('returns the signing key fingerprint for one good signature by the one imported key', () => {
    expect(readSignatureStatus(IMPORT_STATUS, GOOD_VERIFY, 0)).toEqual({ fingerprint: FPR });
  });

  it('refuses a signature that does not verify', () => {
    const status = verifyStatus(
      '[GNUPG:] BADSIG 11F8334136D581E3 Probe Operator <probe@example.invalid>',
      '[GNUPG:] FAILURE gpg-exit 33554433',
    );

    expect(readSignatureStatus(IMPORT_STATUS, status, 1)).toMatchObject({
      problem: expect.stringMatching(/BADSIG/),
    });
  });

  it('refuses a signature by a key that is not in docs/SIGNING-KEY.asc', () => {
    const status = [
      '[GNUPG:] NEWSIG',
      `[GNUPG:] ERRSIG 11F8334136D581E3 22 10 01 1790399659 9 ${FPR}`,
      '[GNUPG:] NO_PUBKEY 11F8334136D581E3',
      '[GNUPG:] FAILURE gpg-exit 33554433',
    ].join('\n');

    expect(readSignatureStatus(IMPORT_STATUS, status, 2)).toMatchObject({
      problem: expect.stringMatching(/ERRSIG/),
    });
  });

  it.each(['EXPKEYSIG', 'REVKEYSIG', 'EXPSIG'])(
    'refuses a %s signature even when gpg exits 0',
    (keyword) => {
      const status = verifyStatus(`[GNUPG:] ${keyword} 11F8334136D581E3 Probe`, validsig());

      expect(readSignatureStatus(IMPORT_STATUS, status, 0)).toMatchObject({
        problem: expect.stringMatching(keyword),
      });
    },
  );

  it('refuses a file carrying more than one signature', () => {
    const status = [GOOD_VERIFY, GOOD_VERIFY].join('\n');

    expect(readSignatureStatus(IMPORT_STATUS, status, 0)).toMatchObject({
      problem: expect.stringMatching(/exactly one signature/),
    });
  });

  it('refuses a key file holding more than one key', () => {
    const importStatus = `${IMPORT_STATUS}\n[GNUPG:] IMPORT_OK 1 ${OTHER_FPR}`;

    expect(readSignatureStatus(importStatus, GOOD_VERIFY, 0)).toMatchObject({
      problem: expect.stringMatching(/exactly one key/),
    });
  });

  it('refuses a key file gpg imported no key from', () => {
    expect(readSignatureStatus('[GNUPG:] IMPORT_RES 0 0 0', GOOD_VERIFY, 0)).toMatchObject({
      problem: expect.stringMatching(/exactly one key/),
    });
  });

  it.each([
    ['1', 'MD5'],
    ['2', 'SHA-1'],
    ['3', 'RIPEMD-160'],
  ])('refuses a signature made over hash algorithm %s (%s)', (hashAlgo, name) => {
    const status = verifyStatus(GOODSIG, validsig(hashAlgo));

    expect(readSignatureStatus(IMPORT_STATUS, status, 0)).toMatchObject({
      problem: expect.stringContaining(name),
    });
  });

  it('refuses a good signature whose primary key is not the imported key', () => {
    const status = verifyStatus(GOODSIG, validsig('10', OTHER_FPR));

    expect(readSignatureStatus(IMPORT_STATUS, status, 0)).toMatchObject({
      problem: expect.stringMatching(OTHER_FPR),
    });
  });

  it('refuses a non-zero gpg exit even when every status line looks good', () => {
    expect(readSignatureStatus(IMPORT_STATUS, GOOD_VERIFY, 2)).toMatchObject({
      problem: expect.stringMatching(/exited 2/),
    });
  });

  it('refuses a verify run that reported no signature at all', () => {
    expect(readSignatureStatus(IMPORT_STATUS, '', 0)).toMatchObject({
      problem: expect.stringMatching(/exactly one signature/),
    });
  });
});

describe('verifySignedAddressFile', () => {
  const tempKeyDir = (): { dir: string; keyPath: string; signedPath: string } => {
    const dir = mkdtempSync(join(tmpdir(), 'donate-verify-test-'));
    const keyPath = join(dir, 'SIGNING-KEY.asc');
    writeFileSync(keyPath, '-----BEGIN PGP PUBLIC KEY BLOCK-----\n');
    return { dir, keyPath, signedPath: join(dir, 'DONATE.asc') };
  };

  /** A stand-in for spawnSync: answers each gpg call from `results` in order
   *  and records the argv it was given. */
  const fakeGpg = (...results: GpgResult[]) => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const run = (command: string, args: readonly string[]): GpgResult => {
      calls.push({ command, args });
      const next = results[calls.length - 1];
      if (next === undefined) throw new Error('unexpected gpg call');
      return next;
    };
    return { run, calls };
  };

  it('refuses without running gpg when docs/SIGNING-KEY.asc is missing', () => {
    const { dir, signedPath } = tempKeyDir();
    const gpg = fakeGpg();

    const result = verifySignedAddressFile(signedPath, join(dir, 'absent.asc'), gpg.run);

    expect(result).toMatchObject({ problem: expect.stringMatching(/SIGNING-KEY\.asc/) });
    expect(gpg.calls).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('names GnuPG when gpg cannot be started', () => {
    const { dir, keyPath, signedPath } = tempKeyDir();
    const missing = Object.assign(new Error('spawnSync gpg ENOENT'), { code: 'ENOENT' });
    const gpg = fakeGpg({ status: null, stdout: '', error: missing });

    expect(verifySignedAddressFile(signedPath, keyPath, gpg.run)).toMatchObject({
      problem: expect.stringMatching(/GnuPG/),
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a key file gpg imports no key from', () => {
    const { dir, keyPath, signedPath } = tempKeyDir();
    const gpg = fakeGpg(
      { status: 2, stdout: '[GNUPG:] IMPORT_RES 0 0 0' },
      { status: 2, stdout: '' },
    );

    expect(verifySignedAddressFile(signedPath, keyPath, gpg.run)).toMatchObject({
      problem: expect.stringMatching(/exactly one key/),
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it('trusts the import status lines over the exit code of a clean import', () => {
    // Real gpg 2.4 on Windows: the key imports, then gpg exits 2 because it
    // cannot reach the agent that --no-autostart keeps from starting.
    const { dir, keyPath, signedPath } = tempKeyDir();
    const importStatus = `${IMPORT_STATUS}\n[GNUPG:] FAILURE gpg-exit 33554433`;
    const gpg = fakeGpg({ status: 2, stdout: importStatus }, { status: 0, stdout: GOOD_VERIFY });

    expect(verifySignedAddressFile(signedPath, keyPath, gpg.run)).toEqual({ fingerprint: FPR });
    rmSync(dir, { recursive: true, force: true });
  });

  it('verifies in a throwaway homedir holding only the committed key, then deletes it', () => {
    const { dir, keyPath, signedPath } = tempKeyDir();
    const gpg = fakeGpg({ status: 0, stdout: IMPORT_STATUS }, { status: 0, stdout: GOOD_VERIFY });

    const result = verifySignedAddressFile(signedPath, keyPath, gpg.run);

    expect(result).toEqual({ fingerprint: FPR });
    const [importCall, verifyCall] = gpg.calls;
    const home = importCall?.args[importCall.args.indexOf('--homedir') + 1] ?? '';
    expect(importCall?.command).toBe('gpg');
    expect(importCall?.args).toEqual(expect.arrayContaining(['--batch', '--no-autostart']));
    expect(importCall?.args.slice(-2)).toEqual(['--import', keyPath]);
    expect(verifyCall?.args).toEqual(expect.arrayContaining(['--homedir', home, '--no-autostart']));
    expect(verifyCall?.args.slice(-2)).toEqual(['--verify', signedPath]);
    expect(home).toContain(tmpdir());
    expect(existsSync(home)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
