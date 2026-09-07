// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  renderDoc,
  renderEntry,
  renderAsciiQr,
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
