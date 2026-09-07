// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Correctness gate for the trimmed vendor copy in `qrcode-lib.ts`
 * (FOUNDATION 1/3's QR slice) — unlike `foundation.test.ts`'s
 * static-source-assertion shape, this one actually RUNS the generated
 * script (via `Function`, sandboxed to its own scope) and compares its
 * `getModuleCount()`/`isDark()` matrix against the real, untouched
 * `qrcode-generator` npm package (a devDependency used only here — it never
 * ships to the browser, see `qrcode-lib.ts`'s docstring). A trim that
 * silently broke the Reed-Solomon math would still look like valid JS and
 * still pass a static string check; only a real encode-and-compare catches
 * it. Donation-address QR codes are exactly the case where "looks right" and
 * "is right" cannot be allowed to diverge.
 */

import { describe, it, expect } from 'vitest';
import qrcodeUpstream from 'qrcode-generator';
import { QRCODE_LIB_JS } from '../../src/web/qrcode-lib.js';

interface TrimmedQrCode {
  addData(data: string, mode?: string): void;
  isDark(row: number, col: number): boolean;
  getModuleCount(): number;
  make(): void;
}
type TrimmedQrCodeFactory = (typeNumber: number, level: string) => TrimmedQrCode;

function loadTrimmedQrcode(): TrimmedQrCodeFactory {
  const factory = new Function(`${QRCODE_LIB_JS}\nreturn qrcode;`);
  return factory() as TrimmedQrCodeFactory;
}

function matrixOf(qr: {
  getModuleCount(): number;
  isDark(r: number, c: number): boolean;
}): boolean[][] {
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

const SAMPLE_ADDRESSES = [
  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  '0x71C7656EC7ab88b098defB751B7401B5f6d8976',
  'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
  'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
  '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
];

describe('QRCODE_LIB_JS (vendored qrcode-generator trim)', () => {
  it('defines a global qrcode factory function', () => {
    const qrcode = loadTrimmedQrcode();
    expect(typeof qrcode).toBe('function');
  });

  it.each(SAMPLE_ADDRESSES)(
    'matches upstream qrcode-generator byte-mode output for %s',
    (address) => {
      const qrcode = loadTrimmedQrcode();

      const trimmed = qrcode(0, 'M');
      trimmed.addData(address, 'Byte');
      trimmed.make();

      const upstream = qrcodeUpstream(0, 'M');
      upstream.addData(address, 'Byte');
      upstream.make();

      expect(trimmed.getModuleCount()).toBe(upstream.getModuleCount());
      expect(matrixOf(trimmed)).toEqual(matrixOf(upstream));
    },
  );

  it('rejects non-Byte modes (the trim only ever builds qr8BitByte)', () => {
    const qrcode = loadTrimmedQrcode();
    const qr = qrcode(0, 'M');
    expect(() => qr.addData('123', 'Numeric')).toThrow();
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    expect(QRCODE_LIB_JS).toBe(QRCODE_LIB_JS.trim());
  });
});
