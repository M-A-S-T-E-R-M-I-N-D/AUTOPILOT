// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct coverage for shared/callsign.ts's firingCallsign — previously only
 * exercised indirectly through callsign-parity.test.ts (which asserts
 * client/server rendering parity, not the function's own behavior) and
 * through read/fleet.ts's re-export. These pin the documented algorithm
 * (firing-number regex extraction + rolling hash into CALLSIGN_WORDS)
 * directly against the pure function.
 */

import { describe, it, expect } from 'vitest';
import { firingCallsign, CALLSIGN_WORDS } from '../../src/shared/callsign.js';

describe('firingCallsign', () => {
  it('returns "AP-0 nova" for an empty id (no digits, zero-length hash loop)', () => {
    expect(firingCallsign('')).toBe('AP-0 nova');
  });

  it('falls back to AP-0 when the id has no "firing-<digits>" segment', () => {
    expect(firingCallsign('no-digits-here')).toBe('AP-0 flux');
  });

  it('extracts the firing number from a bare "firing-<n>" id', () => {
    expect(firingCallsign('firing-1')).toBe('AP-1 raven');
  });

  it('extracts the firing number when prefixed by a project id', () => {
    expect(firingCallsign('p1:firing-42')).toBe('AP-42 drift');
  });

  it('uses only the FIRST "firing-<digits>" match when an id contains more than one', () => {
    expect(firingCallsign('firing-3-firing-9')).toBe('AP-3 lumen');
  });

  it('preserves leading zeros in the captured firing number', () => {
    expect(firingCallsign('firing-007')).toBe('AP-007 zephyr');
  });

  it('handles a very large firing number without overflowing the AP- label', () => {
    expect(firingCallsign('firing-1000000')).toBe('AP-1000000 tide');
  });

  it('is deterministic: the same id always resolves to the same callsign', () => {
    const id = 'p7:firing-256';
    expect(firingCallsign(id)).toBe(firingCallsign(id));
  });

  it('always resolves the word suffix to a member of CALLSIGN_WORDS', () => {
    for (const id of ['a', 'bb', 'ccc', 'firing-5', 'firing-999', 'zzzzzzzzzz']) {
      const [, word] = firingCallsign(id).split(' ');
      expect(CALLSIGN_WORDS).toContain(word);
    }
  });
});
