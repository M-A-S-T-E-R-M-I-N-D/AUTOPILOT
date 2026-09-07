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
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
    '## Before you send',
    '',
    '- Match the network exactly — an address that looks right on the wrong chain is usually ' +
      'unrecoverable.',
    '- These are the ONLY addresses this project publishes; anything you see elsewhere ' +
      "claiming to be AUTOPILOT's is not verified by us.",
    '- Donations carry no promise of return, reward, or tax deductibility until a formal ' +
      'entity exists (see ' +
      '[transparency commitments](FOUNDATION.md#transparency-commitments)).',
    '',
  );

  return sections.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const entries = readEntries();
  const next = renderDoc(entries);

  if (check) {
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
        'address(es)).',
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
