// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct coverage for shared/turns.ts's countTurns — previously only
 * exercised indirectly through count-turns-parity.test.ts (which asserts
 * client/server rendering parity, not the collapsing-loop's own behavior)
 * and through read/fleet.ts's re-export. These pin the documented
 * approximation rules (module docstring) directly against the pure function.
 */

import { describe, it, expect } from 'vitest';
import { countTurns } from '../../src/shared/turns.js';

describe('countTurns', () => {
  it('counts zero turns for an empty activity list', () => {
    expect(countTurns([])).toBe(0);
  });

  it('counts one turn for a single activity row', () => {
    expect(countTurns([{ model: 'sonnet', tokensIn: 500, tokensOut: 40 }])).toBe(1);
  });

  it('collapses consecutive rows sharing the same model/tokensIn/tokensOut/reasoning tuple into one turn', () => {
    expect(
      countTurns([
        { model: 'sonnet', tokensIn: 500, tokensOut: 40 },
        { model: 'sonnet', tokensIn: 500, tokensOut: 40 },
        { model: 'sonnet', tokensIn: 500, tokensOut: 40 },
      ]),
    ).toBe(1);
  });

  it('counts a new turn each time the tuple changes', () => {
    expect(
      countTurns([
        { model: 'sonnet', tokensIn: 100, tokensOut: 10 },
        { model: 'sonnet', tokensIn: 200, tokensOut: 20 },
        { model: 'haiku', tokensIn: 200, tokensOut: 20 },
      ]),
    ).toBe(3);
  });

  it('re-opens a new turn when a collapsed run is followed by the ORIGINAL tuple again (no run-length-encoding memory)', () => {
    expect(
      countTurns([
        { model: 'sonnet', tokensIn: 500, tokensOut: 40 },
        { model: 'haiku', tokensIn: 100, tokensOut: 10 },
        { model: 'sonnet', tokensIn: 500, tokensOut: 40 },
      ]),
    ).toBe(3);
  });

  it('treats a reasoning-only change as a distinct turn even when model/tokens stay identical', () => {
    expect(
      countTurns([
        { model: 'sonnet', tokensIn: 500, tokensOut: 40, reasoning: 'first' },
        { model: 'sonnet', tokensIn: 500, tokensOut: 40, reasoning: 'second' },
      ]),
    ).toBe(2);
  });

  it('collapses every row into one honest-undercount turn when no row carries any telemetry', () => {
    expect(countTurns([{}, {}, {}])).toBe(1);
  });

  it('treats a real zero tokensIn as distinct from a missing/null tokensIn (never coincides with the nullish fallback)', () => {
    expect(
      countTurns([
        { model: 'sonnet', tokensIn: null, tokensOut: 40 },
        { model: 'sonnet', tokensIn: 0, tokensOut: 40 },
      ]),
    ).toBe(2);
  });

  it('treats undefined and null fields identically (both fall back to the same nullish key)', () => {
    expect(
      countTurns([
        { model: 'sonnet', tokensOut: 40 },
        { model: 'sonnet', tokensIn: null, tokensOut: 40 },
      ]),
    ).toBe(1);
  });
});
