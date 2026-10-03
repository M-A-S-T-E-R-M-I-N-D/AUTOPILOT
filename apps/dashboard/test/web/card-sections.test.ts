// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure per-section diff-signature helper
 * (`web/card-sections.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2. `live-render-section-patch.test.ts` already
 * regression-tests this logic indirectly through the rendered DOM in
 * `clientJs()`; these tests exercise the real function directly instead.
 */

import { describe, it, expect } from 'vitest';
import { cardSectionSigs, type CardSectionInput } from '../../src/web/card-sections.js';

const BASE: CardSectionInput = {
  id: 'p1',
  name: 'Alpha',
  status: 'flying',
  anomalies: [],
  soulReviewed: true,
  soulProposed: null,
  soulPrevious: null,
  primaryLanguage: 'typescript',
  fileCount: 2,
  totalBytes: 100,
  activity: [{ tool: 'Read' }],
  flightLog: [{ id: 'f1' }],
  tasks: [{ id: 't1' }],
  firings: 3,
  shipped: 2,
  shipRate: 0.67,
  recentShipRate: 0.67,
  openFindings: 0,
  lastActivityAt: 1,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
};

describe('cardSectionSigs', () => {
  it('returns one signature per card section', () => {
    const sigs = cardSectionSigs(BASE);
    expect(Object.keys(sigs).sort()).toEqual(
      ['actions', 'gauge', 'head', 'meta', 'office', 'stats', 'worker'].sort(),
    );
  });

  it('shares one live signature between worker and office — both react to the same live-firing fields', () => {
    const sigs = cardSectionSigs(BASE);
    expect(sigs.worker).toBe(sigs.office);
  });

  it('changes only the head signature when an anomaly appears, leaving other sections untouched', () => {
    const before = cardSectionSigs(BASE);
    const after = cardSectionSigs({ ...BASE, anomalies: [{ kind: 'cost-spike' }] });
    expect(after.head).not.toBe(before.head);
    expect(after.meta).toBe(before.meta);
    expect(after.worker).toBe(before.worker);
    expect(after.office).toBe(before.office);
    expect(after.stats).toBe(before.stats);
    expect(after.gauge).toBe(before.gauge);
    expect(after.actions).toBe(before.actions);
  });

  it('changes only the head signature when soulReviewed flips (unreviewed SOUL badge)', () => {
    const before = cardSectionSigs(BASE);
    const after = cardSectionSigs({ ...BASE, soulReviewed: false });
    expect(after.head).not.toBe(before.head);
    expect(after.meta).toBe(before.meta);
    expect(after.stats).toBe(before.stats);
    expect(after.gauge).toBe(before.gauge);
    expect(after.actions).toBe(before.actions);
  });

  it('changes only the actions signature when soulProposed flips (pending SOUL proposal)', () => {
    const before = cardSectionSigs(BASE);
    const after = cardSectionSigs({ ...BASE, soulProposed: 'a proposed diff' });
    expect(after.actions).not.toBe(before.actions);
    expect(after.head).toBe(before.head);
    expect(after.meta).toBe(before.meta);
    expect(after.stats).toBe(before.stats);
    expect(after.gauge).toBe(before.gauge);
  });

  it('changes only the actions signature when soulPrevious flips (un-ratify affordance)', () => {
    const before = cardSectionSigs(BASE);
    const after = cardSectionSigs({ ...BASE, soulPrevious: 'the old soul text' });
    expect(after.actions).not.toBe(before.actions);
    expect(after.head).toBe(before.head);
    expect(after.meta).toBe(before.meta);
    expect(after.stats).toBe(before.stats);
    expect(after.gauge).toBe(before.gauge);
  });

  it('changes only the meta signature when file stats change', () => {
    const before = cardSectionSigs(BASE);
    const after = cardSectionSigs({ ...BASE, fileCount: 3, totalBytes: 200 });
    expect(after.meta).not.toBe(before.meta);
    expect(after.head).toBe(before.head);
    expect(after.stats).toBe(before.stats);
  });

  it('changes only worker/office when live-firing fields move (activity/flightLog/tasks/status)', () => {
    const before = cardSectionSigs(BASE);
    const after = cardSectionSigs({ ...BASE, activity: [{ tool: 'Edit' }] });
    expect(after.worker).not.toBe(before.worker);
    expect(after.office).not.toBe(before.office);
    expect(after.head).toBe(before.head);
    expect(after.meta).toBe(before.meta);
    expect(after.stats).toBe(before.stats);
    expect(after.gauge).toBe(before.gauge);
    expect(after.actions).toBe(before.actions);
  });

  it('changes only the stats signature when firing/ship counts change', () => {
    const before = cardSectionSigs(BASE);
    const after = cardSectionSigs({ ...BASE, firings: 4, shipped: 3 });
    expect(after.stats).not.toBe(before.stats);
    expect(after.head).toBe(before.head);
    expect(after.gauge).toBe(before.gauge);
  });

  it('changes only the gauge signature when open findings or the severity gauge move', () => {
    const before = cardSectionSigs(BASE);
    const after = cardSectionSigs({
      ...BASE,
      openFindings: 1,
      gauge: { critical: 1, high: 0, medium: 0, low: 0 },
    });
    expect(after.gauge).not.toBe(before.gauge);
    expect(after.stats).toBe(before.stats);
    expect(after.actions).toBe(before.actions);
  });

  it('changes the actions signature only when id/name change (a rename)', () => {
    const before = cardSectionSigs(BASE);
    const after = cardSectionSigs({ ...BASE, name: 'Alpha Renamed' });
    expect(after.actions).not.toBe(before.actions);
    expect(after.head).not.toBe(before.head); // head also keys off name
    expect(after.meta).toBe(before.meta);
  });
});
