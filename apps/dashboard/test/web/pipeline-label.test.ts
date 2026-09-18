// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The files lens labels a node with a full repo path; a 120-unit cell held
 * `apps/dashboard/src/web/shell.ts` by overflowing both edges (operator,
 * 2026-09-18). `fitLabel` cuts from the FRONT and keeps the leaf whole for
 * as long as it fits — the file name is what a reader scans for.
 */

import { describe, it, expect } from 'vitest';
import {
  fitLabel,
  labelBudget,
  LABEL_ELLIPSIS,
  LABEL_MIN_CHARS,
  PIPELINE_LABEL_CHAR_UNITS,
  PIPELINE_LABEL_PAD_UNITS,
} from '../../src/web/pipeline-label.js';

describe('labelBudget', () => {
  it('is the cell width minus padding, in average glyph advances, rounded down', () => {
    expect(labelBudget(120)).toBe(
      Math.floor((120 - PIPELINE_LABEL_PAD_UNITS) / PIPELINE_LABEL_CHAR_UNITS),
    );
    expect(labelBudget(120)).toBe(15);
  });

  it('never drops below the readable floor, whatever the cell', () => {
    expect(labelBudget(0)).toBe(LABEL_MIN_CHARS);
    expect(labelBudget(PIPELINE_LABEL_PAD_UNITS)).toBe(LABEL_MIN_CHARS);
  });
});

describe('fitLabel', () => {
  it('leaves a label that fits untouched, split into its directories and its leaf', () => {
    expect(fitLabel('plan', 15)).toEqual({ head: '', leaf: 'plan', truncated: false });
    expect(fitLabel('src/a.ts', 15)).toEqual({ head: 'src/', leaf: 'a.ts', truncated: false });
  });

  it('a label exactly at the budget is not cut — the boundary is inclusive', () => {
    expect(fitLabel('abcdefghij/k.ts', 15)).toEqual({
      head: 'abcdefghij/',
      leaf: 'k.ts',
      truncated: false,
    });
  });

  it('cuts directories from the FRONT and keeps as many trailing segments as fit', () => {
    // 31 chars into 15: the leaf (8) plus `…/` leaves 5 for directories —
    // `web/` fits, `src/web/` would not.
    expect(fitLabel('apps/dashboard/src/web/shell.ts', 15)).toEqual({
      head: `${LABEL_ELLIPSIS}/web/`,
      leaf: 'shell.ts',
      truncated: true,
    });
    expect(`${LABEL_ELLIPSIS}/web/shell.ts`.length).toBeLessThanOrEqual(15);
  });

  it('keeps the leaf whole with a bare ellipsis head when no directory fits', () => {
    expect(fitLabel('packages/engine/src/adapters/claude-cli.ts', 15)).toEqual({
      head: `${LABEL_ELLIPSIS}/`,
      leaf: 'claude-cli.ts',
      truncated: true,
    });
  });

  it('a trailing segment that exactly fills the room is kept — the boundary is inclusive', () => {
    // leaf 'x.ts' (4) + '…/' (2) = 6, room = 4: 'abc/' is exactly 4.
    expect(fitLabel('zz/abc/x.ts', 10)).toEqual({
      head: `${LABEL_ELLIPSIS}/abc/`,
      leaf: 'x.ts',
      truncated: true,
    });
  });

  it('a leaf ONE character too long for `…/` + leaf is cut, never pushed over the budget with a head', () => {
    // leaf 'abcdefghijk.ts' is 14: 14 + 2 = 16 > 15, so the head branch must
    // not be taken — `…/abcdefghijk.ts` would be 16 wide.
    expect(fitLabel('x/abcdefghijk.ts', 15)).toEqual({
      head: '',
      leaf: `abcdefghijk${LABEL_ELLIPSIS}.ts`,
      truncated: true,
    });
    expect(`abcdefghijk${LABEL_ELLIPSIS}.ts`.length).toBe(15);
  });

  it('a trailing segment ONE character over the room is dropped, never squeezed in', () => {
    // room = 10 - 4 - 2 = 4; 'abcd/' is 5.
    expect(fitLabel('zz/abcd/x.ts', 10)).toEqual({
      head: `${LABEL_ELLIPSIS}/`,
      leaf: 'x.ts',
      truncated: true,
    });
  });

  it('when even the leaf overflows, keeps its start and its extension (the LAST dot — .ts, not .test.ts)', () => {
    expect(fitLabel('apps/x/shell-decomposition-census.test.ts', 15)).toEqual({
      head: '',
      leaf: `shell-decom${LABEL_ELLIPSIS}.ts`,
      truncated: true,
    });
    expect(`shell-decom${LABEL_ELLIPSIS}.ts`.length).toBe(15);
  });

  it('a long bare name (no slash, no extension) is cut with the ellipsis at the end', () => {
    expect(fitLabel('averyveryverylongspanname', 8)).toEqual({
      head: '',
      leaf: `averyve${LABEL_ELLIPSIS}`,
      truncated: true,
    });
  });

  it('a dotfile has no extension to preserve — the leading dot is not one', () => {
    expect(fitLabel('some/dir/.gitattributes-extended-name', 8)).toEqual({
      head: '',
      leaf: `.gitatt${LABEL_ELLIPSIS}`,
      truncated: true,
    });
  });
});
