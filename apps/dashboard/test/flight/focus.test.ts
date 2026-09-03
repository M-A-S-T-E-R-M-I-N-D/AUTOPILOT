// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { isFocusBoundHere, orderClaimCandidatesFocusFirst } from '../../src/flight/focus.js';

/**
 * FLEET-AWARE FOCUS (web-mswpsozf-oxf17b): run 3's WIP-1 FOCUS starved a
 * 3-instance fleet — every instance that could SEE the focused task rendered
 * the FOCUS MODE lock, but only ONE could claim it; the other two spent 15 of
 * 30 firings locked onto work they didn't own. The fix these prove: the lock
 * binds to the instance that actually CLAIMED the focused task, and claim
 * ordering prefers a focused task so exactly one instance binds to it.
 */
describe('orderClaimCandidatesFocusFirst', () => {
  const t = (id: string, focus: number) => ({ id, focus });

  it('moves a focused task ahead of earlier board order so its claimer binds first', () => {
    const ordered = orderClaimCandidatesFocusFirst([t('a', 0), t('b', 1), t('c', 0)]);
    expect(ordered.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('keeps board order stable when nothing is focused (and among equals)', () => {
    const ordered = orderClaimCandidatesFocusFirst([t('a', 0), t('b', 0), t('c', 1), t('d', 1)]);
    expect(ordered.map((x) => x.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('returns a new array, never reordering the caller’s own list in place', () => {
    const input = [t('a', 0), t('b', 1)];
    orderClaimCandidatesFocusFirst(input);
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('isFocusBoundHere', () => {
  it('binds the FOCUS lock to the instance that claimed the focused task', () => {
    expect(isFocusBoundHere({ id: 't-1', focus: 1 }, 't-1')).toBe(true);
  });

  it("does NOT lock an instance onto a focused task it didn't claim (the run-3 starvation)", () => {
    expect(isFocusBoundHere({ id: 't-1', focus: 1 }, null)).toBe(false);
    expect(isFocusBoundHere({ id: 't-1', focus: 1 }, 't-other')).toBe(false);
  });

  it('never locks onto an unfocused task, claimed or not', () => {
    expect(isFocusBoundHere({ id: 't-1', focus: 0 }, 't-1')).toBe(false);
    expect(isFocusBoundHere({ id: 't-1', focus: 0 }, null)).toBe(false);
  });
});
