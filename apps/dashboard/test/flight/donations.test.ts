// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  parseDonationEntries,
  createDonationsPreviewApi,
  DONATIONS_FILE_PATH,
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

describe('createDonationsPreviewApi', () => {
  it('reads DONATIONS_FILE_PATH by default and parses its JSON', async () => {
    const readFile: DonationsReader = vi
      .fn()
      .mockReturnValue(JSON.stringify([{ chain: 'btc', address: 'bc1qexampleaddress' }]));
    const api = createDonationsPreviewApi(readFile);

    expect(await api()).toEqual([{ chain: 'btc', address: 'bc1qexampleaddress' }]);
    expect(readFile).toHaveBeenCalledWith(DONATIONS_FILE_PATH);
  });

  it('degrades to an empty list when the file does not exist (the pre-verification default)', async () => {
    const readFile: DonationsReader = vi.fn().mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const api = createDonationsPreviewApi(readFile);

    expect(await api()).toEqual([]);
  });

  it('degrades to an empty list on invalid JSON instead of throwing', async () => {
    const readFile: DonationsReader = vi.fn().mockReturnValue('not json{{{');
    const api = createDonationsPreviewApi(readFile);

    expect(await api()).toEqual([]);
  });

  it('degrades to an empty list when the JSON parses but is not an array', async () => {
    const readFile: DonationsReader = vi.fn().mockReturnValue(JSON.stringify({ oops: true }));
    const api = createDonationsPreviewApi(readFile);

    expect(await api()).toEqual([]);
  });

  it('accepts a custom path for the injectable reader', async () => {
    const readFile: DonationsReader = vi.fn().mockReturnValue('[]');
    const api = createDonationsPreviewApi(readFile, 'config/donations.json');

    await api();

    expect(readFile).toHaveBeenCalledWith('config/donations.json');
  });
});
