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
export declare function extractClearsignedText(armored: string): string | null;
export declare function findSignedAddressFileProblem(
  donationsRaw: string | null,
  signedRaw: string | null,
): string | null;
export declare function findSigningKeyProblem(keyRaw: string | null): string | null;

export type SignatureCheck = { readonly fingerprint: string } | { readonly problem: string };

/** The part of a `spawnSync(..., { encoding: 'utf8' })` result the check reads. */
export interface GpgResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly error?: Error;
}

export declare function readImportStatus(importStatus: string): SignatureCheck;
export declare function readSignatureStatus(
  importStatus: string,
  verifyStatus: string,
  verifyExit: number | null,
): SignatureCheck;
export declare function verifySigningKey(
  keyPath: string,
  run?: (command: string, args: readonly string[], options: object) => GpgResult,
): SignatureCheck;
export declare function verifySignedAddressFile(
  signedPath: string,
  keyPath: string,
  run?: (command: string, args: readonly string[], options: object) => GpgResult,
): SignatureCheck;
