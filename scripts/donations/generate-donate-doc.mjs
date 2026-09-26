// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * donations/generate-donate-doc — regenerates docs/DONATE.md (FOUNDATION
 * 2/3, board web-mtq0rsux-ttojba) from docs/donations.json, using the SAME
 * parser `apps/dashboard/src/flight/donations.ts`'s `parseDonationEntries`
 * gives `GET /api/donations` (imported straight from the built dist, not
 * re-implemented) — so the public page and the dashboard panel can never
 * validate an address file differently, and a malformed entry drops
 * silently rather than corrupting either surface.
 *
 * `docs/donations.json` does not exist yet: `docs/FOUNDATION.md`'s custody
 * promise is that addresses are "published… once verified — never before".
 * Until then this renders the same honest placeholder the dashboard panel
 * shows by staying hidden; once a verified file lands, `donate:update` picks
 * it up automatically.
 *
 * QR codes render as ASCII art (`qrcode-generator`'s `createASCII` — a
 * devDependency `qrcode-lib.test.ts` already uses to verify the dashboard's
 * own vendored copy). ASCII keeps the doc Markdown-portable without
 * embedding image files or calling a third-party QR service — the same "no
 * network request" custody stance `web/features/foundation.ts`'s inline-SVG
 * QR rendering takes in the browser.
 *
 * `--check` (wired into `pnpm verify` as `ci:donate`) fails without writing
 * if docs/DONATE.md differs from what's committed; no flag writes it
 * (`pnpm donate:update`).
 *
 * `--check` also holds FOUNDATION.md's transparency commitment 2 (board
 * web-mtq0rtub-jxpptv, FOUNDATION 3/3): addresses ship only as a
 * PGP-clearsigned file, so docs/donations.json and docs/DONATE.asc (its
 * `gpg --clearsign`) must land together and the signed text must be the
 * committed file's text. An address edited after signing, or either file
 * alone, fails the gate. The signature itself is then checked with gpg
 * against docs/SIGNING-KEY.asc, the operator's public key, so editing the
 * signed text to match an edited address file fails too. Readers check that
 * key's fingerprint through an independent channel; the gate only proves the
 * committed key made the signature — so the page itself carries a "Verify
 * before you trust" section with the two gpg commands and that comparison,
 * rendered whether or not an address is published yet: the reader's half of
 * the Qubes pattern is a promise about HOW addresses ship, not a fact about
 * one address.
 *
 * `--check` also reads docs/SIGNING-KEY.asc the moment it lands. The Qubes
 * pattern publishes the key first, then its fingerprint through an
 * independent channel, then what it signs — so the key is gated before any
 * address is: anything but one ASCII-armored PUBLIC key block fails, a
 * PRIVATE key block (`--export-secret-keys`, one flag from `--export`) fails
 * by name as an exposure rather than a misfiling, and gpg must import exactly
 * one key from it. The OK line then echoes that key's fingerprint — one more
 * channel a reader can compare against.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-generator';
import {
  parseDonationEntries,
  DONATIONS_FILE_PATH,
} from '../../apps/dashboard/dist/flight/donations.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const DOC_PATH = join(repoRoot, 'docs', 'DONATE.md');
const DONATIONS_PATH = join(repoRoot, DONATIONS_FILE_PATH);
const SIGNED_PATH = join(repoRoot, 'docs', 'DONATE.asc');
const SIGNING_KEY_PATH = join(repoRoot, 'docs', 'SIGNING-KEY.asc');

const CLEARSIGN_BEGIN = '-----BEGIN PGP SIGNED MESSAGE-----';
const SIGNATURE_BEGIN = '-----BEGIN PGP SIGNATURE-----';
const SIGNATURE_END = '-----END PGP SIGNATURE-----';
const PUBLIC_KEY_BEGIN = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
const PUBLIC_KEY_END = '-----END PGP PUBLIC KEY BLOCK-----';
const HASH_HEADER = /^Hash: [A-Za-z0-9-]+(?:, ?[A-Za-z0-9-]+)*$/;
const BASE64_LINE = /^[A-Za-z0-9+/]+={0,2}$/;

/** gpg status keywords (GnuPG doc/DETAILS) for a signature that is not good.
 *  gpg can exit 0 for a signature by an expired or revoked key, so the exit
 *  code alone could pass one. */
