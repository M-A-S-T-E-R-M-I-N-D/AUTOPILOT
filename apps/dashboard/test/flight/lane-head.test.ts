// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FRESH_LANE,
  LANE_HEAD_UNVERIFIED_EVENT,
  LANE_HEAD_VERIFIED_EVENT,
  laneHeadAfterFiring,
  laneHeadAtLaunch,
  latestLaneHeadMarker,
  type FiringVerdictLike,
} from '../../src/flight/lane-head.js';

function record(over: Partial<FiringVerdictLike>): FiringVerdictLike {
  return {
    firing: 109,
    gateResult: 'passed',
    headAdvanced: true,
    gateChecks: [{ pass: true }],
    gateError: null,
    ...over,
  };
}

const unverified = { verified: false, reason: 'earlier' } as const;

describe('laneHeadAfterFiring — only a gate-judged head is ever published', () => {
  it('a green gate verifies the head, naming the firing', () => {
    expect(laneHeadAfterFiring(unverified, record({ gateResult: 'passed' }))).toEqual({
      verified: true,
      reason: 'firing 109 gate green',
    });
  });

  it('an unverifiable firing whose commit stayed in place clears verification with the recorded reason', () => {
    expect(
      laneHeadAfterFiring(
        FRESH_LANE,
        record({
          gateResult: 'unverifiable',
          gateError:
            'refused: uncommitted changes remain after the commit — the gate cannot verify the commit in isolation',
        }),
      ),
    ).toEqual({
      verified: false,
      reason:
        'firing 109 unverifiable: refused: uncommitted changes remain after the commit — the gate cannot verify the commit in isolation',
    });
    expect(
      laneHeadAfterFiring(FRESH_LANE, record({ gateResult: 'unverifiable', gateError: null })),
    ).toEqual({ verified: false, reason: 'firing 109 unverifiable: no reason recorded' });
  });

  it('an unverifiable firing that committed nothing leaves the head as it was — the same object', () => {
    const r = record({ gateResult: 'unverifiable', headAdvanced: false });
    expect(laneHeadAfterFiring(FRESH_LANE, r)).toBe(FRESH_LANE);
    expect(laneHeadAfterFiring(unverified, r)).toBe(unverified);
  });

  it('a checkpoint is never published — green telemetry gate, red one, or none', () => {
    const parked = {
      verified: false,
      reason: 'firing 109 checkpointed: an unfinished unit is never published',
    };
    for (const gateChecks of [
      [{ pass: true }, { pass: true }],
      [{ pass: true }, { pass: false }],
      [],
    ]) {
      expect(
        laneHeadAfterFiring(
          FRESH_LANE,
          record({ gateResult: 'checkpointed', headAdvanced: false, gateChecks }),
        ),
      ).toEqual(parked);
    }
  });

  it('a revert, a no-commit and a skipped firing keep the previous state — the same object', () => {
    for (const gateResult of ['reverted', 'no-commit', 'skipped'] as const) {
      expect(laneHeadAfterFiring(FRESH_LANE, record({ gateResult }))).toBe(FRESH_LANE);
      expect(laneHeadAfterFiring(unverified, record({ gateResult }))).toBe(unverified);
    }
  });
});

describe('latestLaneHeadMarker — the newest persisted marker for this branch', () => {
  const row = (type: string, payload: string | null) => ({ type, payload });

  it('returns the first matching row (rows arrive newest first), with its verdict and sha', () => {
    const rows = [
      row('other-event', '{"branch":"lane-a","sha":"ffff"}'),
      row(LANE_HEAD_UNVERIFIED_EVENT, '{"branch":"lane-b","sha":"bbbb","reason":"other lane"}'),
      row(
        LANE_HEAD_UNVERIFIED_EVENT,
        '{"branch":"lane-a","sha":"aaaa","reason":"firing 109 unverifiable"}',
      ),
      row(LANE_HEAD_VERIFIED_EVENT, '{"branch":"lane-a","sha":"9999","reason":"older"}'),
    ];
    expect(latestLaneHeadMarker(rows, 'lane-a')).toEqual({
      verified: false,
      sha: 'aaaa',
      reason: 'firing 109 unverifiable',
    });
    expect(latestLaneHeadMarker(rows, 'lane-b')).toEqual({
      verified: false,
      sha: 'bbbb',
      reason: 'other lane',
    });
  });

  it('a verified marker reads as verified, and a missing reason is empty', () => {
    expect(
      latestLaneHeadMarker(
        [row(LANE_HEAD_VERIFIED_EVENT, '{"branch":"lane-a","sha":"1111"}')],
        'lane-a',
      ),
    ).toEqual({ verified: true, sha: '1111', reason: '' });
  });

  it('skips malformed rows — null payload, bad JSON, a non-string sha — and answers null with nothing left', () => {
    const rows = [
      row(LANE_HEAD_UNVERIFIED_EVENT, null),
      row(LANE_HEAD_UNVERIFIED_EVENT, 'not json'),
      row(LANE_HEAD_UNVERIFIED_EVENT, '{"branch":"lane-a","sha":7}'),
      row(LANE_HEAD_UNVERIFIED_EVENT, '{"branch":"lane-z","sha":"zzzz"}'),
    ];
    expect(latestLaneHeadMarker(rows, 'lane-a')).toBeNull();
    expect(latestLaneHeadMarker([], 'lane-a')).toBeNull();
  });
});

