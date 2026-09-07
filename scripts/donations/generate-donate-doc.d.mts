// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface DonationEntryLike {
  readonly chain: 'btc' | 'evm' | 'sol';
  readonly address: string;
  readonly label?: string;
}

export declare function renderAsciiQr(address: string): string;
export declare function renderEntry(entry: DonationEntryLike): string;
export declare function renderDoc(entries: readonly DonationEntryLike[]): string;