const REFUSED_SIGNATURE_STATUS = ['BADSIG', 'ERRSIG', 'EXPSIG', 'EXPKEYSIG', 'REVKEYSIG'];
/** RFC 9580 §9.5 hash algorithm ids too weak to bind an address. */
const WEAK_HASH_ALGORITHMS = { 1: 'MD5', 2: 'SHA-1', 3: 'RIPEMD-160' };

/** @type {Record<import('../../apps/dashboard/dist/flight/donations.js').DonationChain, string>} */
const CHAIN_NAMES = {
  btc: 'Bitcoin',
  evm: 'EVM (Ethereum & compatible)',
  sol: 'Solana',
};

/** Static, per-chain-type safety notes. The published schema tags a chain
 *  family (btc/evm/sol), not a specific network or token, so these stay
 *  general rather than claiming per-address precision the data doesn't
 *  carry — an EVM address, for instance, is valid on every EVM chain, which
 *  is exactly the "wrong-network" trap worth naming explicitly. */
const CHAIN_WARNINGS = {
  btc:
    'Bitcoin mainnet only. Do not send a wrapped/pegged representation ' +
    '(e.g. BTCB, WBTC) expecting native BTC to arrive here.',
  evm:
    'This address format is shared by every EVM chain (Ethereum, BSC, ' +
    'Polygon, Arbitrum, …) — confirm the exact network before sending. Only ' +
    'send native assets or standard ERC-20 tokens; a token sent on the ' +
    'wrong network (for example USDT-TRC20, a different address format ' +
    'entirely — or an ERC-20/BEP-20 mismatch on this same-looking address) ' +
    'is typically unrecoverable.',
  sol:
    'Solana mainnet only. Confirm SPL token mint addresses ' +
    'independently before sending anything other than SOL.',
};

/** Reads and validates docs/donations.json, degrading a missing file, an
 *  unreadable file, or invalid JSON to an empty list — the same fail-closed
 *  contract `createDonationsPreviewApi` uses for `GET /api/donations`. */
