// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  executeLanding,
  detectLandingOverlap,
  narrowToHunkOverlap,
  type Landable,
} from '../src/landing.js';
import type { GatePort, GateResult, LandResult, LineRange } from '../src/index.js';

function fakeGate(result: GateResult): GatePort {
  return { run: () => Promise.resolve(result) };
}

function fakeVcs(result: LandResult): {
  vcs: Landable;
  calls: Array<[string, string | undefined]>;
} {
  const calls: Array<[string, string | undefined]> = [];
  return {
    vcs: {
      land: (base, message) => {
        calls.push([base, message]);
        return Promise.resolve(result);
      },
    },
    calls,
  };
}

const GREEN: GateResult = { ok: true, details: '2 gate command(s) passed', checks: [] };
const RED: GateResult = { ok: false, details: 'typecheck failed (exit 1)', checks: [] };

describe('executeLanding', () => {
  it('refuses on a red gate without touching git', async () => {
    const { vcs, calls } = fakeVcs({ ok: true, details: 'landed x onto main' });

    const result = await executeLanding(fakeGate(RED), vcs, 'main');

    expect(result).toEqual({
      ok: false,
      reason: 'gate-red',
      details: 'typecheck failed (exit 1)',
      gate: RED,
    });
    expect(calls).toHaveLength(0); // never called vcs.land
  });

  it('falls back to a generic reason when a red gate carries no details', async () => {
    const noDetails: GateResult = { ok: false };
    const { vcs } = fakeVcs({ ok: true, details: 'landed x onto main' });

    const result = await executeLanding(fakeGate(noDetails), vcs, 'main');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('gate-red');
    expect(result.details).toBe('the gate failed');
  });

  it('lands once the gate is green, threading base and message through to the vcs', async () => {
    const { vcs, calls } = fakeVcs({ ok: true, details: 'landed autopilot/flight onto main' });

    const result = await executeLanding(fakeGate(GREEN), vcs, 'main', 'chore: land 3 ships');

    expect(result).toEqual({
      ok: true,
      reason: 'landed',
      details: 'landed autopilot/flight onto main',
      gate: GREEN,
    });
    expect(calls).toEqual([['main', 'chore: land 3 ships']]);
  });

  it('surfaces a merge failure (e.g. a conflict) as reason "merge-failed", still carrying the green gate result', async () => {
    const { vcs } = fakeVcs({
      ok: false,
      details: "merge of 'flight' into 'main' failed (exit 1)",
    });

    const result = await executeLanding(fakeGate(GREEN), vcs, 'main');

    expect(result).toEqual({
      ok: false,
      reason: 'merge-failed',
      details: "merge of 'flight' into 'main' failed (exit 1)",
      gate: GREEN,
    });
  });
});

describe('detectLandingOverlap', () => {
  it('returns no warnings when no sibling touches any of the files being landed', () => {
    const warnings = detectLandingOverlap(
      ['a.ts', 'b.ts'],
      [{ branch: 'sibling-1', files: ['c.ts'] }],
    );

    expect(warnings).toEqual([]);
  });

  it('flags a sibling whose unlanded files intersect the files being landed', () => {
    const warnings = detectLandingOverlap(
      ['a.ts', 'b.ts'],
      [
        { branch: 'sibling-1', files: ['b.ts', 'c.ts'] },
        { branch: 'sibling-2', files: ['d.ts'] },
      ],
    );

    expect(warnings).toEqual([{ branch: 'sibling-1', files: ['b.ts'] }]);
  });

  it('dedupes a sibling file list before intersecting', () => {
    const warnings = detectLandingOverlap(
      ['a.ts'],
      [{ branch: 'sibling-1', files: ['a.ts', 'a.ts', 'b.ts'] }],
    );

    expect(warnings).toEqual([{ branch: 'sibling-1', files: ['a.ts'] }]);
  });

  it('flags every sibling that overlaps, not just the first', () => {
    const warnings = detectLandingOverlap(
      ['a.ts'],
      [
        { branch: 'sibling-1', files: ['a.ts'] },
        { branch: 'sibling-2', files: ['a.ts'] },
      ],
    );

    expect(warnings).toEqual([
      { branch: 'sibling-1', files: ['a.ts'] },
      { branch: 'sibling-2', files: ['a.ts'] },
    ]);
  });

  it('returns [] for no siblings', () => {
    expect(detectLandingOverlap(['a.ts'], [])).toEqual([]);
  });
});

