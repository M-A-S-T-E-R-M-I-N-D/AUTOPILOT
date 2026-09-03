// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure replay step-navigation helpers
 * (`web/replay-nav.ts`) — Firing Replay viewer, step-through slice
 * (BOARD web-msnt26yk-5fzo6j).
 */

import { describe, it, expect } from 'vitest';
import { clampReplayStep, replayNav } from '../../src/web/replay-nav.js';

describe('clampReplayStep', () => {
  it('leaves an in-range index untouched', () => {
    expect(clampReplayStep(2, 5)).toBe(2);
  });

  it('clamps a negative index to 0', () => {
    expect(clampReplayStep(-1, 5)).toBe(0);
  });

  it('clamps an index past the end to the last valid index', () => {
    expect(clampReplayStep(9, 5)).toBe(4);
  });

  it('returns 0 for an empty trace regardless of the requested index', () => {
    expect(clampReplayStep(0, 0)).toBe(0);
    expect(clampReplayStep(3, 0)).toBe(0);
  });
});

describe('replayNav', () => {
  it('reports the first step of a multi-step trace: no prev, has next', () => {
    const nav = replayNav(0, 4);
    expect(nav).toEqual({
      index: 0,
      total: 4,
      canPrev: false,
      canNext: true,
      label: 'Step 1 of 4',
    });
  });

  it('reports a middle step: both prev and next available', () => {
    const nav = replayNav(1, 4);
    expect(nav.canPrev).toBe(true);
    expect(nav.canNext).toBe(true);
    expect(nav.label).toBe('Step 2 of 4');
  });

  it('reports the last step: has prev, no next', () => {
    const nav = replayNav(3, 4);
    expect(nav.canPrev).toBe(true);
    expect(nav.canNext).toBe(false);
    expect(nav.label).toBe('Step 4 of 4');
  });

  it('clamps an out-of-range index before deriving canPrev/canNext', () => {
    const nav = replayNav(99, 4);
    expect(nav.index).toBe(3);
    expect(nav.canNext).toBe(false);
  });

  it('reports a single-step trace as neither prev- nor next-able', () => {
    const nav = replayNav(0, 1);
    expect(nav.canPrev).toBe(false);
    expect(nav.canNext).toBe(false);
    expect(nav.label).toBe('Step 1 of 1');
  });

  it('reports an empty trace with a "No steps" label', () => {
    const nav = replayNav(0, 0);
    expect(nav.canPrev).toBe(false);
    expect(nav.canNext).toBe(false);
    expect(nav.label).toBe('No steps');
  });
});