function readEntries() {
  let raw;
  try {
    raw = readFileSync(DONATIONS_PATH, 'utf8');
  } catch {
    return [];
  }
  try {
    return parseDonationEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Reads a file, mapping only "does not exist" to null — any other read
 *  error fails the check rather than passing it as "not published". */
function readIfPresent(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Returns the signed text of an RFC 9580 §7 cleartext-signed message, or null
 * unless `armored` is exactly one well-formed message. Refuses anything before
 * the BEGIN line or after the END line (unsigned text a reader would take for
 * signed), any cleartext armor header but Hash, and any text line starting
 * with "-" that is not dash-escaped.
 * @param {string} armored
 * @returns {string | null}
 */
export function extractClearsignedText(armored) {
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

  const text = [];
  for (const line of lines.slice(blank + 1, sigStart)) {
    if (line.startsWith('- ')) text.push(line.slice(2));
    else if (line.startsWith('-')) return null;
    else text.push(line);
  }
  return text.join('\n');
}

/** The text an OpenPGP text signature actually covers: line endings and
 *  trailing spaces/tabs don't count, nor does the final line break. */
function canonicalText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

/**
 * Checks docs/donations.json against docs/DONATE.asc (each null when absent).
 * @param {string | null} donationsRaw
 * @param {string | null} signedRaw
 * @returns {string | null} what is wrong, or null when the pair is consistent
 */
export function findSignedAddressFileProblem(donationsRaw, signedRaw) {
  if (donationsRaw === null && signedRaw === null) return null;
  if (signedRaw === null) {
    return (
      'docs/donations.json is published without docs/DONATE.asc — addresses ship only as a ' +
      'PGP-clearsigned file (docs/FOUNDATION.md, transparency commitment 2).'
    );
  }
  if (donationsRaw === null) {
    return 'docs/DONATE.asc exists without docs/donations.json — it signs addresses nobody publishes.';
  }
  const signed = extractClearsignedText(signedRaw);
  if (signed === null) {
    return 'docs/DONATE.asc is not a single well-formed PGP cleartext-signed message.';
  }
  if (canonicalText(signed) !== canonicalText(donationsRaw)) {
    return (
      'docs/DONATE.asc signs different text than docs/donations.json — clearsign the committed ' +
      'file again.'
    );
  }
  return null;
}

/**
 * Checks docs/SIGNING-KEY.asc's text (null when absent) before gpg sees it:
 * exactly one ASCII-armored PGP PUBLIC key block and nothing else. A PRIVATE
 * key block is named as such because its fix is not "commit the right file"
 * — the secret half has left the machine that made it.
 * @param {string | null} keyRaw
 * @returns {string | null} what is wrong, or null when the file is acceptable
 */
export function findSigningKeyProblem(keyRaw) {
  if (keyRaw === null) return null;
  if (keyRaw.includes('PRIVATE KEY BLOCK')) {
    return (
      'docs/SIGNING-KEY.asc holds a PGP PRIVATE key block — the secret half. Do not commit ' +
      'it: treat the key as exposed and revoke it, then publish only the public half ' +
      '(`gpg --armor --export <fingerprint>`).'
    );
  }
  const lines = keyRaw.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const isOneBlock =
    lines[0] === PUBLIC_KEY_BEGIN &&
    lines.at(-1) === PUBLIC_KEY_END &&
    !lines.slice(1, -1).some((line) => line.startsWith('-----'));
  if (!isOneBlock) {
    return (
      'docs/SIGNING-KEY.asc must be exactly one ASCII-armored PGP public key block ' +
      '(`gpg --armor --export <fingerprint>`), with nothing before or after it.'
    );
  }
  return null;
}

/** Splits gpg `--status-fd` output into [keyword, ...arguments] records. */
function statusRecords(status) {
  return status
    .split(/\r?\n/)
    .filter((line) => line.startsWith('[GNUPG:] '))
    .map((line) => line.slice('[GNUPG:] '.length).split(' '));
}

/**
 * The one key gpg imported from docs/SIGNING-KEY.asc, read from the status
 * output of `gpg --import` — or why there was not exactly one. Counts the
 * IMPORT_OK lines rather than trusting the exit code: gpg 2.4 on Windows
 * imports the key, then exits 2 because it cannot reach the agent
 * --no-autostart keeps from starting.
 * @param {string} importStatus
 * @returns {{ fingerprint: string } | { problem: string }}
 */
export function readImportStatus(importStatus) {
  const keys = statusRecords(importStatus).filter(([keyword]) => keyword === 'IMPORT_OK');
  if (keys.length !== 1) {
    return {
      problem: `docs/SIGNING-KEY.asc must hold exactly one key; gpg imported ${keys.length}.`,
    };
  }
  return { fingerprint: keys[0][2] };
}

/**
 * Reads gpg's status output from importing docs/SIGNING-KEY.asc into an empty
 * homedir and then verifying docs/DONATE.asc there. Passes exactly one good
 * signature, made by the one imported key over a collision-resistant hash.
 * @param {string} importStatus
 * @param {string} verifyStatus
 * @param {number | null} verifyExit
 * @returns {{ fingerprint: string } | { problem: string }}
 */
export function readSignatureStatus(importStatus, verifyStatus, verifyExit) {
  const key = readImportStatus(importStatus);
  if ('problem' in key) return key;
  const keyFingerprint = key.fingerprint;

  const records = statusRecords(verifyStatus);
  const refused = records.find(([keyword]) => REFUSED_SIGNATURE_STATUS.includes(keyword));
  if (refused) {
    return { problem: `docs/DONATE.asc's signature is not good (gpg reported ${refused[0]}).` };
  }
  if (verifyExit !== 0) {
    return { problem: `gpg --verify docs/DONATE.asc exited ${verifyExit}.` };
  }
  const count = (keyword) => records.filter(([k]) => k === keyword).length;
  const valid = records.find(([keyword]) => keyword === 'VALIDSIG');
  if (count('NEWSIG') !== 1 || count('GOODSIG') !== 1 || count('VALIDSIG') !== 1 || !valid) {
    return { problem: 'docs/DONATE.asc must carry exactly one signature, and it must be good.' };
  }

  const weakHash = WEAK_HASH_ALGORITHMS[valid[8]];
  if (weakHash) {
    return { problem: `docs/DONATE.asc is signed over ${weakHash}; clearsign it with SHA-256.` };
  }
  const signer = valid[10] ?? valid[1];
  if (signer !== keyFingerprint) {
    return {
      problem: `docs/DONATE.asc is signed by ${signer}, not by docs/SIGNING-KEY.asc (${keyFingerprint}).`,
    };
  }
  return { fingerprint: signer };
}

/**
 * Runs `check` with a gpg bound to a fresh temporary homedir, deleted
 * afterwards. No key or trust setting of the machine running the check can
 * vouch for anything, and --no-autostart keeps gpg from starting an agent
 * that would outlive the check.
 * @template T
 * @param {typeof spawnSync} run
 * @param {(gpg: (args: string[]) => ReturnType<typeof spawnSync>) => T} check
 * @returns {T}
 */
function inThrowawayHomedir(run, check) {
  const home = mkdtempSync(join(tmpdir(), 'autopilot-donate-gpg-'));
  try {
    return check((args) =>
      run('gpg', ['--homedir', home, '--batch', '--no-autostart', '--status-fd', '1', ...args], {
        encoding: 'utf8',
        windowsHide: true,
      }),
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/**
 * Imports docs/SIGNING-KEY.asc on its own — the gate for the key landing
 * before any address does. Passes exactly one key and names its fingerprint.
 * @param {string} keyPath
 * @param {typeof spawnSync} [run]
 * @returns {{ fingerprint: string } | { problem: string }}
 */
export function verifySigningKey(keyPath, run = spawnSync) {
  return inThrowawayHomedir(run, (gpg) => {
    const imported = gpg(['--import', keyPath]);
    if (imported.error) {
      return {
        problem: `gpg could not run (${imported.error.message}); install GnuPG to verify docs/SIGNING-KEY.asc.`,
      };
    }
    return readImportStatus(imported.stdout);
  });
}

/**
 * Verifies docs/DONATE.asc with gpg against docs/SIGNING-KEY.asc alone, in a
 * throwaway homedir holding only that key.
 * @param {string} signedPath
 * @param {string} keyPath
 * @param {typeof spawnSync} [run]
 * @returns {{ fingerprint: string } | { problem: string }}
 */
export function verifySignedAddressFile(signedPath, keyPath, run = spawnSync) {
  if (readIfPresent(keyPath) === null) {
    return {
      problem:
        'docs/DONATE.asc is published without docs/SIGNING-KEY.asc, the public key its ' +
        'signature is checked against.',
    };
  }
  return inThrowawayHomedir(run, (gpg) => {
    const imported = gpg(['--import', keyPath]);
    if (imported.error) {
      return {
        problem: `gpg could not run (${imported.error.message}); install GnuPG to verify docs/DONATE.asc.`,
      };
    }
    // No exit-code check here — readImportStatus counts the IMPORT_OK lines.
    const verified = gpg(['--verify', signedPath]);
    if (verified.error) {
      return { problem: `gpg could not run (${verified.error.message}).` };
    }
    return readSignatureStatus(imported.stdout, verified.stdout, verified.status);
  });
}

/** Renders an address as a Markdown-portable QR code using Unicode
 *  half-block characters — no image file, no third-party QR service. */
export function renderAsciiQr(address) {
  const qr = qrcode(0, 'M');
  qr.addData(address, 'Byte');
  qr.make();
  return qr.createASCII(1, 2).replace(/\n+$/, '');
}

/** @param {import('../../apps/dashboard/dist/flight/donations.js').DonationEntry} entry */
export function renderEntry(entry) {
  const heading = entry.label
    ? `### ${CHAIN_NAMES[entry.chain]} — ${entry.label}`
    : `### ${CHAIN_NAMES[entry.chain]}`;
  return [
    heading,
    '',
    '```',
    entry.address,
    '```',
    '',
    '<details><summary>QR code</summary>',
    '',
    '```',
    renderAsciiQr(entry.address),
    '```',
    '',
    '</details>',
    '',
    `> ⚠️ ${CHAIN_WARNINGS[entry.chain]}`,
    '',
  ].join('\n');
}

/** @param {readonly import('../../apps/dashboard/dist/flight/donations.js').DonationEntry[]} entries */
export function renderDoc(entries) {
  const sections = [
    // REUSE-IgnoreStart — these strings are the SPDX header EMITTED into the
    // generated DONATE.md, not this file's own declaration (line 1-2 is);
    // without the ignore markers the REUSE parser reads the trailing quote
    // as part of the expression and fails the whole repo on "Apache-2.0',".
    '<!--',
    'SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND',
    'SPDX-License-Identifier: Apache-2.0',
    '-->',
    // REUSE-IgnoreEnd
    '',
    '# Donate to the AUTOPILOT Foundation',
    '',
    '_Generated by `pnpm donate:update` from `docs/donations.json` — the same file and parser ' +
      '[`GET /api/donations`](../apps/dashboard/src/flight/donations.ts) uses for the ' +
      "dashboard's masthead funding panel, so this page and the app can never disagree about a " +
      'published address._',
    '',
    'See [`docs/FOUNDATION.md`](FOUNDATION.md) for what the Foundation is, what funding pays ' +
      'for, and its [transparency commitments](FOUNDATION.md#transparency-commitments).',
    '',
    '## Addresses',
    '',
  ];

  if (entries.length === 0) {
    sections.push(
      "**No addresses have been published yet.** Per `docs/FOUNDATION.md`'s custody promise, " +
        'addresses are published only after offline seed generation, a steel backup, and ' +
        'test-verified receipt on every chain — never before. Check back, or watch ' +
        '[`docs/FOUNDATION.md`](FOUNDATION.md) for the announcement.',
      '',
    );
  } else {
    for (const entry of entries) sections.push(renderEntry(entry));
  }

  sections.push(
    '## Verify before you trust',
    '',
    'Addresses are published only as a PGP-clearsigned file ' +
      '([transparency commitment 2](FOUNDATION.md#transparency-commitments)): `docs/DONATE.asc` ' +
      "is the `gpg --clearsign` of `docs/donations.json`, made with the operator's key, whose " +
      'public half is `docs/SIGNING-KEY.asc` — the same key that signs ' +
      '[release tags](RELEASING.md#signed-tags--the-qubes-pattern-foundation-33). ' +
      '`pnpm run ci:donate` holds this page, the address file and its signature together on ' +
      'every commit, but a check that lives in the repository can only prove the committed key ' +
      "signed — the reader's half is yours:",
    '',
    '```sh',
    'gpg --import docs/SIGNING-KEY.asc',
    'gpg --verify docs/DONATE.asc',
    '```',
    '',
    'Then compare the fingerprint gpg names with the one published through an independent ' +
      'channel before you trust it. No `docs/DONATE.asc`, a bad signature, an unfamiliar ' +
      'fingerprint, or an address on this page that the signed file does not carry: do not send.',
    '',
    '## Before you send',
    '',
    '- Match the network exactly — an address that looks right on the wrong chain is usually ' +
      'unrecoverable.',
    '- These are the ONLY addresses this project publishes, and only while `docs/DONATE.asc` ' +
      "verifies (above); anything you see elsewhere claiming to be AUTOPILOT's is not verified " +
      'by us.',
    '- Donations carry no promise of return, reward, or tax deductibility until a formal ' +
      'entity exists (see ' +
      '[transparency commitments](FOUNDATION.md#transparency-commitments)).',
    '',
  );

  return sections.join('\n');
}

/**
 * The signing leg of --check: refuses a bad key file, an address file without
 * its clearsigned twin, or a signature gpg does not vouch for; otherwise says
 * what the tree holds, for the OK line.
 * @returns {{ problem: string } | { note: string }}
 */
function checkSigning() {
  const keyRaw = readIfPresent(SIGNING_KEY_PATH);
  const keyProblem = findSigningKeyProblem(keyRaw);
  if (keyProblem !== null) return { problem: keyProblem };

  const signedRaw = readIfPresent(SIGNED_PATH);
  const pairProblem = findSignedAddressFileProblem(readIfPresent(DONATIONS_PATH), signedRaw);
  if (pairProblem !== null) return { problem: pairProblem };

  if (signedRaw !== null) {
    const signature = verifySignedAddressFile(SIGNED_PATH, SIGNING_KEY_PATH);
    if ('problem' in signature) return signature;
    return { note: ` docs/DONATE.asc is signed by ${signature.fingerprint}.` };
  }
  if (keyRaw !== null) {
    const key = verifySigningKey(SIGNING_KEY_PATH);
    if ('problem' in key) return key;
    return {
      note: ` docs/SIGNING-KEY.asc holds key ${key.fingerprint}; no address file is published yet.`,
    };
  }
  return { note: '' };
}

function main() {
  const check = process.argv.includes('--check');
  const entries = readEntries();
  const next = renderDoc(entries);

  if (check) {
    const signing = checkSigning();
    if ('problem' in signing) {
      console.error(`donate-check FAILED: ${signing.problem}`);
      process.exit(1);
    }
    const current = (() => {
      try {
        return readFileSync(DOC_PATH, 'utf8');
      } catch {
        return '';
      }
    })();
    if (next !== current) {
      console.error(
        'donate-check FAILED: docs/DONATE.md is stale — run `pnpm donate:update` and commit ' +
          'the result.',
      );
      process.exit(1);
    }
    console.log(
      `donate-check OK: docs/DONATE.md matches docs/donations.json (${entries.length} ` +
        `address(es)).${signing.note}`,
    );
    return;
  }

  writeFileSync(DOC_PATH, next);
  console.log(`generate-donate-doc: docs/DONATE.md refreshed (${entries.length} address(es)).`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(
      `generate-donate-doc FAILED: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