describe('laneHeadAtLaunch — a parked head stays parked only while it is the same commit', () => {
  it('no marker, or a verified one, is a fresh lane', () => {
    expect(laneHeadAtLaunch(null, 'aaaa')).toBe(FRESH_LANE);
    expect(laneHeadAtLaunch({ verified: true, sha: 'aaaa', reason: 'x' }, 'bbbb')).toBe(FRESH_LANE);
  });

  it('an unverified marker naming the current head keeps the lane parked, carrying the reason', () => {
    expect(
      laneHeadAtLaunch({ verified: false, sha: 'aaaa', reason: 'firing 109 unverifiable' }, 'aaaa'),
    ).toEqual({
      verified: false,
      reason: 'parked since a previous flight: firing 109 unverifiable',
    });
  });

  it('an unverified marker for a head that has since moved is judged afresh', () => {
    expect(laneHeadAtLaunch({ verified: false, sha: 'aaaa', reason: 'x' }, 'bbbb')).toEqual({
      verified: true,
      reason: 'the lane head moved since it was marked unverified',
    });
  });
});

describe('fly.ts wiring (source census)', () => {
  const flySource = readFileSync(
    fileURLToPath(new URL('../../src/fly.ts', import.meta.url)),
    'utf8',
  );

  it('the launch catch-up, the per-firing sync-back and the flight-end sync-back all yield to an unverified head', () => {
    // Launch: the catch-up merges the lane into the shared checkout only when the head is verified.
    expect(flySource).toMatch(
      /if \(sync\.catchUp\) \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(laneHead\.verified\) \{/,
    );
    expect(flySource).toContain('catch-up sync withheld:');
    // Per firing: the record moves the bit, a real transition is persisted, and the sync-back waits for green.
    expect(flySource).toMatch(
      /const next = laneHeadAfterFiring\(laneHead, outcome\.record\);\n\s*if \(next !== laneHead\) \{\n\s*laneHead = next;\n\s*recordLaneHead\(laneHead, await vcs\.head\(\)\);\n\s*\}\n\s*if \(!laneHead\.verified\) \{/,
    );
    expect(flySource).toContain('sync-back withheld:');
    // Flight end: a withheld final sync-back takes the existing stranded-work path (log, event, inbox task).
    expect(flySource).toMatch(
      /const finalSync: SyncWorktreeBranchResult = laneHead\.verified\n\s*\? await syncWorktreeBranch\(/,
    );
    expect(flySource).toContain('an unverified head is never published');
  });

  it("the stranded-work inbox task is filed with a value the schema accepts, and only the store's answer counts as filed", () => {
    expect(flySource).not.toContain("dimension: 'process'");
    expect(flySource).toMatch(/const filed = createTask\(\s*store,/);
    expect(flySource).toContain('stranded-work task could NOT be filed');
  });

  it('the launch reads the persisted marker for this lane branch and judges the head it found', () => {
    expect(flySource).toMatch(
      /laneHead = laneHeadAtLaunch\(\s*latestLaneHeadMarker\(laneHeadMarkerRows\(\), worktreePlan\.branch\),\s*await new GitVcs\(worktreePlan\.path\)\.head\(\),?\s*\);/,
    );
  });
});
