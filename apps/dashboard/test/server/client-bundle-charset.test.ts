// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { transformSync } from 'esbuild';
import { minifiedClientJs } from '../../src/server/client-bundle.js';
import { clientJs } from '../../src/web/shell.js';

/**
 * `minifiedClientJs()` passes `charset: 'utf8'` to esbuild so non-ASCII source
 * characters ship as literal UTF-8 bytes instead of the default `\uXXXX`
 * escapes — smaller over the wire, and safe only because `/app.js` is always
 * served with an explicit `charset=utf-8` Content-Type (routes.ts). This test
 * pins that behavior: without the option, esbuild would escape the same
 * source into visibly more bytes.
 */
describe('minifiedClientJs charset', () => {
  // Each of these minifies the full client bundle, which can exceed the 30s
  // default when sibling gates share the machine — contention, not a hang.
  it('is smaller than the default \\uXXXX-escaped equivalent of the same source', () => {
    const served = minifiedClientJs();
    const escaped = transformSync(clientJs(), { minify: true, loader: 'js' }).code;

    expect(Buffer.byteLength(served, 'utf8')).toBeLessThan(Buffer.byteLength(escaped, 'utf8'));
  }, 120_000);

  it('never encodes a non-ASCII character as a \\u escape sequence', () => {
    const served = minifiedClientJs();

    expect(served).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  }, 120_000);
});
