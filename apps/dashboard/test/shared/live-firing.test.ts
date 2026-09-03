// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct coverage for shared/live-firing.ts's liveFiringsOf — the multi-lane
 * counterpart to liveFiringOf (board web-mtbp0t86-rnimyi, "fleet cockpit
 * shows 1 pilot for 8 lanes"). liveFiringOf gets exercised through
 * web/live-firing-parity.test.ts's rendered-bundle assertions; liveFiringsOf
 * had no test anywhere — grepping the repo for its name turned up only its
 * own definition and its two callers (read/fleet.ts, web/shell.ts, both
 * generated/hand-synced from this module). These pin its per-lane resolution,
 * dedup, and landed-firing exclusion directly against the pure function.
 *
 * Also covers orientFixation directly: every existing reference to it
 * (read/fleet.test.ts, web/live-firing-parity.test.ts) only ever reads the
 * `.orientFixation` FIELD off a `liveFiring()`/parity result, never calls the
 * standalone predicate itself with real inputs and asserts on its return
 * value — the same "only exercised indirectly" gap as liveFiringsOf above.
 */

import { describe, it, expect } from 'vitest';
import {
  liveFiringOf,
  liveFiringsOf,
  orientFixation,
  ORIENT_FIXATION_TURN_THRESHOLD,
  type LiveFiringActivity,
  type LiveFiringProject,
} from '../../src/shared/live-firing.js';

const NOW = 1_700_000_000_000;

function act(overrides: Partial<LiveFiringActivity>): LiveFiringActivity {
  return {
    tool: 'Bash',
    target: 'pnpm run test',
    kind: 'command',
    phase: 'gate',
    at: NOW - 5_000,
    firingId: 'f1',
    ...overrides,
  };
}

const callsignOf = (firingId: string): string => 'C-' + firingId;
const narratorLineOf = (activity: readonly LiveFiringActivity[]): string =>
  'narrating ' + activity.length;
const countTurnsOf = (activity: readonly LiveFiringActivity[]): number => activity.length;

function project(overrides: Partial<LiveFiringProject>): LiveFiringProject {
  return {
    status: 'flying',
    activity: [],
    flightLog: [],
    tasks: [],
    ...overrides,
  };
}

describe('liveFiringsOf', () => {
  it('returns no lanes when the project is not flying', () => {
    const p = project({ status: 'idle', activity: [act({})] });
    expect(liveFiringsOf(p, callsignOf, narratorLineOf, countTurnsOf)).toEqual([]);
  });

  it('returns no lanes when the activity window is empty', () => {
    const p = project({ activity: [] });
    expect(liveFiringsOf(p, callsignOf, narratorLineOf, countTurnsOf)).toEqual([]);
  });

  it('returns no lanes when the only firing already landed', () => {
    const p = project({
      activity: [act({ firingId: 'f1' })],
      flightLog: [{ id: 'f1', durationMs: null }],
    });
    expect(liveFiringsOf(p, callsignOf, narratorLineOf, countTurnsOf)).toEqual([]);
  });

  it('skips activity rows with no firingId', () => {
    const p = project({ activity: [act({ firingId: null })] });
    expect(liveFiringsOf(p, callsignOf, narratorLineOf, countTurnsOf)).toEqual([]);
  });

  it('resolves one lane per distinct live firingId, newest-first', () => {
    const p = project({
      activity: [
        act({ firingId: 'f2', at: NOW - 1_000, target: 'lane-2 newest' }),
        act({ firingId: 'f1', at: NOW - 2_000, target: 'lane-1 newest' }),
        act({ firingId: 'f2', at: NOW - 3_000, target: 'lane-2 older' }),
        act({ firingId: 'f1', at: NOW - 4_000, target: 'lane-1 older' }),
      ],
    });
    const lanes = liveFiringsOf(p, callsignOf, narratorLineOf, countTurnsOf);
    expect(lanes.map((l) => l.firingId)).toEqual(['f2', 'f1']);
    expect(lanes.map((l) => l.target)).toEqual(['lane-2 newest', 'lane-1 newest']);
  });

  it('excludes a landed firingId while still reporting its still-live sibling', () => {
    const p = project({
      activity: [
        act({ firingId: 'f2', at: NOW - 1_000 }),
        act({ firingId: 'f1', at: NOW - 2_000 }),
      ],
      flightLog: [{ id: 'f1', durationMs: null }],
    });
    const lanes = liveFiringsOf(p, callsignOf, narratorLineOf, countTurnsOf);
    expect(lanes.map((l) => l.firingId)).toEqual(['f2']);
  });

  it("scopes recentActions/turnsSeen/startedAt to each lane's own activity, not the whole window", () => {
    const p = project({
      activity: [
        act({ firingId: 'f2', at: NOW - 1_000 }),
        act({ firingId: 'f1', at: NOW - 2_000 }),
        act({ firingId: 'f1', at: NOW - 3_000 }),
        act({ firingId: 'f1', at: NOW - 4_000 }),
      ],
    });
    const lanes = liveFiringsOf(p, callsignOf, narratorLineOf, countTurnsOf);
    const f1 = lanes.find((l) => l.firingId === 'f1');
    const f2 = lanes.find((l) => l.firingId === 'f2');
    expect(f1?.recentActions).toBe(3);
    expect(f1?.turnsSeen).toBe(3);
    expect(f1?.startedAt).toBe(NOW - 4_000);
    expect(f2?.recentActions).toBe(1);
    expect(f2?.startedAt).toBe(NOW - 1_000);
  });

  it('shares focusTask and avgFiringDurationMs across every lane rather than recomputing per lane', () => {
    const p = project({
      activity: [
        act({ firingId: 'f2', at: NOW - 1_000 }),
        act({ firingId: 'f1', at: NOW - 2_000 }),
      ],
      flightLog: [{ id: 'p1:done', durationMs: 60_000 }],
      tasks: [{ title: 'Ship the fix', focus: true }],
    });
    const lanes = liveFiringsOf(p, callsignOf, narratorLineOf, countTurnsOf);
    expect(lanes).toHaveLength(2);
    for (const lane of lanes) {
      expect(lane.focusTask).toBe('Ship the fix');
      expect(lane.avgFiringDurationMs).toBe(60_000);
    }
  });

  it('produces the exact same shape as liveFiringOf for an equivalent single-lane project', () => {
    const activity = [
      act({ firingId: 'f1', at: NOW - 1_000, phase: 'do' }),
      act({ firingId: 'f1', at: NOW - 2_000 }),
    ];
    const p = project({ activity, tasks: [{ title: 'Wire up retries', focus: true }] });
    const single = liveFiringOf(p, callsignOf, narratorLineOf, countTurnsOf);
    const lanes = liveFiringsOf(p, callsignOf, narratorLineOf, countTurnsOf);
    expect(lanes).toEqual([single]);
  });
});

describe('orientFixation', () => {
  it('stays false below the turn threshold, even with zero DO-phase activity', () => {
    const activity = [{ phase: 'orient' }, { phase: 'gate' }];
    expect(orientFixation(activity, ORIENT_FIXATION_TURN_THRESHOLD - 1)).toBe(false);
  });

  it('flags true once the threshold is reached with no DO-phase activity in the window', () => {
    const activity = [{ phase: 'orient' }, { phase: 'gate' }];
    expect(orientFixation(activity, ORIENT_FIXATION_TURN_THRESHOLD)).toBe(true);
  });

  it('stays false once a DO-phase activity exists in the window, even past the threshold', () => {
    const activity = [{ phase: 'orient' }, { phase: 'do' }, { phase: 'gate' }];
    expect(orientFixation(activity, ORIENT_FIXATION_TURN_THRESHOLD + 5)).toBe(false);
  });

  it('flags true for an empty activity window at the threshold', () => {
    expect(orientFixation([], ORIENT_FIXATION_TURN_THRESHOLD)).toBe(true);
  });

  it('stays false for an empty activity window below the threshold', () => {
    expect(orientFixation([], 0)).toBe(false);
  });
});