describe('narrowToHunkOverlap', () => {
  function ranges(...spans: Array<[number, number]>): readonly LineRange[] {
    return spans.map(([start, end]) => ({ start, end }));
  }

  it('keeps a warning whose ranges genuinely intersect', () => {
    const warnings = narrowToHunkOverlap(
      [{ branch: 'sibling-1', files: ['a.ts'] }],
      new Map([['a.ts', ranges([5, 10])]]),
      new Map([['sibling-1', new Map([['a.ts', ranges([8, 12])]])]]),
    );

    expect(warnings).toEqual([{ branch: 'sibling-1', files: ['a.ts'] }]);
  });

  it('drops a warning whose ranges touch the same file but disjoint lines', () => {
    const warnings = narrowToHunkOverlap(
      [{ branch: 'sibling-1', files: ['a.ts'] }],
      new Map([['a.ts', ranges([1, 2])]]),
      new Map([['sibling-1', new Map([['a.ts', ranges([9, 10])]])]]),
    );

    expect(warnings).toEqual([]);
  });

  it('keeps a file this pass cannot measure (missing from either side) as a warning', () => {
    const noMyData = narrowToHunkOverlap(
      [{ branch: 'sibling-1', files: ['a.ts'] }],
      new Map(),
      new Map([['sibling-1', new Map([['a.ts', ranges([1, 2])]])]]),
    );
    const noSiblingData = narrowToHunkOverlap(
      [{ branch: 'sibling-1', files: ['a.ts'] }],
      new Map([['a.ts', ranges([1, 2])]]),
      new Map([['sibling-1', new Map()]]),
    );
    const noSiblingBranch = narrowToHunkOverlap(
      [{ branch: 'sibling-1', files: ['a.ts'] }],
      new Map([['a.ts', ranges([1, 2])]]),
      new Map(),
    );

    expect(noMyData).toEqual([{ branch: 'sibling-1', files: ['a.ts'] }]);
    expect(noSiblingData).toEqual([{ branch: 'sibling-1', files: ['a.ts'] }]);
    expect(noSiblingBranch).toEqual([{ branch: 'sibling-1', files: ['a.ts'] }]);
  });

  it('filters a multi-file warning down to only the files with real range overlap', () => {
    const warnings = narrowToHunkOverlap(
      [{ branch: 'sibling-1', files: ['a.ts', 'b.ts'] }],
      new Map([
        ['a.ts', ranges([1, 2])],
        ['b.ts', ranges([1, 2])],
      ]),
      new Map([
        [
          'sibling-1',
          new Map([
            ['a.ts', ranges([9, 10])],
            ['b.ts', ranges([1, 2])],
          ]),
        ],
      ]),
    );

    expect(warnings).toEqual([{ branch: 'sibling-1', files: ['b.ts'] }]);
  });

  it('treats adjacent-but-touching ranges as overlapping at the boundary line', () => {
    const warnings = narrowToHunkOverlap(
      [{ branch: 'sibling-1', files: ['a.ts'] }],
      new Map([['a.ts', ranges([1, 5])]]),
      new Map([['sibling-1', new Map([['a.ts', ranges([5, 9])]])]]),
    );

    expect(warnings).toEqual([{ branch: 'sibling-1', files: ['a.ts'] }]);
  });

  it('returns [] for no file warnings', () => {
    expect(narrowToHunkOverlap([], new Map(), new Map())).toEqual([]);
  });
});
