// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure language-bar segment math
 * (`web/lang-bar.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2. `gauge-langbar-tooltips.test.ts` already regression-tests this
 * logic indirectly through the rendered DOM in `clientJs()`; these tests
 * exercise the real function directly instead.
 */

import { describe, it, expect } from 'vitest';
import { langBarSegments, langSegMeta, langLegendLine } from '../../src/web/lang-bar.js';

describe('langBarSegments', () => {
  it("computes each language's rounded percentage share of the total", () => {
    const segs = langBarSegments([
      { language: 'typescript', bytes: 3072 },
      { language: 'json', bytes: 1024 },
    ]);
    expect(segs.map((s) => ({ ...s, opacity: undefined }))).toEqual([
      { language: 'typescript', bytes: 3072, pct: 75, opacity: undefined },
      { language: 'json', bytes: 1024, pct: 25, opacity: undefined },
    ]);
    expect(segs[0]?.opacity).toBeCloseTo(1);
    expect(segs[1]?.opacity).toBeCloseTo(0.82);
  });

  it('dims opacity by original rank, floored at 0.35', () => {
    const segs = langBarSegments([
      { language: 'a', bytes: 10 },
      { language: 'b', bytes: 10 },
      { language: 'c', bytes: 10 },
      { language: 'd', bytes: 10 },
      { language: 'e', bytes: 10 },
    ]);
    const opacities = segs.map((s) => s.opacity);
    [1, 0.82, 0.64, 0.46, 0.35].forEach((expected, i) => {
      expect(opacities[i]).toBeCloseTo(expected);
    });
  });

  it('drops zero-byte languages but keeps later ranks dimmed by their original index', () => {
    const segs = langBarSegments([
      { language: 'typescript', bytes: 100 },
      { language: 'empty', bytes: 0 },
      { language: 'json', bytes: 50 },
    ]);
    expect(segs).toEqual([
      { language: 'typescript', bytes: 100, pct: 67, opacity: 1 },
      { language: 'json', bytes: 50, pct: 33, opacity: Math.max(0.35, 1 - 2 * 0.18) },
    ]);
  });

  it('treats missing/null bytes as zero', () => {
    const segs = langBarSegments([
      { language: 'typescript', bytes: 100 },
      { language: 'unknown', bytes: null },
      { language: 'other', bytes: undefined },
    ]);
    expect(segs).toEqual([{ language: 'typescript', bytes: 100, pct: 100, opacity: 1 }]);
  });

  it('returns an empty array when every language is zero bytes', () => {
    expect(langBarSegments([{ language: 'a', bytes: 0 }])).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(langBarSegments([])).toEqual([]);
  });
});

describe('langSegMeta', () => {
  const fmtBytes = (n: number) => 'BYTES(' + n + ')';

  it('formats the tip as "<language> — <pct>%"', () => {
    expect(
      langSegMeta({ language: 'typescript', bytes: 3072, pct: 75, opacity: 1 }, fmtBytes).tip,
    ).toBe('typescript — 75%');
  });

  it('formats the aria-label as "<language>: <pct> percent, <fmtBytes>" via the injected fmtBytes', () => {
    expect(
      langSegMeta({ language: 'json', bytes: 1024, pct: 25, opacity: 0.82 }, fmtBytes).ariaLabel,
    ).toBe('json: 25 percent, BYTES(1024)');
  });
});

describe('langLegendLine', () => {
  const fmtBytes = (n: number) => 'BYTES(' + n + ')';

  it('joins language, pluralized file count, and formatted bytes', () => {
    expect(langLegendLine({ language: 'typescript', files: 12, bytes: 3072 }, fmtBytes)).toBe(
      'typescript — 12 files, BYTES(3072)',
    );
  });

  it('treats missing/null bytes as zero', () => {
    expect(langLegendLine({ language: 'unknown', files: 1, bytes: null }, fmtBytes)).toBe(
      'unknown — 1 files, BYTES(0)',
    );
    expect(langLegendLine({ language: 'other', files: 0, bytes: undefined }, fmtBytes)).toBe(
      'other — 0 files, BYTES(0)',
    );
  });
});
