// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure phase-rail activity math
 * (`web/phase-rail.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2. `phase-rail-tooltips.test.ts` already regression-tests
 * `phaseCounts`/`phaseTipText` indirectly through the rendered DOM in
 * `clientJs()`; these tests exercise the real functions directly instead.
 * `phaseDetailRows` (the "look INTO a phase" detail view) previously had no
 * coverage at all beyond what a DOM render happened to exercise.
 */

import { describe, it, expect } from 'vitest';
import {
  phaseCounts,
  phaseTipText,
  phaseDetailRows,
  PHASE_DETAIL_CAP,
} from '../../src/web/phase-rail.js';

describe('phaseCounts', () => {
  it('counts activities per known phase', () => {
    expect(
      phaseCounts([
        { phase: 'orient' },
        { phase: 'do' },
        { phase: 'do' },
        { phase: 'gate' },
        { phase: 'commit' },
      ]),
    ).toEqual({ orient: 1, do: 2, gate: 1, commit: 1, other: 0 });
  });

  it('buckets a missing/empty phase as other', () => {
    expect(phaseCounts([{ phase: '' }, { phase: 'orient' }])).toEqual({
      orient: 1,
      do: 0,
      gate: 0,
      commit: 0,
      other: 1,
    });
  });

  it('counts an unrecognized non-empty phase under its own name, not other', () => {
    expect(phaseCounts([{ phase: 'mystery' }])).toEqual({
      orient: 0,
      do: 0,
      gate: 0,
      commit: 0,
      other: 0,
      mystery: 1,
    });
  });

  it('returns all-zero counts for an empty activity list', () => {
    expect(phaseCounts([])).toEqual({ orient: 0, do: 0, gate: 0, commit: 0, other: 0 });
  });
});

describe('phaseTipText', () => {
  const officeTips = {
    orient: 'ORIENT — reading repo state before picking work',
    gate: 'GATE — typecheck + test + build must pass',
  };

  it('singularizes the activity count when it is exactly 1', () => {
    expect(phaseTipText('orient', 1, officeTips)).toBe(
      'ORIENT — reading repo state before picking work — 1 activity, toggle detail',
    );
  });

  it('reflects a zero count for a phase with no activity yet', () => {
    expect(phaseTipText('gate', 0, officeTips)).toBe(
      'GATE — typecheck + test + build must pass — 0 activities, toggle detail',
    );
  });

  it('pluralizes the activity count when it is more than 1', () => {
    expect(phaseTipText('gate', 2, officeTips)).toBe(
      'GATE — typecheck + test + build must pass — 2 activities, toggle detail',
    );
  });
});

describe('phaseDetailRows', () => {
  it('returns only activities matching the given phase, newest first', () => {
    const acts = [
      { phase: 'orient', target: 'a' },
      { phase: 'do', target: 'b' },
      { phase: 'orient', target: 'c' },
    ];
    expect(phaseDetailRows(acts, 'orient')).toEqual([
      { phase: 'orient', target: 'c' },
      { phase: 'orient', target: 'a' },
    ]);
  });

  it('buckets a missing/empty phase as other, matching phaseCounts', () => {
    const acts = [{ phase: '' }, { phase: 'orient' }];
    expect(phaseDetailRows(acts, 'other')).toEqual([{ phase: '' }]);
  });

  it('stops once cap rows are collected instead of scanning the whole array', () => {
    const acts = Array.from({ length: 10 }, (_, i) => ({ phase: 'do', i }));
    const rows = phaseDetailRows(acts, 'do', 3);
    expect(rows).toEqual([
      { phase: 'do', i: 9 },
      { phase: 'do', i: 8 },
      { phase: 'do', i: 7 },
    ]);
  });

  it('defaults the cap to PHASE_DETAIL_CAP when none is given', () => {
    const acts = Array.from({ length: PHASE_DETAIL_CAP + 5 }, () => ({ phase: 'gate' }));
    expect(phaseDetailRows(acts, 'gate')).toHaveLength(PHASE_DETAIL_CAP);
  });

  it('returns an empty array when nothing matches the phase', () => {
    expect(phaseDetailRows([{ phase: 'orient' }], 'commit')).toEqual([]);
  });
});
