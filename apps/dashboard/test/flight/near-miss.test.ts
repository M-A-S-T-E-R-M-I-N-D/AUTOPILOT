// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  nearMissTotal,
  nearMissDebriefLine,
  detectRecurringNearMissClass,
  nearMissClassLabel,
  parseNearMissCounts,
  type NearMissCounts,
} from '../../src/flight/near-miss.js';

const ZERO: NearMissCounts = {
  guardDenials: 0,
  intentCollisions: 0,
  rescues: 0,
  syncBackRefusals: 0,
  checkpointErrors: 0,
};

describe('nearMissTotal', () => {
  it('sums every weak-signal class', () => {
    expect(nearMissTotal({ ...ZERO, guardDenials: 2, rescues: 1 })).toBe(3);
  });

  it('is 0 for a clean flight', () => {
    expect(nearMissTotal(ZERO)).toBe(0);
  });
});

describe('nearMissDebriefLine', () => {
  it('returns null for a clean flight', () => {
    expect(nearMissDebriefLine(ZERO)).toBeNull();
  });

  it('names every non-zero class, pluralized correctly', () => {
    const line = nearMissDebriefLine({ ...ZERO, guardDenials: 1, syncBackRefusals: 2 });
    expect(line).toBe('SAFETY-II near-miss debrief: 1 guard denial, 2 sync-back refusals.');
  });

  it('omits zero classes entirely', () => {
    const line = nearMissDebriefLine({ ...ZERO, checkpointErrors: 1 });
    expect(line).toBe('SAFETY-II near-miss debrief: 1 checkpoint error.');
  });
});

describe('detectRecurringNearMissClass', () => {
  it('returns null when nothing crosses the streak threshold', () => {
    const history: NearMissCounts[] = [
      { ...ZERO, guardDenials: 1 },
      { ...ZERO, guardDenials: 1 },
      ZERO,
    ];
    expect(detectRecurringNearMissClass(history)).toBeNull();
  });

  it('flags a class nonzero for 3+ consecutive flights (newest first)', () => {
    const history: NearMissCounts[] = [
      { ...ZERO, syncBackRefusals: 1 },
      { ...ZERO, syncBackRefusals: 2 },
      { ...ZERO, syncBackRefusals: 1 },
      ZERO,
    ];
    expect(detectRecurringNearMissClass(history)).toEqual({
      nearMissClass: 'syncBackRefusals',
      streak: 3,
    });
  });

  it('stops the streak at the first flight the class was absent', () => {
    const history: NearMissCounts[] = [
      { ...ZERO, rescues: 1 },
      { ...ZERO, rescues: 1 },
      ZERO,
      { ...ZERO, rescues: 1 },
      { ...ZERO, rescues: 1 },
      { ...ZERO, rescues: 1 },
    ];
    expect(detectRecurringNearMissClass(history)).toBeNull();
  });

  it('picks the longer streak when multiple classes recur', () => {
    const history: NearMissCounts[] = [
      { ...ZERO, guardDenials: 1, checkpointErrors: 1 },
      { ...ZERO, guardDenials: 1, checkpointErrors: 1 },
      { ...ZERO, guardDenials: 1 },
    ];
    expect(detectRecurringNearMissClass(history)).toEqual({
      nearMissClass: 'guardDenials',
      streak: 3,
    });
  });
});

describe('nearMissClassLabel', () => {
  it('returns the pluralized label used by the debrief line', () => {
    expect(nearMissClassLabel('guardDenials')).toBe('guard denials');
    expect(nearMissClassLabel('checkpointErrors')).toBe('checkpoint errors');
    expect(nearMissClassLabel('syncBackRefusals')).toBe('sync-back refusals');
  });
});

describe('parseNearMissCounts', () => {
  it('round-trips a persisted debrief payload', () => {
    const counts: NearMissCounts = { ...ZERO, guardDenials: 2, rescues: 1 };
    expect(parseNearMissCounts(JSON.stringify(counts))).toEqual(counts);
  });

  it('returns null for a null payload', () => {
    expect(parseNearMissCounts(null)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseNearMissCounts('{not json')).toBeNull();
  });

  it('returns null when a class is missing or not a number', () => {
    expect(parseNearMissCounts(JSON.stringify({ ...ZERO, guardDenials: 'two' }))).toBeNull();
    expect(parseNearMissCounts(JSON.stringify({ guardDenials: 1 }))).toBeNull();
  });
});
