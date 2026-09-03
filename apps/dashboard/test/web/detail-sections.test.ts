// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure per-subsection diff-signature helper
 * (`web/detail-sections.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2. `live-render-section-patch.test.ts` already
 * regression-tests this logic indirectly through the rendered DOM in
 * `clientJs()`; these tests exercise the real function directly instead.
 */

import { describe, it, expect } from 'vitest';
import { detailSectionSigs, type DetailSectionInput } from '../../src/web/detail-sections.js';

const BASE: DetailSectionInput = {
  id: 'p1',
  gate: 'pnpm test',
  backedUp: true,
  languages: ['typescript'],
  topDirs: ['src'],
  hotFiles: ['src/index.ts'],
  flightLog: [{ id: 'f1' }],
  tasks: [{ id: 't1' }],
  flightLogHasMore: false,
  activity: [{ tool: 'Read' }],
  status: 'flying',
  firings: 3,
  cost: 1.5,
  tokensIn: 100,
  tokensOut: 50,
  shipRate: 0.67,
};

// (flightLogExtra, flightLogMore, openFlightLogAll, openFlightRow, flightLogLoading, openPhases, openFirings)
const NO_STATE = [
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
] as const;

describe('detailSectionSigs', () => {
  it('returns one signature per Details subsection', () => {
    const sigs = detailSectionSigs(BASE, ...NO_STATE);
    expect(Object.keys(sigs).sort()).toEqual(
      [
        'facts',
        'languages',
        'dirs',
        'hotfiles',
        'flightlog',
        'activity',
        'timeline',
        'metrics',
      ].sort(),
    );
  });

  it('changes only the facts signature when gate/backedUp change', () => {
    const before = detailSectionSigs(BASE, ...NO_STATE);
    const after = detailSectionSigs({ ...BASE, gate: 'pnpm build' }, ...NO_STATE);
    expect(after.facts).not.toBe(before.facts);
    expect(after.languages).toBe(before.languages);
    expect(after.dirs).toBe(before.dirs);
    expect(after.hotfiles).toBe(before.hotfiles);
  });

  it('changes only the languages signature when languages change', () => {
    const before = detailSectionSigs(BASE, ...NO_STATE);
    const after = detailSectionSigs({ ...BASE, languages: ['typescript', 'go'] }, ...NO_STATE);
    expect(after.languages).not.toBe(before.languages);
    expect(after.facts).toBe(before.facts);
    expect(after.dirs).toBe(before.dirs);
  });

  it('changes only the dirs signature when topDirs change', () => {
    const before = detailSectionSigs(BASE, ...NO_STATE);
    const after = detailSectionSigs({ ...BASE, topDirs: ['src', 'test'] }, ...NO_STATE);
    expect(after.dirs).not.toBe(before.dirs);
    expect(after.hotfiles).toBe(before.hotfiles);
  });

  it('changes only the hotfiles signature when hotFiles change', () => {
    const before = detailSectionSigs(BASE, ...NO_STATE);
    const after = detailSectionSigs(
      { ...BASE, hotFiles: ['src/index.ts', 'src/other.ts'] },
      ...NO_STATE,
    );
    expect(after.hotfiles).not.toBe(before.hotfiles);
    expect(after.dirs).toBe(before.dirs);
  });

  it('changes the flightlog signature when any injected flight-log disclosure state moves, not just c', () => {
    const before = detailSectionSigs(
      BASE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    const afterExtra = detailSectionSigs(
      BASE,
      [{ id: 'f2' }],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    const afterOpenRow = detailSectionSigs(
      BASE,
      undefined,
      undefined,
      undefined,
      'f1',
      undefined,
      undefined,
      undefined,
    );
    expect(afterExtra.flightlog).not.toBe(before.flightlog);
    expect(afterOpenRow.flightlog).not.toBe(before.flightlog);
    expect(afterExtra.activity).toBe(before.activity);
    expect(afterOpenRow.timeline).toBe(before.timeline);
  });

  it('changes only the activity signature when the injected openPhases state moves', () => {
    const before = detailSectionSigs(BASE, ...NO_STATE);
    const after = detailSectionSigs(
      BASE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'orient',
      undefined,
    );
    expect(after.activity).not.toBe(before.activity);
    expect(after.flightlog).toBe(before.flightlog);
    expect(after.timeline).toBe(before.timeline);
  });

  it('changes only the timeline signature when the injected openFirings state moves', () => {
    const before = detailSectionSigs(BASE, ...NO_STATE);
    const after = detailSectionSigs(
      BASE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'fir-1',
    );
    expect(after.timeline).not.toBe(before.timeline);
    expect(after.activity).toBe(before.activity);
    expect(after.flightlog).toBe(before.flightlog);
  });

  it('changes only the metrics signature when cost/token/ship fields change', () => {
    const before = detailSectionSigs(BASE, ...NO_STATE);
    const after = detailSectionSigs({ ...BASE, cost: 2, tokensIn: 200 }, ...NO_STATE);
    expect(after.metrics).not.toBe(before.metrics);
    expect(after.facts).toBe(before.facts);
    expect(after.timeline).toBe(before.timeline);
  });

  it('falls back to an empty-array signature when languages/topDirs/hotFiles are null', () => {
    const sigs = detailSectionSigs(
      { ...BASE, languages: null, topDirs: null, hotFiles: null },
      ...NO_STATE,
    );
    expect(sigs.languages).toBe('[]');
    expect(sigs.dirs).toBe('[]');
    expect(sigs.hotfiles).toBe('[]');
  });
});
